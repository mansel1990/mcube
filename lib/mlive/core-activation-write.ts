import { sql } from "@/lib/sql";
import { coreActivationPatch } from "./core-activation";

function strategiesOf(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === "string");
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : ["rs", "ema"];
    } catch {
      return ["rs", "ema"];
    }
  }
  return ["rs", "ema"];
}

/** Owner action only. Adds longterm and turns Core on in one transaction. Never touches Radar. */
export async function enableLongtermCore(userId: string): Promise<{ strategiesEnabled: string[] }> {
  const rows = await sql`SELECT key, value FROM mlive.mlive_settings WHERE key IN ('strategies_enabled', 'longterm_core_enabled')`;
  const map = new Map(rows.map((row) => [String(row.key), row.value]));
  const current = strategiesOf(map.get("strategies_enabled"));
  const patch = coreActivationPatch(current);
  const strategies = JSON.stringify(patch.strategiesEnabled);
  const beforeStrategies = JSON.stringify(current);
  await sql.transaction([
    sql`INSERT INTO mlive.mlive_settings (key, value, updated_at, updated_by)
        VALUES ('strategies_enabled', ${strategies}::jsonb, now(), ${userId})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    sql`INSERT INTO mlive.mlive_settings_history (key, old_value, new_value, changed_by)
        VALUES ('strategies_enabled', ${beforeStrategies}::jsonb, ${strategies}::jsonb, ${userId})`,
    sql`INSERT INTO mlive.mlive_settings (key, value, updated_at, updated_by)
        VALUES ('longterm_core_enabled', 'true'::jsonb, now(), ${userId})
        ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now(), updated_by = EXCLUDED.updated_by`,
    sql`INSERT INTO mlive.mlive_settings_history (key, old_value, new_value, changed_by)
        VALUES ('longterm_core_enabled', ${JSON.stringify(map.get("longterm_core_enabled") ?? false)}::jsonb, 'true'::jsonb, ${userId})`,
    sql`INSERT INTO mlive.mlive_audit_log (actor, action, before, after, reason)
        VALUES ('user', 'setting.change', ${JSON.stringify({ key: "strategies_enabled", value: current })}::jsonb, ${JSON.stringify({ key: "strategies_enabled", value: patch.strategiesEnabled })}::jsonb, 'strategies_enabled')`,
    sql`INSERT INTO mlive.mlive_audit_log (actor, action, before, after, reason)
        VALUES ('user', 'setting.change', ${JSON.stringify({ key: "longterm_core_enabled", value: map.get("longterm_core_enabled") ?? false })}::jsonb, ${JSON.stringify({ key: "longterm_core_enabled", value: true })}::jsonb, 'longterm_core_enabled')`,
  ]);
  return { strategiesEnabled: patch.strategiesEnabled };
}
