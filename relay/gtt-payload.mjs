/** Shared GTT OCO sell payload builder for the relay (mirrors lib/kite/gtt-exit.ts). */

export const NSE_EQUITY_TICK = 0.05;

export function roundToTick(price, tick = NSE_EQUITY_TICK) {
  const rounded = Math.round(price / tick) * tick;
  return Math.round(rounded * 100) / 100;
}

export function sellLimitBelowTrigger(trigger, tick = NSE_EQUITY_TICK) {
  const buffer = Math.max(trigger * 0.002, tick);
  return roundToTick(trigger - buffer, tick);
}

export function buildOcoSellGttFormFields({
  exchange = "NSE",
  tradingsymbol,
  quantity,
  lastPrice,
  stopLoss,
  target,
}) {
  const ltp = roundToTick(Number(lastPrice));
  const sl = roundToTick(Number(stopLoss));
  const tgt = roundToTick(Number(target));
  const qty = Math.floor(Number(quantity));

  if (sl >= ltp || tgt <= ltp || sl >= tgt) {
    throw new Error("Stop loss must be below LTP and target above LTP");
  }

  const slLimit = sellLimitBelowTrigger(sl);
  const tgtLimit = sellLimitBelowTrigger(tgt);

  const condition = JSON.stringify({
    exchange,
    tradingsymbol: String(tradingsymbol).toUpperCase(),
    trigger_values: [sl, tgt],
    last_price: ltp,
  });

  const orders = JSON.stringify([
    {
      exchange,
      tradingsymbol: String(tradingsymbol).toUpperCase(),
      transaction_type: "SELL",
      quantity: qty,
      order_type: "LIMIT",
      product: "CNC",
      price: slLimit,
    },
    {
      exchange,
      tradingsymbol: String(tradingsymbol).toUpperCase(),
      transaction_type: "SELL",
      quantity: qty,
      order_type: "LIMIT",
      product: "CNC",
      price: tgtLimit,
    },
  ]);

  return { type: "two-leg", condition, orders, meta: { sl, tgt, slLimit, tgtLimit, ltp, qty } };
}
