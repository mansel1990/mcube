import {
  researchThresholds,
  type ResearchBook,
  type ResearchSample,
  type ResearchThresholds,
} from "./research-bar";

/** The engine scores these five tests. A strategy passes only when every one passes. */
export const PASS_BAR_COUNT = 5;

export const RESEARCH_NAMES: Record<string, string> = {
  trend_breakout: "Trend breakout",
  rsi2: "RSI 2",
  momentum: "Momentum",
  ema_v2: "EMA v2",
  ema: "EMA Pullback",
  rs: "RS Resilience",
  orb: "Opening range",
  vwap: "VWAP",
};

export const RESEARCH_IDEAS: Record<string, string> = {
  rs: "Buys stocks holding up better than Nifty",
  trend_breakout: "Buys a breakout to a new high on high volume",
  rsi2: "Buys a deep two-day drop while the longer trend is still up",
  momentum: "Buys the strongest stocks and rebalances each week",
  ema: "Buys a pullback to the 20-day average in an uptrend",
  ema_v2: "Buys a pullback to a short average while price stays above the 50-day",
  orb: "Buys a break of the opening range",
  vwap: "Trades with the session's volume-weighted average",
};

export const RESEARCH_VARIANT_NAMES: Record<string, string> = {
  "M15-control": "Momentum XI — Opener",
  "M10-6": "Momentum XI — Anchor",
  "M10-8": "Momentum XI — Middle Order",
  "M10-10": "Momentum XI — Powerplay",
  "M-vol8": "Momentum XI — Adaptive",
  "TB+M10": "All-Rounder XI — Breakout + Momentum",
};

export const INTRADAY_EMPTY =
  "Intraday has not been tested yet. Data: 5-minute bars from Nov 2024 (building Nov 2024–Apr 2026). Runs on the server after 16:00.";

export const RESEARCH_RUNTIME = "About 10 minutes.";

export type Band = "passed" | "close" | "failed";

export type ResearchIdentity = {
  book: ResearchBook;
  sample: ResearchSample;
  strategies: string[];
  variants: string[];
  grid: boolean;
  engineSha: string;
  lastCandle: string;
  only: string[];
};

export type StoredRun = {
  id: number;
  status: string;
  finishedAt: string | null;
  identity: ResearchIdentity | null;
};

export type PassRow = { id: string; pass: boolean; text: string };

export function strategyName(key: string): string {
  return RESEARCH_NAMES[key] ?? key;
}

export function strategyIdea(key: string): string {
  return RESEARCH_IDEAS[key] ?? "";
}

export function variantName(key: string): string {
  return RESEARCH_VARIANT_NAMES[key] ?? key;
}

export function isLiveStrategy(book: ResearchBook, key: string, variant?: string | null): boolean {
  return book === "swing" && key === "momentum" && variant === "M10-6";
}

export function resultBand(passed: boolean, fails: number): Band {
  if (passed) return "passed";
  if (fails >= 1 && fails <= 2) return "close";
  return "failed";
}

export function makeIdentity(input: {
  book: ResearchBook;
  sample: ResearchSample;
  strategies: readonly string[];
  variants?: readonly string[];
  grid: boolean;
  engineSha: string;
  lastCandle: string;
  only?: readonly string[];
}): ResearchIdentity {
  return {
    book: input.book,
    sample: input.sample,
    strategies: uniqueSorted(input.strategies),
    variants: uniqueSorted(input.variants ?? []),
    grid: input.grid,
    engineSha: input.engineSha,
    lastCandle: input.lastCandle.slice(0, 10),
    only: uniqueSorted((input.only ?? []).map((symbol) => symbol.toUpperCase())),
  };
}

export function readIdentity(params: unknown, engineSha = ""): ResearchIdentity | null {
  const row = objectOf(params);
  const raw = objectOf(row.identity);
  if (raw.book !== "swing" && raw.book !== "intraday") return null;
  return makeIdentity({
    book: raw.book,
    sample: raw.sample === "heldback" ? "heldback" : "building",
    strategies: stringsOf(raw.strategies),
    variants: stringsOf(raw.variants),
    grid: raw.grid !== false,
    engineSha: typeof raw.engineSha === "string" && raw.engineSha ? raw.engineSha : engineSha,
    lastCandle: typeof raw.lastCandle === "string" ? raw.lastCandle : "",
    only: stringsOf(raw.only),
  });
}

