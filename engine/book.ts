import { randomBytes } from "crypto";
import { estimateCharges, withDp } from "@/lib/mlive/charges";
import { clampSellQty, fillDeltaPrice, gttLastPrice, gttPrices, gttQtyAction, makeTag, rejectIsKnown, type ExitParams, type Side } from "@/lib/mlive/rules";
import { audit } from "./audit";
import { raiseAlert } from "./alerts";
import { jsonValue, num, q } from "./db";
import { MliveKite } from "./kite";
import { livePrice, previousClose } from "./market";
import type { MliveSettings } from "./load";

export type OpenPosition = {
  id: number;
  symbol: string;
  strategy: "rs" | "ema" | null;
  qty: number;
  avgPrice: number;
  trendStop: number | null;
  frozen: boolean;
  openedAt: string;
};

export type Decision = {
  id: number;
  side: Side;
  symbol: string;
  outcome: string;
  sizing: { qty?: number; limit?: number; stop?: number; text?: string; signalClose?: number } | null;
  ideaId: number | null;
  positionId: number | null;
};

export function shortId(): string {
  return randomBytes(4).toString("hex").slice(0, 6).toUpperCase();
}

function sizingOf(value: unknown): Decision["sizing"] {
  if (!value || typeof value !== "object") return null;
  const row = value as Decision["sizing"];
  return row;
}

export async function openPositions(includeDry = false): Promise<OpenPosition[]> {
  const rows = await q(
    `SELECT id, symbol, strategy, qty, avg_price, trend_stop, frozen, opened_at
       FROM mlive.mlive_positions
      WHERE closed_at IS NULL AND ($1::boolean OR dry_run = false)
      ORDER BY id`,
    [includeDry]
  );
  return rows.map((row) => ({
    id: num(row.id),
    symbol: String(row.symbol),
    strategy: row.strategy === "rs" || row.strategy === "ema" ? row.strategy : null,
    qty: num(row.qty),
    avgPrice: num(row.avg_price),
    trendStop: row.trend_stop == null ? null : num(row.trend_stop),
    frozen: row.frozen === true,
    openedAt: String(row.opened_at),
  }));
}

export async function decisionsFor(day: string, side?: Side): Promise<Decision[]> {
  const rows = await q(
    `SELECT id, side, symbol, outcome, sizing, idea_id, position_id
       FROM mlive.mlive_decisions
      WHERE trade_date = $1::date AND ($2::text IS NULL OR side = $2)
      ORDER BY rank NULLS LAST, id`,
    [day, side ?? null]
  );
  return rows.map((row) => ({
    id: num(row.id),
    side: row.side === "SELL" ? "SELL" : "BUY",
    symbol: String(row.symbol),
    outcome: String(row.outcome),
    sizing: sizingOf(row.sizing),
    ideaId: row.idea_id == null ? null : num(row.idea_id),
    positionId: row.position_id == null ? null : num(row.position_id),
  }));
}

export type BuyPace = {
  newBuys: number;
  strategyBuys: { rs: number; ema: number };
  openInStrategy: { rs: number; ema: number };
  deployed: number;
  baseline: number | null;
};

