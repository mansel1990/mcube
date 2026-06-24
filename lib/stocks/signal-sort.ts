import { normalizeDateStr } from "./format-date";
import type { UnifiedSignal } from "./types";

/** Newest scan date first; within a date, higher conviction first. */
export function sortSignalsNewestFirst(signals: UnifiedSignal[]): UnifiedSignal[] {
  return [...signals].sort((a, b) => {
    const dateCmp = normalizeDateStr(b.signalDate).localeCompare(normalizeDateStr(a.signalDate));
    if (dateCmp !== 0) return dateCmp;
    return (b.proba ?? 0) - (a.proba ?? 0);
  });
}
