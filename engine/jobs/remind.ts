import { todayIst } from "@/lib/mlive/calendar";
import { raiseAlert } from "../alerts";
import { asDate, q } from "../db";
import { loadSettings } from "../load";
import { runJob } from "../run";

export async function remind(): Promise<void> {
  await runJob("remind", async (runId) => {
    const settings = await loadSettings();
    if (!settings.loginReminder) return { skipped: "reminder off" };
    const rows = await q<{ token_date: unknown }>(
      `SELECT token_date::text AS token_date FROM mlive.mlive_kite_sessions ORDER BY connected_at DESC LIMIT 1`
    );
    if (asDate(rows[0]?.token_date) === todayIst()) return { session: true };
    await raiseAlert({
      level: "needs_you",
      code: "kite_login_needed",
      message: "Log in to Kite before 09:10. The engine will not trade without today's session.",
      runId,
    });
    return { session: false };
  });
}
