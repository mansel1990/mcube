import { isTradingDay, todayIst } from "@/lib/mlive/calendar";
import { kiteErrorMessage } from "@/lib/mlive/rules";
import { audit } from "./audit";
import { raiseAlert } from "./alerts";
import { q } from "./db";
import { holidaySet } from "./load";
import { withLock } from "./lock";

export async function runJob(kind: string, fn: (runId: number) => Promise<Record<string, unknown>>): Promise<void> {
  const today = todayIst();
  const holidays = await holidaySet();
  if (!isTradingDay(today, holidays)) {
    console.log(`${kind} skipped: ${today} is not a trading day`);
    return;
  }
  try {
    await withLock(async () => {
    const created = await q<{ id: string }>(
      `INSERT INTO mlive.mlive_runs (kind, status) VALUES ($1, 'running') RETURNING id`,
      [kind]
    );
    const runId = Number(created[0].id);
    try {
      const summary = await fn(runId);
      await q(
        `UPDATE mlive.mlive_runs SET status = 'ok', finished_at = now(), summary = $2::jsonb WHERE id = $1`,
        [runId, JSON.stringify(summary)]
      );
      await q(`UPDATE mlive.mlive_state SET last_run_id = $1, updated_at = now() WHERE id = 1`, [runId]);
      await audit({ actor: "engine", action: `run.${kind}`, after: summary, runId });
      console.log(`${kind} ok`, JSON.stringify(summary));
    } catch (error) {
      const message = kiteErrorMessage(error);
      await q(
        `UPDATE mlive.mlive_runs SET status = 'error', finished_at = now(), summary = $2::jsonb WHERE id = $1`,
        [runId, JSON.stringify({ error: message })]
      );
      await audit({ actor: "engine", action: "run.error", reason: `${kind}: ${message}`, runId });
      await raiseAlert({ level: "problem", code: "engine_error", message: `${kind} failed: ${message}`, runId });
      throw error;
    }
  });
  } catch (error) {
    const message = kiteErrorMessage(error);
    if (message.includes("already running")) {
      await raiseAlert({ level: "problem", code: "engine_lock", message: `${kind} waited 4 minutes and the previous job was still running` });
    }
    throw error;
  }
}
