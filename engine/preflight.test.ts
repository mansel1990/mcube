import { beforeEach, describe, expect, it, vi } from "vitest";

const { getMargins, getHoldings, q, raiseAlert, audit, clock } = vi.hoisted(() => ({
  getMargins: vi.fn(),
  getHoldings: vi.fn(),
  q: vi.fn(),
  raiseAlert: vi.fn(),
  audit: vi.fn(),
  clock: { minute: 9 * 60 + 10 },
}));

vi.mock("@/lib/mlive/calendar", async () => {
  const actual = await vi.importActual<typeof import("@/lib/mlive/calendar")>("@/lib/mlive/calendar");
  return { ...actual, istMinutes: () => clock.minute, todayIst: () => "2026-11-06" };
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
  let status = "active";
  const loginAlerts: string[] = [];

  beforeEach(async () => {
    const { kiteReadRetry } = await import("./jobs/preflight");
    kiteReadRetry.gapMs = 0;
    kiteReadRetry.attempts = 3;
    process.env.KITE_API_KEY = "test-key";
    process.env.MLIVE_TOKEN_KEY = "test-token-key";
    clock.minute = 9 * 60 + 10;
    summary = null;
    haltReason = null;
    status = "active";
    loginAlerts.length = 0;
    getMargins.mockReset();
    getMargins.mockResolvedValue({});
    getHoldings.mockReset();
    getHoldings.mockResolvedValue([]);
    raiseAlert.mockReset();
    audit.mockReset();
    raiseAlert.mockImplementation(async (entry: { code?: string; message?: string }) => {
      if (entry.code === "kite_login_needed" && entry.message) loginAlerts.push(entry.message);
    });
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
          status,
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
      if (text.includes("kite_login_needed")) {
        return loginAlerts.includes(String(params[1] ?? "")) ? [{ id: "1" }] : [];
      }
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
    expect(getMargins).toHaveBeenCalledTimes(3);
    expect(raiseAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "problem",
        message: expect.stringMatching(/kite_unreadable.*Kite margins: cash missing in response/),
      })
    );
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "preflight.kite_unreadable", reason: "Kite margins: cash missing in response" })
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

  it("treats yesterday's token at 08:35 as waiting, with one login alert and no halt", async () => {
    clock.minute = 8 * 60 + 35;
    kiteRows = [{ access_token_enc: "enc", token_date: "2026-11-05" }];
    const { preflight } = await import("./jobs/preflight");
    await preflight();
    await preflight();
    expect(summary).toEqual({ waiting: "no_kite_session" });
    const logins = raiseAlert.mock.calls.filter((call) => (call[0] as { code?: string }).code === "kite_login_needed");
    expect(logins).toHaveLength(1);
    expect(logins[0][0]).toMatchObject({
      level: "needs_you",
      message: "Log in to Kite. Buys wait until you do.",
    });
    const halted = q.mock.calls.some((call) => Array.isArray(call[1]) && (call[1] as unknown[]).includes("halted_today"));
    expect(halted).toBe(false);
    expect(getHoldings).not.toHaveBeenCalled();
    const messages = raiseAlert.mock.calls.map((call) => String((call[0] as { message?: string }).message));
    expect(messages.some((message) => message.includes("No orders today"))).toBe(false);
  });

  it("clears today's kite_unreadable halt when a later preflight can read Kite", async () => {
    clock.minute = 8 * 60 + 45;
    status = "halted_today";
    haltReason = "kite_unreadable";
    getMargins.mockResolvedValue({ available: { live_balance: 80000 } });
    const { preflight } = await import("./jobs/preflight");
    await preflight();
    expect(summary).toMatchObject({ session: true });
    const writes = q.mock.calls.filter((call) => String(call[0]).includes("UPDATE") && String(call[0]).includes("halt_reason"));
    expect(writes.map((call) => call[1])).toEqual([
      expect.arrayContaining(["active"]),
    ]);
    expect((writes[0][1] as unknown[])[5]).toBeNull();
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "state.auto_resume", reason: "halt cleared, Kite readable at 08:45" })
    );
    expect(raiseAlert).toHaveBeenCalledWith(
      expect.objectContaining({ level: "done", code: "halt_cleared", message: "Halt cleared, Kite readable at 08:45." })
    );
  });

  it("halts after retries when today's session cannot read holdings, and logs the error", async () => {
    getHoldings.mockRejectedValue(new Error("Unable to read holdings"));
    const { preflight } = await import("./jobs/preflight");
    await preflight();
    expect(getHoldings).toHaveBeenCalledTimes(3);
    expect(summary).toEqual({ halted: "kite_unreadable" });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "preflight.kite_unreadable", reason: "Unable to read holdings" })
    );
    expect(raiseAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        level: "problem",
        message: expect.stringContaining("Unable to read holdings"),
      })
    );
  });

  it("does not clear an order rejection or a breaker pause when Kite is readable", async () => {
    getMargins.mockResolvedValue({ available: { live_balance: 80000 } });
    const { preflight } = await import("./jobs/preflight");
    status = "halted_today";
    haltReason = "order_rejected";
    await preflight();
    status = "paused_by_breaker";
    haltReason = "breaker";
    await preflight();
    const cleared = audit.mock.calls.some((call) => (call[0] as { action?: string }).action === "state.auto_resume");
    expect(cleared).toBe(false);
    const writes = q.mock.calls.filter((call) => String(call[0]).includes("UPDATE") && String(call[0]).includes("halt_reason"));
    expect(writes).toHaveLength(0);
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
