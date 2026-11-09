import { beforeEach, describe, expect, it, vi } from "vitest";

const { q, raiseAlert, livePrice } = vi.hoisted(() => ({
  q: vi.fn(),
  raiseAlert: vi.fn(),
  livePrice: vi.fn(),
}));

vi.mock("@/lib/mlive/calendar", async () => {
  const actual = await vi.importActual<typeof import("@/lib/mlive/calendar")>("@/lib/mlive/calendar");
  return { ...actual, todayIst: () => "2026-11-09" };
});

vi.mock("../db", () => ({
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

vi.mock("../lock", () => ({
  withLock: (fn: () => Promise<unknown>) => fn(),
}));

vi.mock("../audit", () => ({
  audit: vi.fn(),
}));

vi.mock("../alerts", () => ({
  raiseAlert: (...args: unknown[]) => raiseAlert(...args),
}));

vi.mock("../market", () => ({
  livePrice: (...args: unknown[]) => livePrice(...args),
  previousClose: vi.fn(),
}));

describe("end of day account value", () => {
  let pending = 0;
  let systemValue: number | null = null;

  beforeEach(() => {
    pending = 0;
    systemValue = null;
    raiseAlert.mockReset();
    livePrice.mockReset();
    livePrice.mockResolvedValue(2445);
    q.mockReset();
    q.mockImplementation(async (text: string, params: unknown[] = []) => {
      if (text.includes("INSERT INTO mlive.mlive_runs")) return [{ id: "1" }];
      if (text.includes("mlive_holidays")) return [];
      if (text.includes("mlive_settings")) return [];
      if (text.includes("FROM mlive.mlive_state")) {
        return [{
          status: "active",
          mode: "approve",
          peak_value: 80000,
          peak_date: "2026-11-05",
          last_eod_date: null,
          updated_at: null,
          halt_reason: null,
        }];
      }
      if (text.includes("mlive_fund_ledger")) return [{ total: "80000" }];
      if (text.includes("FROM mlive.mlive_positions")) {
        return [{
          id: 1,
          symbol: "MPHASIS",
          strategy: "rs",
          qty: 7,
          avg_price: 2438.5,
          trend_stop: null,
          frozen: false,
          opened_at: "2026-11-09T04:00:00.000Z",
        }];
      }
      if (text.includes("mlive_orders")) return [{ total: String(pending) }];
      if (text.includes("INSERT INTO mlive.mlive_equity_daily")) {
        systemValue = Number(params[3]);
        return [];
      }
      return [];
    });
  });

  it("does not change when a buy is only pending", async () => {
    const { eod } = await import("./eod");
    pending = 19262;
    await eod();
    const withPending = systemValue;
    pending = 0;
    await eod();
    expect(withPending).toBe(systemValue);
    expect(systemValue).toBe(80045.5);
  });
});
