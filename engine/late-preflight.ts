import { istMinutes, todayIst } from "@/lib/mlive/calendar";
import { audit } from "./audit";
import { q } from "./db";
import { runSessionPreflight } from "./jobs/preflight";
import { MliveKite } from "./kite";
import { fundBalance, loadSettings, loadState } from "./load";

/** Buys still go out through 10:00 IST. A later login does not open a new morning draft. */
export function buysWindowOpen(minute: number): boolean {
  return minute <= 10 * 60;
}

async function sessionPreflightDone(today: string): Promise<boolean> {
  const rows = await q(
    `SELECT id FROM mlive.mlive_runs
      WHERE kind = 'preflight' AND status = 'ok'
        AND (COALESCE(finished_at, started_at) AT TIME ZONE 'Asia/Kolkata')::date = $1::date
        AND (summary->>'session' = 'true' OR summary ? 'spendable')
      LIMIT 1`,
    [today]
  );
  return Boolean(rows[0]);
}

async function lateAlreadyRan(today: string): Promise<boolean> {
  const rows = await q(
    `SELECT id FROM mlive.mlive_audit_log
      WHERE action = 'preflight.late' AND reason = $1
        AND (ts AT TIME ZONE 'Asia/Kolkata')::date = $1::date
      LIMIT 1`,
    [today]
  );
  return Boolean(rows[0]);
}

/**
 * Morning checks after a late login. Once a day, and only when today's preflight
 * never finished with a Kite session. No 08:35–09:10 window, and no halt for a missing session.
 */
export async function runLatePreflight(runId: number): Promise<void> {
  const today = todayIst();
  if (await sessionPreflightDone(today)) return;
  if (await lateAlreadyRan(today)) return;
  const settings = await loadSettings();
  const state = await loadState();
  const kite = new MliveKite(settings.dryRun);
  let holdings: { tradingsymbol: string; quantity: number }[] = [];
  let reconcile = false;
  let kiteCash = 0;
  let alertCash = false;
  let fund = 0;
  try {
    holdings = await kite.holdings();
    reconcile = true;
  } catch (error) {
    console.error("late preflight holdings", error instanceof Error ? error.message : error);
  }
  try {
    kiteCash = await kite.equityCash();
    alertCash = true;
  } catch (error) {
    console.error("late preflight cash", error instanceof Error ? error.message : error);
  }
  try {
    fund = await fundBalance(settings.dryRun);
  } catch (error) {
    alertCash = false;
    console.error("late preflight fund", error instanceof Error ? error.message : error);
  }
  const draftBuys = buysWindowOpen(istMinutes());
  await runSessionPreflight(runId, {
    settings,
    state,
    holdings,
    kiteCash,
    fund,
    reconcile,
    alertCash,
    draftBuys,
  });
  await audit({ actor: "engine", action: "preflight.late", reason: today, runId });
}
