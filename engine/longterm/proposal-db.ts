import { todayIst } from "@/lib/mlive/calendar";
import { audit } from "../audit";
import { q, num, jsonValue } from "../db";
import { loadSettings } from "../load";
import { LONGTERM_VARIANT_NAMES, type LongtermVariantName } from "./variants";
import {
  activationAllowed,
  type AllocationChange,
  type DecisionDraft,
  type ProposalTrade,
  type StoredProposal,
  type SleeveWeights,
} from "./proposal";

export type ProposalGate = {
  allowed: boolean;
  cap: number;
  expiryDays: number;
  variant: string | null;
  enabled: string[];
  conclusion: string | null;
};

export async function readProposalGate(): Promise<ProposalGate> {
  const rows = await q<{ key: string; value: unknown }>(
    `SELECT key, value FROM mlive.mlive_settings
      WHERE key IN ('strategies_enabled', 'longterm_variant', 'longterm_max_changes_per_year', 'longterm_proposal_expiry_days')`
  );
  const map = new Map(rows.map((row) => [row.key, jsonValue(row.value)]));
  const enabled = Array.isArray(map.get("strategies_enabled")) ? (map.get("strategies_enabled") as unknown[]).map(String) : [];
  const variantRaw = map.get("longterm_variant");
  const variant = typeof variantRaw === "string" && (LONGTERM_VARIANT_NAMES as readonly string[]).includes(variantRaw)
    ? variantRaw
    : null;
  const conclusion = variant ? await heldbackConclusion(variant) : null;
  return {
    allowed: activationAllowed({ enabled, heldbackConclusion: conclusion }),
    cap: finite(map.get("longterm_max_changes_per_year"), 12),
    expiryDays: finite(map.get("longterm_proposal_expiry_days"), 3),
    variant,
    enabled,
    conclusion,
  };
}

export async function loadPendingProposal(): Promise<StoredProposal | null> {
  const rows = await q<Record<string, unknown>>(
    `SELECT * FROM mlive.mlive_longterm_proposals WHERE status = 'pending' ORDER BY id LIMIT 1`
  );
  return rows[0] ? mapProposal(rows[0]) : null;
}

export async function countApprovedThisYear(year: number): Promise<number> {
  const rows = await q<{ n: number }>(
    `SELECT COUNT(*)::int AS n
       FROM mlive.mlive_longterm_proposals
      WHERE status = 'approved'
        AND EXTRACT(YEAR FROM (decided_at AT TIME ZONE 'Asia/Kolkata')) = $1`,
    [year]
  );
  return num(rows[0]?.n);
}

export async function insertProposal(input: Omit<StoredProposal, "id" | "status" | "note">): Promise<number> {
  const rows = await q<{ id: string }>(
    `INSERT INTO mlive.mlive_longterm_proposals
       (variant, status, signal_date, proposed_on, expires_on, reason, current_weights, target_weights,
        trades, costs_inr, tax_inr, events_used, events_cap)
     VALUES ($1, 'pending', $2::date, $3::date, $4::date, $5, $6::jsonb, $7::jsonb, $8::jsonb, $9, $10, $11, $12)
     RETURNING id`,
    [
      input.variant,
      input.signalDate,
      input.proposedOn,
      input.expiresOn,
      input.reason,
      JSON.stringify(input.currentWeights),
      JSON.stringify(input.targetWeights),
      JSON.stringify(input.trades),
      input.costsInr,
      input.taxInr,
      input.eventsUsed,
      input.eventsCap,
    ]
  );
  const id = num(rows[0]?.id);
  await audit({
    actor: "engine",
    action: "longterm.proposal",
    after: { id, variant: input.variant, eventsUsed: input.eventsUsed, eventsCap: input.eventsCap },
    reason: input.reason,
  });
  return id;
}

export async function markProposal(id: number, status: "expired" | "rejected" | "approved", note: string, actor: "engine" | "user"): Promise<void> {
  const before = await q(`SELECT status FROM mlive.mlive_longterm_proposals WHERE id = $1`, [id]);
  await q(
    `UPDATE mlive.mlive_longterm_proposals
        SET status = $2, note = $3, decided_at = now()
      WHERE id = $1 AND status = 'pending'`,
    [id, status, note || null]
  );
  await audit({
    actor,
    action: `longterm.${status}`,
    before: { id, status: before[0]?.status ?? "pending" },
    after: { id, status },
    reason: note || null,
  });
}

