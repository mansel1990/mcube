import { todayIst } from "@/lib/mlive/calendar";
import {
  buyTooCloseToStop,
  decisionSentence,
  engineSpendable,
  entryBelowEma,
  heldOutsideSystem,
  ideaRejectReason,
  isExcluded,
  limitPrice,
  paceBuys,
  priceSkip,
  RECHECK_REASON_CODES,
  recheckPlan,
  sizeOrder,
} from "@/lib/mlive/rules";
import { audit } from "../audit";
import { raiseAlert } from "../alerts";
import { buyPace, openCost, openPositions, pendingBuyValue, saveDeployBaseline, sentCounts } from "../book";
import { num, q } from "../db";
import { MliveKite } from "../kite";
import { fundBalance, loadSettings, loadState } from "../load";
import { livePrice, loadBars, previousClose, yahooPreviousClose } from "../market";

type Candidate = {
  id: number | null;
  ideaId: number;
  symbol: string;
  strategy: "rs" | "ema";
  sector: string;
  signalClose: number;
  stop: number | null;
  rank: number | null;
  outcome: string | null;
  reasonCode: string | null;
};

/** Re-size today's cash skips, and ideas that never got a decision, against fresh Kite cash. */
export async function recheckBuys(runId: number): Promise<number> {
  const settings = await loadSettings();
  const state = await loadState();
  if (state.mode === "paused" || state.status !== "active") return 0;
  const today = todayIst();
  const kite = new MliveKite(settings.dryRun);
  let kiteCash = 0;
  if (await kite.sessionOk()) kiteCash = await kite.equityCash();
  const fund = await fundBalance(settings.dryRun);
  const positions = await openPositions(settings.dryRun);
  let spendable = engineSpendable(
    fund,
    await openCost(settings.dryRun),
    await pendingBuyValue(settings.dryRun),
    kiteCash,
    settings.cashReserve
  );
  const counts = await sentCounts(today);
  let buysSent = counts.buys;
  let openCount = positions.length;
  const sectorCounts = new Map<string, number>();
  for (const position of positions) {
    const sector = await q<{ sector: string | null }>(`SELECT sector FROM mlive.mlive_instruments WHERE symbol = $1`, [position.symbol]);
    const name = sector[0]?.sector;
    if (name) sectorCounts.set(name, (sectorCounts.get(name) ?? 0) + 1);
  }
  const kiteQty = new Map<string, number>();
  if (await kite.sessionOk()) {
    try {
      for (const row of await kite.holdings()) kiteQty.set(row.tradingsymbol.toUpperCase(), row.quantity);
    } catch {
      /* a missing holdings read does not invent a skip */
    }
  }

  const skipped = await q<{
    id: string;
    idea_id: string;
    symbol: string;
    rank: number | null;
    reason_code: string | null;
    signal_close: string | null;
    initial_stop: string | null;
    sector: string | null;
    strategy: string | null;
  }>(
    `SELECT d.id, d.idea_id, d.symbol, d.rank, d.reason_code, i.signal_close, i.initial_stop, i.sector, i.strategy
       FROM mlive.mlive_decisions d
       JOIN mlive.mlive_ideas i ON i.id = d.idea_id
      WHERE d.trade_date = $1::date AND d.side = 'BUY' AND d.outcome = 'skipped'
        AND d.reason_code = ANY($3::text[])
        AND ($2::boolean OR d.dry_run = false)
      ORDER BY d.rank NULLS LAST, d.id`,
    [today, settings.dryRun, [...RECHECK_REASON_CODES]]
  );
  const fresh = await q<{
    id: string;
    symbol: string;
    strategy: string | null;
    signal_close: string | null;
    initial_stop: string | null;
    sector: string | null;
    score: string | null;
  }>(
    `SELECT i.id, i.symbol, i.strategy, i.signal_close, i.initial_stop, i.sector, i.score
       FROM mlive.mlive_ideas i
      WHERE i.valid_for = $1::date
        AND NOT EXISTS (
          SELECT 1 FROM mlive.mlive_decisions d
           WHERE d.idea_id = i.id AND d.trade_date = i.valid_for AND d.side = 'BUY'
        )
      ORDER BY i.score DESC`,
    [today]
  );

  const candidates: Candidate[] = [
    ...skipped.map((row) => ({
      id: num(row.id),
      ideaId: num(row.idea_id),
      symbol: String(row.symbol),
      strategy: row.strategy === "ema" ? "ema" as const : "rs" as const,
      sector: String(row.sector ?? ""),
      signalClose: num(row.signal_close),
      stop: row.initial_stop == null ? null : num(row.initial_stop),
      rank: row.rank == null ? null : num(row.rank),
      outcome: "skipped",
      reasonCode: row.reason_code,
    })),
  ];
  for (const idea of fresh) {
    const strategy = idea.strategy === "ema" ? "ema" : "rs";
    if (!settings.strategies.includes(strategy)) continue;
    const symbol = String(idea.symbol);
    const viable = await ideaIsViable({
      symbol,
      strategy,
      signalClose: num(idea.signal_close),
      stop: idea.initial_stop == null ? null : num(idea.initial_stop),
      sector: String(idea.sector ?? ""),
      sectorCounts,
      kiteQty,
      systemQty: positions.find((row) => row.symbol === symbol)?.qty ?? 0,
      settings,
    });
    if (!viable) continue;
    candidates.push({
      id: null,
      ideaId: num(idea.id),
      symbol,
      strategy,
      sector: String(idea.sector ?? ""),
      signalClose: num(idea.signal_close),
      stop: idea.initial_stop == null ? null : num(idea.initial_stop),
      rank: null,
      outcome: null,
      reasonCode: null,
    });
  }

  let promoted = 0;
  const pace = await buyPace(today, settings.dryRun, { proposed: true, approved: true });
  let paceBook = {
    newBuys: Math.max(pace.newBuys, buysSent),
    strategyBuys: pace.strategyBuys,
    openInStrategy: pace.openInStrategy,
    deployed: pace.deployed,
    baseline: pace.baseline,
  };
  const engineNow = engineSpendable(fund, await openCost(settings.dryRun), await pendingBuyValue(settings.dryRun), kiteCash, settings.cashReserve);
  const paceLimits = {
    maxNewBuysPerDay: settings.maxNewBuys,
    maxBuysPerDay: settings.maxBuys,
    maxBuysPerStrategyPerDay: settings.maxBuysPerStrategy,
    maxOpenPerStrategy: settings.maxOpenPerStrategy,
    maxDailyDeployPct: settings.maxDailyDeployPct,
    engineCanUseNow: engineNow,
  };
  for (const candidate of candidates) {
    if (candidate.stop == null || !(candidate.signalClose > 0)) continue;
    const entry = limitPrice(candidate.signalClose, settings.limitOffset);
    const live = await livePrice(candidate.symbol);
    if (live != null && buyTooCloseToStop(live, candidate.stop)) {
      await rememberSkip(candidate, "too_close_to_stop", decisionSentence({ outcome: "skipped", reasonCode: "too_close_to_stop" }), runId, today, settings.dryRun);
      continue;
    }
    const sized = sizeOrder({
      fund,
      entry,
      stop: candidate.stop,
      spendable,
      riskPct: settings.riskPct,
      maxOrderPct: settings.maxOrderPct,
      minOrderInr: settings.minOrderInr,
    });
    if (sized.reason !== "ok") {
      const would = Math.min(sized.qtyRisk, sized.qtyCap);
      await rememberSkip(
        candidate,
        sized.reason,
        decisionSentence({ outcome: "skipped", reasonCode: sized.reason, qty: would, notional: would * entry, minOrderInr: settings.minOrderInr }),
        runId,
        today,
        settings.dryRun,
        { qty: would, limit: entry, stop: candidate.stop, notional: would * entry, text: sized.text },
      );
      continue;
    }
    const paced = paceBuys([{ symbol: candidate.symbol, strategy: candidate.strategy, notional: sized.notional }], paceBook, paceLimits);
    const paceReason = paced.results[0]?.reason ?? "ok";
    if (paceReason !== "ok") {
      const text = decisionSentence({
        outcome: "skipped",
        reasonCode: paceReason,
        strategy: candidate.strategy,
        limitCount: paceReason === "strategy_full" ? settings.maxOpenPerStrategy : paceReason === "pacing_strategy" ? settings.maxBuysPerStrategy : settings.maxNewBuys,
      });
      await rememberSkip(candidate, paceReason, text, runId, today, settings.dryRun);
      continue;
    }
    const action = recheckPlan({
      outcome: candidate.outcome,
      reasonCode: candidate.reasonCode,
      sizingReason: sized.reason,
      buysSent,
      maxBuys: settings.maxBuys,
      openPositions: openCount,
      maxPositions: settings.maxOpen,
      sectorCount: sectorCounts.get(candidate.sector) ?? 0,
      maxPerSector: settings.maxPerSector,
    });
    if (action !== "propose") continue;
    paceBook = paced.book;
    const sizing = {
      qty: sized.qty,
      limit: entry,
      stop: candidate.stop,
      notional: sized.notional,
      signalClose: candidate.signalClose,
      text: sized.text,
    };
    if (candidate.id != null) {
      await q(
        `UPDATE mlive.mlive_decisions
            SET outcome = 'proposed', reason_code = 'ranked', reason_text = $2, sizing = $3::jsonb, run_id = $4
          WHERE id = $1 AND outcome = 'skipped' AND reason_code = ANY($5::text[])`,
        [candidate.id, sized.text, JSON.stringify(sizing), runId, [...RECHECK_REASON_CODES]]
      );
    } else {
      await q(
        `INSERT INTO mlive.mlive_decisions
           (run_id, trade_date, idea_id, side, symbol, outcome, reason_code, reason_text, sizing, rank, dry_run)
         VALUES ($1, $2::date, $3, 'BUY', $4, 'proposed', 'ranked', $5, $6::jsonb, NULL, $7)
         ON CONFLICT (trade_date, side, idea_id) WHERE idea_id IS NOT NULL
         DO UPDATE SET outcome = 'proposed', reason_code = 'ranked', reason_text = EXCLUDED.reason_text, sizing = EXCLUDED.sizing, run_id = EXCLUDED.run_id
          WHERE mlive.mlive_decisions.outcome IN ('proposed', 'skipped')`,
        [runId, today, candidate.ideaId, candidate.symbol, sized.text, JSON.stringify(sizing), settings.dryRun]
      );
    }
    await audit({
      actor: "engine",
      action: "recheck",
      symbol: candidate.symbol,
      reason: candidate.reasonCode?.startsWith("pacing_") ? "rechecked: pacing slot free" : "rechecked: cash available",
      after: { qty: sized.qty, limit: entry },
      runId,
    });
    if (state.mode === "approve") {
      await raiseAlert({
        level: "needs_you",
        code: "approve_buy",
        symbol: candidate.symbol,
        message: `Approve buy ${candidate.symbol} · ${sized.qty} @ ₹${entry}`,
        runId,
      });
    }
    spendable = Math.max(0, spendable - sized.notional);
    buysSent += 1;
    openCount += 1;
    if (candidate.sector) sectorCounts.set(candidate.sector, (sectorCounts.get(candidate.sector) ?? 0) + 1);
    promoted += 1;
  }
  if (paceBook.baseline != null && paceBook.baseline > 0) await saveDeployBaseline(today, paceBook.baseline);
  return promoted;
}

