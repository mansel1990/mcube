import { todayIst } from "@/lib/mlive/calendar";
import { q } from "./db";

export type AlertLevel = "needs_you" | "problem" | "done";

type Quiet = { start: string; end: string };

function minutes(hhmm: string): number | null {
  const match = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function inQuietHours(nowMinutes: number, quiet: Quiet | null): boolean {
  if (!quiet) return false;
  const start = minutes(quiet.start);
  const end = minutes(quiet.end);
  if (start == null || end == null) return false;
  if (start === end) return false;
  if (start < end) return nowMinutes >= start && nowMinutes < end;
  return nowMinutes >= start || nowMinutes < end;
}

async function quietSetting(): Promise<Quiet | null> {
  const rows = await q<{ value: unknown }>(`SELECT value FROM mlive.mlive_settings WHERE key = 'quiet_hours'`);
  const value = rows[0]?.value;
  if (!value || typeof value !== "object") return null;
  const record = value as { start?: string; end?: string };
  if (!record.start || !record.end) return null;
  return { start: record.start, end: record.end };
}

export async function raiseAlert(entry: {
  level: AlertLevel;
  code: string;
  message: string;
  symbol?: string | null;
  runId?: number | null;
}): Promise<number> {
  const rows = await q<{ id: string }>(
    `INSERT INTO mlive.mlive_alerts (level, code, message, symbol) VALUES ($1, $2, $3, $4) RETURNING id`,
    [entry.level, entry.code, entry.message, entry.symbol ?? null]
  );
  const id = Number(rows[0].id);
  await q(
    `INSERT INTO mlive.mlive_audit_log (actor, action, symbol, after, reason, run_id)
     VALUES ('engine', 'alert', $1, $2::jsonb, $3, $4)`,
    [entry.symbol ?? null, JSON.stringify({ id, level: entry.level, code: entry.code }), entry.message, entry.runId ?? null]
  );
  await pushAlert(id, entry);
  return id;
}

async function pushAlert(
  id: number,
  entry: { level: AlertLevel; code: string; message: string; symbol?: string | null }
): Promise<void> {
  const secret = process.env.MLIVE_PUSH_SECRET || process.env.CRON_SECRET;
  const url = process.env.MLIVE_PUSH_URL || "https://mcubetechstudio.com/api/mlive/push";
  if (!secret) return;
  const now = new Date();
  const quiet = await quietSetting().catch(() => null);
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const nowMinutes = Number(parts.find((p) => p.type === "hour")?.value ?? 0) * 60 + Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  if (inQuietHours(nowMinutes, quiet) && entry.level === "done") return;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-mlive-secret": secret },
      body: JSON.stringify({ alert_id: id, level: entry.level, code: entry.code, message: entry.message, symbol: entry.symbol ?? null, day: todayIst(now) }),
    });
    if (res.ok) await q(`UPDATE mlive.mlive_alerts SET push_sent = true WHERE id = $1`, [id]);
  } catch (error) {
    console.error("mlive push failed", error instanceof Error ? error.message : error);
  }
}
