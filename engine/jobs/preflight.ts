import { istMinutes, previousTradingDay, todayIst } from "@/lib/mlive/calendar";
import {
  buyTooCloseToStop,
  decisionSentence,
  engineSpendable,
  entryBelowEma,
  haltReasons,
  heldOutsideSystem,
  ideaRejectReason,
  isExcluded,
  kiteCashGap,
  kiteCashMessage,
  limitPrice,
  KITE_LOGIN_WAIT,
  PREFLIGHT_FINAL_MINUTE,
  preflightSessionPlan,
  paceBuys,
  priceSkip,
  rankIdeas,
  reconcile,
  sizeOrder,
  spendableCash,
  systemCash,
  type ScoredIdea,
} from "@/lib/mlive/rules";
import { audit } from "../audit";
import { raiseAlert } from "../alerts";
import { buyPace, openCost, openPositions, pendingBuyValue, saveDeployBaseline } from "../book";
import { jsonValue, num, q } from "../db";
import { MliveKite } from "../kite";
import { fundBalance, holidaySet, loadSettings, loadState, setState } from "../load";
import { bhavcopyPresent, livePrice, loadBars, previousClose, yahooPreviousClose } from "../market";
import { runJob } from "../run";

export async function preflight(): Promise<void> {
  await runJob("preflight", async (runId) => {
    const minute = istMinutes();
    if (minute < 8 * 60 + 35 || minute > 9 * 60 + 10) return { skipped: "outside preflight window" };
    const today = todayIst();
    const settings = await loadSettings();
    let state = await loadState();
    if (state.status === "halted_today" && state.updatedAt) {
      const stamped = new Date(state.updatedAt).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
      if (stamped < today) {
        await setState({ status: "active", haltReason: null });
        state = { ...state, status: "active", haltReason: null };
      }
    }
    const holidays = await holidaySet();
    const previous = previousTradingDay(today, holidays);
    let stateReadable = true;
    let ledgerReadable = true;
    let fund = 0;
    try {
      fund = await fundBalance(settings.dryRun);
    } catch {
      ledgerReadable = false;
    }
    try {
      await loadState();
    } catch {
      stateReadable = false;
    }
    const kite = new MliveKite(settings.dryRun);
    const session = await kite.sessionOk();
    let holdings: { tradingsymbol: string; quantity: number }[] = [];
    let holdingsReadable = false;
    let marginsReadable = false;
    let kiteCash = 0;
    if (session) {
      try {
        holdings = await kite.holdings();
        holdingsReadable = true;
      } catch {
        holdingsReadable = false;
      }
      try {
        kiteCash = await kite.equityCash();
        marginsReadable = true;
      } catch {
        marginsReadable = false;
      }
    }
    const bhav = await bhavcopyPresent(previous).catch(() => false);
    const reasons = haltReasons({
      stateReadable,
      ledgerReadable,
      eodPresent: state.lastEod == null || state.lastEod >= previous,
      kiteSession: session,
      holdingsReadable: session ? holdingsReadable : false,
      marginsReadable: session ? marginsReadable : false,
      bhavcopyPresent: bhav,
      unknownReject: false,
    });
    const plan = preflightSessionPlan({
      minute,
      reasons,
      status: state.status,
      haltReason: state.haltReason,
    });
    if (plan.clearHalt) {
      await setState({ status: "active", haltReason: null });
      state = { ...state, status: "active", haltReason: null };
    }
    if (plan.alert === "wait") {
      const finalCall = minute >= PREFLIGHT_FINAL_MINUTE;
      const message = finalCall ? KITE_LOGIN_WAIT : "No Kite session yet. Preflight will wait until 09:10.";
      const already = await q(
        `SELECT id FROM mlive.mlive_alerts
          WHERE code = 'kite_login_needed' AND message = $2
            AND (ts AT TIME ZONE 'Asia/Kolkata')::date = $1::date`,
        [today, message]
      );
      if (!already[0]) {
        await raiseAlert({
          level: "needs_you",
          code: "kite_login_needed",
          message,
          runId,
        });
      }
      await writeDraft(today, { waiting: "no_kite_session", note: "waiting for Kite login" });
      return { waiting: "no_kite_session" };
    }
    if (plan.halt) {
      await setState({ status: "halted_today", haltReason: plan.haltReason });
      await raiseAlert({
        level: "problem",
        code: plan.haltReason === "no_kite_session" ? "kite_login_needed" : "bad_data",
        message: `No orders today: ${plan.haltReason}`,
        runId,
      });
      await writeDraft(today, { halted: plan.haltReason });
      return { halted: plan.haltReason };
    }

    const positions = await openPositions(settings.dryRun);
    const kiteQty = new Map(holdings.map((row) => [row.tradingsymbol.toUpperCase(), row.quantity]));
    for (const position of positions) {
      const have = kiteQty.get(position.symbol) ?? 0;
      const result = reconcile(position.qty, have);
      await q(
        `INSERT INTO mlive.mlive_reconciliations (run_id, symbol, system_qty, kite_qty, result) VALUES ($1, $2, $3, $4, $5)`,
        [runId, position.symbol, position.qty, have, result]
      );
      if (result === "missing") {
        await q(`UPDATE mlive.mlive_positions SET frozen = true WHERE id = $1`, [position.id]);
        await raiseAlert({
          level: "needs_you",
          code: "position_missing_in_kite",
          symbol: position.symbol,
          message: `${position.symbol} is frozen. Kite has ${have}, the system has ${position.qty}.`,
          runId,
        });
      }
    }
    await audit({ actor: "engine", action: "reconcile", after: { positions: positions.length }, runId });

    const system = systemCash(fund, await openCost(settings.dryRun), await pendingBuyValue(settings.dryRun));
    const spendable = spendableCash(system, kiteCash, settings.cashReserve);
    const gap = kiteCashGap(system, kiteCash);
    if (gap > 0) {
      const already = await q(
        `SELECT id FROM mlive.mlive_alerts
          WHERE code = 'kite_cash_low' AND (ts AT TIME ZONE 'Asia/Kolkata')::date = $1::date`,
        [today]
      );
      if (!already[0]) {
        await raiseAlert({
          level: "problem",
          code: "kite_cash_low",
          message: kiteCashMessage({ dryRun: settings.dryRun, system, kite: kiteCash }),
          runId,
        });
      }
    }

    const ideas = await q(
      `SELECT id, symbol, strategy, score, signal_close, initial_stop, sector
         FROM mlive.mlive_ideas WHERE valid_for = $1::date`,
      [today]
    );
    const sectorCounts = new Map<string, number>();
    for (const position of positions) {
      const sector = await q<{ sector: string | null }>(`SELECT sector FROM mlive.mlive_instruments WHERE symbol = $1`, [position.symbol]);
      const name = sector[0]?.sector;
      if (name) sectorCounts.set(name, (sectorCounts.get(name) ?? 0) + 1);
    }
    const viable: ScoredIdea[] = [];
    for (const idea of ideas) {
      const symbol = String(idea.symbol);
      const strategy = idea.strategy === "ema" ? "ema" : "rs";
      if (!settings.strategies.includes(strategy)) continue;
      const bars = await loadBars(symbol, 30);
      const last = await previousClose(symbol);
      const yahoo = await yahooPreviousClose(symbol);
      const bad = priceSkip({
        yahooPrevClose: yahoo,
        bhavClose: last?.close ?? null,
        live: null,
        lastClose: last?.close ?? null,
        volume: last?.volume ?? null,
        corporateAction: false,
      });
      const kiteHave = kiteQty.get(symbol) ?? 0;
      const systemQty = positions.find((row) => row.symbol === symbol)?.qty ?? 0;
      const instrument = await q<{ is_etf: boolean }>(`SELECT is_etf FROM mlive.mlive_instruments WHERE symbol = $1`, [symbol]);
      const stop = idea.initial_stop == null ? null : num(idea.initial_stop);
      const entry = limitPrice(num(idea.signal_close), settings.limitOffset);
      const reason = ideaRejectReason({
        heldBySystem: systemQty > 0,
        heldBySanjay: heldOutsideSystem(kiteHave, systemQty),
        excluded: isExcluded(symbol, settings.exclude, instrument[0]?.is_etf === true),
        sectorCount: sectorCounts.get(String(idea.sector ?? "")) ?? 0,
        maxPerSector: settings.maxPerSector,
        historyDays: bars.length,
        badData: bad != null || stop == null,
        chasing: false,
        belowMinAfterSizing: false,
        entryBelowStop: strategy === "ema" && stop != null && entryBelowEma(entry, stop),
      });
      if (reason) {
        await proposeSkip(runId, today, num(idea.id), symbol, reason, bad ?? reason, settings.dryRun);
        continue;
      }
      viable.push({ symbol, strategy, score: num(idea.score) });
    }
    const invested = positions.reduce((sum, row) => sum + row.qty * row.avgPrice, 0);
    const ranked = fund + 1e-6 < invested ? [] : rankIdeas(viable);
    if (fund + 1e-6 < invested) {
      for (const idea of viable) {
        const source = ideas.find((row) => String(row.symbol) === idea.symbol && row.strategy === idea.strategy);
        if (!source) continue;
        await proposeSkip(
          runId,
          today,
          num(source.id),
          idea.symbol,
          "no_funds",
          "Withdrawal is below the amount invested. New buys wait until a sale frees cash.",
          settings.dryRun
        );
      }
    }
    let cash = spendable;
    let planned = 0;
    const pace = await buyPace(today, settings.dryRun, { approved: true });
    let paceBook = {
      newBuys: pace.newBuys,
      strategyBuys: pace.strategyBuys,
      openInStrategy: pace.openInStrategy,
      deployed: pace.deployed,
      baseline: pace.baseline,
    };
    const engineNow = engineSpendable(fund, invested, await pendingBuyValue(settings.dryRun), kiteCash, settings.cashReserve);
    for (const [index, idea] of ranked.entries()) {
      const source = ideas.find((row) => String(row.symbol) === idea.symbol && row.strategy === idea.strategy);
      if (!source) continue;
      if (positions.length + planned >= settings.maxOpen) {
        await proposeSkip(runId, today, num(source.id), idea.symbol, "limit", "daily or position limit", settings.dryRun);
        continue;
      }
      const entry = limitPrice(num(source.signal_close), settings.limitOffset);
      const stop = num(source.initial_stop);
      const sized = sizeOrder({
        fund,
        entry,
        stop,
        spendable: cash,
        riskPct: settings.riskPct,
        maxOrderPct: settings.maxOrderPct,
        minOrderInr: settings.minOrderInr,
      });
      await audit({ actor: "engine", action: "sizing", symbol: idea.symbol, reason: sized.text, runId });
      if (sized.reason !== "ok") {
        const would = Math.min(sized.qtyRisk, sized.qtyCap);
        await upsertBuy(runId, today, num(source.id), idea.symbol, "skipped", sized.reason, sized.text, {
          qty: would,
          limit: entry,
          stop,
          notional: would * entry,
          text: sized.text,
        }, null, settings.dryRun);
        continue;
      }
      const paced = paceBuys(
        [{ symbol: idea.symbol, strategy: idea.strategy, notional: sized.notional }],
        paceBook,
        {
          maxNewBuysPerDay: settings.maxNewBuys,
          maxBuysPerDay: settings.maxBuys,
          maxBuysPerStrategyPerDay: settings.maxBuysPerStrategy,
          maxOpenPerStrategy: settings.maxOpenPerStrategy,
          maxDailyDeployPct: settings.maxDailyDeployPct,
          engineCanUseNow: engineNow,
        }
      );
      paceBook = paced.book;
      const paceReason = paced.results[0]?.reason ?? "ok";
      if (paceReason !== "ok") {
        const text = decisionSentence({
          outcome: "skipped",
          reasonCode: paceReason,
          strategy: idea.strategy,
          limitCount: paceReason === "strategy_full" ? settings.maxOpenPerStrategy : paceReason === "pacing_strategy" ? settings.maxBuysPerStrategy : settings.maxNewBuys,
        });
        await proposeSkip(runId, today, num(source.id), idea.symbol, paceReason, text, settings.dryRun);
        continue;
      }
      const live = await livePrice(idea.symbol);
      if (live != null && buyTooCloseToStop(live, stop)) {
        await proposeSkip(
          runId,
          today,
          num(source.id),
          idea.symbol,
          "too_close_to_stop",
          decisionSentence({ outcome: "skipped", reasonCode: "too_close_to_stop" }),
          settings.dryRun
        );
        continue;
      }
      await upsertBuy(runId, today, num(source.id), idea.symbol, "proposed", "ranked", sized.text, {
        qty: sized.qty,
        limit: entry,
        stop,
        signalClose: num(source.signal_close),
        text: sized.text,
      }, index + 1, settings.dryRun);
      if (state.mode === "approve") {
        await raiseAlert({ level: "needs_you", code: "approve_buy", symbol: idea.symbol, message: `Approve buy ${idea.symbol} · ${sized.qty} @ ₹${entry}`, runId });
      }
      cash -= sized.notional;
      planned += 1;
      const sector = String(source.sector ?? "");
      if (sector) sectorCounts.set(sector, (sectorCounts.get(sector) ?? 0) + 1);
    }
    const sellCount = (await q<{ n: unknown }>(
      `SELECT COUNT(*)::int AS n FROM mlive.mlive_decisions WHERE trade_date = $1::date AND side = 'SELL' AND outcome = 'proposed'`,
      [today]
    ))[0];
    if (paceBook.baseline != null && paceBook.baseline > 0) await saveDeployBaseline(today, paceBook.baseline);
    await writeDraft(today, { buys: planned, sells: num(sellCount?.n), ideas: ideas.length, deployBaseline: paceBook.baseline });
    return { buys: planned, ideas: ideas.length, spendable };
  });
}

