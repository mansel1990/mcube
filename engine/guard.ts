import { tagMatches, type Side } from "@/lib/mlive/rules";

/**
 * Last check before any Kite order or protective GTT.
 * Re-checks the 25% cap, the daily limits, the exclude list, owned quantity, and mode.
 * A GTT exit does not use a daily slot and is still allowed while paused:
 * existing stops stay in Kite, and raising one is protective. New buys and sells are not.
 */

export type GuardIntent = {
  side: Side;
  symbol: string;
  qty: number;
  limitPrice: number;
  tag: string;
  decisionId: string;
  product: string;
  orderType: string;
  isGttExit: boolean;
};

export type GuardContext = {
  mode: "approve" | "auto" | "paused";
  status: "active" | "paused_by_user" | "paused_by_breaker" | "halted_today";
  approved: boolean;
  fund: number;
  spendable: number;
  maxOrderPct: number;
  excluded: boolean;
  systemQty: number;
  buysSent: number;
  sellsSent: number;
  maxBuys: number;
  maxSells: number;
  decisionAlreadySent: boolean;
  frozen: boolean;
  openPositions: number;
  maxOpenPositions: number;
  isNewSymbol: boolean;
  sectorCount: number;
  maxPerSector: number;
  /** New buys already committed today, excluding rejected and cancelled orders. */
  newBuys?: number;
  maxNewBuys?: number;
  strategyBuys?: number;
  maxBuysPerStrategy?: number;
  openInStrategy?: number;
  maxOpenPerStrategy?: number;
  deployed?: number;
  /** 50% of Engine can use now, locked at the first buy step. */
  deployCap?: number;
};

export type GuardVerdict = { ok: true; reason: "ok" } | { ok: false; reason: string };

export function guardOrder(intent: GuardIntent, ctx: GuardContext): GuardVerdict {
  const fail = (reason: string): GuardVerdict => ({ ok: false, reason });

  if (!intent.decisionId) return fail("missing_decision");
  if (ctx.decisionAlreadySent) return fail("duplicate_decision");
  if (intent.product !== "CNC") return fail("product");
  if (intent.orderType !== "LIMIT") return fail("order_type");
  if (intent.side !== "BUY" && intent.side !== "SELL") return fail("side");
  if (!Number.isInteger(intent.qty) || intent.qty < 1) return fail("qty");
  if (!(intent.limitPrice > 0)) return fail("price");
  if (!tagMatches(intent.tag, intent.side)) return fail("tag");
  if (ctx.excluded) return fail("excluded");
  if (ctx.frozen) return fail("frozen");

  const blocked =
    ctx.mode === "paused" ||
    ctx.status === "paused_by_user" ||
    ctx.status === "paused_by_breaker" ||
    ctx.status === "halted_today";
  if (blocked && !intent.isGttExit) return fail(ctx.status === "active" ? "paused" : ctx.status);

  if (!intent.isGttExit && ctx.mode === "approve" && !ctx.approved) return fail("not_approved");

  if (intent.side === "BUY") {
    if (intent.isGttExit) return fail("gtt_side");
    if (ctx.systemQty > 0) return fail("already_held");
    const notional = intent.qty * intent.limitPrice;
    if (notional > ctx.maxOrderPct * ctx.fund + 1e-6) return fail("order_cap");
    if (notional > ctx.spendable + 1e-6) return fail("spendable");
    if (ctx.isNewSymbol && ctx.openPositions >= ctx.maxOpenPositions) return fail("max_positions");
    if (ctx.sectorCount >= ctx.maxPerSector) return fail("sector_cap");
    if (ctx.buysSent >= ctx.maxBuys) return fail("buy_limit");
    if (ctx.maxNewBuys != null && (ctx.newBuys ?? 0) >= ctx.maxNewBuys) return fail("pacing_day");
    if (ctx.maxBuysPerStrategy != null && (ctx.strategyBuys ?? 0) >= ctx.maxBuysPerStrategy) return fail("pacing_strategy");
    if (ctx.maxOpenPerStrategy != null && ctx.isNewSymbol && (ctx.openInStrategy ?? 0) >= ctx.maxOpenPerStrategy) return fail("strategy_full");
    if (ctx.deployCap != null && (ctx.deployed ?? 0) + notional > ctx.deployCap + 1e-6) return fail("pacing_cash");
    return { ok: true, reason: "ok" };
  }

  if (intent.qty > ctx.systemQty) return fail("unowned_qty");
  if (!intent.isGttExit && ctx.sellsSent >= ctx.maxSells) return fail("sell_limit");
  return { ok: true, reason: "ok" };
}
