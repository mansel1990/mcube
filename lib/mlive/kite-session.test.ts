import { beforeEach, describe, expect, it, vi } from "vitest";
import { clearNoLoginHalt, kiteSessionView, kiteTokenDay } from "./kite-session";
import { homeStatusPill } from "./rules";

const { sql } = vi.hoisted(() => ({ sql: vi.fn() }));

vi.mock("@/lib/sql", () => ({ sql }));

const today = "2026-11-06";

describe("kite session date", () => {
  it("reads a Date, a date, and a timestamp as the same IST day", () => {
    const date = new Date("2026-11-06T00:00:00.000Z");
    expect(String(date)).toMatch(/Nov/);
    expect(kiteTokenDay(date)).toBe(today);
    expect(kiteTokenDay("2026-11-06")).toBe(today);
    expect(kiteTokenDay("2026-11-06T00:00:00.000Z")).toBe(today);
    const status = kiteSessionView({ token_date: date, connected_at: "2026-11-06T04:44:00.000Z" }, today);
    expect(status.connected).toBe(true);
    expect(status.tokenDate).toBe(today);
  });

  it("treats yesterday's token as disconnected", () => {
    expect(kiteSessionView({ token_date: "2026-11-05", connected_at: "2026-11-05T04:00:00.000Z" }, today).connected).toBe(false);
  });

  it("gives Home and Settings the same answer for one fixture", () => {
    const row = { token_date: new Date("2026-11-06T00:00:00.000Z"), connected_at: "2026-11-06T04:44:00.000Z", kite_user_id: "AB1234" };
    const home = kiteSessionView(row, today);
    const settings = kiteSessionView(row, today);
    expect(home).toEqual(settings);
    expect(home.connected).toBe(true);
    expect(settings.kiteUserId).toBe("AB1234");
  });
});

describe("login with a stale halt reason", () => {
  const updates: string[] = [];
  const inserts: string[] = [];

  beforeEach(() => {
    updates.length = 0;
    inserts.length = 0;
    sql.mockReset();
    sql.mockImplementation(async (strings: TemplateStringsArray) => {
      const text = Array.isArray(strings) ? strings.join(" ") : String(strings);
      if (text.includes("UPDATE") && text.includes("mlive_state")) {
        updates.push(text);
        return [];
      }
      if (text.includes("INSERT")) {
        inserts.push(text);
        return [{ id: "1" }];
      }
      if (text.includes("mlive_state")) return [{ status: "active", halt_reason: "no_kite_session" }];
      return [];
    });
  });

  it("clears halt_reason and Home says the engine is active", async () => {
    await clearNoLoginHalt(new Date("2026-11-16T04:27:00.000Z"));
    expect(updates).toHaveLength(1);
    expect(updates[0]).toContain("halt_reason = NULL");
    expect(updates[0]).toContain("status = 'active'");
    expect(inserts).toEqual([]);
    expect(homeStatusPill({
      status: "active",
      haltReason: null,
      kiteConnected: true,
      resumedAt: null,
    }).label).toBe("Engine active");
  });
});