/** Buys that still count today. Rejected and cancelled orders do not. */
export async function buyPace(
  day: string,
  includeDry = false,
  count: { proposed?: boolean; approved?: boolean } = {}
): Promise<BuyPace> {
  const orders = await q<{ strategy: string | null; n: unknown; notional: unknown }>(
    `SELECT i.strategy, COUNT(*)::int AS n, COALESCE(SUM(o.qty * o.limit_price), 0) AS notional
       FROM mlive.mlive_orders o
       JOIN mlive.mlive_decisions d ON d.id = o.decision_id
       LEFT JOIN mlive.mlive_ideas i ON i.id = d.idea_id
      WHERE d.trade_date = $1::date
        AND o.side = 'BUY'
        AND o.status NOT IN ('CANCELLED', 'REJECTED')
        AND ($2::boolean OR o.dry_run = false)
      GROUP BY i.strategy`,
    [day, includeDry]
  );
  const outcomes = [count.proposed ? "proposed" : "", count.approved ? "approved" : ""].filter(Boolean);
  if (outcomes.length) {
    const waiting = await q<{ strategy: string | null; n: unknown; notional: unknown }>(
      `SELECT i.strategy, COUNT(*)::int AS n,
              COALESCE(SUM((d.sizing->>'qty')::numeric * (d.sizing->>'limit')::numeric), 0) AS notional
         FROM mlive.mlive_decisions d
         LEFT JOIN mlive.mlive_ideas i ON i.id = d.idea_id
        WHERE d.trade_date = $1::date
          AND d.side = 'BUY'
          AND d.outcome = ANY($3::text[])
          AND ($2::boolean OR d.dry_run = false)
          AND NOT EXISTS (
            SELECT 1 FROM mlive.mlive_orders o
             WHERE o.decision_id = d.id AND o.side = 'BUY' AND o.status NOT IN ('CANCELLED', 'REJECTED')
          )
        GROUP BY i.strategy`,
      [day, includeDry, outcomes]
    );
    orders.push(...waiting);
  }
  const open = await q<{ strategy: string | null; n: unknown }>(
    `SELECT strategy, COUNT(*)::int AS n
       FROM mlive.mlive_positions
      WHERE closed_at IS NULL AND ($1::boolean OR dry_run = false)
      GROUP BY strategy`,
    [includeDry]
  );
  const report = await q<{ decision_summary: unknown }>(
    `SELECT decision_summary FROM mlive.mlive_daily_reports WHERE trade_date = $1::date`,
    [day]
  );
  const summary = jsonValue(report[0]?.decision_summary);
  const baselineRaw = summary && typeof summary === "object" ? (summary as { deployBaseline?: unknown }).deployBaseline : null;
  const strategyBuys = { rs: 0, ema: 0 };
  let deployed = 0;
  let newBuys = 0;
  for (const row of orders) {
    const n = num(row.n);
    newBuys += n;
    deployed += num(row.notional);
    if (row.strategy === "rs" || row.strategy === "ema") strategyBuys[row.strategy] += n;
  }
  const openInStrategy = { rs: 0, ema: 0 };
  for (const row of open) {
    if (row.strategy === "rs" || row.strategy === "ema") openInStrategy[row.strategy] = num(row.n);
  }
  return {
    newBuys,
    strategyBuys,
    openInStrategy,
    deployed,
    baseline: baselineRaw == null || baselineRaw === "" || !(num(baselineRaw) > 0) ? null : num(baselineRaw),
  };
}

export async function saveDeployBaseline(day: string, baseline: number): Promise<void> {
  if (!(baseline > 0)) return;
  await q(
    `INSERT INTO mlive.mlive_daily_reports (trade_date, decision_summary, text)
     VALUES ($1::date, jsonb_build_object('deployBaseline', $2::numeric), 'Morning draft')
     ON CONFLICT (trade_date) DO UPDATE
       SET decision_summary = COALESCE(mlive.mlive_daily_reports.decision_summary, '{}'::jsonb)
         || jsonb_build_object('deployBaseline', $2::numeric)`,
    [day, baseline]
  );
}

export async function sentCounts(day: string): Promise<{ buys: number; sells: number }> {
  const rows = await q<{ side: string; n: unknown }>(
    `SELECT o.side, COUNT(*)::int AS n
       FROM mlive.mlive_orders o
       JOIN mlive.mlive_decisions d ON d.id = o.decision_id
      WHERE d.trade_date = $1::date
      GROUP BY o.side`,
    [day]
  );
  const buys = num(rows.find((row) => row.side === "BUY")?.n);
  const sells = num(rows.find((row) => row.side === "SELL")?.n);
  return { buys, sells };
}

export async function pendingBuyValue(includeDry = false): Promise<number> {
  const rows = await q<{ total: unknown }>(
    `SELECT COALESCE(SUM((qty - filled_qty) * limit_price), 0) AS total
       FROM mlive.mlive_orders
      WHERE side = 'BUY'
        AND status NOT IN ('CANCELLED', 'REJECTED', 'COMPLETE')
        AND ($1::boolean OR dry_run = false)`,
    [includeDry]
  );
  return num(rows[0]?.total);
}