/** Older runs stored the pieces of an identity, but not the object. `dataLast` is the newest candle that run loaded. */
export function identityFromRun(input: {
  book: string;
  sample: string;
  params: unknown;
  engineSha: string;
  dataLast?: string | null;
}): ResearchIdentity | null {
  const stored = readIdentity(input.params, input.engineSha);
  if (stored?.lastCandle) return stored;
  if (input.book !== "swing" && input.book !== "intraday") return null;
  const params = objectOf(input.params);
  const strategies = stringsOf(params.strategies);
  const last = input.dataLast?.slice(0, 10) ?? "";
  if (strategies.length === 0 || !last || !input.engineSha) return null;
  return makeIdentity({
    book: input.book,
    sample: input.sample === "heldback" ? "heldback" : "building",
    strategies,
    variants: stringsOf(params.variants),
    grid: params.grid !== false,
    engineSha: input.engineSha,
    lastCandle: last,
    only: stringsOf(params.only),
  });
}

export function sameIdentity(a: ResearchIdentity, b: ResearchIdentity): boolean {
  return sameSetup(a, b) && a.engineSha === b.engineSha && a.lastCandle === b.lastCandle && a.engineSha !== "" && a.lastCandle !== "";
}

export function sameSetup(a: ResearchIdentity, b: ResearchIdentity): boolean {
  return a.book === b.book && a.sample === b.sample && a.grid === b.grid && sameList(a.strategies, b.strategies) && sameList(a.variants, b.variants) && sameList(a.only, b.only);
}

export function alreadyRunMessage(finishedAt: string | null): string {
  return `Already run on ${dayMonth(finishedAt)} with this code and data. Results won't change.`;
}

export function duplicateBlock(current: ResearchIdentity, runs: readonly StoredRun[], force: boolean, ignoreId?: number): string | null {
  if (force || !knownIdentity(current)) return null;
  const hit = runs.find((run) => run.status === "ok" && run.id !== ignoreId && run.identity != null && sameIdentity(run.identity, current));
  return hit ? alreadyRunMessage(hit.finishedAt) : null;
}

export function queueBlock(current: ResearchIdentity, runs: readonly StoredRun[], ignoreId?: number): string | null {
  if (!knownIdentity(current)) return null;
  const hit = runs.find((run) => {
    if (run.id === ignoreId || !run.identity || !sameIdentity(run.identity, current)) return false;
    return run.status === "queued" || run.status === "running";
  });
  if (!hit) return null;
  return hit.status === "running" ? "This setup is already running." : "A run with this setup is already queued.";
}

export function changeNote(current: ResearchIdentity, runs: readonly StoredRun[]): string | null {
  if (!current.engineSha || current.engineSha === "unknown") {
    return "The engine code version could not be read, so this run is allowed.";
  }
  const prior = runs.find((run) => run.status === "ok" && run.identity != null && sameSetup(run.identity, current));
  if (!prior?.identity) return null;
  const code = prior.identity.engineSha !== current.engineSha;
  const data = prior.identity.lastCandle !== current.lastCandle;
  if (!code && !data) return null;
  const when = dayMonth(prior.finishedAt);
  if (code && data) return `The engine code and the candle data changed since ${when}.`;
  if (code) return `The engine code changed since ${when}.`;
  return `The candle data changed since ${when}.`;
}

export function researchStartLine(minutes: number): string {
  const daySlot = minutes >= 8 * 60 && minutes <= 16 * 60 + 55;
  return daySlot ? "Starts at 16:00" : "Runs tonight after 20:00 on the server";
}

export function queuedForLabel(minutes: number): "16:00" | "20:00" {
  return researchStartLine(minutes).startsWith("Starts") ? "16:00" : "20:00";
}

