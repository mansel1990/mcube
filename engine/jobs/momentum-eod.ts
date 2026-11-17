import { nextTradingDay, todayIst } from "@/lib/mlive/calendar";
import { raiseAlert } from "../alerts";
import { dailyBars } from "../backtest/data";
import { num, q } from "../db";
import { holidaySet, loadSettings } from "../load";
import { isWeeklySignalDay, loadMomentumSnapshot, momentumCohortIsCurrent } from "../momentum-live";
import { runJob } from "../run";

export async function momentumEod(): Promise<void> {
  await runJob("momentum-eod", async (runId) => {
    const settings = await loadSettings();
    if (!settings.strategies.includes("momentum")) return { skipped: "momentum disabled" };
    const today = todayIst();
    const nextSession = nextTradingDay(today, await holidaySet());
    const nifty = await dailyBars("NIFTY 50");
    const latest = nifty.at(-1)?.t ?? "";
    if (latest !== today) {
      await raiseAlert({
        level: "problem",
        code: "bad_data",
        message: `Momentum did not run: latest NIFTY 50 candle is ${latest || "missing"}, expected ${today}.`,
        runId,
      });
      throw new Error(`Momentum scan has stale NIFTY 50 candle ${latest || "missing"}`);
    }
    let formed = false;
    let exits = 0;
    const weeklySignalDay = isWeeklySignalDay(today, nextSession);
    if (weeklySignalDay) {
      const seen = await q(`SELECT signal_date FROM mlive.mlive_momentum_runs WHERE signal_date = $1::date`, [today]);
      const snapshot = await loadMomentumSnapshot(today);
      await q(`UPDATE mlive.mlive_momentum_cohorts SET active = false WHERE active`);
      await q(
        `INSERT INTO mlive.mlive_momentum_runs (signal_date, market_up, eligible)
         VALUES ($1::date, $2, $3)
         ON CONFLICT (signal_date) DO UPDATE SET
           market_up = EXCLUDED.market_up, eligible = EXCLUDED.eligible`,
        [today, snapshot.marketUp, snapshot.cohort.length]
      );
      for (const row of snapshot.cohort) {
        await q(
          `INSERT INTO mlive.mlive_momentum_cohorts
             (signal_date, symbol, rank, return_90, signal_close, sector, active)
           VALUES ($1::date, $2, $3, $4, $5, $6, true)
           ON CONFLICT (signal_date, symbol) DO UPDATE SET
             rank = EXCLUDED.rank, return_90 = EXCLUDED.return_90,
             signal_close = EXCLUDED.signal_close, sector = EXCLUDED.sector, active = true`,
          [today, row.symbol, row.rank, row.return90, row.signalClose, row.sector]
        );
      }
      exits = await proposeWeeklyExits(runId, today, nextSession, new Set(snapshot.cohort.map((row) => row.symbol)), settings.dryRun);
      formed = !seen[0];
    } else {
      await expireStaleCohort(today, await holidaySet());
    }
    const ideas = await writeActiveIdeas(runId, today, nextSession, settings.dryRun);
    return { formed, ideas, exits, validFor: nextSession };
  });
}

async function expireStaleCohort(today: string, holidays: ReadonlySet<string>): Promise<void> {
  const rows = await q<{ signal_date: string }>(
    `SELECT signal_date::text AS signal_date
       FROM mlive.mlive_momentum_cohorts
      WHERE active
      ORDER BY signal_date DESC
      LIMIT 1`
  );
  const signalDate = rows[0]?.signal_date;
  if (!signalDate) return;
  const firstTradeDay = nextTradingDay(signalDate, holidays);
  if (momentumCohortIsCurrent(signalDate, today, firstTradeDay)) return;
  await q(`UPDATE mlive.mlive_momentum_cohorts SET active = false WHERE active`);
  await raiseAlert({
    level: "problem",
    code: "bad_data",
    message: `Momentum cohort ${signalDate} expired before a replacement formed. New momentum buys are blocked.`,
  });
}

