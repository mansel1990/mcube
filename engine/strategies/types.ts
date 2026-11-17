import type { Bar } from "./math";

export type { Bar };

export type BookName = "swing" | "intraday";
export type Side = "long" | "short";

export type ParamSpec = { default: number; grid: number[] };

/** A signal is decided on the close of `at`. The fill is the next bar. */
export type Signal = {
  at: number;
  side: Side;
  score: number;
  /** Trend stop known at the close of `at`. Sizing uses this. */
  stop: number;
  target?: number | null;
  /** Skip the fill when the slipped entry is below this price. */
  minEntry?: number;
  /** Live 09:45 limit at the signal close plus the configured offset. */
  useLimit?: boolean;
  /** False when `stop` is not a price exit. */
  priceStop?: boolean;
  /** Size to the order cap even when `stop` is a real price. Momentum never uses 1% risk. */
  sizeToCap?: boolean;
  /** ATR known at the signal close. Used only by declarative exposure sizing variants. */
  sizingAtr?: number;
  range?: number;
};

export type SignalContext = {
  bars: Bar[];
  params: Record<string, number>;
  /** 1 is the strongest name that day. NaN when this bar has no rank. */
  rank: Float64Array;
  /** How many names were ranked that day. */
  rankN: Float64Array;
  /** 1 when NIFTY 50's close is above its own 200-day average. */
  indexUp: Uint8Array;
  /** NIFTY 50 close on this bar's date. NaN when missing. */
  indexClose: Float64Array;
  /** ATR known before this session, for intraday stops. */
  atr?: number;
  cache?: Map<string, unknown>;
};

export type ExitState = SignalContext & {
  entryAt: number;
  side: Side;
  stop: number;
  /** Fill price. Present once the position is open. */
  entryPx?: number;
};

export type StrategyDef = {
  name: string;
  book: BookName;
  params: Record<string, ParamSpec>;
  signals(ctx: SignalContext): Signal[];
  /**
   * The signal stays on until the exit, and a skipped day can still be bought later
   * in that spell. Used when a weekly list would otherwise be one entry date.
   */
  flexibleEntry?: boolean;
  /** After the close of bar `i`. Only bars at or before `i` are in the past. */
  afterClose(ctx: ExitState, i: number): { exit: boolean; stop: number };
  /** Intraday stop and target from the fill price. */
  bracket?(entryPx: number, signal: Signal, ctx: SignalContext): { stop: number; target: number | null };
};

export function defaultParams(strategy: StrategyDef): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [key, spec] of Object.entries(strategy.params)) out[key] = spec.default;
  return out;
}

export function paramKey(params: Record<string, number>): string {
  const keys = Object.keys(params).sort();
  if (keys.length === 0) return "default";
  return keys.map((key) => `${key}=${params[key]}`).join("&");
}

export function paramSets(strategy: StrategyDef, grid: boolean): Array<{ key: string; params: Record<string, number>; isDefault: boolean }> {
  const base = defaultParams(strategy);
  const sets = [{ key: paramKey(base), params: base, isDefault: true }];
  if (!grid) return sets;
  for (const [name, spec] of Object.entries(strategy.params)) {
    for (const value of spec.grid) {
      if (value === spec.default) continue;
      const params = { ...base, [name]: value };
      sets.push({ key: paramKey(params), params, isDefault: false });
    }
  }
  return sets;
}

export function emptyRank(length: number): Float64Array {
  const rank = new Float64Array(length);
  rank.fill(Number.NaN);
  return rank;
}

export function emptyContext(bars: Bar[], params: Record<string, number> = {}): SignalContext {
  const n = bars.length;
  return {
    bars,
    params,
    rank: emptyRank(n),
    rankN: new Float64Array(n),
    indexUp: new Uint8Array(n),
    indexClose: emptyRank(n),
  };
}
