/** Build and validate Kite two-leg (OCO) sell GTT for CNC exits after a buy. */

export function roundPrice(n: number): number {
  return Math.round(n * 100) / 100;
}

/** % move from reference (e.g. LTP) to price. */
export function pctFromRef(ref: number, price: number): number {
  if (ref <= 0) return 0;
  return ((price - ref) / ref) * 100;
}

export function priceFromPct(ref: number, pct: number): number {
  return roundPrice(ref * (1 + pct / 100));
}

/** Sell LIMIT: slightly below trigger so Kite can place the order. */
export function sellLimitBelowTrigger(trigger: number): number {
  const buffer = Math.max(trigger * 0.002, 0.05);
  return roundPrice(trigger - buffer);
}

export function validateExitGtt(
  stopLoss: number,
  target: number,
  lastPrice: number
): string | null {
  if (!Number.isFinite(stopLoss) || stopLoss <= 0) return "Invalid stop loss";
  if (!Number.isFinite(target) || target <= 0) return "Invalid target";
  if (!Number.isFinite(lastPrice) || lastPrice <= 0) return "Price unavailable for GTT";
  if (stopLoss >= lastPrice) return "Stop loss must be below current price";
  if (target <= lastPrice) return "Target must be above current price";
  if (stopLoss >= target) return "Stop loss must be below target";
  return null;
}

export interface OcoSellGttLeg {
  trigger: number;
  limit: number;
}

export interface OcoSellGttPayload {
  exchange: string;
  tradingsymbol: string;
  lastPrice: number;
  quantity: number;
  stopLoss: OcoSellGttLeg;
  target: OcoSellGttLeg;
}

export function buildOcoSellGttPayload(params: {
  symbol: string;
  exchange?: string;
  quantity: number;
  lastPrice: number;
  stopLoss: number;
  target: number;
}): OcoSellGttPayload {
  const err = validateExitGtt(params.stopLoss, params.target, params.lastPrice);
  if (err) throw new Error(err);

  const slTrigger = roundPrice(params.stopLoss);
  const targetTrigger = roundPrice(params.target);

  return {
    exchange: params.exchange ?? "NSE",
    tradingsymbol: params.symbol.toUpperCase(),
    lastPrice: roundPrice(params.lastPrice),
    quantity: Math.floor(params.quantity),
    stopLoss: {
      trigger: slTrigger,
      limit: sellLimitBelowTrigger(slTrigger),
    },
    target: {
      trigger: targetTrigger,
      limit: sellLimitBelowTrigger(targetTrigger),
    },
  };
}

export function ocoSellGttToRelayBody(payload: OcoSellGttPayload) {
  const { exchange, tradingsymbol, lastPrice, quantity, stopLoss, target } = payload;

  const condition = {
    exchange,
    tradingsymbol,
    trigger_values: [stopLoss.trigger, target.trigger],
    last_price: lastPrice,
  };

  const leg = (trigger: OcoSellGttLeg) => ({
    exchange,
    tradingsymbol,
    transaction_type: "SELL" as const,
    quantity,
    order_type: "LIMIT" as const,
    product: "CNC" as const,
    price: trigger.limit,
  });

  return {
    type: "two-leg",
    condition,
    orders: [leg(stopLoss), leg(target)],
  };
}
