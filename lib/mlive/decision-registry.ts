export type LifecycleStatus = "live_pilot" | "parked" | "retired" | "stopped";
export type RegistryBook = "swing" | "intraday" | "longterm";

export type DecisionRecord = {
  id: string;
  book: RegistryBook;
  status: LifecycleStatus;
  label: string;
  decidedOn: string;
  reason: string;
  explanation?: string;
};

/**
 * Owner decisions for Research. This is presentation only.
 * It is not read by the engine and it does not change strategies_enabled.
 */
export const RESEARCH_DECISIONS: readonly DecisionRecord[] = [
  {
    id: "swing:momentum:M10-6",
    book: "swing",
    status: "live_pilot",
    label: "Momentum M10-6",
    decidedOn: "2026-11-18",
    reason: "Small-size live pilot",
    explanation: "Running with real money by owner's choice. It passed 3 of 5 tests: short on trade count (140 of 150) and profitable half-years (3 of 5). Small size, stop rule agreed.",
  },
  {
    id: "intraday:orb",
    book: "intraday",
    status: "retired",
    label: "Opening Range",
    decidedOn: "2026-11-18",
    reason: "PF 0.71",
  },
  {
    id: "intraday:vwap",
    book: "intraday",
    status: "retired",
    label: "VWAP",
    decidedOn: "2026-11-18",
    reason: "PF 0.34",
  },
  {
    id: "swing:ema",
    book: "swing",
    status: "stopped",
    label: "EMA Pullback",
    decidedOn: "2026-11-18",
    reason: "Stopped by the owner",
    explanation: "EMA Pullback is stopped. It is not inferred from the enabled-strategy list.",
  },
  {
    id: "swing:rs",
    book: "swing",
    status: "stopped",
    label: "RS Resilience",
    decidedOn: "2026-11-18",
    reason: "Stopped by the owner",
    explanation: "RS Resilience is stopped. It is not inferred from the enabled-strategy list.",
  },
  {
    id: "longterm:RADAR-MID",
    book: "longterm",
    status: "parked",
    label: "Radar",
    decidedOn: "2026-11-18",
    reason: "Radar did not qualify on 18 Nov 2026 (run 17). Radar is parked as research only. The override is consumed.",
    explanation: "Held-back run 17 covered 2024-01-01 through 2026-11-18. Radar's drawdown was 14.2% against Core's 12.5%. The rule required Radar at or under 15% and lower than Core. Radar passed the cap and failed the comparison.",
  },
];

export const RADAR_RULES_PARAGRAPH =
  "Radar did not qualify on 18 Nov 2026 (run 17). Its held-back drawdown was 14.2%, under the 15% cap but not lower than Core's 12.5% on the same window. Radar is parked as research only. The override is consumed.";

export function decisionById(id: string): DecisionRecord | null {
  return RESEARCH_DECISIONS.find((row) => row.id === id) ?? null;
}

export function retiredStoppedRecords(records: readonly DecisionRecord[] = RESEARCH_DECISIONS): DecisionRecord[] {
  return records.filter((row) => row.status === "retired" || row.status === "stopped");
}

export function statusLabel(status: LifecycleStatus): string {
  if (status === "live_pilot") return "Live pilot";
  if (status === "parked") return "Parked";
  if (status === "retired") return "Retired";
  return "Stopped";
}
