import { isTradingDay, istMinutes, nextTradingDay, previousTradingDay, recentMarketDays, todayIst } from "./calendar";
import { dayStepResult } from "./day-steps";
import { breakerReading, moneySpan, newBuyLimit } from "./limits";
import { loadNiftyCloses } from "./nifty";
import type { NiftyReason } from "./nifty-reason";
import { loadSwingToday, swingBuysOn } from "./read";
import { beforeOpenSentence, buyWindowReading, decisionRows, decisionSkips, firstLoginClock, isHeldSkip, noBuyReason, skipDetails, verdictSentence, type DecisionRow, type SkipRow } from "./verdict";
import { markStep, minutesOf, withNext, type StepMark } from "./schedule";
import { intradayRetired } from "./capabilities";
import { sql } from "../sql";

export type RecentDay = { day: string; netPct: number | null; niftyPct: number | null; blurb: string };
export type RuleLine = { label: string; detail: string; ok: boolean | null };
export type TimelineStep = { id: string; title: string; result: string; state: StepMark };

export type DailyReport = {
  day: string;
  today: string;
  phase: "before" | "session" | "closed";
  holiday: boolean;
  kiteConnected: boolean;
  kiteAt: string | null;
  recent: RecentDay[];
  pill: string;
  rulesPill: string;
  rulesOpen: boolean;
  sentence: string;
  reportedAt: string | null;
  closeValue: number | null;
  netInr: number | null;
  netPct: number | null;
  netLabel: string;
  netNote: string | null;
  niftyPct: number | null;
  niftyReason: NiftyReason | null;
  bought: number;
  sold: number;
  skipped: number;
  decisions: DecisionRow[];
  heldLeftOut: number;
  rules: RuleLine[];
  timeline: TimelineStep[];
  prevDay: string;
  nextDay: string | null;
  nextSession: string;
};

type AuditBit = {
  ts: string;
  action: string;
  symbol: string | null;
  reason: string;
  side: string | null;
  qty: number | null;
  code: string | null;
};

