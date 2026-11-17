import { istMinutes } from "@/lib/mlive/calendar";
import type { ResearchBook, ResearchSample } from "@/lib/mlive/research-bar";
import type { ResearchArgs } from "../backtest/args";
import { runResearch } from "../backtest/run";
import { researchWindowOpen } from "../backtest/schedule";
import { jsonValue, q } from "../db";

/** Starts the oldest queued research request. Any day, but only in the overnight window. */
export async function researchQueue(): Promise<void> {
  if (!researchWindowOpen(istMinutes())) {
    console.log("research-queue: outside the overnight window");
    return;
  }
  const rows = await q<{ id: string; by_user: string; payload: unknown }>(
    `SELECT id::text AS id, by_user, payload
       FROM mlive.mlive_requests
      WHERE kind = 'research' AND done_at IS NULL
      ORDER BY id
      LIMIT 1`
  );
  const request = rows[0];
  if (!request) {
    console.log("research-queue: nothing queued");
    return;
  }
  const payload = asPayload(jsonValue(request.payload));
  if (!payload) {
    await done(request.id);
    console.log("research-queue: request had no run");
    return;
  }
  const state = await q<{ status: string; started_at: string | null }>(
    `SELECT status, started_at::text AS started_at FROM mlive.mlive_research_runs WHERE id = $1`,
    [payload.runId]
  );
  const status = state[0]?.status;
  if (status === "ok" || status === "error") {
    await done(request.id);
    return;
  }
  if (status === "running") {
    const at = state[0]?.started_at ? Date.parse(state[0].started_at) : Date.now();
    if (Number.isFinite(at) && Date.now() - at < 6 * 60 * 60 * 1000) {
      console.log("research-queue: a backtest is already running");
      return;
    }
  }
  const args: ResearchArgs = {
    book: payload.book,
    strategies: payload.strategies,
    sample: payload.sample,
    force: payload.force,
    grid: payload.grid,
  };
  try {
    await runResearch(args, { runId: payload.runId, requestedBy: request.by_user });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
  } finally {
    await done(request.id);
  }
}

function done(id: string): Promise<unknown> {
  return q(`UPDATE mlive.mlive_requests SET done_at = now() WHERE id = $1 AND done_at IS NULL`, [id]);
}

function asPayload(value: unknown): { runId: number; book: ResearchBook; strategies: string[]; sample: ResearchSample; force: boolean; grid: boolean } | null {
  if (!value || typeof value !== "object") return null;
  const row = value as { runId?: unknown; book?: unknown; strategies?: unknown; sample?: unknown; force?: unknown; grid?: unknown };
  if ((row.book !== "swing" && row.book !== "intraday") || (row.sample !== "building" && row.sample !== "heldback")) return null;
  const runId = Number(row.runId);
  if (!Number.isFinite(runId)) return null;
  const strategies = Array.isArray(row.strategies) ? row.strategies.filter((item): item is string => typeof item === "string") : [];
  return { runId, book: row.book, strategies, sample: row.sample, force: row.force === true, grid: row.grid !== false };
}
