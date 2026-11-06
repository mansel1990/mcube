import { describe, expect, it } from "vitest";
import { kiteSessionView, kiteTokenDay } from "./kite-session";

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