function num(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function settingNum(value: unknown, fallback: number): number {
  const n = Number(String(value ?? "").replace(/"/g, ""));
  return Number.isFinite(n) ? n : fallback;
}

function clock(value: unknown): string {
  if (value == null || value === "") return "";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Kolkata" });
}

function dayOf(value: unknown): string {
  return String(value ?? "").slice(0, 10);
}

export async function dailyReport(requested: string | null, now = new Date()): Promise<DailyReport> {
  const today = todayIst(now);
  const minutes = istMinutes(now);
  const holidayRows = await sql`SELECT trade_date::text AS trade_date FROM mlive.mlive_holidays`;
  const holidays = new Set(holidayRows.map((row) => dayOf(row.trade_date)));
  const day = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : today;
  const recentDays = recentMarketDays(today, 7, holidays);
  const oldest = recentDays[recentDays.length - 1] ?? day;
  const from = day < oldest ? day : oldest;
  const end = day > today ? day : today;
  const [equity, flows, audit, runs, kite, settings, positions, buysCash, fund, decisionRowsRaw, ideaRows, matchedRows, buyCount, live] = await Promise.all([
    sql`SELECT trade_date::text AS trade_date, system_value, peak, drawdown_pct FROM mlive.mlive_equity_daily WHERE trade_date >= ${from}::date - 10 ORDER BY trade_date`,
    sql`SELECT (timezone('Asia/Kolkata', ts))::date::text AS d, kind, amount FROM mlive.mlive_fund_ledger WHERE kind IN ('deposit', 'withdrawal') AND (timezone('Asia/Kolkata', ts))::date >= ${from}::date - 10`,
    sql`SELECT ts, action, symbol, coalesce(reason, '') AS reason, after FROM mlive.mlive_audit_log
         WHERE (timezone('Asia/Kolkata', ts))::date BETWEEN ${from}::date AND ${end}::date
           AND action NOT LIKE 'run.%' ORDER BY ts`,
    sql`SELECT kind, status, started_at, finished_at, summary FROM mlive.mlive_runs
         WHERE (timezone('Asia/Kolkata', coalesce(finished_at, started_at)))::date = ${day}::date
         ORDER BY id`,
    sql`SELECT token_date::text AS token_date, connected_at FROM mlive.mlive_kite_sessions
         WHERE token_date = ${day}::date
            OR (timezone('Asia/Kolkata', connected_at))::date = ${day}::date
         ORDER BY connected_at ASC`,
    sql`SELECT key, value FROM mlive.mlive_settings`,
    sql`SELECT count(*) FILTER (WHERE coalesce(book, 'swing') = 'swing')::int AS swing,
               count(*) FILTER (WHERE book = 'intraday')::int AS intra,
               count(*) FILTER (WHERE coalesce(book, 'swing') = 'swing' AND EXISTS (
                 SELECT 1 FROM mlive.mlive_gtts g WHERE g.position_id = p.id AND g.status NOT IN ('cancelled', 'rejected')
               ))::int AS stopped
          FROM mlive.mlive_positions p WHERE closed_at IS NULL`,
    sql`SELECT coalesce(sum(f.qty * f.price), 0) AS notional
          FROM mlive.mlive_fills f JOIN mlive.mlive_orders o ON o.id = f.order_id
         WHERE o.side = 'BUY' AND (timezone('Asia/Kolkata', f.ts))::date = ${day}::date`,
    sql`SELECT coalesce(sum(CASE WHEN kind = 'deposit' THEN amount WHEN kind = 'withdrawal' THEN -amount ELSE 0 END), 0) AS total FROM mlive.mlive_fund_ledger`,
    sql`SELECT trade_date::text AS trade_date, side, symbol, outcome, reason_code, coalesce(reason_text, '') AS reason_text
          FROM mlive.mlive_decisions
         WHERE trade_date BETWEEN ${from}::date AND ${end}::date`,
    sql`SELECT count(*)::int AS n FROM mlive.mlive_ideas WHERE valid_for = ${day}::date AND coalesce(book, 'swing') = 'swing'`,
    sql`SELECT count(*) FILTER (WHERE r.result = 'ok')::int AS matched,
               count(*)::int AS checked
          FROM mlive.mlive_reconciliations r
         WHERE r.run_id = (
           SELECT u.id FROM mlive.mlive_runs u
            WHERE u.kind = 'preflight'
              AND (timezone('Asia/Kolkata', coalesce(u.finished_at, u.started_at)))::date = ${day}::date
            ORDER BY u.id DESC
            LIMIT 1
         )`,
    swingBuysOn(day),
    day === today ? loadSwingToday(now) : Promise.resolve(null),
  ]);
  const nifty = await loadNiftyCloses(from);
  const setting: Record<string, unknown> = {};
  for (const row of settings) setting[String(row.key)] = row.value;
  const equityByDay = new Map(equity.map((row) => [dayOf(row.trade_date), row]));
  const flowByDay = new Map<string, { deposit: number; withdrawal: number }>();
  for (const row of flows) {
    const key = dayOf(row.d);
    const bag = flowByDay.get(key) ?? { deposit: 0, withdrawal: 0 };
    if (row.kind === "withdrawal") bag.withdrawal += num(row.amount);
    else bag.deposit += num(row.amount);
    flowByDay.set(key, bag);
  }
  const closeByDay = new Map(nifty.closes.map((row) => [row.date, row.close]));
  const bits = audit.map(toBit);
  const bitsByDay = new Map<string, AuditBit[]>();
  for (const bit of bits) {
    const key = dayOf(new Date(bit.ts).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" }));
    const list = bitsByDay.get(key) ?? [];
    list.push(bit);
    bitsByDay.set(key, list);
  }
  const skipRows = decisionRowsRaw.map((row) => ({
    day: dayOf(row.trade_date),
    symbol: String(row.symbol ?? ""),
    outcome: String(row.outcome ?? ""),
    reasonCode: row.reason_code == null ? null : String(row.reason_code),
    reason: String(row.reason_text ?? ""),
    side: row.side == null ? null : String(row.side),
  }));
  const skipsByDay = new Map<string, SkipRow[]>();
  for (const row of skipRows) {
    const list = skipsByDay.get(row.day) ?? [];
    list.push(row);
    skipsByDay.set(row.day, list);
  }
  const skipNamesByDay = new Map<string, string[]>();
  for (const [key, rows] of skipsByDay) skipNamesByDay.set(key, decisionSkips(rows));
  const recent = recentDays.map((item) => cardFor(item, equityByDay, flowByDay, closeByDay, bitsByDay, skipNamesByDay));
  const selectedBits = bitsByDay.get(day) ?? [];
  const decided = decisionRows(selectedBits.map((bit) => ({
    time: clock(bit.ts),
    action: bit.action,
    symbol: bit.symbol,
    side: bit.side,
    qty: bit.qty,
    reason: bit.reason,
    code: bit.code,
  })));
  const daySkips = skipRows.filter((row) => row.day === day);
  const skipNames = decisionSkips(daySkips);
  const held = daySkips.filter((row) => row.outcome.toLowerCase() === "skipped" && isHeldSkip(row.reason, row.reasonCode)).length;
  const preflight = [...runs].reverse().find((row) => row.kind === "preflight" && row.finished_at);
  for (const row of daySkips) {
    if (!skipNames.includes(row.symbol)) continue;
    if (decided.rows.some((item) => item.symbol === row.symbol && item.pill === "Skipped")) continue;
    decided.rows.push({
      time: preflight ? clock(preflight.finished_at) : "",
      symbol: row.symbol,
      pill: "Skipped",
      reason: row.reason || "Not bought.",
    });
  }
  const boughtNames = selectedBits.filter((bit) => bit.action === "fill" && (bit.side ?? "").toUpperCase() !== "SELL").map((bit) => bit.symbol ?? "").filter(Boolean);
  const soldNames = selectedBits.filter((bit) => bit.action === "fill" && (bit.side ?? "").toUpperCase() === "SELL").map((bit) => bit.symbol ?? "").filter(Boolean);
  const skipped = skipNames.length;
  const stopsRaised = decided.rows.filter((row) => row.pill === "Stop raised").length;
  const loginClocks = selectedBits.filter((bit) => bit.action === "kite.login").map((bit) => clock(bit.ts));
  const sessionClocks = kite.map((row) => clock(row.connected_at));
  const kiteAt = firstLoginClock([...loginClocks, ...sessionClocks]);
  const lateLogin = kiteAt ? minutesOf(kiteAt) > minutesOf("09:20") : false;
  const waiting = day === today && !kiteAt && minutes < 9 * 60 + 45;
  const point = cardFor(day, equityByDay, flowByDay, closeByDay, bitsByDay, skipNamesByDay);
  const maxBuys = newBuyLimit(setting.max_new_buys_per_day, 2);
  const deployPct = settingNum(setting.max_daily_deploy_pct, 0.5);
  const limit = num(fund[0]?.total);
  const cashCap = limit * deployPct;
  const cashUsed = num(buysCash[0]?.notional);
  const closedRow = equityByDay.get(day === today && live?.beforeOpen ? previousTradingDay(day, holidays) : day);
  const drawdown = day === today && live && !live.beforeOpen
    ? live.drawdown
    : breakerReading(num(closedRow?.system_value), num(closedRow?.peak) || num(closedRow?.system_value));
  const rawBreaker = settingNum(setting.breaker_pct, 0.25);
  const breaker = rawBreaker <= 1 ? rawBreaker * 100 : rawBreaker;
  const swingOpen = num(positions[0]?.swing);
  const stopped = num(positions[0]?.stopped);
  const intra = num(positions[0]?.intra);
  const exitAt = String(setting.intraday_exit_time ?? "15:10").replace(/"/g, "");
  const rules: RuleLine[] = [
    { label: "Swing buys", detail: `${buyCount} of ${maxBuys}`, ok: buyCount <= maxBuys },
    { label: "Cash used today", detail: moneySpan(cashUsed, cashCap), ok: cashCap <= 0 || cashUsed <= cashCap + 1 },
    { label: "Holdings with a stop", detail: swingOpen === 0 ? "No holdings" : `${stopped} of ${swingOpen}`, ok: swingOpen === 0 || stopped >= swingOpen },
    { label: "Breaker", detail: `${drawdown.toFixed(1)}%`, ok: drawdown < breaker },
    ...(intradayRetired(setting.intraday_retired) ? [] : [
      intra === 0
        ? { label: "Intraday", detail: "Not live yet", ok: null }
        : { label: "Intraday", detail: `Flat by ${exitAt}`, ok: day < today || minutes < minutesOf(exitAt) },
    ]),
  ];
  const broken = rules.filter((rule) => rule.ok === false).length;
  const past = day < today || (day === today && minutes >= 19 * 60 + 50);
  const before = day === today && minutes < 9 * 60 + 15 && isTradingDay(day, holidays);
  const buyWindow = buyWindowReading(runs.map((row) => ({ kind: String(row.kind), summary: summaryOf(row.summary) })));
  const details = skipDetails(daySkips);
  const quietReason = noBuyReason({
    bought: boughtNames.length,
    ideas: num(ideaRows[0]?.n),
    skipped,
    held,
    kiteAt,
    hadSession: buyWindow.hadSession,
    paused: buyWindow.paused,
  });
  const facts = {
    bought: boughtNames,
    sold: soldNames,
    skipped,
    stopsRaised,
    lateLogin,
    waitingForLogin: waiting,
    rulesBroken: broken,
    noBuyReason: quietReason,
    skipNames,
    skipDetails: details,
  };
  const sentence = before ? beforeOpenSentence(kiteAt) : verdictSentence(facts);
  const eod = runs.find((row) => row.kind === "eod-final" && row.finished_at);
  const ran = runs.map((row) => ({
    kind: String(row.kind),
    status: String(row.status),
    finished: row.finished_at ? clock(row.finished_at) : null,
    summary: summaryOf(row.summary),
  }));
  const preflightSummary = [...ran].reverse().find((row) => row.kind === "preflight" && row.status === "ok")?.summary ?? null;
  const remindSummary = [...ran].reverse().find((row) => row.kind === "remind" && row.status === "ok")?.summary ?? null;
  const cash = preflightSummary && Number.isFinite(Number(preflightSummary.spendable)) ? Number(preflightSummary.spendable) : null;
  const matched = matchedRows[0] ? num(matchedRows[0]?.matched) : null;
  const checked = matchedRows[0] ? num(matchedRows[0]?.checked) : null;
  const timeline = dailyTimeline(selectedBits, ran, {
    bought: boughtNames.length,
    skipped,
    stops: stopsRaised,
    kiteAt,
    minutes,
    live: day === today,
    remind: remindKind(remindSummary),
    matched: preflight ? matched : null,
    checked: preflight ? checked : null,
    cash,
    noBuys: quietReason ? verdictSentence({ ...facts, stopsRaised: 0, rulesBroken: 0, sold: [] }) : null,
  });
  const netLabel = day === today && live?.label === "Yesterday" ? "Yesterday" : "Net today";
  const netNote = day === today ? live?.note ?? null : null;
  if (day === today && live && !live.beforeOpen) {
    const card = recent.find((item) => item.day === today);
    if (card) card.netPct = live.pct;
  }
  return {
    day,
    today,
    phase: !isTradingDay(day, holidays) ? "closed" : before ? "before" : past ? "closed" : "session",
    holiday: !isTradingDay(day, holidays),
    kiteConnected: Boolean(kiteAt),
    kiteAt,
    recent,
    pill: !isTradingDay(day, holidays) ? "Market closed" : before ? "Before the open" : past ? "Day closed" : "In progress",
    rulesPill: broken > 0 ? `${broken} rule${broken === 1 ? "" : "s"} broken` : "All rules held",
    rulesOpen: broken > 0,
    sentence,
    reportedAt: eod ? clock(eod.finished_at) : null,
    closeValue: equityByDay.get(day) ? num(equityByDay.get(day)?.system_value) : null,
    netInr: day === today && live ? live.amount : point.netInr,
    netPct: day === today && live ? live.pct : point.netPct,
    netLabel,
    netNote,
    niftyPct: point.niftyPct,
    niftyReason: nifty.reason ?? (closeByDay.has(day) ? null : "no-data"),
    bought: boughtNames.length,
    sold: soldNames.length,
    skipped,
    decisions: decided.rows,
    heldLeftOut: Math.max(decided.heldLeftOut, held),
    rules,
    timeline,
    prevDay: previousTradingDay(day, holidays),
    nextDay: nextTradingDay(day, holidays) <= today ? nextTradingDay(day, holidays) : null,
    nextSession: nextTradingDay(day, holidays),
  };
}

function cardFor(
  day: string,
  equity: Map<string, Record<string, unknown>>,
  flows: Map<string, { deposit: number; withdrawal: number }>,
  closes: Map<string, number>,
  bits: Map<string, AuditBit[]>,
  skips: Map<string, string[]>,
): RecentDay & { netInr: number | null } {
  const dates = [...equity.keys()].sort();
  const prevDate = [...dates].reverse().find((item) => item < day);
  const value = equity.get(day) ? num(equity.get(day)?.system_value) : null;
  const prev = prevDate ? num(equity.get(prevDate)?.system_value) : null;
  const flow = flows.get(day) ?? { deposit: 0, withdrawal: 0 };
  const netInr = value != null && prev != null ? value - prev - flow.deposit + flow.withdrawal : null;
  const netPct = netInr != null && prev ? (netInr / prev) * 100 : null;
  const prevCloseDate = [...closes.keys()].sort().reverse().find((item) => item < day);
  const close = closes.get(day);
  const prevClose = prevCloseDate ? closes.get(prevCloseDate) : undefined;
  const niftyPct = close != null && prevClose ? (close / prevClose - 1) * 100 : null;
  const dayBits = bits.get(day) ?? [];
  const bought = dayBits.filter((bit) => bit.action === "fill" && (bit.side ?? "").toUpperCase() !== "SELL").map((bit) => bit.symbol ?? "");
  const sold = dayBits.filter((bit) => bit.action === "fill" && (bit.side ?? "").toUpperCase() === "SELL").map((bit) => bit.symbol ?? "");
  const skipNames = skips.get(day) ?? [];
  return {
    day,
    netPct,
    niftyPct,
    netInr,
    blurb: verdictSentence({
      bought: bought.filter(Boolean),
      sold: sold.filter(Boolean),
      skipped: skipNames.length,
      skipNames,
      stopsRaised: dayBits.filter((bit) => bit.action === "stop.updated").length,
      lateLogin: false,
      waitingForLogin: false,
      rulesBroken: 0,
    }),
  };
}

function toBit(row: Record<string, unknown>): AuditBit {
  const after = (row.after ?? {}) as Record<string, unknown>;
  return {
    ts: String(row.ts),
    action: String(row.action),
    symbol: row.symbol ? String(row.symbol) : null,
    reason: String(row.reason ?? ""),
    side: after.side ? String(after.side) : null,
    qty: after.qty == null ? null : num(after.qty),
    code: after.reason_code ? String(after.reason_code) : null,
  };
}

const DAILY_STEPS: { id: string; kind: string; title: string; time: string }[] = [
  { id: "remind", kind: "remind", title: "Login reminder", time: "08:30" },
  { id: "login", kind: "kite", title: "You logged in", time: "09:00" },
  { id: "preflight", kind: "preflight", title: "Morning checks", time: "08:35" },
  { id: "sells", kind: "sells", title: "Sells", time: "09:20" },
  { id: "buys", kind: "buys", title: "Buys", time: "09:45" },
  { id: "eod", kind: "eod", title: "Market close", time: "15:45" },
  { id: "scan", kind: "import-ideas", title: "Nightly scan", time: "18:20" },
  { id: "stops", kind: "eod-stops", title: "Stop updates", time: "19:45" },
  { id: "report", kind: "eod-final", title: "Daily report", time: "19:50" },
];

type DayRun = { kind: string; status: string; finished: string | null; summary: Record<string, unknown> };

function dailyTimeline(
  bits: AuditBit[],
  runs: DayRun[],
  input: {
    bought: number;
    skipped: number;
    stops: number;
    kiteAt: string | null;
    minutes: number;
    live: boolean;
    remind: "push" | "ready" | "off" | null;
    matched: number | null;
    checked: number | null;
    cash: number | null;
    noBuys: string | null;
  },
): TimelineStep[] {
  const waiting = bits.some((bit) => /no_kite|waiting/i.test(bit.action) || /waiting for kite/i.test(bit.reason));
  const base = DAILY_STEPS.filter((step) => step.id !== "login" || input.kiteAt || waiting);
  const withWait = waiting
    ? [...base, { id: "wait", kind: "wait", title: "Waiting for login", time: "09:00" }]
    : base;
  const steps = [...withWait].sort((a, b) => a.time.localeCompare(b.time) || a.title.localeCompare(b.title));
  const marks = steps.map((step) => {
    if (step.id === "wait") return "late" as StepMark;
    if (step.id === "login") return input.kiteAt ? markStep(step.time, { status: "ok", finishedMinutes: minutesOf(input.kiteAt) }) : "planned";
    const run = [...runs].reverse().find((item) => item.kind === step.kind);
    return markStep(step.time, run ? { status: run.status, finishedMinutes: run.finished ? minutesOf(run.finished) : null } : null);
  });
  const shown = withNext(marks, input.live ? input.minutes : 24 * 60, steps.map((step) => step.time));
  return steps.map((step, index) => {
    const state = step.id === "login" && waiting && !input.kiteAt ? "late" : shown[index];
    return {
      id: step.id,
      title: step.title,
      state,
      result: dayStepResult({
        id: step.id,
        ran: state === "done" || state === "late",
        bought: input.bought,
        skipped: input.skipped,
        stops: input.stops,
        kiteAt: input.kiteAt,
        remind: input.remind,
        matched: input.matched,
        checked: input.checked,
        cash: input.cash,
        noBuys: input.noBuys,
      }),
    };
  });
}

function summaryOf(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" ? parsed as Record<string, unknown> : {};
    } catch {
      return {};
    }
  }
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function remindKind(summary: Record<string, unknown> | null): "push" | "ready" | "off" | null {
  if (!summary) return null;
  if (summary.skipped) return "off";
  if (summary.session === true) return "ready";
  return "push";
}

