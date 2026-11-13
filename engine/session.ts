import { todayIst } from "@/lib/mlive/calendar";
import { audit } from "./audit";
import { q } from "./db";
import { MliveKite } from "./kite";
import { loadSettings } from "./load";

export type SessionJob = "sells" | "buys" | "approvals" | "sync";

/** No login: skip the job. One audit row for that job today, and no alert. */
export async function skipIfNoSession(kind: SessionJob): Promise<boolean> {
  const settings = await loadSettings();
  const kite = new MliveKite(settings.dryRun);
  if (await kite.sessionOk()) return false;
  const action = `${kind}.skipped`;
  const already = await q(
    `SELECT id FROM mlive.mlive_audit_log
      WHERE action = $1 AND reason = 'no_kite_session'
        AND (ts AT TIME ZONE 'Asia/Kolkata')::date = $2::date
      LIMIT 1`,
    [action, todayIst()]
  );
  if (!already[0]) {
    await audit({ actor: "engine", action, reason: "no_kite_session" });
  }
  return true;
}
