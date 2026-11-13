import { beforeEach, describe, expect, it, vi } from "vitest";
import { recheckDue } from "@/lib/mlive/rules";

const { getMargins, getHoldings, q, audit, raiseAlert } = vi.hoisted(() => ({
  getMargins: vi.fn(),
  getHoldings: vi.fn(),
  q: vi.fn(),
  audit: vi.fn(),
  raiseAlert: vi.fn(),
}));

vi.mock("@/lib/mlive/calendar", async () => {
  const actual = await vi.importActual<typeof import("@/lib/mlive/calendar")>("@/lib/mlive/calendar");
  return { ...actual, todayIst: () => "2026-11-13" };
});

vi.mock("kiteconnect", () => ({
  KiteConnect: vi.fn().mockImplementation(() => ({
    setAccessToken: vi.fn(),
    getMargins,
    getHoldings,
  })),
}));

vi.mock("yahoo-finance2", () => ({
  default: class {
    quote() {
      return { regularMarketPrice: 200, regularMarketPreviousClose: 200 };
    }
  },
}));

vi.mock("@/lib/mlive/crypto", () => ({
  decryptToken: () => "access-token",
}));

vi.mock("../db", () => ({
  q: (...args: unknown[]) => q(...args),
  num: (value: unknown) => {
    const n = typeof value === "number" ? value : Number(value);
    return Number.isFinite(n) ? n : 0;
  },
  asDate: (value: unknown) => (value == null ? null : String(value).slice(0, 10)),
  jsonValue: (value: unknown) => (typeof value === "string" ? JSON.parse(value) : value),
}));

vi.mock("../audit", () => ({
  audit: (...args: unknown[]) => audit(...args),
}));

vi.mock("../alerts", () => ({
  raiseAlert: (...args: unknown[]) => raiseAlert(...args),
}));

const bars = Array.from({ length: 25 }, (_, index) => ({
  date: `2026-10-${String(index + 1).padStart(2, "0")}`,
  high: 101,
  low: 99,
  close: 200,
  volume: 1000,
}));

describe("recheck after a late login", () => {
  const inserts: unknown[][] = [];

  beforeEach(() => {
    process.env.KITE_API_KEY = "test-key";
    process.env.MLIVE_TOKEN_KEY = "test-token-key";
    inserts.length = 0;
    getMargins.mockReset();
    getMargins.mockResolvedValue({ available: { live_balance: 80000 } });
    getHoldings.mockReset();
    getHoldings.mockResolvedValue([]);
    audit.mockReset();
    raiseAlert.mockReset();
    q.mockReset();
    q.mockImplementation(async (text: string, params: unknown[] = []) => {
      if (text.includes("mlive_settings")) return [];
      if (text.includes("mlive_kite_sessions")) return [{ access_token_enc: "enc", token_date: "2026-11-13" }];
      if (text.includes("FROM mlive.mlive_state")) {
        return [{
          status: "active",
          mode: "approve",
          peak_value: 80000,
          peak_date: "2026-11-12",
          last_eod_date: "2026-11-12",
          updated_at: "2026-11-13T03:30:00.000Z",
          halt_reason: null,
        }];
      }
      if (text.includes("mlive_fund_ledger")) return [{ total: "80000" }];
      if (text.includes("SUM(qty * avg_price)")) return [{ total: "0" }];
      if (text.includes("filled_qty")) return [{ total: "0" }];
      if (text.includes("FROM mlive.mlive_positions")) return [];
      if (text.includes("GROUP BY o.side")) return [];
      if (text.includes("outcome = 'skipped'")) return [];
      if (text.includes("SELECT i.id")) {
        return [{
          id: "15",
          symbol: "INFY",
          strategy: "rs",
          signal_close: "200",
          initial_stop: "190",
          sector: "Technology",
          score: "1",
        }];
      }
      if (text.includes("high, low, close")) return bars;
      if (text.includes("SELECT close, volume")) return [{ close: "200", volume: "1000" }];
      if (text.includes("mlive_instruments")) return [{ is_etf: false }];
      if (text.includes("INSERT INTO mlive.mlive_decisions")) {
        inserts.push([text, ...params]);
        return [];
      }
      return [];
    });
  });

  it("proposes the day's undecided idea at 11:00", async () => {
    expect(recheckDue(11 * 60, false)).toBe(true);
    expect(recheckDue(14 * 60 + 31, false)).toBe(false);
    const { recheckBuys } = await import("./recheck");
    const proposed = await recheckBuys(4);
    expect(proposed).toBe(1);
    expect(inserts).toHaveLength(1);
    expect(String(inserts[0][0])).toContain("'proposed'");
    expect(inserts[0]).toContain("INFY");
  });
});
