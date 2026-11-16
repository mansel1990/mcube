import { beforeEach, describe, expect, it, vi } from "vitest";

const { getMargins, getHoldings, q, audit, raiseAlert, clock } = vi.hoisted(() => ({
  getMargins: vi.fn(),
  getHoldings: vi.fn(),
  q: vi.fn(),
  audit: vi.fn(),
  raiseAlert: vi.fn(),
  clock: { minute: 9 * 60 + 57 },
}));

vi.mock("@/lib/mlive/calendar", async () => {
  const actual = await vi.importActual<typeof import("@/lib/mlive/calendar")>("@/lib/mlive/calendar");
  return { ...actual, istMinutes: () => clock.minute, todayIst: () => "2026-11-16" };
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

describe("late login morning check", () => {
  let sessionDone = false;
  let lateRan = false;
  let ideaReads = 0;
  const lateAudits: { action: string; reason?: string }[] = [];

  beforeEach(() => {
    process.env.KITE_API_KEY = "test-key";
    process.env.MLIVE_TOKEN_KEY = "test-token-key";
    clock.minute = 9 * 60 + 57;
    sessionDone = false;
    lateRan = false;
    ideaReads = 0;
    lateAudits.length = 0;
    getMargins.mockReset();
    getMargins.mockResolvedValue({ available: { live_balance: 80000 } });
    getHoldings.mockReset();
    getHoldings.mockResolvedValue([]);
    raiseAlert.mockReset();
    audit.mockReset();
    audit.mockImplementation(async (entry: { action: string; reason?: string }) => {
      if (entry.action === "preflight.late") {
        lateRan = true;
        lateAudits.push(entry);
      }
    });
    q.mockReset();
    q.mockImplementation(async (text: string) => {
      if (text.includes("INSERT INTO mlive.mlive_runs")) return [{ id: "12" }];
      if (text.includes("summary->>'session'")) return sessionDone ? [{ id: "4" }] : [];
      if (text.includes("preflight.late")) return lateRan ? [{ id: "8" }] : [];
      if (text.includes("mlive_kite_sessions")) return [{ access_token_enc: "enc", token_date: "2026-11-16" }];
      if (text.includes("mlive_settings")) return [];
      if (text.includes("FROM mlive.mlive_state")) {
        return [{
          status: "active",
          mode: "approve",
          peak_value: 80000,
          peak_date: "2026-11-13",
          last_eod_date: "2026-11-13",
          updated_at: "2026-11-16T03:30:00.000Z",
          halt_reason: null,
        }];
      }
      if (text.includes("mlive_holidays")) return [];
      if (text.includes("mlive_fund_ledger")) return [{ total: "80000" }];
      if (text.includes("FROM mlive.mlive_ideas WHERE valid_for")) {
        ideaReads += 1;
        return [];
      }
      return [];
    });
  });

  it("runs once when today's preflight never finished with a session", async () => {
    const { approvals } = await import("./jobs/approvals");
    await approvals();
    expect(lateAudits).toEqual([
      { actor: "engine", action: "preflight.late", reason: "2026-11-16", runId: 12 },
    ]);
    expect(getHoldings).toHaveBeenCalledTimes(1);
    expect(ideaReads).toBe(1);
  });

  it("does not run again on the next approvals pass", async () => {
    const { approvals } = await import("./jobs/approvals");
    await approvals();
    await approvals();
    expect(lateAudits).toHaveLength(1);
    expect(getHoldings).toHaveBeenCalledTimes(1);
    expect(ideaReads).toBe(1);
  });

  it("stays quiet after a normal preflight that had a session", async () => {
    sessionDone = true;
    const { approvals } = await import("./jobs/approvals");
    await approvals();
    expect(lateAudits).toEqual([]);
    expect(getHoldings).not.toHaveBeenCalled();
    expect(ideaReads).toBe(0);
  });
});
