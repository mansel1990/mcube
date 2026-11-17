import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  watched: [] as Record<string, unknown>[],
  carry: [] as Record<string, unknown>[],
  live: 100.03 as number | null,
  tick: 0.05 as number | null,
  insert: true,
  modifications: [] as { orderId: string; price: number }[],
  cancellations: [] as string[],
  audits: [] as Record<string, unknown>[],
  alerts: [] as Record<string, unknown>[],
  queries: [] as { sql: string; args: unknown[] }[],
}));

vi.mock("./db", () => ({
  q: async (sql: string, args: unknown[] = []) => {
    state.queries.push({ sql, args });
    if (sql.includes("SELECT status, mode FROM mlive.mlive_state")) return [{ status: "active", mode: "auto" }];
    if (sql.includes("FROM mlive.mlive_orders o") && sql.includes("o.status NOT IN")) return state.watched;
    if (sql.includes("SELECT DISTINCT d.position_id")) return state.carry;
    if (sql.includes("INSERT INTO mlive.mlive_decisions")) return state.insert ? [{ id: 91 }] : [];
    return [];
  },
}));

vi.mock("./kite", () => ({
  MliveKite: class {
    async tickSize() {
      return state.tick;
    }

    async modifyOrder(orderId: string, price: number) {
      state.modifications.push({ orderId, price });
    }

    async cancelOrder(orderId: string) {
      state.cancellations.push(orderId);
    }
  },
}));

vi.mock("./market", () => ({ livePrice: async () => state.live }));
vi.mock("./load", () => ({ holidaySet: async () => new Set<string>() }));
vi.mock("./audit", () => ({ audit: async (entry: Record<string, unknown>) => { state.audits.push(entry); } }));
vi.mock("./alerts", () => ({ raiseAlert: async (entry: Record<string, unknown>) => { state.alerts.push(entry); } }));

const watchedOrder = {
  id: 7,
  decision_id: 8,
  run_id: 9,
  position_id: 10,
  kite_order_id: "K-1",
  symbol: "INFY",
  qty: 12,
  filled_qty: 4,
  position_qty: 8,
  limit_price: 105,
  placed_at: "2026-11-20T09:20:00+05:30",
  last_reprice_at: null,
  dry_run: false,
};

describe("momentum weekly sell maintenance", () => {
  beforeEach(() => {
    state.watched = [];
    state.carry = [];
    state.live = 100.03;
    state.tick = 0.05;
    state.insert = true;
    state.modifications.length = 0;
    state.cancellations.length = 0;
    state.audits.length = 0;
    state.alerts.length = 0;
    state.queries.length = 0;
  });

  it("re-prices the existing order from the live quote and audits only the remaining quantity", async () => {
    state.watched = [watchedOrder];
    const { maintainMomentumWeeklySells } = await import("./momentum-sell-watch");
    await maintainMomentumWeeklySells(42, new Date("2026-11-20T09:35:00+05:30"));

    expect(state.modifications).toEqual([{ orderId: "K-1", price: 99.5 }]);
    expect(state.audits).toContainEqual(expect.objectContaining({
      action: "momentum_sell_repriced",
      after: expect.objectContaining({ livePrice: 100.03, remainingQty: 8, stage: "reprice" }),
    }));
  });

  it("keeps the tracked order and raises a problem when quote data is unavailable", async () => {
    state.watched = [watchedOrder];
    state.live = null;
    const { maintainMomentumWeeklySells } = await import("./momentum-sell-watch");
    await maintainMomentumWeeklySells(42, new Date("2026-11-20T09:35:00+05:30"));

    expect(state.modifications).toHaveLength(0);
    expect(state.alerts).toContainEqual(expect.objectContaining({ code: "momentum_sell_reprice_data_missing" }));
    expect(state.queries.some(({ sql }) => sql.includes("last_reprice_at"))).toBe(true);
  });

  it("cancels at 15:10 and carries one decision to the next trading session", async () => {
    state.watched = [watchedOrder];
    state.carry = [{ position_id: 10, symbol: "INFY", position_qty: 8, dry_run: false }];
    const { carryUnfilledMomentumSells, maintainMomentumWeeklySells } = await import("./momentum-sell-watch");
    const now = new Date("2026-11-20T15:10:00+05:30");
    const watch = await maintainMomentumWeeklySells(42, now);
    await carryUnfilledMomentumSells(42, now);

    expect(watch.cancellationsRequested).toBe(true);
    expect(state.cancellations).toEqual(["K-1"]);
    const insert = state.queries.find(({ sql }) => sql.includes("INSERT INTO mlive.mlive_decisions"));
    expect(insert?.args[1]).toBe("2026-11-23");
    expect(state.alerts).toContainEqual(expect.objectContaining({
      level: "needs_you",
      message: "MOMENTUM SELL NOT FILLED: INFY, 8 shares. Sell it in Kite.",
    }));
  });

  it("does not duplicate the carried decision or its alert", async () => {
    state.carry = [{ position_id: 10, symbol: "INFY", position_qty: 8, dry_run: false }];
    state.insert = false;
    const { carryUnfilledMomentumSells } = await import("./momentum-sell-watch");
    await carryUnfilledMomentumSells(42, new Date("2026-11-20T15:15:00+05:30"));

    expect(state.alerts).toHaveLength(0);
    expect(state.audits).toHaveLength(0);
  });
});
