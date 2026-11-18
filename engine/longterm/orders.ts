import { floorToTick, makeTag } from "@/lib/mlive/rules";
import { istMinutes, todayIst } from "@/lib/mlive/calendar";
import { guardOrder, type GuardContext } from "../guard";
import { recordOrder, shortId } from "../book";
import { num, q } from "../db";
import { MliveKite } from "../kite";
import { fundBalance, loadSettings, loadState } from "../load";
import { readProposalGate } from "./proposal-db";
import { isLongtermEtf } from "./proposal";

const LONGTERM_REASON = "longterm_allocation";

/** Places approved Long Game decisions. Research and the proposal job do not call this. */
export async function sendLongtermDecisions(side: "BUY" | "SELL", runId: number): Promise<{ sent: number; skipped?: string }> {
  try {
    const minute = istMinutes();
    if (side === "SELL" && (minute < 9 * 60 + 15 || minute > 9 * 60 + 35)) return { sent: 0, skipped: "hours" };
    if (side === "BUY" && (minute < 9 * 60 + 40 || minute > 10 * 60)) return { sent: 0, skipped: "hours" };
    const gate = await readProposalGate();
    if (!gate.allowed) return { sent: 0, skipped: "guard" };
    const settings = await loadSettings();
    const state = await loadState();
    const day = todayIst();
    const rows = await q<{ id: string; symbol: string; sizing: unknown }>(
      `SELECT id::text AS id, symbol, sizing
         FROM mlive.mlive_decisions
        WHERE trade_date = $1::date
          AND side = $2
          AND outcome = 'approved'
          AND reason_code = $3
        ORDER BY rank NULLS LAST, id`,
      [day, side, LONGTERM_REASON]
    );
    if (rows.length === 0) return { sent: 0 };
    const fund = await fundBalance(settings.dryRun);
    const kite = new MliveKite(settings.dryRun);
    let spendable = fund;
    if (side === "BUY") {
      try {
        const cash = await kite.equityCash();
        spendable = cash == null ? 0 : Math.min(fund, cash);
      } catch {
        spendable = 0;
      }
    }
    let sent = 0;
    for (const row of rows) {
      const sizing = sizingOf(row.sizing);
      const qty = sizing.qty;
      const limit = sizing.limit;
      if (!isLongtermEtf(row.symbol) || qty < 1 || !(limit > 0)) continue;
      const owned = await ownedQty(row.symbol, settings.dryRun);
      const already = await q(`SELECT id FROM mlive.mlive_orders WHERE decision_id = $1`, [num(row.id)]);
      if (already[0]) continue;
      const ctx: GuardContext = {
        mode: state.mode,
        status: state.status,
        approved: true,
        fund: Math.max(fund, qty * limit),
        spendable,
        maxOrderPct: 1,
        excluded: false,
        systemQty: side === "SELL" ? owned : 0,
        buysSent: 0,
        sellsSent: 0,
        maxBuys: 99,
        maxSells: 99,
        decisionAlreadySent: false,
        frozen: false,
        openPositions: 0,
        maxOpenPositions: 99,
        isNewSymbol: false,
        sectorCount: 0,
        maxPerSector: 99,
      };
      const tag = makeTag(side, shortId());
      const verdict = guardOrder(
        {
          side,
          symbol: row.symbol,
          qty,
          limitPrice: limit,
          tag,
          decisionId: row.id,
          product: "CNC",
          orderType: "LIMIT",
          isGttExit: false,
        },
        ctx
      );
      if (!verdict.ok) continue;
      const price = await kiteLimit(kite, row.symbol, limit);
      if (price == null) continue;
      const placed = await kite.placeOrder({ symbol: row.symbol, side, qty, price, tag, product: "CNC" });
      await recordOrder({
        decisionId: num(row.id),
        tag,
        side,
        symbol: row.symbol,
        qty,
        limit: price,
        kiteOrderId: placed.orderId,
        dryRun: placed.dryRun,
        runId,
        book: "longterm",
      });
      if (side === "BUY") spendable = Math.max(0, spendable - qty * price);
      sent += 1;
    }
    return { sent };
  } catch (error) {
    console.error("longterm orders skipped", error instanceof Error ? error.message : error);
    return { sent: 0, skipped: "error" };
  }
}

async function ownedQty(symbol: string, dryRun: boolean): Promise<number> {
  const rows = await q<{ qty: unknown }>(
    `SELECT qty FROM mlive.mlive_positions
      WHERE symbol = $1 AND book = 'longterm' AND closed_at IS NULL AND dry_run = $2
      ORDER BY id LIMIT 1`,
    [symbol, dryRun]
  );
  return num(rows[0]?.qty);
}

async function kiteLimit(kite: MliveKite, symbol: string, price: number): Promise<number | null> {
  const tick = await kite.tickSize(symbol);
  if (tick == null) return null;
  return floorToTick(price, tick);
}

function sizingOf(value: unknown): { qty: number; limit: number } {
  const parsed = typeof value === "string" ? safeJson(value) : value;
  const row = parsed && typeof parsed === "object" ? parsed as { qty?: unknown; limit?: unknown } : {};
  return { qty: num(row.qty), limit: num(row.limit) };
}

function safeJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}
