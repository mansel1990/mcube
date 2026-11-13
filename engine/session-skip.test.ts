import { beforeEach, describe, expect, it, vi } from "vitest";

const { clock, q, audit, raiseAlert } = vi.hoisted(() => ({
  clock: { minute: 9 * 60 + 25 },
  q: vi.fn(),
  audit: vi.fn(),
  raiseAlert: vi.fn(),
}));

vi.mock("@/lib/mlive/calendar", async () => {
  const actual = await vi.importActual<typeof import("@/lib/mlive/calendar")>("@/lib/mlive/calendar");
  return { ...actual, istMinutes: () => clock.minute, todayIst: () => "2026-11-13" };
});

vi.mock("kiteconnect", () => ({
  KiteConnect: vi.fn().mockImplementation(() => ({ setAccessToken: vi.fn() })),
}));

vi.mock("@/lib/mlive/crypto", () => ({
  decryptToken: () => "access-token",
}));

vi.mock("./db", () => ({
  q: (...args: unknown[]) => q(...args),
  num: (value: unknown) => Number(value) || 0,
  asDate: (value: unknown) => (value == null ? null : String(value).slice(0, 10)),
  jsonValue: (value: unknown) => value,
}));

vi.mock("./audit", () => ({
  audit: (...args: unknown[]) => audit(...args),
}));

vi.mock("./alerts", () => ({
  raiseAlert: (...args: unknown[]) => raiseAlert(...args),
}));

vi.mock("./lock", () => ({
  withLock: (fn: () => Promise<unknown>) => fn(),
}));

describe("jobs with no Kite session", () => {
  const written = new Set<string>();

  beforeEach(() => {
    process.env.KITE_API_KEY = "test-key";
    process.env.MLIVE_TOKEN_KEY = "test-token-key";
    written.clear();
    audit.mockReset();
    raiseAlert.mockReset();
    audit.mockImplementation(async (entry: { action: string }) => {
      written.add(entry.action);
    });
    q.mockReset();
    q.mockImplementation(async (text: string, params: unknown[] = []) => {
      if (text.includes("mlive_settings")) return [];
      if (text.includes("mlive_kite_sessions")) return [];
      if (text.includes("mlive_audit_log")) return written.has(String(params[0])) ? [{ id: "1" }] : [];
      return [];
    });
  });

  it("skips sells, buys, approvals and sync once each, with no alert", async () => {
    const { sells } = await import("./jobs/sells");
    const { buys } = await import("./jobs/buys");
    const { approvals } = await import("./jobs/approvals");
    const { sync } = await import("./jobs/sync");
    clock.minute = 9 * 60 + 25;
    await sells();
    await sells();
    clock.minute = 9 * 60 + 50;
    await buys();
    await buys();
    clock.minute = 11 * 60;
    await approvals();
    await approvals();
    clock.minute = 11 * 60 + 5;
    await sync();
    await sync();
    const rows = audit.mock.calls.map((call) => call[0] as { action: string; reason: string });
    expect(rows.map((row) => row.action)).toEqual(["sells.skipped", "buys.skipped", "approvals.skipped", "sync.skipped"]);
    expect(rows.every((row) => row.reason === "no_kite_session")).toBe(true);
    expect(raiseAlert).not.toHaveBeenCalled();
    expect(q).not.toHaveBeenCalledWith(expect.stringContaining("INSERT INTO mlive.mlive_runs"), expect.anything());
  });
});