async function rememberSkip(
  candidate: Candidate,
  code: string,
  text: string,
  runId: number,
  today: string,
  dryRun: boolean,
  sizing: unknown = null,
): Promise<void> {
  if (candidate.id != null) {
    if (candidate.reasonCode === code) return;
    await q(
      `UPDATE mlive.mlive_decisions
          SET outcome = 'skipped', reason_code = $2, reason_text = $3, run_id = $4
        WHERE id = $1 AND outcome IN ('proposed', 'skipped')`,
      [candidate.id, code, text, runId]
    );
    return;
  }
  await q(
    `INSERT INTO mlive.mlive_decisions
       (run_id, trade_date, idea_id, side, symbol, outcome, reason_code, reason_text, sizing, rank, dry_run)
     VALUES ($1, $2::date, $3, 'BUY', $4, 'skipped', $5, $6, $7::jsonb, NULL, $8)
     ON CONFLICT (trade_date, side, idea_id) WHERE idea_id IS NOT NULL
     DO UPDATE SET outcome = 'skipped', reason_code = EXCLUDED.reason_code, reason_text = EXCLUDED.reason_text, sizing = EXCLUDED.sizing, run_id = EXCLUDED.run_id
      WHERE mlive.mlive_decisions.outcome IN ('proposed', 'skipped')`,
    [runId, today, candidate.ideaId, candidate.symbol, code, text, sizing == null ? null : JSON.stringify(sizing), dryRun]
  );
}

