/**
 * Equity charge estimate used when Kite's virtual contract note is unavailable.
 * Rates are the defaults below; the engine may override them from `mlive_settings.charges`.
 *
 * Delivery is the default. A CNC buy and sell on the same trade date is intraday at
 * Zerodha: brokerage 0.03% per order capped at ₹20, STT 0.025% on the sell only,
 * stamp 0.003% on the buy, and no DP charge. Exchange, SEBI and the 18% GST rate
 * stay as they are. GST is 18% of brokerage + exchange + SEBI; delivery brokerage
 * is zero, so a delivery estimate does not change.
 *
 * DP is not part of the Kite virtual-contract payload, so a delivery sell adds
 * `dpInr` on top of either the formula or the API total.
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
  brokerage: number;
  stt: number;
  exchange: number;
  sebi: number;
  stamp: number;
  gst: number;
  dp: number;
  total: number;
  source: "formula" | "kite";
};

const INTRADAY_BROKERAGE_PCT = 0.0003;
const INTRADAY_BROKERAGE_CAP = 20;
const INTRADAY_STT_PCT = 0.00025;
const INTRADAY_STAMP_PCT = 0.00003;

function paise(n: number): number {
  return Math.round(n * 100) / 100;
}

export function estimateCharges(
  side: "BUY" | "SELL",
  turnover: number,
  rates: ChargeRates = DEFAULT_CHARGE_RATES,
  intraday = false
): ChargeBreakdown {
  const brokerage = intraday ? paise(Math.min(turnover * INTRADAY_BROKERAGE_PCT, INTRADAY_BROKERAGE_CAP)) : 0;
  const stt = paise(turnover * (intraday ? (side === "SELL" ? INTRADAY_STT_PCT : 0) : rates.sttPct));
  const exchange = paise(turnover * rates.exchangePct);
  const sebi = paise(turnover * rates.sebiPct);
  const stamp = side === "BUY" ? paise(turnover * (intraday ? INTRADAY_STAMP_PCT : rates.stampBuyPct)) : 0;
  const gst = paise((brokerage + exchange + sebi) * rates.gstPct);
  const dp = side === "SELL" && !intraday ? paise(rates.dpInr) : 0;
  const total = paise(brokerage + stt + exchange + sebi + stamp + gst + dp);
  return { turnover, brokerage, stt, exchange, sebi, stamp, gst, dp, total, source: "formula" };
}

export type ChargeSplit = {
  brokerage: number;
  stt: number;
  exchange: number;
  sebi: number;
  stamp: number;
  gst: number;
  dp: number;
  total: number;
};

/** Component-wise `next − prev`, rounded to paise. An intraday correction is negative. */
export function chargeDifference(next: ChargeSplit, prev: ChargeSplit): ChargeSplit {
  return {
    brokerage: paise(next.brokerage - prev.brokerage),
    stt: paise(next.stt - prev.stt),
    exchange: paise(next.exchange - prev.exchange),
    sebi: paise(next.sebi - prev.sebi),
    stamp: paise(next.stamp - prev.stamp),
    gst: paise(next.gst - prev.gst),
    dp: paise(next.dp - prev.dp),
    total: paise(next.total - prev.total),
  };
}

/** Add the flat DP charge onto a Kite virtual-contract total. Intraday and buys have none. */
export function withDp(
  apiTotal: number,
  side: "BUY" | "SELL",
  rates: ChargeRates = DEFAULT_CHARGE_RATES,
  intraday = false
): number {
  if (intraday || side !== "SELL") return paise(apiTotal);
  return paise(apiTotal + rates.dpInr);
}