export function progressLine(status: string, progress: { done: number; total: number } | null, minutes: number): string | null {
  if (status === "queued") return `Queued for ${queuedForLabel(minutes)}`;
  if (status !== "running") return null;
  if (progress && progress.total > 0) return `Running: ${progress.done} of ${progress.total} stocks`;
  return "Running";
}

export function dayMonth(value: string | null): string {
  if (!value) return "an earlier date";
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    return new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" }).format(date);
  }
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return "an earlier date";
  return new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  });
}

export function runClock(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const day = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" }).format(date);
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
  return `${day} ${time}`;
}

export function sampleSpan(from: string, to: string): string {
  if (from.endsWith("-01-01") && to.endsWith("-12-31")) {
    const start = from.slice(0, 4);
    const end = to.slice(0, 4);
    return start === end ? start : `${start}–${end}`;
  }
  return `${monthYear(from)}–${monthYear(to)}`;
}

export function runSummary(input: {
  id: number;
  at: string | null;
  from: string | null;
  to: string | null;
  sample: string;
  symbols: number;
}): string {
  const span = input.from && input.to ? sampleSpan(input.from, input.to) : "dates not stored";
  const sample = input.sample === "heldback" ? "held-back" : "building";
  const stocks = input.symbols > 0 ? `${input.symbols} stocks` : "no stocks";
  return `Run ${input.id} · ${runClock(input.at)} · ${span} ${sample} sample · ${stocks}`;
}

export function verdictFor(input: {
  book: ResearchBook;
  runs: number;
  sample: ResearchSample | null;
  rows: { name: string; passed: boolean; fails: number }[];
}): { tone: "empty" | "open" | "passed"; text: string } {
  if (input.book === "intraday" && input.runs === 0) return { tone: "empty", text: INTRADAY_EMPTY };
  if (input.rows.length === 0) return { tone: "empty", text: "Building sample not run yet." };
  const passed = input.rows.filter((row) => row.passed);
  if (passed.length > 0) {
    const noun = passed.length === 1 ? "strategy" : "strategies";
    const next = input.sample === "heldback" ? "" : " Next step: held-back test.";
    return { tone: "passed", text: `${passed.length} ${noun} passed: ${joinNames(passed.map((row) => row.name))}.${next}` };
  }
  const ranked = [...input.rows].sort((a, b) => a.fails - b.fails || a.name.localeCompare(b.name));
  const close = ranked.filter((row) => row.fails >= 1 && row.fails <= 2);
  const listed = close.length > 0 ? close : ranked.slice(0, 2);
  const closest = listed.map((row) => `${row.name} (fails ${row.fails} of ${PASS_BAR_COUNT} tests)`);
  return { tone: "open", text: `No strategy has passed yet. Closest: ${joinNames(closest)}.` };
}

export function bandCounts(rows: readonly { band: Band }[]): { passed: number; close: number; failed: number } {
  return {
    passed: rows.filter((row) => row.band === "passed").length,
    close: rows.filter((row) => row.band === "close").length,
    failed: rows.filter((row) => row.band === "failed").length,
  };
}

export function sortStrategies<T extends { band: Band; profitFactor: number | null; name: string }>(rows: readonly T[]): T[] {
  const rank: Record<Band, number> = { passed: 0, close: 1, failed: 2 };
  return [...rows].sort((a, b) => rank[a.band] - rank[b.band] || (b.profitFactor ?? -1) - (a.profitFactor ?? -1) || a.name.localeCompare(b.name));
}

