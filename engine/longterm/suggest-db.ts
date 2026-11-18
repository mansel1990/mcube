import { audit } from "../audit";
import { num, q, jsonValue } from "../db";
import { loadSettings } from "../load";
import { loadLongtermDataset } from "./data";
import { buildSignalFrame } from "./signal";
import { approvalPlan, radarGate } from "./suggest";
import { getLongtermVariant } from "./variants";

function enabled(value: unknown): boolean {
  return value === true || value === "true";
}

function drawdownPct(metrics: unknown): number | null {
  const parsed = typeof metrics === "string" ? jsonValue(metrics) : metrics;
  if (!parsed || typeof parsed !== "object") return null;
  const row = parsed as { maxDrawdown?: { pct?: unknown } };
  const pct = Number(row.maxDrawdown?.pct);
  return Number.isFinite(pct) ? pct : null;
}

/** Creates no decisions and places no orders. Both switches default off, so this returns before any market read. */
export async function considerLongGameSuggestions(): Promise<{ skipped: string }> {
  const rows = await q<{ key: string; value: unknown }>(
    `SELECT key, value FROM mlive.mlive_settings
      WHERE key IN ('longterm_core_enabled', 'longterm_radar_enabled', 'longterm_secondary')`
  );
  const map = new Map(rows.map((row) => [row.key, jsonValue(row.value)]));
  const core = enabled(map.get("longterm_core_enabled"));
  const radar = enabled(map.get("longterm_radar_enabled"));
  if (!core && !radar) return { skipped: "disabled" };
  const secondary = typeof map.get("longterm_secondary") === "string" ? String(map.get("longterm_secondary")) : "mid";
  if (!radar) return { skipped: "core-only" };
  const latest = await q<{ id: string }>(
    `SELECT id::text AS id FROM mlive.mlive_research_runs
      WHERE book = 'longterm' AND sample = 'heldback' AND status = 'ok'
      ORDER BY id DESC LIMIT 1`
  );
  const runId = latest[0]?.id;
  if (!runId) return { skipped: "radar-blocked" };
  const results = await q<{ variant: string; metrics: unknown }>(
    `SELECT variant, metrics FROM mlive.mlive_longterm_results WHERE run_id = $1 AND variant IN ('STATIC-MID', 'RADAR-MID')`,
    [num(runId)]
  );
  const radarDd = drawdownPct(results.find((row) => row.variant === "RADAR-MID")?.metrics);
  const staticDd = drawdownPct(results.find((row) => row.variant === "STATIC-MID")?.metrics);
  const gate = radarGate({
    radarEnabled: true,
    secondary,
    variants: results.map((row) => row.variant),
    radarMaxDrawdownPct: radarDd ?? 100,
    staticMaxDrawdownPct: staticDd ?? 0,
  });
  if (!gate.allowed || radarDd == null || staticDd == null) return { skipped: "radar-blocked" };
  const dataset = await loadLongtermDataset("building", { annotate: false });
  buildSignalFrame(dataset, getLongtermVariant("RADAR-MID"), dataset.dates.slice(-400));
  return { skipped: "radar-frame" };
}

export async function commitSuggestionApproval(input: {
  suggestionId: number;
  amount: number;
  today: string;
  fundingConfirmed: boolean;
  lines: { symbol: string; side: "BUY" | "SELL"; units: number; limit: number }[];
}): Promise<{ ok: true; deposit: number } | { ok: false; error: string }> {
  const rows = await q<{ status: string; rules_version: string; expires_on: string | null; pocket: string }>(
    `SELECT status, rules_version, expires_on::text AS expires_on, pocket
       FROM mlive.mlive_longgame_suggestions WHERE id = $1`,
    [input.suggestionId]
  );
  const row = rows[0];
  if (!row) return { ok: false, error: "That suggestion is not there." };
  if (row.status === "approved") return { ok: true, deposit: 0 };
  const plan = approvalPlan({
    status: row.status,
    expiresOn: row.expires_on ?? input.today,
    today: input.today,
    rulesVersion: row.rules_version,
    amount: input.amount,
    fundingConfirmed: input.fundingConfirmed,
  });
  if (!plan.ok) return plan;
  const key = `suggestion:${input.suggestionId}:deposit`;
  const locked = await q<{ id: string }>(
    `WITH locked AS (
       UPDATE mlive.mlive_longgame_suggestions
          SET status = 'approved', selected_inr = $2, decided_at = now()
        WHERE id = $1 AND status = 'pending' AND rules_version = $3
          AND (expires_on IS NULL OR expires_on >= $4::date)
       RETURNING id, pocket
     ),
     deposited AS (
       INSERT INTO mlive.mlive_longgame_ledger (pocket, kind, amount, idempotency_key, note)
       SELECT pocket, 'deposit', $5, $6, 'Approved Long Game suggestion'
         FROM locked
        WHERE $5 > 0
       ON CONFLICT (idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
       RETURNING id
     )
     SELECT id::text AS id FROM locked`,
    [input.suggestionId, input.amount, row.rules_version, input.today, plan.deposit, key]
  );
  if (!locked[0]) return { ok: false, error: "That suggestion changed before it could be approved." };
  const settings = await loadSettings();
  for (const line of input.lines) {
    const existing = await q(
      `SELECT id FROM mlive.mlive_decisions WHERE suggestion_id = $1 AND symbol = $2 AND side = $3`,
      [input.suggestionId, line.symbol, line.side]
    );
    if (existing[0]) continue;
    await q(
      `INSERT INTO mlive.mlive_decisions
         (trade_date, side, symbol, outcome, reason_code, reason_text, sizing, dry_run, book, suggestion_id, pocket)
       VALUES ($1::date, $2, $3, 'approved', 'longterm_allocation', $4, $5::jsonb, $6, 'longterm', $7, $8)`,
      [
        input.today,
        line.side,
        line.symbol,
        "Approved Long Game suggestion",
        JSON.stringify({ qty: line.units, limit: line.limit }),
        settings.dryRun,
        input.suggestionId,
        row.pocket,
      ]
    );
  }
  await audit({
    actor: "user",
    action: "longgame.approve",
    reason: plan.deposit > 0 ? `Approved with a deposit of ${plan.deposit}.` : "Approved with no new money.",
    after: { suggestionId: input.suggestionId, deposit: plan.deposit },
  });
  return { ok: true, deposit: plan.deposit };
}

export async function closeSuggestion(id: number, status: "rejected" | "expired", reason: string): Promise<void> {
  await q(
    `UPDATE mlive.mlive_longgame_suggestions
        SET status = $2, note = $3, decided_at = now()
      WHERE id = $1 AND status = 'pending'`,
    [id, status, reason]
  );
}
