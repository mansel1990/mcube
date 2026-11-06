import { sql } from "@/lib/sql";
import { adjustPeak } from "./rules";

export async function userAudit(entry: {
  userId: string;
  action: string;
  symbol?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
}): Promise<void> {
  await sql`
    INSERT INTO mlive.mlive_audit_log (actor, action, symbol, before, after, reason)
    VALUES (
      'user',
      ${entry.action},
      ${entry.symbol ?? null},
      ${entry.before == null ? null : JSON.stringify(entry.before)}::jsonb,
      ${entry.after == null ? null : JSON.stringify(entry.after)}::jsonb,
      ${entry.reason ?? null}
    )`;
}

const EDITABLE = new Set([
  "risk_pct",
  "max_order_pct",
  "min_order_inr",
  "cash_reserve_inr",
  "max_buys_per_day",
  "max_new_buys_per_day",
  "max_buys_per_strategy_per_day",
  "max_open_per_strategy",
  "max_daily_deploy_pct",
  "max_sells_per_day",
  "max_open_positions",
  "max_per_sector",
  "breaker_pct",
  "chase_pct",
  "limit_offset_pct",
  "exclude_symbols",
  "strategies_enabled",
  "login_reminder",
  "quiet_hours",
]);

export function settingAllowed(key: string): boolean {
  return EDITABLE.has(key);
}

export async function changeSetting(key: string, value: unknown, userId: string): Promise<void> {
  const current = await sql`SELECT value FROM mlive.mlive_settings WHERE key = ${key}`;
  const oldValue = current[0]?.value ?? null;
  await sql`
    INSERT INTO mlive.mlive_settings (key, value, updated_at, updated_by)
    VALUES (${key}, ${JSON.stringify(value)}::jsonb, now(), ${userId})
    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`;
  await sql`
    INSERT INTO mlive.mlive_settings_history (key, old_value, new_value, changed_by)
    VALUES (${key}, ${oldValue == null ? null : JSON.stringify(oldValue)}::jsonb, ${JSON.stringify(value)}::jsonb, ${userId})`;
  await userAudit({ userId, action: "setting.change", before: { key, value: oldValue }, after: { key, value }, reason: key });
}

export async function recordFund(kind: "deposit" | "withdrawal", amount: number, userId: string, note: string): Promise<void> {
  const signed = kind === "withdrawal" ? -Math.abs(amount) : Math.abs(amount);
  const fundRows = await sql`SELECT COALESCE(SUM(amount), 0) AS total FROM mlive.mlive_fund_ledger WHERE dry_run = false`;
  const fund = Number(fundRows[0]?.total ?? 0);
  if (kind === "withdrawal" && Math.abs(signed) > fund) {
    throw new Error("That is more than the trading limit");
  }
  await sql`
    INSERT INTO mlive.mlive_fund_ledger (kind, amount, note) VALUES (${kind}, ${signed}, ${note})`;
  const state = await sql`SELECT peak_value FROM mlive.mlive_state WHERE id = 1`;
  const peak = adjustPeak(Number(state[0]?.peak_value ?? fund), signed);
  await sql`UPDATE mlive.mlive_state SET peak_value = ${peak}, updated_at = now() WHERE id = 1`;
  await userAudit({ userId, action: `fund.${kind}`, after: { amount: signed, peak }, reason: note });
}