export async function openCost(includeDry = false): Promise<number> {
  const rows = await q<{ total: unknown }>(
    `SELECT COALESCE(SUM(qty * avg_price), 0) AS total
       FROM mlive.mlive_positions
      WHERE closed_at IS NULL AND ($1::boolean OR dry_run = false)`,
    [includeDry]
  );
  return num(rows[0]?.total);
}

export { rejectIsKnown };

export async function recordOrder(args: {
  decisionId: number;
  tag: string;
  side: Side;
  symbol: string;
  qty: number;
  limit: number;
  kiteOrderId: string;
  dryRun: boolean;
  runId: number;
}): Promise<number> {
  const rows = await q<{ id: string }>(
    `INSERT INTO mlive.mlive_orders
       (decision_id, tag, kite_order_id, side, symbol, qty, limit_price, status, placed_at, dry_run)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now(), $9)
     RETURNING id`,
    [
      args.decisionId,
      args.tag,
      args.kiteOrderId,
      args.side,
      args.symbol,
      args.qty,
      args.limit,
      args.dryRun ? "DRY" : "OPEN",
      args.dryRun,
    ]
  );
  await q(`UPDATE mlive.mlive_decisions SET outcome = 'sent' WHERE id = $1`, [args.decisionId]);
  await audit({
    actor: "engine",
    action: "order.sent",
    symbol: args.symbol,
    after: { side: args.side, tag: args.tag, qty: args.qty, limit: args.limit, dryRun: args.dryRun, kiteOrderId: args.kiteOrderId },
    runId: args.runId,
  });
  return num(rows[0].id);
}

export async function recordExitOrder(args: {
  kiteOrderId: string;
  symbol: string;
  qty: number;
  limit: number;
  dryRun: boolean;
  runId: number;
}): Promise<number> {
  const existing = await q<{ id: string }>(`SELECT id FROM mlive.mlive_orders WHERE kite_order_id = $1`, [args.kiteOrderId]);
  if (existing[0]) return num(existing[0].id);
  const rows = await q<{ id: string }>(
    `INSERT INTO mlive.mlive_orders
       (decision_id, tag, kite_order_id, side, symbol, qty, limit_price, status, placed_at, dry_run, kind)
     VALUES (NULL, NULL, $1, 'SELL', $2, $3, $4, $5, now(), $6, 'gtt_exit')
     RETURNING id`,
    [args.kiteOrderId, args.symbol, args.qty, args.limit, args.dryRun ? "DRY" : "OPEN", args.dryRun]
  );
  await audit({
    actor: "kite",
    action: "gtt.exit",
    symbol: args.symbol,
    after: { side: "SELL", kiteOrderId: args.kiteOrderId, qty: args.qty, limit: args.limit, dryRun: args.dryRun },
    runId: args.runId,
  });
  return num(rows[0].id);
}

