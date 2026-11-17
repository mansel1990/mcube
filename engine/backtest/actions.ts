/**
 * Official records used to validate a discontinuity. A listing drops bars from
 * before the first session. A split, bonus or demerger adjusts earlier bars
 * only when `priceFactor` puts them on the post-action scale.
 * Price factor multiplies pre-action OHLC. Volume is divided by that factor.
 */
export type CorporateAction = {
  symbol: string;
  /** Ex-date or listing date, YYYY-MM-DD. */
  date: string;
  kind: "listing" | "split" | "bonus" | "demerger";
  priceFactor?: number;
  note: string;
};

/**
 * Checked against NSE circulars and the stored candles.
 * NMDC has no usable factor: the stored series rises 85.7% on the ex-date
 * while the official session fell about 20% (close ₹104.30, open ₹92.25).
 */
export const VERIFIED_ACTIONS: readonly CorporateAction[] = [
  {
    symbol: "MEDANTA",
    date: "2022-11-16",
    kind: "listing",
    note: "Global Health (MEDANTA) listed on 16 Nov 2022. Earlier candles, ₹47 to ₹60.50, are not this listing.",
  },
  {
    symbol: "NMDC",
    date: "2022-10-27",
    kind: "demerger",
    note: "NMDC Steel demerger ex-date 27 Oct 2022. The official session fell about 20% (NSE close ₹104.30 from ₹130.75, open ₹92.25). Stored candles rise from ₹15.75 to ₹29.25, so the opening gap is not the official print and no single factor reconciles the scales. The segment restarts. Prices inside each segment are left as stored.",
  },
];

export function actionsFor(symbol: string, actions: readonly CorporateAction[]): CorporateAction[] {
  return actions.filter((action) => action.symbol === symbol).sort((a, b) => a.date.localeCompare(b.date));
}
