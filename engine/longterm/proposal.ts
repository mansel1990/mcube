import { addDays, isTradingDay, nextTradingDay } from "@/lib/mlive/calendar";
import { DEFAULT_LONGTERM_COSTS, DEFAULT_LONGTERM_TAX, DEFAULT_REPRESENTATIVE_ETFS, type Sleeve } from "./variants";

export type SleeveWeights = Record<string, number>;

export type ProposalTrade = {
  side: "BUY" | "SELL";
  symbol: string;
  sleeve: string;
  qty: number;
  limit: number;
  notional: number;
  costInr: number;
  taxInr: number;
};

export type AllocationChange = {
  variant: string;
  signalDate: string;
  reason: string;
  currentWeights: SleeveWeights;
  targetWeights: SleeveWeights;
  trades: ProposalTrade[];
  costsInr: number;
  taxInr: number;
};

export type StoredProposal = AllocationChange & {
  id: number;
  status: "pending" | "approved" | "rejected" | "expired";
  proposedOn: string;
  expiresOn: string;
  eventsUsed: number;
  eventsCap: number;
  note: string;
};

export type DecisionDraft = {
  tradeDate: string;
  side: "BUY" | "SELL";
  symbol: string;
  qty: number;
  limit: number;
  reason: string;
  rank: number;
};

const WEIGHT_BAND = 0.005;

export function activationAllowed(input: {
  enabled: readonly unknown[];
  heldbackConclusion: string | null;
}): boolean {
  return input.enabled.includes("longterm") && input.heldbackConclusion === "qualifies for live design";
}

export function representativeSymbol(variant: string, sleeve: string): string | null {
  if (sleeve === "liquid") return null;
  const config = DEFAULT_REPRESENTATIVE_ETFS[sleeve as keyof typeof DEFAULT_REPRESENTATIVE_ETFS];
  if (!config) return null;
  const parts = config.symbol.split("/").map((part) => part.trim()).filter(Boolean);
  if (parts.length === 1) return parts[0];
  return variant.endsWith("MID") ? parts[parts.length - 1] : parts[0];
}

export function isLongtermEtf(symbol: string): boolean {
  const symbols = new Set<string>();
  for (const variant of ["RADAR-NEXT", "RADAR-MID", "STATIC-NEXT", "STATIC-MID"]) {
    for (const sleeve of ["nifty50", "secondary", "gold"] as const) {
      const symbolForSleeve = representativeSymbol(variant, sleeve);
      if (symbolForSleeve) symbols.add(symbolForSleeve);
    }
  }
  return symbols.has(symbol);
}

export function weightsDiffer(current: SleeveWeights, target: SleeveWeights, band = WEIGHT_BAND): boolean {
  const keys = new Set([...Object.keys(current), ...Object.keys(target)]);
  for (const key of keys) {
    if (Math.abs((current[key] ?? 0) - (target[key] ?? 0)) > band) return true;
  }
  return false;
}

export function buildAllocationChange(input: {
  variant: string;
  signalDate: string;
  reason: string;
  currentWeights: SleeveWeights;
  targetWeights: SleeveWeights;
  bookValue: number;
  prices: Record<string, number>;
}): AllocationChange | null {
  if (!(input.bookValue > 0) || !weightsDiffer(input.currentWeights, input.targetWeights)) return null;
  const sleeves: Sleeve[] = ["nifty50", "secondary", "gold", "liquid"];
  const trades: ProposalTrade[] = [];
  for (const sleeve of sleeves) {
    const symbol = representativeSymbol(input.variant, sleeve);
    const price = input.prices[sleeve];
    if (!symbol || !(price > 0)) continue;
    const delta = (input.targetWeights[sleeve] ?? 0) - (input.currentWeights[sleeve] ?? 0);
    if (Math.abs(delta) <= WEIGHT_BAND) continue;
    const notional = Math.abs(delta) * input.bookValue;
    const qty = Math.floor(notional / price + 1e-9);
    if (qty < 1) continue;
    const side = delta > 0 ? "BUY" : "SELL";
    const traded = qty * price;
    const costInr = traded * (DEFAULT_LONGTERM_COSTS.slippagePct + DEFAULT_LONGTERM_COSTS.transactionCostPct);
    const taxInr = side === "SELL" ? traded * DEFAULT_LONGTERM_TAX.equity.longRate : 0;
    trades.push({ side, symbol, sleeve, qty, limit: round2(price), notional: round2(traded), costInr: round2(costInr), taxInr: round2(taxInr) });
  }
  if (trades.length === 0) return null;
  trades.sort((a, b) => sideRank(a.side) - sideRank(b.side) || a.symbol.localeCompare(b.symbol));
  return {
    variant: input.variant,
    signalDate: input.signalDate,
    reason: input.reason,
    currentWeights: { ...input.currentWeights },
    targetWeights: { ...input.targetWeights },
    trades,
    costsInr: round2(trades.reduce((sum, trade) => sum + trade.costInr, 0)),
    taxInr: round2(trades.reduce((sum, trade) => sum + trade.taxInr, 0)),
  };
}

