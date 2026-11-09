import { todayIst } from "@/lib/mlive/calendar";
import { breakerTripped } from "@/lib/mlive/rules";
import { raiseAlert } from "../alerts";
import { openPositions } from "../book";
import { num, q } from "../db";
import { fundBalance, loadSettings, loadState, setState } from "../load";
import { livePrice, previousClose } from "../market";
import { runJob } from "../run";

export async function eod(): Promise<void> {
  await runJob("eod", (runId) => closeBook(runId, false));
}

export async function eodFinal(): Promise<void> {
  await runJob("eod-final", (runId) => closeBook(runId, true));
}

async function closeBook(runId: number, official: boolean): Promise<Record<string, unknown>> {
    const today = todayIst();
    const settings = await loadSettings();
    const state = await loadState();
    const fund = await fundBalance(false);
    const positions = await openPositions(false);
    let openCost = 0;
    let positionsValue = 0;
    for (const position of positions) {
      const marked = official ? (await previousClose(position.symbol))?.close : await livePrice(position.symbol);
      const price = marked || position.avgPrice;
      openCost += position.qty * position.avgPrice;
      positionsValue += position.qty * price;
    }
    // A pending buy is still the account's money. It only reduces spendable cash elsewhere.
    const cash = fund - openCost;
    const systemValue = fund - openCost + positionsValue;
    let peak = state.peak;
    const tripped = official && breakerTripped(systemValue, peak, settings.breakerPct);
    if (official && systemValue > peak) peak = systemValue;
    const drawdown = peak > 0 ? (1 - systemValue / peak) * 100 : 0;
    await q(
      `INSERT INTO mlive.mlive_equity_daily (trade_date, cash, positions_value, system_value, peak, drawdown_pct)
       VALUES ($1::date, $2, $3, $4, $5, $6)
       ON CONFLICT (trade_date) DO UPDATE SET
         cash = EXCLUDED.cash, positions_value = EXCLUDED.positions_value,
         system_value = EXCLUDED.system_value, peak = EXCLUDED.peak, drawdown_pct = EXCLUDED.drawdown_pct`,
      [today, cash, positionsValue, systemValue, peak, drawdown]
    );
    const nextStatus = !official
      ? state.status
      : tripped
        ? "paused_by_breaker"
        : state.status === "halted_today"
          ? "halted_today"
          : state.status;
    if (official) {
      await setState({ peak, peakDate: systemValue >= state.peak ? today : state.peakDate, lastEod: today, status: nextStatus });
    }
    if (official && tripped && state.status !== "paused_by_breaker") {
      await raiseAlert({
        level: "problem",
        code: "breaker_tripped",
        message: `Down ${drawdown.toFixed(1)}% from the peak. The engine is paused until you resume.`,
        runId,
      });
    }
    const decisions = await q(
      `SELECT outcome, side, symbol FROM mlive.mlive_decisions WHERE trade_date = $1::date`,
      [today]
    );
    const summary = {
      proposed: decisions.filter((row) => row.outcome === "proposed").length,
      sent: decisions.filter((row) => row.outcome === "sent").length,
      skipped: decisions.filter((row) => row.outcome === "skipped").length,
      value: systemValue,
    };
    const text = decisions.length
      ? decisions.map((row) => `${row.outcome} ${row.side} ${row.symbol}`).join("\n")
      : "No action";
    await q(
      `INSERT INTO mlive.mlive_daily_reports (trade_date, decision_summary, text)
       VALUES ($1::date, $2::jsonb, $3)
       ON CONFLICT (trade_date) DO UPDATE SET decision_summary = EXCLUDED.decision_summary, text = EXCLUDED.text`,
      [today, JSON.stringify(summary), text]
    );
    await raiseAlert({
      level: "done",
      code: "daily_report",
      message: official ? `Official close ₹${Math.round(systemValue)}` : `Marked at ₹${Math.round(systemValue)} from the live price`,
      runId,
    });
    return { systemValue, peak, tripped, official, drawdown: num(drawdown.toFixed(2)) };
}