export function passRows(input: {
  profitFactor: number | null;
  trades: number;
  halfYearsPct: number | null;
  worstDrawdownPct: number | null;
  avgNetPct: number | null;
  bar: ResearchThresholds;
  quarters: boolean;
}): PassRow[] {
  const period = input.quarters ? "quarters" : "half-years";
  const rows: PassRow[] = [
    row("profit", input.profitFactor != null && input.profitFactor >= input.bar.profitFactor, `Profit factor ${num(input.profitFactor, 2)}`, `needs ${input.bar.profitFactor}`),
    row("trades", input.trades >= input.bar.trades, `Trades ${input.trades}`, `needs ${input.bar.trades}`),
    row("periods", input.halfYearsPct != null && input.halfYearsPct >= input.bar.halfYearsPct, `Profitable ${period} ${num(input.halfYearsPct, 0)}%`, `needs ${input.bar.halfYearsPct}%`),
    row("drawdown", input.worstDrawdownPct != null && input.worstDrawdownPct <= input.bar.maxDrawdownPct, `Worst drawdown ${num(input.worstDrawdownPct, 1)}%`, `needs ≤ ${input.bar.maxDrawdownPct}%`),
    row("average", input.avgNetPct != null && input.avgNetPct >= input.bar.avgNetPct, `Average net per trade ${num(input.avgNetPct, 2)}%`, `needs ${input.bar.avgNetPct}%`),
  ];
  return [...rows.filter((item) => !item.pass), ...rows.filter((item) => item.pass)];
}

export function robustnessLabel(defaultPf: number | null, otherPfs: readonly (number | null)[], bar: number): string {
  if (otherPfs.length === 0) return "Default settings only";
  if (defaultPf == null || otherPfs.some((pf) => pf == null)) return "Depends on one setting";
  const side = defaultPf >= bar;
  const stable = otherPfs.every((pf) => pf != null && Math.abs(pf - defaultPf) <= 0.25 + 1e-9 && (pf >= bar) === side);
  return stable ? "Robust across settings" : "Depends on one setting";
}

export type OverlapPair = { left: string; right: string; share: string; high: number };

export function overlapPairs(
  rows: readonly { strategy: string; name: string; band: Band }[],
  cells: readonly { a: string; b: string; overlap: number }[],
): OverlapPair[] {
  const kept = rows.filter((row) => row.band === "passed" || row.band === "close");
  const lookup = new Map(cells.map((cell) => [`${cell.a}:${cell.b}`, cell.overlap]));
  const pairs: OverlapPair[] = [];
  for (let i = 0; i < kept.length; i++) {
    for (let j = i + 1; j < kept.length; j++) {
      const left = kept[i];
      const right = kept[j];
      const ab = lookup.get(`${left.strategy}:${right.strategy}`);
      const ba = lookup.get(`${right.strategy}:${left.strategy}`);
      const values = [ab, ba].filter((value): value is number => value != null && Number.isFinite(value));
      if (values.length === 0) continue;
      const percents = values.map((value) => Math.round(value * 100));
      const low = Math.min(...percents);
      const high = Math.max(...percents);
      pairs.push({ left: left.name, right: right.name, share: low === high ? `${low}%` : `${low}–${high}%`, high });
    }
  }
  return pairs;
}

export function overlapLines(
  rows: readonly { strategy: string; name: string; band: Band }[],
  cells: readonly { a: string; b: string; overlap: number }[],
): string[] {
  return overlapPairs(rows, cells).map((pair) => `${pair.left} and ${pair.right} lose on the same day ${pair.share} of the time. Under 50% is better for a pair.`);
}

export type AboutBit = { id: string; label: string; text: string };

const ABOUT_LABELS = ["Sample", "Universe", "Costs", "Capital", "Stops", "Rules"] as const;

export function aboutGist(input: {
  book: ResearchBook;
  sample: ResearchSample;
  window: { from: string; to: string } | null;
  strategies: readonly string[];
  capital: Record<string, unknown>;
}): AboutBit[] {
  return aboutRun(input).map((line, index) => ({
    id: ABOUT_LABELS[index] ?? `note-${index}`,
    label: ABOUT_LABELS[index] ?? "Note",
    text: line.replace(/\.$/, ""),
  }));
}

