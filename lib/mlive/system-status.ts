import { isTradingDay, istMinutes, previousTradingDay, todayIst } from "./calendar";
import { marketSql } from "./market";
import { loadNiftyCloses } from "./nifty";
import type { NiftyReason } from "./nifty-reason";
import { SCHEDULE, markStep, minutesOf, systemBanner, withNext, yesterdayLine, type StepMark } from "./schedule";
import { sql } from "../sql";

type RunRow = { kind: string; status: string; started_at: unknown; finished_at: unknown; summary: unknown };

export type SystemStep = {
  kind: string;
  time: string;
  title: string;
  description: string;
  group: "before" | "market" | "evening";
  mark: StepMark;
  count: number;
  errors: number;
  runs: { status: string; at: string; summary: string }[];
};

export type SystemStatus = {
  banner: { tone: "ok" | "wait" | "bad" | "muted"; line: string };
  groups: { id: "before" | "market" | "evening"; label: string; steps: SystemStep[] }[];
  health: { server: string; kite: string; prices: string; candles: string; mainDb: string; marketDb: string; niftyReason: NiftyReason | null };
  yesterday: { day: string; line: string };
  deploy: { commit: string; at: string } | null;
};

function clock(value: unknown): string {
  if (value == null || value === "") return "";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Kolkata" });
}

function minutes(value: unknown): number | null {
  const text = clock(value);
  return text ? minutesOf(text) : null;
}