/** The only insert of Long Game orders into the decision book. */
export async function insertLongtermDecisions(drafts: readonly DecisionDraft[]): Promise<number[]> {
  if (drafts.length === 0) return [];
  const settings = await loadSettings();
  const ids: number[] = [];
  for (const draft of drafts) {
    const existing = await q<{ id: string }>(
      `SELECT id::text AS id FROM mlive.mlive_decisions
        WHERE reason_code = 'longterm_allocation'
          AND trade_date = $1::date
          AND symbol = $2
          AND side = $3
          AND outcome IN ('approved', 'sent')
        ORDER BY id DESC
        LIMIT 1`,
      [draft.tradeDate, draft.symbol, draft.side]
    );
    if (existing[0]) {
      ids.push(num(existing[0].id));
      continue;
    }
    const rows = await q<{ id: string }>(
      `INSERT INTO mlive.mlive_decisions
         (trade_date, side, symbol, outcome, reason_code, reason_text, sizing, dry_run, book, rank)
       VALUES ($1::date, $2, $3, 'approved', 'longterm_allocation', $4, $5::jsonb, $6, 'longterm', $7)
       RETURNING id`,
      [
        draft.tradeDate,
        draft.side,
        draft.symbol,
        draft.reason,
        JSON.stringify({ qty: draft.qty, limit: draft.limit }),
        settings.dryRun,
        draft.rank,
      ]
    );
    const id = num(rows[0]?.id);
    ids.push(id);
    await audit({
      actor: "engine",
      action: "longterm.decision",
      symbol: draft.symbol,
      after: { id, side: draft.side, qty: draft.qty, limit: draft.limit, tradeDate: draft.tradeDate },
      reason: draft.reason,
    });
  }
  return ids;
}

export function proposalView(row: StoredProposal) {
  return {
    id: row.id,
    variant: row.variant,
    reason: row.reason,
    signalDate: row.signalDate,
    currentWeights: row.currentWeights,
    targetWeights: row.targetWeights,
    trades: row.trades.map((trade) => ({
      side: trade.side,
      symbol: trade.symbol,
      sleeve: trade.sleeve,
      qty: trade.qty,
      limit: trade.limit,
    })),
    costsInr: row.costsInr,
    taxInr: row.taxInr,
    eventsUsed: row.eventsUsed,
    eventsCap: row.eventsCap,
    expiresOn: row.expiresOn,
  };
}

async function heldbackConclusion(variant: string): Promise<string | null> {
  const rows = await q<{ conclusion: string | null }>(
    `SELECT r.metrics->>'conclusion' AS conclusion
       FROM mlive.mlive_longterm_results r
       JOIN mlive.mlive_research_runs u ON u.id = r.run_id
      WHERE u.book = 'longterm'
        AND u.sample = 'heldback'
        AND u.status = 'ok'
        AND r.variant = $1
        AND u.id <> ALL($2::bigint[])
      ORDER BY u.id DESC
      LIMIT 1`,
    [variant, [9, 10]]
  );
  const text = rows[0]?.conclusion;
  return text === "qualifies for live design" || text === "does not qualify" ? text : null;
}

function mapProposal(row: Record<string, unknown>): StoredProposal {
  const change = jsonValue(row.trades);
  return {
    id: num(row.id),
    status: row.status === "approved" || row.status === "rejected" || row.status === "expired" ? row.status : "pending",
    variant: String(row.variant),
    signalDate: dateOf(row.signal_date),
    reason: String(row.reason ?? ""),
    currentWeights: weightsOf(row.current_weights),
    targetWeights: weightsOf(row.target_weights),
    trades: Array.isArray(change) ? change as ProposalTrade[] : tradesOf(row.trades),
    costsInr: num(row.costs_inr),
    taxInr: num(row.tax_inr),
    proposedOn: dateOf(row.proposed_on),
    expiresOn: dateOf(row.expires_on),
    eventsUsed: num(row.events_used),
    eventsCap: num(row.events_cap),
    note: row.note == null ? "" : String(row.note),
  };
}

function tradesOf(value: unknown): ProposalTrade[] {
  const parsed = jsonValue(value);
  if (!Array.isArray(parsed)) return [];
  return parsed as ProposalTrade[];
}

function weightsOf(value: unknown): SleeveWeights {
  const parsed = jsonValue(value);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  return Object.fromEntries(Object.entries(parsed as Record<string, unknown>).map(([key, item]) => [key, num(item)]));
}

function dateOf(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const match = String(value ?? "").match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : todayIst();
}

function finite(value: unknown, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function isChosenVariant(value: string | null): value is LongtermVariantName {
  return value != null && (LONGTERM_VARIANT_NAMES as readonly string[]).includes(value);
}

export type { AllocationChange };
