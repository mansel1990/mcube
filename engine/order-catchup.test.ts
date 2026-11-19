import { beforeEach, describe, expect, it, vi } from "vitest";
import { orderSlot, slotPassed } from "./jobs/order-window";

const { getInstruments, getHoldings, q, clock } = vi.hoisted(() => ({
  getInstruments: vi.fn(),
  getHoldings: vi.fn(),
  q: vi.fn(),
  clock: { minute: 9 * 60 + 30 },
}));

vi.mock("@/lib/mlive/calendar", async () => {
  const actual = await vi.importActual<typeof import("@/lib/mlive/calendar")>("@/lib/mlive/calendar");
  return { ...actual, istMinutes: () => clock.minute, todayIst: () => "2026-11-19" };
});

vi.mock("kiteconnect", () => ({
  KiteConnect: vi.fn().mockImplementation(() => ({
    setAccessToken: vi.fn(),
    getMargins: vi.fn().mockResolvedValue({ available: { live_balance: 80000 } }),
    getInstruments,
    getHoldings,
  })),
}));

vi.mock("@/lib/mlive/crypto", () => ({
  decryptToken: () => "access-token",
}));

vi.mock("./db", () => ({
  q: (...args: unknown[]) => q(...args),
  num: (value: unknown) => {
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? n : 0;
  },
  asDate: (value: unknown) => {
    if (value == null) return null;
    const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : null;
  },
  jsonValue: (value: unknown) => (typeof value === "string" ? JSON.parse(value) : value),
}));

vi.mock("./lock", () => ({
  withLock: (fn: () => Promise<unknown>) => fn(),
}));

vi.mock("./audit", () => ({
  audit: vi.fn(),
}));

vi.mock("./alerts", () => ({
  raiseAlert: vi.fn(),
}));

vi.mock("./jobs/recheck", () => ({
  recheckBuys: async () => 0,
  skipUnviableFreshIdeas: async () => 0,
}));

const sell = {
  id: "4",
  side: "SELL",
  symbol: "HEROMOTOCO",
  outcome: "proposed",
  sizing: { qty: 3, limit: 5400 },
  idea_id: null,
  position_id: "8",
  reason_code: "trend_stop",
};

describe("order windows", () => {
  it("keeps the morning slot, then catches up until 14:30", () => {
    expect(orderSlot("SELL", 9 * 60 + 20)).toBe("open");
    expect(orderSlot("SELL", 9 * 60 + 30)).toBe("open");
    expect(slotPassed("SELL", 9 * 60 + 30)).toBe(true);
    expect(orderSlot("SELL", 11 * 60)).toBe("catchup");
    expect(orderSlot("SELL", 14 * 60 + 31)).toBe("closed");
    expect(orderSlot("BUY", 9 * 60 + 45)).toBe("open");
    expect(orderSlot("BUY", 10 * 60 + 30)).toBe("catchup");
    expect(slotPassed("BUY", 9 * 60 + 50)).toBe(true);
  });
});

describe("a sell after the 09:20 slot", () => {
  const orders: unknown[][] = [];
  let status = "active";
  let pending = true;

  beforeEach(async () => {
    const { clearTickCache } = await import("./kite");
    clearTickCache();
    process.env.KITE_API_KEY = "test-key";
    process.env.MLIVE_TOKEN_KEY = "test-token-key";
    clock.minute = 9 * 60 + 30;
    status = "active";
    pending = true;
    orders.length = 0;
    getHoldings.mockReset();
    getHoldings.mockResolvedValue([]);
    getInstruments.mockReset();
    getInstruments.mockResolvedValue([
      { tradingsymbol: "HEROMOTOCO", exchange: "NSE", instrument_type: "EQ", tick_size: 0.05 },
    ]);
    q.mockReset();
    q.mockImplementation(async (text: string, params: unknown[] = []) => {
      if (text.includes("INSERT INTO mlive.mlive_runs")) return [{ id: "21" }];
      if (text.includes("status = 'ok'")) return [];
      if (text.includes("summary->>'session'") || text.includes("preflight.late")) return [{ id: "3" }];
      if (text.includes("mlive_kite_sessions")) return [{ access_token_enc: "enc", token_date: "2026-11-19" }];
      if (text.includes("mlive_settings")) return [];
      if (text.includes("FROM mlive.mlive_state")) {
        return [{
          status,
          mode: "auto",
          peak_value: 80000,
          peak_date: "2026-11-18",
          last_eod_date: "2026-11-18",
          updated_at: "2026-11-19T04:00:00.000Z",
          halt_reason: status === "halted_today" ? "order_rejected" : null,
        }];
      }
      if (text.includes("mlive_holidays")) return [];
      if (text.includes("mlive_fund_ledger")) return [{ total: "80000" }];
      if (text.includes("mlive_requests")) return [];
      if (text.includes("mlive.mlive_decisions")) {
        if (!pending) return [];
        if (params[1] === "BUY") return [];
        return [sell];
      }
      if (text.includes("FROM mlive.mlive_positions")) {
        return [{
          id: "8",
          symbol: "HEROMOTOCO",
          strategy: "ema",
          qty: "3",
          avg_price: "5600",
          trend_stop: "5200",
          frozen: false,
          opened_at: "2026-11-01",
        }];
      }
      if (text.includes("INSERT INTO mlive.mlive_orders")) {
        orders.push(params);
        return [{ id: "50" }];
      }
      if (text.includes("mlive_instruments")) return [{ is_etf: false, sector: null }];
      return [];
    });
  });

  it("sends a proposed sell at 09:30 after the halt has cleared", async () => {
    const { approvals } = await import("./jobs/approvals");
    await approvals();
    expect(orders.map((params) => [params[3], params[4]])).toEqual([["SELL", "HEROMOTOCO"]]);
  });

  it("sends that sell on a later tick after the 09:35 window", async () => {
    clock.minute = 11 * 60;
    const { sells } = await import("./jobs/sells");
    await sells();
    expect(orders.map((params) => params[4])).toEqual(["HEROMOTOCO"]);
  });

  it("does not send when an order rejection or the breaker is still in force", async () => {
    const { approvals } = await import("./jobs/approvals");
    status = "halted_today";
    await approvals();
    status = "paused_by_breaker";
    await approvals();
    expect(orders).toEqual([]);
  });

  it("does not send after the 14:30 cut-off", async () => {
    clock.minute = 14 * 60 + 31;
    const { sells } = await import("./jobs/sells");
    const { approvals } = await import("./jobs/approvals");
    await sells();
    await approvals();
    expect(orders).toEqual([]);
  });

  it("does not send when nothing is pending", async () => {
    pending = false;
    const { sells } = await import("./jobs/sells");
    await sells();
    expect(orders).toEqual([]);
  });
});
