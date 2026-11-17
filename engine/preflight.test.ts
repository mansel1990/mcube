import { beforeEach, describe, expect, it, vi } from "vitest";

const { getMargins, getHoldings, q, raiseAlert, audit } = vi.hoisted(() => ({
  getMargins: vi.fn(),
  getHoldings: vi.fn(),
  q: vi.fn(),
  raiseAlert: vi.fn(),
  audit: vi.fn(),
}));

vi.mock("@/lib/mlive/calendar", async () => {
  const actual = await vi.importActual<typeof import("@/lib/mlive/calendar")>("@/lib/mlive/calendar");
  return { ...actual, istMinutes: () => 9 * 60 + 10, todayIst: () => "2026-11-06" };
});

vi.mock("kiteconnect", () => ({
  KiteConnect: vi.fn().mockImplementation(() => ({
    setAccessToken: vi.fn(),
    getMargins,
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
  audit: (...args: unknown[]) => audit(...args),
}));

vi.mock("./alerts", () => ({
  raiseAlert: (...args: unknown[]) => raiseAlert(...args),
}));

describe("preflight when Kite cash cannot be read", () => {
  let summary: Record<string, unknown> | null = null;
  let kiteRows: unknown[] = [];
  let haltReason: string | null = null;

  beforeEach(() => {
    process.env.KITE_API_KEY = "test-key";
    process.env.MLIVE_TOKEN_KEY = "test-token-key";
    summary = null;
    haltReason = null;
    getMargins.mockReset();
    getMargins.mockResolvedValue({});
    getHoldings.mockReset();
    getHoldings.mockResolvedValue([]);
    raiseAlert.mockReset();
    kiteRows = [{ access_token_enc: "enc", token_date: "2026-11-06" }];
    q.mockReset();
    q.mockImplementation(async (text: string, params: unknown[] = []) => {
      if (text.includes("INSERT INTO mlive.mlive_runs")) return [{ id: "7" }];
      if (text.includes("status = 'ok'")) {
        summary = JSON.parse(String(params[1])) as Record<string, unknown>;
        return [];
      }
      if (text.includes("mlive_kite_sessions")) return kiteRows;
      if (text.includes("mlive_settings")) return [];
      if (text.includes("FROM mlive.mlive_state")) {
        return [{
          status: "active",
          mode: "approve",
          peak_value: 80000,
          peak_date: "2026-11-05",
          last_eod_date: "2026-11-05",
          updated_at: "2026-11-06T02:00:00.000Z",
          halt_reason: haltReason,
        }];
      }
      if (text.includes("mlive_holidays")) return [];
      if (text.includes("mlive_fund_ledger")) return [{ total: "80000" }];
      if (text.includes("stocks.daily_ohlcv")) return [{ n: 500 }];
      return [];
    });
  });

  it("halts because margins are unreadable and does not warn that cash is ₹0", async () => {
    const { preflight } = await import("./jobs/preflight");
    await preflight();
    expect(summary).toEqual({ halted: "kite_unreadable" });
    expect(q).toHaveBeenCalledWith(
      expect.stringContaining("halt_reason"),
      expect.arrayContaining(["halted_today", "kite_unreadable"])
    );
    expect(raiseAlert).toHaveBeenCalledWith(
      expect.objectContaining({ level: "problem", message: expect.stringContaining("kite_unreadable") })
    );
    expect(raiseAlert).not.toHaveBeenCalledWith(expect.objectContaining({ code: "kite_cash_low" }));
    const messages = raiseAlert.mock.calls.map((call) => String((call[0] as { message?: string }).message));
    expect(messages.some((message) => message.includes("₹0"))).toBe(false);
  });

  it("at 09:10 with no login does not set halted_today", async () => {
    kiteRows = [];
    const { preflight } = await import("./jobs/preflight");
    await preflight();
    expect(summary).toEqual({ waiting: "no_kite_session" });
    expect(raiseAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "needs_you",
        code: "kite_login_needed",
        message: "Log in to Kite. Buys wait until you do.",
      })
    );
    const halted = q.mock.calls.some((call) => Array.isArray(call[1]) && (call[1] as unknown[]).includes("halted_today"));
    expect(halted).toBe(false);
  });

  it("clears a stale halt reason while it waits, and does not write one", async () => {
    kiteRows = [];
    haltReason = "no_kite_session";
    const { preflight } = await import("./jobs/preflight");
    await preflight();
    expect(summary).toEqual({ waiting: "no_kite_session" });
    const writes = q.mock.calls.filter((call) => String(call[0]).includes("UPDATE") && String(call[0]).includes("halt_reason"));
    expect(writes).toHaveLength(1);
    const params = writes[0][1] as unknown[];
    expect(params[0]).toBe("active");
    expect(params[5]).toBeNull();
    expect(params).not.toContain("no_kite_session");
  });
});

describe("T+1 holdings reconcile", () => {
  const position = {
    id: "4",
    symbol: "HEROMOTOCO",
    strategy: "rs",
    qty: "3",
    avg_price: "5600",
    trend_stop: "5200",
    frozen: false,
    opened_at: "2026-11-16",
  };

  beforeEach(() => {
    process.env.KITE_API_KEY = "test-key";
    process.env.MLIVE_TOKEN_KEY = "test-token-key";
    position.frozen = false;
    getHoldings.mockReset();
    raiseAlert.mockReset();
    audit.mockReset();
    q.mockReset();
    q.mockImplementation(async (text: string) => {
      if (text.includes("mlive_kite_sessions")) return [{ access_token_enc: "enc", token_date: "2026-11-06" }];
      if (text.includes("SELECT id, symbol")) return [position];
      return [];
    });
  });

  async function reconcileRaw(raw: { tradingsymbol: string; quantity: number; t1_quantity: number }) {
    getHoldings.mockResolvedValue([raw]);
    const { MliveKite } = await import("./kite");
    const { runSessionPreflight } = await import("./jobs/preflight");
    const holdings = await new MliveKite(true).holdings();
    await runSessionPreflight(9, {
      settings: { dryRun: true, cashReserve: 500 },
      state: { status: "active", mode: "approve" },
      holdings,
      kiteCash: 80000,
      fund: 80000,
      reconcile: true,
      alertCash: false,
      draftBuys: false,
    } as never);
  }

  function reconciliation(): unknown[] {
    const call = q.mock.calls.find((entry) => String(entry[0]).includes("mlive_reconciliations"));
    return (call?.[1] as unknown[]) ?? [];
  }

  it("treats quantity 0 and t1_quantity 3 as the full position", async () => {
    await reconcileRaw({ tradingsymbol: "HEROMOTOCO", quantity: 0, t1_quantity: 3 });
    expect(reconciliation()).toEqual([9, "HEROMOTOCO", 3, 0, 3, "ok"]);
    expect(q.mock.calls.some((call) => String(call[0]).includes("frozen = true"))).toBe(false);
    expect(raiseAlert).not.toHaveBeenCalled();
    expect(audit).not.toHaveBeenCalledWith(expect.objectContaining({ action: "position.unfrozen" }));
  });

  it("unfreezes a frozen position once Kite agrees", async () => {
    position.frozen = true;
    await reconcileRaw({ tradingsymbol: "HEROMOTOCO", quantity: 3, t1_quantity: 0 });
    expect(reconciliation()).toEqual([9, "HEROMOTOCO", 3, 3, 0, "ok"]);
    expect(q).toHaveBeenCalledWith(expect.stringContaining("frozen = false"), [4]);
    expect(audit).toHaveBeenCalledWith({
      actor: "engine",
      action: "position.unfrozen",
      symbol: "HEROMOTOCO",
      reason: "Kite now shows 3 shares",
      runId: 9,
    });
    expect(q).toHaveBeenCalledWith(
      expect.stringContaining("position_missing_in_kite"),
      ["HEROMOTOCO"]
    );
    expect(raiseAlert).not.toHaveBeenCalled();
  });

  it("still freezes a real shortfall and says what Kite reported", async () => {
    await reconcileRaw({ tradingsymbol: "HEROMOTOCO", quantity: 0, t1_quantity: 0 });
    expect(reconciliation()).toEqual([9, "HEROMOTOCO", 3, 0, 0, "missing"]);
    expect(q).toHaveBeenCalledWith(expect.stringContaining("frozen = true"), [4]);
    expect(raiseAlert).toHaveBeenCalledWith({
      level: "needs_you",
      code: "position_missing_in_kite",
      symbol: "HEROMOTOCO",
      message: "HEROMOTOCO is frozen. Kite has 0 settled and 0 unsettled; the system has 3.",
      runId: 9,
    });
    expect(q.mock.calls.some((call) => String(call[0]).includes("frozen = false"))).toBe(false);
  });
});
