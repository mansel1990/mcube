import { beforeEach, describe, expect, it, vi } from "vitest";

const { getMargins, getInstruments, q, audit, raiseAlert } = vi.hoisted(() => ({
  getMargins: vi.fn(),
  getInstruments: vi.fn(),
  q: vi.fn(),
  audit: vi.fn(),
  raiseAlert: vi.fn(),
}));

vi.mock("@/lib/mlive/calendar", async () => {
  const actual = await vi.importActual<typeof import("@/lib/mlive/calendar")>("@/lib/mlive/calendar");
  return { ...actual, istMinutes: () => 10 * 60 + 1, todayIst: () => "2026-11-06" };
});

vi.mock("kiteconnect", () => ({
  KiteConnect: vi.fn().mockImplementation(() => ({
    setAccessToken: vi.fn(),
    getMargins,
    getInstruments,
    getHoldings: vi.fn().mockResolvedValue([]),
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
  audit: (...args: unknown[]) => audit(...args),
}));

vi.mock("./alerts", () => ({
  raiseAlert: (...args: unknown[]) => raiseAlert(...args),
}));

const stateRow = {
  status: "active",
  mode: "approve",
  peak_value: 80000,
  peak_date: "2026-11-05",
  last_eod_date: "2026-11-05",
  updated_at: "2026-11-06T03:00:00.000Z",
  halt_reason: null,
};

describe("approvals when Kite cash cannot be read", () => {
  const orders: unknown[][] = [];
  let summary: Record<string, unknown> | null = null;

  beforeEach(async () => {
    const { clearTickCache } = await import("./kite");
    clearTickCache();
    process.env.KITE_API_KEY = "test-key";
    process.env.MLIVE_TOKEN_KEY = "test-token-key";
    orders.length = 0;
    summary = null;
    getMargins.mockReset();
    getMargins.mockResolvedValue({});
    getInstruments.mockReset();
    getInstruments.mockResolvedValue([
      { tradingsymbol: "INFY", exchange: "NSE", instrument_type: "EQ", tick_size: 0.05 },
    ]);
    audit.mockReset();
    raiseAlert.mockReset();
    q.mockReset();
    q.mockImplementation(async (text: string, params: unknown[] = []) => {
      if (text.includes("INSERT INTO mlive.mlive_runs")) return [{ id: "12" }];
      if (text.includes("status = 'ok'")) {
        summary = JSON.parse(String(params[1])) as Record<string, unknown>;
        return [];
      }
      if (text.includes("mlive_kite_sessions")) return [{ access_token_enc: "enc", token_date: "2026-11-06" }];
      if (text.includes("mlive_settings")) return [];
      if (text.includes("FROM mlive.mlive_state")) return [stateRow];
      if (text.includes("mlive_holidays")) return [];
      if (text.includes("mlive_fund_ledger")) return [{ total: "80000" }];
      if (text.includes("mlive_requests")) return [];
      if (text.includes("FROM mlive.mlive_decisions")) {
        const side = params[1];
        if (side === "SELL") {
          return [{ id: "1", side: "SELL", symbol: "INFY", outcome: "approved", sizing: { qty: 1, limit: 100 }, idea_id: null, position_id: "9" }];
        }
        if (side === "BUY") {
          return [{ id: "2", side: "BUY", symbol: "TCS", outcome: "approved", sizing: { qty: 1, limit: 1000 }, idea_id: "3", position_id: null }];
        }
        return [];
      }
      if (text.includes("FROM mlive.mlive_positions")) {
        return [{ id: "9", symbol: "INFY", strategy: "rs", qty: "1", avg_price: "100", trend_stop: "90", frozen: false, opened_at: "2026-11-01" }];
      }
      if (text.includes("INSERT INTO mlive.mlive_orders")) {
        orders.push(params);
        return [{ id: "50" }];
      }
      if (text.includes("mlive_instruments")) return [{ is_etf: false }];
      return [];
    });
  });

  it("sends the approved sell, sends no buy, and raises one problem alert", async () => {
    const { approvals } = await import("./jobs/approvals");
    await approvals();
    expect(orders.map((params) => params[3])).toEqual(["SELL"]);
    expect(raiseAlert).toHaveBeenCalledTimes(1);
    expect(raiseAlert).toHaveBeenCalledWith(
      expect.objectContaining({ level: "problem", message: expect.stringContaining("Kite margins: cash missing in response") })
    );
    expect(summary).toMatchObject({ rechecked: 0 });
    expect(q).toHaveBeenCalledWith(expect.stringContaining("status = 'ok'"), expect.arrayContaining([12]));
    expect(q).not.toHaveBeenCalledWith(expect.stringContaining("done_at = now()"), expect.anything());
  });
});
