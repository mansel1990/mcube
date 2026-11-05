import { q } from "./db";

export async function audit(entry: {
  actor: "engine" | "user" | "kite" | "system";
  action: string;
  symbol?: string | null;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
  runId?: number | null;
}): Promise<void> {
  await q(
    `INSERT INTO mlive.mlive_audit_log (actor, action, symbol, before, after, reason, run_id)
     VALUES ($1, $2, $3, $4::jsonb, $5::jsonb, $6, $7)`,
    [
      entry.actor,
      entry.action,
      entry.symbol ?? null,
      entry.before == null ? null : JSON.stringify(entry.before),
      entry.after == null ? null : JSON.stringify(entry.after),
      entry.reason ?? null,
      entry.runId ?? null,
    ]
  );
}