async function ideaIsViable(args: {
  symbol: string;
  strategy: "rs" | "ema";
  signalClose: number;
  stop: number | null;
  sector: string;
  sectorCounts: Map<string, number>;
  kiteQty: Map<string, number>;
  systemQty: number;
  settings: Awaited<ReturnType<typeof loadSettings>>;
}): Promise<boolean> {
  const bars = await loadBars(args.symbol, 30);
  const last = await previousClose(args.symbol);
  const yahoo = await yahooPreviousClose(args.symbol);
  const bad = priceSkip({
    yahooPrevClose: yahoo,
    bhavClose: last?.close ?? null,
    live: null,
    lastClose: last?.close ?? null,
    volume: last?.volume ?? null,
    corporateAction: false,
  });
  const instrument = await q<{ is_etf: boolean }>(`SELECT is_etf FROM mlive.mlive_instruments WHERE symbol = $1`, [args.symbol]);
  const entry = limitPrice(args.signalClose, args.settings.limitOffset);
  const reason = ideaRejectReason({
    heldBySystem: args.systemQty > 0,
    heldBySanjay: heldOutsideSystem(args.kiteQty.get(args.symbol) ?? 0, args.systemQty),
    excluded: isExcluded(args.symbol, args.settings.exclude, instrument[0]?.is_etf === true),
    sectorCount: args.sectorCounts.get(args.sector) ?? 0,
    maxPerSector: args.settings.maxPerSector,
    historyDays: bars.length,
    badData: bad != null || args.stop == null,
    chasing: false,
    belowMinAfterSizing: false,
    entryBelowStop: args.strategy === "ema" && args.stop != null && entryBelowEma(entry, args.stop),
  });
  return reason == null;
}