export function tradingDaysAfter(iso: string, days: number, holidays: ReadonlySet<string>): string {
  let cursor = iso;
  let left = Math.max(0, days);
  while (left > 0) {
    cursor = nextTradingDay(cursor, holidays);
    left -= 1;
  }
  return cursor;
}

/** The session that has not yet had its Long Game send. After 09:15, that is the next trading day. */
export function longtermTradeDate(today: string, minutes: number, holidays: ReadonlySet<string>): string {
  if (!isTradingDay(today, holidays) || minutes >= 9 * 60 + 15) return nextTradingDay(today, holidays);
  return today;
}

export type AfterCloseInput = {
  allowed: boolean;
  cap: number;
  expiryDays: number;
  today: string;
  holidays: ReadonlySet<string>;
  pending: StoredProposal | null;
  approvedThisYear: number;
  change: AllocationChange | null;
};

export type AfterCloseResult = {
  expiredId: number | null;
  created: Omit<StoredProposal, "id" | "status" | "note"> | null;
  alert: { code: "longterm_proposal" | "longterm_cap"; message: string } | null;
  decisions: DecisionDraft[];
};

export function afterClose(input: AfterCloseInput): AfterCloseResult {
  const quiet: AfterCloseResult = { expiredId: null, created: null, alert: null, decisions: [] };
  if (!input.allowed) return quiet;
  let pending = input.pending;
  let expiredId: number | null = null;
  if (pending && pending.status === "pending" && input.today > pending.expiresOn) {
    expiredId = pending.id;
    pending = null;
  }
  if (pending && pending.status === "pending") {
    return { expiredId, created: null, alert: null, decisions: [] };
  }
  if (input.approvedThisYear >= input.cap) {
    return {
      expiredId,
      created: null,
      alert: {
        code: "longterm_cap",
        message: `Long Game has used ${input.approvedThisYear} of ${input.cap} approved allocation changes this calendar year. No further change will be proposed until next year.`,
      },
      decisions: [],
    };
  }
  if (!input.change) return { expiredId, created: null, alert: null, decisions: [] };
  return {
    expiredId,
    created: {
      ...input.change,
      proposedOn: input.today,
      expiresOn: tradingDaysAfter(input.today, input.expiryDays, input.holidays),
      eventsUsed: input.approvedThisYear,
      eventsCap: input.cap,
    },
    alert: {
      code: "longterm_proposal",
      message: `Long Game allocation change needs approval. ${input.approvedThisYear} of ${input.cap} changes used this year.`,
    },
    decisions: [],
  };
}

export function ownerDecision(input: {
  allowed: boolean;
  proposal: StoredProposal | null;
  action: "approve" | "reject";
  note: string;
  tradeDate: string;
}): { status: "approved" | "rejected" | "ignored"; decisions: DecisionDraft[]; note: string } {
  if (!input.allowed || !input.proposal || input.proposal.status !== "pending") {
    return { status: "ignored", decisions: [], note: input.note };
  }
  if (input.action === "reject") return { status: "rejected", decisions: [], note: input.note };
  const ordered = [...input.proposal.trades].sort((a, b) => sideRank(a.side) - sideRank(b.side) || a.symbol.localeCompare(b.symbol));
  return {
    status: "approved",
    note: input.note,
    decisions: ordered.map((trade, index) => ({
      tradeDate: input.tradeDate,
      side: trade.side,
      symbol: trade.symbol,
      qty: trade.qty,
      limit: trade.limit,
      reason: input.proposal?.reason ?? "",
      rank: index + 1,
    })),
  };
}

export function addCalendarDays(iso: string, days: number): string {
  return addDays(iso, days);
}

function sideRank(side: "BUY" | "SELL"): number {
  return side === "SELL" ? 0 : 1;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