function pretty(bytes: number): string {
  if (!bytes) return "Not reporting yet";
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

export async function systemStatus(now = new Date()): Promise<SystemStatus> {
  const today = todayIst(now);
  const minute = istMinutes(now);
  const holidays = new Set((await sql`SELECT trade_date::text AS trade_date FROM mlive.mlive_holidays`).map((row) => String(row.trade_date).slice(0, 10)));
  const closed = !isTradingDay(today, holidays);
  const yesterday = previousTradingDay(today, holidays);
  const [runs, kite, tables, mainSize] = await Promise.all([
    sql`SELECT kind, status, started_at, finished_at, summary FROM mlive.mlive_runs
         WHERE (timezone('Asia/Kolkata', coalesce(finished_at, started_at)))::date IN (${today}::date, ${yesterday}::date)
         ORDER BY id`,
    sql`SELECT token_date::text AS token_date, connected_at FROM mlive.mlive_kite_sessions ORDER BY connected_at DESC LIMIT 1`,
    sql`SELECT to_regclass('mlive.mlive_heartbeat')::text AS beat, to_regclass('mlive.mlive_deploys')::text AS deploy`,
    sql`SELECT pg_database_size(current_database())::bigint AS bytes`,
  ]);
  const todayRuns = (runs as RunRow[]).filter((row) => clock(row.finished_at ?? row.started_at) && dayOf(row.finished_at ?? row.started_at) === today);
  const yRuns = (runs as RunRow[]).filter((row) => dayOf(row.finished_at ?? row.started_at) === yesterday);
  const byKind = new Map<string, RunRow[]>();
  for (const row of todayRuns) {
    const list = byKind.get(String(row.kind)) ?? [];
    list.push(row);
    byKind.set(String(row.kind), list);
  }
  const repeat = new Set(["approvals", "sync"]);
  const steps: SystemStep[] = SCHEDULE.map((step) => {
    const list = byKind.get(step.kind) ?? [];
    const last = list.at(-1) ?? null;
    const errors = list.filter((row) => /fail|error/i.test(String(row.status))).length;
    const mark = markStep(step.time, last ? { status: String(last.status), finishedMinutes: minutes(last.finished_at) } : null);
    return {
      ...step,
      mark,
      count: list.length,
      errors,
      runs: (repeat.has(step.kind) ? list.slice(-5) : list.slice(-8)).map((row) => ({
        status: String(row.status),
        at: clock(row.finished_at ?? row.started_at),
        summary: summarise(row.summary),
      })),
    };
  });
  steps.sort((a, b) => minutesOf(a.time) - minutesOf(b.time) || a.title.localeCompare(b.title));
  const marks = withNext(steps.map((step) => step.mark), closed ? 24 * 60 : minute, steps.map((step) => step.time));
  steps.forEach((step, index) => { step.mark = marks[index]; });
  const failed = steps.find((step) => step.mark === "failed");
  const next = steps.find((step) => step.mark === "next" || step.mark === "planned");
  const buys = steps.find((step) => step.kind === "buys");
  const banner = systemBanner({
    closed,
    minutes: minute,
    kiteConnected: kite[0] ? String(kite[0].token_date).slice(0, 10) === today : false,
    failed: failed ? failed.title : null,
    buysDone: buys?.mark === "done" || buys?.mark === "late",
    clock: now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Kolkata" }),
    next: next ? `${next.title} ${next.time}` : "Nothing else today",
  });
  const lateBuy = yRuns.find((row) => row.kind === "buys" && (minutes(row.finished_at) ?? 0) > minutesOf("10:05"));
  const yFail = yRuns.find((row) => /fail|error/i.test(String(row.status)));
  const kiteYesterday = kite[0] && String(kite[0].token_date).slice(0, 10) === yesterday ? clock(kite[0].connected_at) : null;
  const market = await marketFacts(closed ? yesterday : today);
  return {
    banner,
    groups: [
      { id: "before", label: "Before the open", steps: steps.filter((step) => step.group === "before") },
      { id: "market", label: "Market hours", steps: steps.filter((step) => step.group === "market") },
      { id: "evening", label: "Evening", steps: steps.filter((step) => step.group === "evening") },
    ],
    health: {
      server: tables[0]?.beat ? "Online" : "Not reporting yet",
      kite: kite[0] && String(kite[0].token_date).slice(0, 10) === today ? `Valid today, connected ${clock(kite[0].connected_at)}` : "Not connected",
      prices: "Not reporting yet",
      candles: market.candles,
      mainDb: pretty(Number(mainSize[0]?.bytes ?? 0)),
      marketDb: market.size,
      niftyReason: market.niftyReason,
    },
    yesterday: {
      day: yesterday,
      line: yRuns.length === 0
        ? "No jobs recorded."
        : yesterdayLine(lateBuy ? clock(lateBuy.finished_at) : null, kiteYesterday, yFail ? String(yFail.kind) : null),
    },
    deploy: tables[0]?.deploy ? await lastDeploy() : null,
  };
}

function dayOf(value: unknown): string {
  if (value == null) return "";
  return new Date(String(value)).toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function summarise(value: unknown): string {
  if (value == null) return "No log stored for this run.";
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > 600 ? `${text.slice(0, 600)}…` : text;
}

async function lastDeploy(): Promise<{ commit: string; at: string } | null> {
  try {
    const rows = await sql.query(`SELECT commit, created_at FROM mlive.mlive_deploys ORDER BY created_at DESC LIMIT 1`);
    const row = (rows as { commit?: unknown; created_at?: unknown }[])[0];
    if (!row) return null;
    return { commit: String(row.commit ?? "").slice(0, 7), at: clock(row.created_at) };
  } catch {
    return null;
  }
}

async function marketFacts(day: string): Promise<{ candles: string; size: string; niftyReason: NiftyReason | null }> {
  const market = marketSql();
  if (!market) return { candles: "Not configured", size: "Not configured", niftyReason: "no-url" };
  try {
    const [latest, size] = await Promise.all([
      market`SELECT max(ts)::text AS ts FROM candles_daily`,
      market`SELECT pg_database_size(current_database())::bigint AS bytes`,
    ]);
    const nifty = await loadNiftyCloses(day, day);
    return {
      candles: latest[0]?.ts ? String(latest[0].ts).slice(0, 10) : "No candles yet",
      size: pretty(Number(size[0]?.bytes ?? 0)),
      niftyReason: nifty.reason,
    };
  } catch (error) {
    console.error("Nifty market database unreachable:", error instanceof Error ? error.message : error);
    return { candles: "Not reporting yet", size: "Not reporting yet", niftyReason: "unreachable" };
  }
}
