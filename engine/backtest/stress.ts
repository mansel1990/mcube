import { cagrPct, equityPeriods, profitFactor } from "@/lib/mlive/research-bar";
import { slipped } from "./money";
import { muteKey, runSwingPortfolio, type Candidate, type FilledTrade, type SwingRules } from "./portfolio";

const EXECUTION_NOTE =
  "Slippage on market and open fills is 0.10% instead of 0.05%. A buy limit does not fill above its limit. A stop that is touched fills at the stop. A gap exit and a rule exit take the adverse open slippage.";

export function withExecutionSlip(candidates: readonly Candidate[], slip: number): Candidate[] {
  return candidates.map((candidate) => {
    if (candidate.exitReason === "open") return candidate;
    const tick = candidate.tick != null && candidate.tick > 0 ? candidate.tick : 0.05;
    let entryPx = candidate.entryPx;
    if (candidate.fill === "intraday" && candidate.entryRaw != null && candidate.entryLimit != null) {
      const better = slipped(candidate.entryRaw, candidate.side, "entry", slip, tick);
      entryPx = candidate.side === "long" ? Math.min(candidate.entryLimit, better) : Math.max(candidate.entryLimit, better);
    }
    let exitPx = candidate.exitPx;
    const level = candidate.protective != null && candidate.protective > 0 ? candidate.protective : candidate.stop;
    const open = candidate.exitOpen;
    const gapped = open != null && (candidate.side === "long" ? open < level : open > level);
    if (candidate.exitReason === "rule" && open != null) exitPx = slipped(open, candidate.side, "exit", slip, tick);
    else if (candidate.exitReason === "stop" && gapped && open != null) exitPx = slipped(open, candidate.side, "exit", slip, tick);
    if (entryPx === candidate.entryPx && exitPx === candidate.exitPx) return candidate;
    return { ...candidate, entryPx, exitPx };
  });
}

export function concentrationKeys(trades: readonly FilledTrade[], count: number): Set<string> {
  const winners = trades.filter((trade) => trade.net > 0).sort((a, b) => b.net - a.net || a.symbol.localeCompare(b.symbol));
  return new Set(winners.slice(0, count).map((trade) => muteKey(trade)));
}

export function bookOutcome(rules: SwingRules, candidates: Candidate[], calendar: string[], capital: number, from: string, to: string, mute?: ReadonlySet<string>) {
  const book = runSwingPortfolio(candidates, rules, calendar, mute ? { mute } : {});
  const end = book.equity.length ? book.equity[book.equity.length - 1].value : capital;
  return {
    book,
    profitFactor: profitFactor(book.trades.map((trade) => trade.net)),
    cagrPct: cagrPct(capital, end, from, to),
  };
}

export function yearRows(trades: readonly FilledTrade[], equity: readonly { date: string; value: number }[], capital: number, from: string, to: string) {
  return equityPeriods(equity, capital, from, to, "year").map((period) => ({
    year: period.key,
    profitFactor: profitFactor(trades.filter((trade) => trade.exitDate.slice(0, 4) === period.key).map((trade) => trade.net)),
    bookReturnPct: period.returnPct,
  }));
}

export function executionNote(): string {
  return EXECUTION_NOTE;
}