async function proposeSkip(runId: number, day: string, ideaId: number, symbol: string, code: string, text: string, dryRun: boolean): Promise<void> {
  await upsertBuy(runId, day, ideaId, symbol, "skipped", code, text, null, null, dryRun);
}

async function upsertBuy(
  runId: number,
  day: string,
  ideaId: number,
  symbol: string,
  outcome: string,
  code: string,
  text: string,
  sizing: unknown,
  rank: number | null,
  dryRun: boolean
): Promise<void> {
  await q(
    `INSERT INTO mlive.mlive_decisions
       (run_id, trade_date, idea_id, side, symbol, outcome, reason_code, reason_text, sizing, rank, dry_run)
     VALUES ($1, $2::date, $3, 'BUY', $4, $5, $6, $7, $8::jsonb, $9, $10)
     ON CONFLICT (trade_date, side, idea_id) WHERE idea_id IS NOT NULL
     DO UPDATE SET
       run_id = EXCLUDED.run_id,
       outcome = EXCLUDED.outcome,
       reason_code = EXCLUDED.reason_code,
       reason_text = EXCLUDED.reason_text,
       sizing = EXCLUDED.sizing,
       rank = EXCLUDED.rank,
       symbol = EXCLUDED.symbol,
       dry_run = EXCLUDED.dry_run
     WHERE mlive.mlive_decisions.outcome IN ('proposed', 'skipped')`,
    [runId, day, ideaId, symbol, outcome, code, text, sizing == null ? null : JSON.stringify(sizing), rank, dryRun]
  );
}

async function writeDraft(day: string, summary: Record<string, unknown>): Promise<void> {
  const existing = await q<{ decision_summary: unknown }>(
    `SELECT decision_summary FROM mlive.mlive_daily_reports WHERE trade_date = $1::date`,
    [day]
  );
  const prev = jsonValue(existing[0]?.decision_summary);
  const prior = prev && typeof prev === "object" ? (prev as Record<string, unknown>) : {};
  const merged = { ...prior, ...summary };
  const nextBaseline = Number(merged.deployBaseline);
  const priorBaseline = Number(prior.deployBaseline);
  if (!(nextBaseline > 0)) {
    if (priorBaseline > 0) merged.deployBaseline = prior.deployBaseline;
    else delete merged.deployBaseline;
  }
  await q(
    `INSERT INTO mlive.mlive_daily_reports (trade_date, decision_summary, text)
     VALUES ($1::date, $2::jsonb, 'Morning draft')
     ON CONFLICT (trade_date) DO UPDATE SET decision_summary = EXCLUDED.decision_summary`,
    [day, JSON.stringify(merged)]
  );
}
