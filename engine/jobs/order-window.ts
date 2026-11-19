import { todayIst } from "@/lib/mlive/calendar";
import { q } from "../db";
import { loadState } from "../load";

/** Approvals stop sending at 14:30 IST. A missed morning order can still go out until then. */
export const SEND_CUTOFF_MINUTE = 14 * 60 + 30;

const SELL_START = 9 * 60 + 15;
const SELL_END = 9 * 60 + 35;
const BUY_START = 9 * 60 + 40;
const BUY_END = 10 * 60;
const SELL_CRON = 9 * 60 + 20;
const BUY_CRON = 9 * 60 + 45;

export type OrderPhase = "before" | "open" | "catchup" | "closed";

/** Sells 09:15–09:35, buys 09:40–10:00. After that slot, pending orders stay eligible until 14:30. */
export function orderSlot(side: "BUY" | "SELL", minute: number): OrderPhase {
  const start = side === "SELL" ? SELL_START : BUY_START;
  const end = side === "SELL" ? SELL_END : BUY_END;
  if (minute < start) return "before";
  if (minute <= end) return "open";
  if (minute <= SEND_CUTOFF_MINUTE) return "catchup";
  return "closed";
}

/** The cron minute has passed and the order is still inside the send cut-off. */
export function slotPassed(side: "BUY" | "SELL", minute: number): boolean {
  const cron = side === "SELL" ? SELL_CRON : BUY_CRON;
  const phase = orderSlot(side, minute);
  return minute > cron && (phase === "open" || phase === "catchup");
}

export async function pendingDecisions(side: "BUY" | "SELL", day = todayIst()): Promise<boolean> {
  const rows = await q(
    `SELECT id FROM mlive.mlive_decisions
      WHERE trade_date = $1::date AND side = $2 AND outcome IN ('proposed', 'approved')
      LIMIT 1`,
    [day, side]
  );
  return Boolean(rows[0]);
}

/** A later tick may send today's orders after the scheduled minute, while the book is active. */
export async function catchUpOpen(side: "BUY" | "SELL", minute: number): Promise<boolean> {
  const phase = orderSlot(side, minute);
  if (phase === "before" || phase === "closed") return false;
  if (phase === "open" && !slotPassed(side, minute)) return false;
  const state = await loadState();
  if (state.status !== "active") return false;
  return pendingDecisions(side);
}
