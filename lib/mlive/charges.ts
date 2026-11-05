/**
 * Delivery-equity charge estimate used when Kite's virtual contract note
 * is unavailable. Rates are the defaults below; the engine may override
 * them from `mlive_settings.charges`.
 *
 * The backtest used about 0.24% plus a ₹15.93 DP charge on a ₹15,000 sell.
 * DP is not part of the Kite virtual-contract payload, so a sell always
 * adds `dpInr` on top of either the formula or the API total.
 */

export type ChargeRates = {
  sttPct: number;
  exchangePct: number;
  sebiPct: number;
  stampBuyPct: number;
  gstPct: number;
  dpInr: number;
};

export const DEFAULT_CHARGE_RATES: ChargeRates = {
  sttPct: 0.001,
  exchangePct: 0.0000297,
  sebiPct: 0.000001,
  stampBuyPct: 0.00015,
  gstPct: 0.18,
  dpInr: 15.93,
};

export type ChargeBreakdown = {
  turnover: number;
  stt: number;
  exchange: number;
  sebi: number;
  stamp: number;
  gst: number;
  dp: number;
  total: number;
  source: "formula" | "kite";
};

function paise(n: number): number {
  return Math.round(n * 100) / 100;
}

export function estimateCharges(
  side: "BUY" | "SELL",
  turnover: number,
  rates: ChargeRates = DEFAULT_CHARGE_RATES
): ChargeBreakdown {
  const stt = paise(turnover * rates.sttPct);
  const exchange = paise(turnover * rates.exchangePct);
  const sebi = paise(turnover * rates.sebiPct);
  const stamp = side === "BUY" ? paise(turnover * rates.stampBuyPct) : 0;
  const gst = paise((exchange + sebi) * rates.gstPct);
  const dp = side === "SELL" ? paise(rates.dpInr) : 0;
  const total = paise(stt + exchange + sebi + stamp + gst + dp);
  return { turnover, stt, exchange, sebi, stamp, gst, dp, total, source: "formula" };
}

/** Add the flat DP charge onto a Kite virtual-contract total (sells only). */
export function withDp(apiTotal: number, side: "BUY" | "SELL", rates: ChargeRates = DEFAULT_CHARGE_RATES): number {
  return paise(apiTotal + (side === "SELL" ? rates.dpInr : 0));
}