export async function applyFill(args: {
  orderId: number;
  kiteOrderId: string;
  side: Side;
  symbol: string;
  filledQty: number;
  avgPrice: number;
  previousFilled: number;
  previousAvg: number;
  orderStatus: string;
  dryRun: boolean;
  gttExit?: boolean;
  strategy: "rs" | "ema" | null;
  stop: number | null;
  settings: MliveSettings;
  kite: MliveKite;
  runId: number;
}): Promise<void> {
  const delta = args.filledQty - args.previousFilled;
  if (delta < 1 || !(args.avgPrice > 0)) return;
  const price = fillDeltaPrice(args.previousFilled, args.previousAvg, args.filledQty, args.avgPrice);
  if (!(price > 0)) return;
  const tradeId = `${args.kiteOrderId}:${args.filledQty}`;
  const inserted = await q<{ id: string }>(
    `INSERT INTO mlive.mlive_fills (order_id, kite_trade_id, qty, price, ts)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (kite_trade_id) DO NOTHING
     RETURNING id`,
    [args.orderId, tradeId, delta, price]
  );
  if (!inserted[0]) return;
  await q(
    `UPDATE mlive.mlive_orders SET filled_qty = $2, avg_price = $3, status = $4, updated_at = now() WHERE id = $1`,
    [args.orderId, args.filledQty, args.avgPrice, args.orderStatus]
  );

  const api = await args.kite.contractCharges({ symbol: args.symbol, side: args.side, qty: delta, price });
  const charges = api == null
    ? estimateCharges(args.side, delta * price, args.settings.charges).total
    : withDp(api, args.side, args.settings.charges);

  if (args.side === "BUY") {
    await addBuyPosition({ ...args, avgPrice: price }, delta, charges);
    await q(
      `INSERT INTO mlive.mlive_fund_ledger (kind, amount, ref_order_id, note, dry_run) VALUES ('charges', $1, $2, $3, $4)`,
      [-charges, args.orderId, `Buy charges ${args.symbol}`, args.dryRun]
    );
    const positionId = await positionIdFor(args.symbol, args.dryRun);
    if (positionId) await ensureGtt(positionId, { ...args, avgPrice: price, filledQty: delta });
  } else {
    await reducePosition({ ...args, avgPrice: price }, delta, charges);
  }
  await alignPositionGtt({ ...args, gttExit: args.gttExit === true });
  await audit({
    actor: "kite",
    action: "fill",
    symbol: args.symbol,
    after: { side: args.side, qty: delta, price, charges },
    runId: args.runId,
  });
  await raiseAlert({
    level: "done",
    code: "order_filled",
    symbol: args.symbol,
    message: `${args.symbol} ${delta} filled @ ₹${price}`,
    runId: args.runId,
  });
}

async function positionIdFor(symbol: string, dryRun: boolean): Promise<number | null> {
  const rows = await q(
    `SELECT id FROM mlive.mlive_positions WHERE symbol = $1 AND closed_at IS NULL AND dry_run = $2 ORDER BY id LIMIT 1`,
    [symbol, dryRun]
  );
  return rows[0] ? num(rows[0].id) : null;
}

