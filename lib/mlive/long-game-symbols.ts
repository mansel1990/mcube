/** Configured Long Game ETFs. Research `RepresentativeEtfConfig` is not this list: it merges the two secondaries and leaves Liquid out. */

export const LONG_GAME_INSTRUMENT_SYMBOLS = ["NIFTYBEES", "MID150BEES", "JUNIORBEES", "GOLDBEES", "LIQUIDBEES"] as const;

const KNOWN = new Set<string>(LONG_GAME_INSTRUMENT_SYMBOLS);

export const LONGTERM_DAILY_FROM = "2026-03-01";

export function secondaryEtf(secondary: string): "MID150BEES" | "JUNIORBEES" {
  return secondary === "next" ? "JUNIORBEES" : "MID150BEES";
}

/** Configured sleeves, plus an attributed Long Game ETF that the secondary setting no longer names. */
export function longGameEtfSymbols(secondary: string, attributed: readonly string[] = []): string[] {
  const configured = ["NIFTYBEES", secondaryEtf(secondary), "GOLDBEES", "LIQUIDBEES"];
  const seen = new Set(configured);
  const extra: string[] = [];
  for (const raw of attributed) {
    const symbol = raw.trim().toUpperCase();
    if (!symbol || seen.has(symbol) || !KNOWN.has(symbol)) continue;
    seen.add(symbol);
    extra.push(symbol);
  }
  return [...configured, ...extra];
}

export function isLongGameEtf(symbol: string, secondary: string, attributed: readonly string[] = []): boolean {
  return longGameEtfSymbols(secondary, attributed).includes(symbol.trim().toUpperCase());
}

export type KiteMarkInput = { tradingsymbol: string; lastPrice?: number };

/** Positive Kite holding marks for the canonical symbols. Other holdings are ignored. */
export function kiteMarksToStore(
  kite: readonly KiteMarkInput[],
  symbols: readonly string[]
): { symbol: string; price: number; source: "kite_holding" }[] {
  const wanted = new Set(symbols.map((symbol) => symbol.toUpperCase()));
  const marks: { symbol: string; price: number; source: "kite_holding" }[] = [];
  for (const row of kite) {
    const symbol = row.tradingsymbol.trim().toUpperCase();
    if (!wanted.has(symbol)) continue;
    if (!(typeof row.lastPrice === "number" && Number.isFinite(row.lastPrice) && row.lastPrice > 0)) continue;
    marks.push({ symbol, price: row.lastPrice, source: "kite_holding" });
  }
  return marks;
}

/** Backfill starts at 1 Mar 2026, or earlier when an open lot was bought before that. */
export function longtermDailyFrom(earliestOpenLot: string | null): string {
  if (earliestOpenLot && /^\d{4}-\d{2}-\d{2}$/.test(earliestOpenLot) && earliestOpenLot < LONGTERM_DAILY_FROM) {
    return earliestOpenLot;
  }
  return LONGTERM_DAILY_FROM;
}
