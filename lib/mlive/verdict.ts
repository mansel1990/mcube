import { minutesOf } from "./schedule";

export type NoBuyReason = "late-kite" | "no-ideas" | "all-skipped" | "paused";

export type VerdictFacts = {
  bought: string[];
  sold: string[];
  skipped: number;
  stopsRaised: number;
  lateLogin: boolean;
  waitingForLogin: boolean;
  rulesBroken: number;
  /** Why nothing was bought. Omitted when the day had a buy, or the reason is unknown. */
  noBuyReason?: NoBuyReason | null;
  /** Names behind `skipped`, already-held ideas left out. */
  skipNames?: string[];
  /** Every skipped idea, including ones already held, with a short reason. */
  skipDetails?: { symbol: string; why: string }[];
};

const SMALL = ["Zero", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"];

function small(n: number): string {
  return SMALL[n] ?? String(n);
}

function names(rows: string[]): string {
  if (rows.length <= 1) return rows[0] ?? "";
  if (rows.length === 2) return `${rows[0]} and ${rows[1]}`;
  return `${rows.slice(0, -1).join(", ")} and ${rows[rows.length - 1]}`;
}

const SKIP_OUTCOMES = new Set(["skipped", "budget", "price", "sizing", "pacing"]);

export type SkipRow = {
  symbol: string;
  outcome: string;
  reasonCode?: string | null;
  reason?: string | null;
  side?: string | null;
};

/** Skip names from decisions. Already-held ideas are left out. */
export function decisionSkips(rows: SkipRow[]): string[] {
  const names: string[] = [];
  for (const row of rows) {
    if ((row.side ?? "BUY").toUpperCase() === "SELL") continue;
    if (!SKIP_OUTCOMES.has(row.outcome.toLowerCase())) continue;
    if (isHeldSkip(row.reason ?? "", row.reasonCode)) continue;
    if (row.symbol) names.push(row.symbol);
  }
  return names;
}

/** Earliest clock. A later reconnect does not replace the first login. */
export function firstLoginClock(clocks: string[]): string | null {
  const usable = clocks.filter((clock) => /^\d{2}:\d{2}$/.test(clock));
  if (!usable.length) return null;
  return [...usable].sort((a, b) => minutesOf(a) - minutesOf(b))[0];
}

const PAUSED = /paused|halted/i;
const NO_SESSION = /no_kite|no kite session/i;

function skippedText(summary: Record<string, unknown> | null): string | null {
  if (!summary) return null;
  if (typeof summary.skipped === "string") return summary.skipped;
  const buys = summary.buys;
  if (buys && typeof buys === "object" && typeof (buys as { skipped?: unknown }).skipped === "string") {
    return (buys as { skipped: string }).skipped;
  }
  return null;
}

function isSendSummary(summary: Record<string, unknown> | null): boolean {
  if (!summary) return false;
  if ("buysSent" in summary) return true;
  return summary.buys != null && typeof summary.buys === "object";
}

/** Whether the buy window actually ran with a Kite session, and whether it was paused. */
export function buyWindowReading(runs: { kind: string; summary: Record<string, unknown> | null }[]): { hadSession: boolean; paused: boolean } {
  let hadSession = false;
  let paused = false;
  for (const run of runs) {
    if (run.kind !== "buys" && run.kind !== "approvals") continue;
    const skipped = skippedText(run.summary);
    if (skipped && NO_SESSION.test(skipped)) continue;
    if (skipped === "before send window") continue;
    if (skipped && PAUSED.test(skipped)) {
      hadSession = true;
      paused = true;
      continue;
    }
    if (isSendSummary(run.summary)) hadSession = true;
  }
  return { hadSession, paused };
}

const SKIP_WHY: Record<string, string> = {
  held: "already held",
  too_expensive: "one share over the order cap",
  too_close_to_stop: "too close to the stop",
  entry_below_stop: "too close to the stop",
  no_funds: "no cash in Kite",
  pacing_cash: "today's buy budget is used",
  pacing_day: "the daily buy limit is full",
  pacing_strategy: "that strategy's buy limit is full",
  strategy_full: "that strategy is full",
  sector_cap: "the sector is full",
  too_small: "under the minimum",
  chasing: "the price ran too far",
  excluded: "on the exclude list",
  limit: "the daily buy limit is full",
};

export function skipWhy(code: string | null | undefined, reason: string): string {
  if (code && SKIP_WHY[code]) return SKIP_WHY[code];
  if (/already held/i.test(reason)) return "already held";
  return reason.replace(/^Not bought:\s*/i, "").replace(/\.$/, "").trim();
}

/** Skipped ideas for the no-buy sentence, already-held included. */
export function skipDetails(rows: SkipRow[]): { symbol: string; why: string }[] {
  const out: { symbol: string; why: string }[] = [];
  for (const row of rows) {
    if ((row.side ?? "BUY").toUpperCase() === "SELL") continue;
    if (!SKIP_OUTCOMES.has(row.outcome.toLowerCase())) continue;
    if (!row.symbol) continue;
    out.push({ symbol: row.symbol, why: skipWhy(row.reasonCode, row.reason ?? "") });
  }
  return out;
}

/**
 * Why no buy went out.
 * A login after 10:00 counts only when the buy window never had a session.
 * Otherwise: no ideas, every idea skipped, or buys paused.
 */
export function noBuyReason(input: {
  bought: number;
  ideas: number | null;
  skipped: number;
  held: number;
  kiteAt: string | null;
  hadSession?: boolean;
  paused?: boolean;
}): NoBuyReason | null {
  if (input.bought > 0) return null;
  const late = !input.kiteAt || minutesOf(input.kiteAt) > minutesOf("10:00");
  if (late && !input.hadSession) return "late-kite";
  if (input.ideas === 0) return "no-ideas";
  if (input.ideas != null && input.ideas > 0 && input.skipped + input.held > 0 && input.skipped + input.held >= input.ideas) return "all-skipped";
  if (input.paused) return "paused";
  if (late) return "late-kite";
  return null;
}

function skipClause(count: number): string {
  if (count === 0) return "nothing skipped";
  if (count === 1) return "one idea skipped";
  return `${small(count).toLowerCase()} ideas skipped`;
}

function cap(text: string): string {
  return text ? `${text[0].toUpperCase()}${text.slice(1)}` : text;
}

function allSkippedSentence(details: { symbol: string; why: string }[]): string {
  const groups: { why: string; symbols: string[] }[] = [];
  for (const row of details) {
    const found = groups.find((group) => group.why === row.why);
    if (found) found.symbols.push(row.symbol);
    else groups.push({ why: row.why, symbols: [row.symbol] });
  }
  if (groups.length === 1 && !groups[0].why) return `All ideas skipped: ${names(groups[0].symbols)}.`;
  const parts = groups.map((group) => (group.why ? `${names(group.symbols)}, ${group.why}` : names(group.symbols)));
  return `All ideas skipped: ${parts.join("; ")}.`;
}

function noBuyLine(facts: VerdictFacts): string | null {
  if (facts.noBuyReason === "late-kite") return "Kite connected after 10:00, so no buys today.";
  if (facts.noBuyReason === "no-ideas") return "No ideas from last night's scan.";
  if (facts.noBuyReason === "paused") return "Buys are paused, so no buys today.";
  if (facts.noBuyReason === "all-skipped") {
    const details = facts.skipDetails?.filter((row) => row.symbol) ?? [];
    if (details.length) return allSkippedSentence(details);
    const list = names(facts.skipNames ?? []);
    return list ? `All ideas skipped: ${list}.` : "All ideas skipped.";
  }
  return null;
}

/** One plain sentence for the daily report. */
export function verdictSentence(facts: VerdictFacts): string {
  if (facts.waitingForLogin && facts.bought.length === 0 && facts.sold.length === 0) {
    return "Waiting for Kite login; buys held.";
  }
  const parts: string[] = [];
  const reason = facts.bought.length === 0 ? noBuyLine(facts) : null;
  if (facts.bought.length > 0) {
    parts.push(`Bought ${names(facts.bought)}${facts.lateLogin ? " after a late login" : ""}.`);
    if (facts.sold.length > 0) parts.push(`${cap(skipClause(facts.skipped))}; sold ${names(facts.sold)}.`);
    else parts.push(`${cap(skipClause(facts.skipped))}, nothing sold.`);
  } else if (reason) {
    parts.push(facts.sold.length > 0 ? `${reason.replace(/\.$/, "")}; sold ${names(facts.sold)}.` : reason);
  } else if (facts.sold.length > 0) {
    parts.push(`${cap(skipClause(facts.skipped))}; sold ${names(facts.sold)}.`);
  } else if (facts.skipped > 0) {
    parts.push(`${cap(skipClause(facts.skipped))}.`);
  } else if (facts.stopsRaised === 0) {
    parts.push("Nothing to buy today; holdings unchanged.");
  }
  if (facts.stopsRaised > 0) {
    const holdings = facts.stopsRaised === 1 ? "one holding" : `${small(facts.stopsRaised).toLowerCase()} holdings`;
    parts.push(`Stops raised on ${holdings} in the evening.`);
  }
  if (facts.rulesBroken > 0) {
    parts.push(facts.rulesBroken === 1 ? "One rule did not hold." : `${facts.rulesBroken} rules did not hold.`);
  }
  return parts.join(" ");
}

export function beforeOpenSentence(kiteAt: string | null, buysAt = "09:45"): string {
  const kite = kiteAt ? `Kite connected ${kiteAt}` : "Kite is not connected";
  return `Before the open: ${kite}, buys at ${buysAt}.`;
}

export function isHeldSkip(reason: string, code?: string | null): boolean {
  return code === "held" || /already held/i.test(reason);
}

export type DecisionRow = {
  time: string;
  symbol: string;
  pill: string;
  reason: string;
};

type AuditBit = {
  time: string;
  action: string;
  symbol: string | null;
  side: string | null;
  qty: number | null;
  reason: string;
  code?: string | null;
};

/** Decision rows for one day, oldest first. Held-only skips are counted and left out. */
export function decisionRows(rows: AuditBit[]): { rows: DecisionRow[]; heldLeftOut: number } {
  const kept: DecisionRow[] = [];
  let heldLeftOut = 0;
  for (const row of rows) {
    const pill = decisionPill(row);
    if (!pill) continue;
    if (pill === "Skipped" && isHeldSkip(row.reason, row.code)) {
      heldLeftOut += 1;
      continue;
    }
    kept.push({
      time: row.time,
      symbol: row.symbol ?? "",
      pill,
      reason: row.reason || pill,
    });
  }
  return { rows: kept, heldLeftOut };
}

function decisionPill(row: AuditBit): string | null {
  const side = (row.side ?? "").toUpperCase();
  const qty = row.qty && row.qty > 0 ? ` ${row.qty}` : "";
  if (row.action === "fill" && side !== "SELL") return `Bought${qty}`;
  if ((row.action === "fill" && side === "SELL") || row.action === "position.marked_sold") {
    return /safety/i.test(row.reason) ? "Safety sell" : `Sold${qty}`;
  }
  if (row.action === "gtt.exit") return "Safety sell";
  if (row.action === "decision.skip" || row.action === "approval.skip") return "Skipped";
  if (row.action.endsWith(".skipped") && row.symbol) return "Skipped";
  if (row.action === "stop.updated") return /set|new stop/i.test(row.reason) ? "Stop set" : "Stop raised";
  if (row.action === "stop.set" || row.action === "gtt.placed") return "Stop set";
  return null;
}