async function addBuyPosition(
  args: { symbol: string; strategy: "rs" | "ema" | null; avgPrice: number; stop: number | null; dryRun: boolean },
  delta: number,
  charges: number
): Promise<number> {
  const existing = await q(
    `SELECT id, qty, avg_price FROM mlive.mlive_positions
      WHERE symbol = $1 AND closed_at IS NULL AND dry_run = $2 ORDER BY id LIMIT 1`,
    [args.symbol, args.dryRun]
  );
  const row = existing[0];
  if (!row) {
    const inserted = await q<{ id: string }>(
      `INSERT INTO mlive.mlive_positions (symbol, strategy, qty, avg_price, trend_stop, charges, dry_run)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [args.symbol, args.strategy, delta, args.avgPrice, args.stop, charges, args.dryRun]
    );
    return num(inserted[0].id);
  }
  const prevQty = num(row.qty);
  const nextQty = prevQty + delta;
  const avg = (prevQty * num(row.avg_price) + delta * args.avgPrice) / nextQty;
  await q(
    `UPDATE mlive.mlive_positions SET qty = $2, avg_price = $3, charges = charges + $4 WHERE id = $1`,
    [num(row.id), nextQty, avg, charges]
  );
  return num(row.id);
}

export async function ensurePositionGtt(
  positionId: number,
  args: {
    symbol: string;
    filledQty: number;
    avgPrice: number;
    stop: number | null;
    strategy: "rs" | "ema" | null;
    settings: MliveSettings;
    kite: MliveKite;
    runId: number;
  }
): Promise<boolean> {
  await ensureGtt(positionId, { ...args, quiet: true });
  const rows = await q(`SELECT id FROM mlive.mlive_gtts WHERE position_id = $1 AND status IN ('active', 'DRY')`, [positionId]);
  return Boolean(rows[0]);
}

async function ensureGtt(
  positionId: number,
  args: {
    symbol: string;
    filledQty: number;
    avgPrice: number;
    stop: number | null;
    strategy: "rs" | "ema" | null;
    settings: MliveSettings;
    kite: MliveKite;
    runId: number;
    quiet?: boolean;
  }
): Promise<void> {
  const existing = await q(`SELECT id FROM mlive.mlive_gtts WHERE position_id = $1 AND status IN ('active', 'DRY')`, [positionId]);
  if (existing[0] || args.stop == null) return;
  const gap = (args.strategy === "ema" ? args.settings.exitEma : args.settings.exitRs).gtt_gap_pct;
  const prices = gttPrices(args.stop, gap);
  const qty = clampSellQty(args.filledQty, args.filledQty);
  const lastPrice = await markPrice(args.symbol, args.avgPrice);
  try {
    const triggerId = await args.kite.placeGtt({
      symbol: args.symbol,
      qty,
      trigger: prices.trigger,
      limit: prices.limit,
      lastPrice,
    });
    await q(
      `INSERT INTO mlive.mlive_gtts (position_id, kite_trigger_id, trigger_price, limit_price, qty, status, dry_run)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [positionId, triggerId, prices.trigger, prices.limit, qty, triggerId.startsWith("DRY-") ? "DRY" : "active", triggerId.startsWith("DRY-")]
    );
    await raiseAlert({
      level: "done",
      code: "gtt_placed",
      symbol: args.symbol,
      message: `${args.symbol} GTT at ₹${prices.trigger}`,
      runId: args.runId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!args.quiet) {
      await raiseAlert({ level: "problem", code: "gtt_failed", symbol: args.symbol, message, runId: args.runId });
    }
  }
}

/** Move the protective GTT when the trend stop changes. Both strategies only ratchet the trigger up. */
export async function syncGttToStop(args: {
  positionId: number;
  symbol: string;
  qty: number;
  stop: number;
  strategy: "rs" | "ema";
  lastPrice: number;
  settings: MliveSettings;
  runId: number;
}): Promise<void> {
  const rows = await q(
    `SELECT id, kite_trigger_id, trigger_price, limit_price, qty FROM mlive.mlive_gtts
      WHERE position_id = $1 AND status IN ('active', 'DRY') ORDER BY id DESC LIMIT 1`,
    [args.positionId]
  );
  const row = rows[0];
  if (!row?.kite_trigger_id) return;
  const gap = (args.strategy === "ema" ? args.settings.exitEma : args.settings.exitRs).gtt_gap_pct;
  const prices = gttPrices(args.stop, gap);
  const current = num(row.trigger_price);
  const nextQty = args.qty;
  const qtyChanged = num(row.qty) !== nextQty;
  const trigger = Math.max(prices.trigger, current);
  const movingUp = trigger > current + 0.001;
  if (!movingUp && !qtyChanged) return;
  const limit = movingUp ? prices.limit : num(row.limit_price);
  const kite = new MliveKite(args.settings.dryRun);
  try {
    await kite.modifyGtt(String(row.kite_trigger_id), {
      symbol: args.symbol,
      qty: nextQty,
      trigger,
      limit,
      lastPrice: args.lastPrice,
    });
    await q(
      `UPDATE mlive.mlive_gtts
          SET trigger_price = $2, limit_price = $3, qty = $4,
              history = history || jsonb_build_array($5::jsonb)
        WHERE id = $1`,
      [num(row.id), trigger, limit, nextQty, JSON.stringify({ at: new Date().toISOString(), stop: args.stop, trigger, limit, qty: nextQty })]
    );
    await raiseAlert({
      level: "done",
      code: "gtt_moved",
      symbol: args.symbol,
      message: `${args.symbol} GTT moved to ₹${trigger}`,
      runId: args.runId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await raiseAlert({ level: "problem", code: "gtt_failed", symbol: args.symbol, message, runId: args.runId });
  }
}

async function reducePosition(
  args: { symbol: string; avgPrice: number; orderId: number; dryRun: boolean },
  delta: number,
  charges: number
): Promise<void> {
  const rows = await q(
    `SELECT id, qty, avg_price FROM mlive.mlive_positions
      WHERE symbol = $1 AND closed_at IS NULL AND dry_run = $2 ORDER BY id LIMIT 1`,
    [args.symbol, args.dryRun]
  );
  const position = rows[0];
  if (!position) return;
  const owned = num(position.qty);
  const sellQty = Math.min(delta, owned);
  const pnl = (args.avgPrice - num(position.avg_price)) * sellQty - charges;
  const left = owned - sellQty;
  if (left <= 0) {
    await q(
      `UPDATE mlive.mlive_positions
          SET qty = 0, closed_at = now(), realised_pnl = realised_pnl + $2, charges = charges + $3
        WHERE id = $1`,
      [num(position.id), pnl, charges]
    );
  } else {
    await q(
      `UPDATE mlive.mlive_positions
          SET qty = $2, realised_pnl = realised_pnl + $3, charges = charges + $4
        WHERE id = $1`,
      [num(position.id), left, pnl, charges]
    );
  }
  await q(
    `INSERT INTO mlive.mlive_fund_ledger (kind, amount, ref_order_id, note, dry_run) VALUES ('realised_pnl', $1, $2, $3, $4)`,
    [pnl, args.orderId, `Realised ${args.symbol}`, args.dryRun]
  );
}

async function alignPositionGtt(args: {
  symbol: string;
  dryRun: boolean;
  settings: MliveSettings;
  kite: MliveKite;
  runId: number;
  gttExit?: boolean;
}): Promise<void> {
  const positions = await q(
    `SELECT id, qty, avg_price FROM mlive.mlive_positions
      WHERE symbol = $1 AND closed_at IS NULL AND dry_run = $2 ORDER BY id LIMIT 1`,
    [args.symbol, args.dryRun]
  );
  const position = positions[0];
  if (!position) {
    const leftover = await q(
      `SELECT g.id, g.kite_trigger_id FROM mlive.mlive_gtts g
         JOIN mlive.mlive_positions p ON p.id = g.position_id
        WHERE p.symbol = $1 AND p.dry_run = $2 AND g.status IN ('active', 'DRY')`,
      [args.symbol, args.dryRun]
    );
    for (const row of leftover) {
      if (args.gttExit) {
        await q(`UPDATE mlive.mlive_gtts SET status = 'triggered' WHERE id = $1`, [num(row.id)]);
        continue;
      }
      if (row.kite_trigger_id) {
        try {
          await args.kite.deleteGtt(String(row.kite_trigger_id));
        } catch {
          /* Kite may already have dropped it */
        }
      }
      await q(`UPDATE mlive.mlive_gtts SET status = 'cancelled' WHERE id = $1`, [num(row.id)]);
    }
    return;
  }
  const gtts = await q(
    `SELECT id, kite_trigger_id, trigger_price, limit_price, qty FROM mlive.mlive_gtts
      WHERE position_id = $1 AND status IN ('active', 'DRY') ORDER BY id DESC LIMIT 1`,
    [num(position.id)]
  );
  const gtt = gtts[0];
  if (!gtt?.kite_trigger_id) return;
  const action = gttQtyAction(num(position.qty), num(gtt.qty));
  if (action === "keep") return;
  if (action === "cancel") {
    await args.kite.deleteGtt(String(gtt.kite_trigger_id));
    await q(`UPDATE mlive.mlive_gtts SET status = 'cancelled' WHERE id = $1`, [num(gtt.id)]);
    await raiseAlert({
      level: "done",
      code: "gtt_cancelled",
      symbol: args.symbol,
      message: `${args.symbol} GTT cancelled after the sell`,
      runId: args.runId,
    });
    return;
  }
  const lastPrice = await markPrice(args.symbol, num(position.avg_price));
  await args.kite.modifyGtt(String(gtt.kite_trigger_id), {
    symbol: args.symbol,
    qty: num(position.qty),
    trigger: num(gtt.trigger_price),
    limit: num(gtt.limit_price),
    lastPrice,
  });
  await q(`UPDATE mlive.mlive_gtts SET qty = $2 WHERE id = $1`, [num(gtt.id), num(position.qty)]);
}

async function markPrice(symbol: string, avgPrice: number): Promise<number> {
  const live = await livePrice(symbol);
  const close = await previousClose(symbol);
  return gttLastPrice(live, close?.close ?? null, avgPrice);
}

export function exitFor(strategy: "rs" | "ema" | null, settings: MliveSettings): ExitParams {
  return strategy === "ema" ? settings.exitEma : settings.exitRs;
}

export { makeTag };