async function writeActiveIdeas(runId: number, scanDate: string, validFor: string, dryRun: boolean): Promise<number> {
  const rows = await q<{
    symbol: string;
    rank: unknown;
    signal_close: unknown;
    sector: string | null;
    signal_date: string;
    return_90: unknown;
  }>(
    `SELECT symbol, rank, signal_close, sector, signal_date::text AS signal_date, return_90
       FROM mlive.mlive_momentum_cohorts
      WHERE active
      ORDER BY rank, symbol`
  );
  let saved = 0;
  for (const row of rows) {
    const score = 9 - num(row.rank);
    await q(
      `INSERT INTO mlive.mlive_ideas
         (scan_date, valid_for, symbol, strategy, score, signal_close, initial_stop, sector, raw, book)
       VALUES ($1::date, $2::date, $3, 'momentum', $4, $5, NULL, $6, $7::jsonb, 'swing')
       ON CONFLICT (scan_date, symbol, strategy) DO UPDATE SET
         valid_for = EXCLUDED.valid_for, score = EXCLUDED.score,
         signal_close = EXCLUDED.signal_close, initial_stop = NULL,
         sector = EXCLUDED.sector, raw = EXCLUDED.raw, book = 'swing'`,
      [
        scanDate,
        validFor,
        row.symbol,
        score,
        num(row.signal_close),
        row.sector,
        JSON.stringify({ variant: "M10-6", cohort: row.signal_date, rank: num(row.rank), return90: num(row.return_90), dryRun }),
      ]
    );
    saved += 1;
  }
  if (saved) {
    await q(
      `INSERT INTO mlive.mlive_audit_log (actor, action, after, run_id)
       VALUES ('engine', 'momentum.ideas', $1::jsonb, $2)`,
      [JSON.stringify({ scanDate, validFor, saved }), runId]
    );
  }
  return saved;
}

async function proposeWeeklyExits(
  runId: number,
  signalDate: string,
  tradeDate: string,
  keep: ReadonlySet<string>,
  dryRun: boolean
): Promise<number> {
  const positions = await q<{ id: string; symbol: string; qty: unknown; avg_price: unknown; frozen: boolean }>(
    `SELECT id::text AS id, symbol, qty, avg_price, frozen
       FROM mlive.mlive_positions
      WHERE closed_at IS NULL AND strategy = 'momentum' AND ($1::boolean OR dry_run = false)
      ORDER BY id`,
    [dryRun]
  );
  let proposed = 0;
  for (const position of positions) {
    if (position.frozen || keep.has(position.symbol)) continue;
    const bars = await dailyBars(position.symbol);
    const close = [...bars].reverse().find((bar) => bar.t <= signalDate)?.c ?? num(position.avg_price);
    const limit = Number((close * 0.995).toFixed(2));
    await q(
      `INSERT INTO mlive.mlive_decisions
         (run_id, trade_date, position_id, side, symbol, outcome, reason_code, reason_text, sizing, dry_run, book)
       VALUES ($1, $2::date, $3, 'SELL', $4, 'proposed', 'momentum_weekly', $5, $6::jsonb, $7, 'swing')
       ON CONFLICT (trade_date, side, position_id) WHERE position_id IS NOT NULL
       DO UPDATE SET run_id = EXCLUDED.run_id, outcome = 'proposed',
         reason_code = EXCLUDED.reason_code, reason_text = EXCLUDED.reason_text,
         sizing = EXCLUDED.sizing, dry_run = EXCLUDED.dry_run, book = 'swing'
       WHERE mlive.mlive_decisions.outcome IN ('proposed', 'skipped')`,
      [
        runId,
        tradeDate,
        num(position.id),
        position.symbol,
        `Momentum weekly rebalance from ${signalDate}: no longer in the top 8 or NIFTY filter is off.`,
        JSON.stringify({ qty: num(position.qty), limit, signalDate }),
        dryRun,
      ]
    );
    proposed += 1;
  }
  return proposed;
}