export function aboutRun(input: {
  book: ResearchBook;
  sample: ResearchSample;
  window: { from: string; to: string } | null;
  strategies: readonly string[];
  capital: Record<string, unknown>;
}): string[] {
  const sample = input.sample === "heldback" ? "Held-back" : "Building";
  const span = input.window ? sampleSpan(input.window.from, input.window.to) : "dates not stored";
  const lines = [`${sample} sample, ${span}.`];
  if (input.book === "swing") {
    lines.push("Today's Nifty 500. Names that left the index are missing, and join dates are not stored.");
    lines.push("Delivery charges on the real quantity, DP charge on sells, 0.05% slippage.");
  } else {
    lines.push("Opening range uses Nifty 200 and VWAP uses Nifty 100. Names that left the index are missing.");
    lines.push("MIS charges on the real quantity, plus 0.1% slippage.");
  }
  lines.push(capitalLine(input.book, input.capital));
  lines.push(stopLine(input.book, input.capital));
  if (input.strategies.includes("rs") || input.strategies.includes("ema")) {
    lines.push("RS buys only when Nifty's 10-day return is under 1%. EMA is filled the next day only when price trades at the limit.");
  }
  return lines;
}

export function rebaseToCapital(
  equity: readonly { date: string; value: number }[],
  nifty: readonly { date: string; close: number }[],
  capital: number,
): { date: string; portfolio: number; nifty: number | null }[] {
  if (equity.length === 0) return [];
  const start = equity[0].date;
  const base = nifty.find((point) => point.date >= start)?.close ?? nifty[0]?.close;
  const byDate = new Map(nifty.map((point) => [point.date, point.close]));
  let last = base;
  return equity.map((point) => {
    const close = byDate.get(point.date);
    if (close != null) last = close;
    const niftyValue = base && last ? (capital * last) / base : null;
    return { date: point.date, portfolio: point.value, nifty: niftyValue };
  });
}

export function barFor(book: ResearchBook, sample: ResearchSample): ResearchThresholds {
  return researchThresholds(book, sample);
}

function capitalLine(book: ResearchBook, capital: Record<string, unknown>): string {
  const fund = numberOf(capital.fund);
  if (fund == null) return "Capital rules were not stored with this run.";
  const money = `₹${Math.round(fund).toLocaleString("en-IN")}`;
  if (book === "intraday") {
    const trades = numberOf(capital.maxTrades);
    const loss = numberOf(capital.dayLossPct);
    return `${money}, ${pct(numberOf(capital.riskPct))} risk, ${trades ?? "—"} trades a day, day stops at −${pct(loss)}.`;
  }
  return `${money}, ${pct(numberOf(capital.riskPct))} risk, ${pct(numberOf(capital.maxOrderPct))} per order, ${count(capital.maxNewBuys)} buys a day, ${count(capital.maxOpen)} open, ${count(capital.maxPerSector)} per sector.`;
}

function stopLine(book: ResearchBook, capital: Record<string, unknown>): string {
  if (book === "intraday") {
    const exit = typeof capital.exitTime === "string" ? capital.exitTime : "15:00";
    return `No bar from 15:15 is used. Positions close at ${exit}, and the day stops after the loss limit.`;
  }
  const gap = numberOf(capital.gttGap);
  const pctGap = gap == null ? "3" : String(Math.round(gap * 1000) / 10);
  return `A close under the stop sells at the next open. For RS and EMA, a low through the GTT, ${pctGap}% under the stop, sells at that trigger.`;
}

function row(id: string, pass: boolean, label: string, need: string): PassRow {
  return { id, pass, text: `${label} ${pass ? "✓" : "✗"} ${need}` };
}

function num(value: number | null, places: number): string {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toFixed(places);
}

function pct(value: number | null): string {
  if (value == null) return "—";
  const points = Math.round(value * 1000) / 10;
  return `${points}%`;
}

function count(value: unknown): string {
  const n = numberOf(value);
  return n == null ? "—" : String(Math.round(n));
}

function numberOf(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

function monthYear(iso: string): string {
  const [year, month, day] = iso.split("-").map(Number);
  if (!year || !month || !day) return iso;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-GB", { month: "short", year: "numeric", timeZone: "UTC" });
}

function knownIdentity(identity: ResearchIdentity): boolean {
  return identity.engineSha !== "" && identity.engineSha !== "unknown" && identity.lastCandle !== "";
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function sameList(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

function stringsOf(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function objectOf(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return {};
}
