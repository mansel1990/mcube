import { floorToTick } from "@/lib/mlive/rules";
import { nextTradingDay } from "@/lib/mlive/calendar";
import { audit } from "./audit";
import { q } from "./db";
import { raiseAlert } from "./alerts";
import { MliveKite } from "./kite";
import { holidaySet } from "./load";
import { livePrice } from "./market";

const REPRICE_MINUTES = 15;

export type MomentumSellAction = "wait" | "reprice" | "aggressive" | "cancel";

type WatchedSell = {
  id: string | number;
  decision_id: string | number;
  run_id: string | number | null;
  position_id: string | number;
  kite_order_id: string;
  symbol: string;
  qty: string | number;
  filled_qty: string | number;
  position_qty: string | number;
  limit_price: string | number;
  placed_at: string | Date | null;
  last_reprice_at: string | Date | null;
  dry_run: boolean;
};

function minutesOfDay(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

function elapsedMinutes(now: Date, previous: string | Date | null): number {
  if (!previous) return Number.POSITIVE_INFINITY;
  return (now.getTime() - new Date(previous).getTime()) / 60_000;
}

export function momentumSellAction(
  now: Date,
  lastRepriceAt: string | Date | null,
  placedAt: string | Date | null,
): MomentumSellAction {
  const minute = minutesOfDay(now);
  const last = lastRepriceAt ?? placedAt;
  const lastMinute = last ? minutesOfDay(new Date(last)) : -1;
  const due = elapsedMinutes(now, last) >= REPRICE_MINUTES;

  if (minute >= 15 * 60 + 10) {
    return lastMinute < 15 * 60 + 10 || due ? "cancel" : "wait";
  }
  if (minute >= 14 * 60 + 30) {
    return lastMinute < 14 * 60 + 30 || due ? "aggressive" : "wait";
  }
  return due ? "reprice" : "wait";
}

export function momentumSellLimit(live: number, tick: number, action: "reprice" | "aggressive"): number | null {
  return floorToTick(live * (action === "aggressive" ? 0.98 : 0.995), tick);
}

export function initialMomentumWeeklySell(
  requestedQty: number,
  positionQty: number,
  live: number,
  tick: number,
): { qty: number; limit: number } | null {
  const qty = Math.max(0, Math.min(requestedQty, positionQty));
  const limit = momentumSellLimit(live, tick, "reprice");
  return qty > 0 && limit != null && limit > 0 ? { qty, limit } : null;
}

async function watcherActive(): Promise<boolean> {
  const rows = await q<{ status: string; mode: string }>(`SELECT status, mode FROM mlive.mlive_state WHERE id = 1`);
  return rows[0]?.status === "active" && rows[0]?.mode !== "paused";
}

async function watchedSells(tradeDate: string): Promise<WatchedSell[]> {
  return q<WatchedSell>(
    `SELECT o.id, o.decision_id, d.run_id, d.position_id, o.kite_order_id, o.symbol,
            o.qty, o.filled_qty, p.qty AS position_qty, o.limit_price, o.placed_at,
            o.last_reprice_at, o.dry_run
       FROM mlive.mlive_orders o
       JOIN mlive.mlive_decisions d ON d.id = o.decision_id
       JOIN mlive.mlive_positions p ON p.id = d.position_id
      WHERE d.trade_date = $1
        AND d.side = 'SELL'
        AND d.reason_code = 'momentum_weekly'
        AND o.kite_order_id IS NOT NULL
        AND o.status NOT IN ('FILLED', 'COMPLETE', 'CANCELLED', 'REJECTED')
        AND p.strategy = 'momentum'
        AND p.closed_at IS NULL
        AND p.frozen = false
        AND p.qty > 0`,
    [tradeDate],
  );
}

async function noteAttempt(orderId: string | number, now: Date): Promise<void> {
  await q(`UPDATE mlive.mlive_orders SET last_reprice_at = $2, updated_at = now() WHERE id = $1`, [orderId, now]);
}

async function problem(code: string, message: string, symbol: string): Promise<void> {
  await raiseAlert({ level: "problem", code, message, symbol });
}

export async function maintainMomentumWeeklySells(
  runId: number,
  now = new Date(),
): Promise<{ cancellationsRequested: boolean }> {
  if (!(await watcherActive())) return { cancellationsRequested: false };

  const tradeDate = now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  let cancellationsRequested = false;

  for (const order of await watchedSells(tradeDate)) {
    const kite = new MliveKite(order.dry_run);
    const action = momentumSellAction(now, order.last_reprice_at, order.placed_at);
    if (action === "wait") continue;

    await noteAttempt(order.id, now);
    const remainingQty = Math.max(
      0,
      Math.min(Number(order.qty) - Number(order.filled_qty), Number(order.position_qty)),
    );
    if (remainingQty <= 0) continue;

    if (action === "cancel") {
      try {
        await kite.cancelOrder(order.kite_order_id);
        if (order.dry_run) {
          await q(`UPDATE mlive.mlive_orders SET status = 'CANCELLED', updated_at = now() WHERE id = $1`, [order.id]);
        }
        cancellationsRequested = true;
        await audit({
          actor: "engine",
          action: "momentum_sell_cancel_requested",
          symbol: order.symbol,
          before: { orderId: order.kite_order_id, remainingQty },
          after: { requestedAt: now.toISOString() },
          reason: "Momentum weekly sell was still open at 15:10 IST",
          runId,
        });
      } catch (error) {
        await problem(
          "momentum_sell_cancel_failed",
          `Could not cancel the unfilled momentum sell for ${order.symbol}: ${String(error)}`,
          order.symbol,
        );
      }
      continue;
    }

    try {
      const [live, tick] = await Promise.all([livePrice(order.symbol), kite.tickSize(order.symbol)]);
      if (live == null || tick == null) {
        await problem(
          "momentum_sell_reprice_data_missing",
          `Could not reprice the momentum sell for ${order.symbol}: live quote or tick size was unavailable.`,
          order.symbol,
        );
        continue;
      }

      const oldLimit = Number(order.limit_price);
      const newLimit = momentumSellLimit(live, tick, action);
      if (newLimit == null) {
        await problem(
          "momentum_sell_reprice_data_missing",
          `Could not reprice the momentum sell for ${order.symbol}: tick size was invalid.`,
          order.symbol,
        );
        continue;
      }
      if (newLimit === oldLimit) continue;

      await kite.modifyOrder(order.kite_order_id, newLimit);
      await q(`UPDATE mlive.mlive_orders SET limit_price = $2, updated_at = now() WHERE id = $1`, [
        order.id,
        newLimit,
      ]);
      await audit({
        actor: "engine",
        action: "momentum_sell_repriced",
        symbol: order.symbol,
        before: { orderId: order.kite_order_id, limit: oldLimit },
        after: { limit: newLimit, livePrice: live, remainingQty, stage: action },
        reason: action === "aggressive" ? "14:30 momentum exit escalation" : "15-minute momentum exit reprice",
        runId,
      });
    } catch (error) {
      await problem(
        "momentum_sell_reprice_failed",
        `Could not reprice the momentum sell for ${order.symbol}: ${String(error)}`,
        order.symbol,
      );
    }
  }

  return { cancellationsRequested };
}

export async function carryUnfilledMomentumSells(runId: number, now = new Date()): Promise<void> {
  if (minutesOfDay(now) < 15 * 60 + 10) return;

  const tradeDate = now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const rows = await q<{
    position_id: string | number;
    symbol: string;
    position_qty: string | number;
    dry_run: boolean;
  }>(
    `SELECT DISTINCT d.position_id, d.symbol, p.qty AS position_qty, o.dry_run
       FROM mlive.mlive_orders o
       JOIN mlive.mlive_decisions d ON d.id = o.decision_id
       JOIN mlive.mlive_positions p ON p.id = d.position_id
      WHERE d.trade_date = $1
        AND d.side = 'SELL'
        AND d.reason_code = 'momentum_weekly'
        AND o.status IN ('CANCELLED', 'REJECTED')
        AND p.strategy = 'momentum'
        AND p.closed_at IS NULL
        AND p.frozen = false
        AND p.qty > 0`,
    [tradeDate],
  );
  if (rows.length === 0) return;

  const nextDate = nextTradingDay(tradeDate, await holidaySet());
  for (const row of rows) {
    const qty = Number(row.position_qty);
    const inserted = await q<{ id: string | number }>(
      `INSERT INTO mlive.mlive_decisions
         (run_id, trade_date, position_id, side, symbol, outcome, reason_code, reason_text, sizing, dry_run, book)
       VALUES ($1, $2, $3, 'SELL', $4, 'proposed', 'momentum_weekly',
               'Carry-over: prior momentum weekly sell did not fill', $5::jsonb, $6, 'swing')
       ON CONFLICT (trade_date, side, position_id) WHERE position_id IS NOT NULL DO NOTHING
       RETURNING id`,
      [runId, nextDate, row.position_id, row.symbol, JSON.stringify({ qty }), row.dry_run],
    );
    if (inserted.length === 0) continue;

    await audit({
      actor: "engine",
      action: "momentum_sell_carried",
      symbol: row.symbol,
      after: { decisionId: inserted[0].id, tradeDate: nextDate, qty },
      reason: "Unfilled momentum weekly sell carried to the next trading session",
      runId,
    });
    await raiseAlert({
      level: "needs_you",
      code: "momentum_sell_not_filled",
      message: `MOMENTUM SELL NOT FILLED: ${row.symbol}, ${qty} shares. Sell it in Kite.`,
      symbol: row.symbol,
      runId,
    });
  }
}
