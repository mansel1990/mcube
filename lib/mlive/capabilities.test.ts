import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { intradayRetired, intradayRetiredSentence } from "./capabilities";
import { dailyCandlePlanIds } from "../../engine/jobs/market";
import { scheduleForRetirement } from "./schedule";

describe("Intraday retirement", () => {
  it("reads the flag and hides the book only when it is true", () => {
    expect(intradayRetired(true)).toBe(true);
    expect(intradayRetired("true")).toBe(true);
    expect(intradayRetired(false)).toBe(false);
    expect(intradayRetired(undefined)).toBe(false);
  });

  it("prints the retired sentence only for the stored building metrics", () => {
    const sentence = intradayRetiredSentence([
      { runId: 4, sample: "building", strategy: "orb", profitFactor: 0.71, trades: 710 },
      { runId: 4, sample: "building", strategy: "vwap", profitFactor: 0.34, trades: 1342 },
      { runId: 9, sample: "heldback", strategy: "orb", profitFactor: 0.71, trades: 710 },
    ]);
    expect(sentence).toBe("Intraday (ORB, VWAP), retired 18 Nov 2026. Failed the full building test: ORB PF 0.71 over 710 trades, VWAP PF 0.34 over 1,342 trades (run 4).");
    expect(intradayRetiredSentence([
      { runId: 4, sample: "building", strategy: "orb", profitFactor: 0.71, trades: 711 },
      { runId: 4, sample: "building", strategy: "vwap", profitFactor: 0.34, trades: 1342 },
    ])).toBeNull();
  });

  it("keeps daily candles and drops the 5-minute plan while retired", () => {
    expect(dailyCandlePlanIds(true)).toEqual(["daily"]);
    expect(dailyCandlePlanIds(false)).toEqual(["daily", "5m-neon"]);
    expect(dailyCandlePlanIds(true)).not.toContain("1m-files");
    const retired = scheduleForRetirement(true);
    expect(retired.map((step) => step.kind)).not.toContain("intraday");
    expect(retired.find((step) => step.kind === "market-daily")?.description).toMatch(/daily candles/);
    expect(retired.find((step) => step.kind === "market-daily")?.description).not.toMatch(/5-minute/);
    expect(scheduleForRetirement(false).find((step) => step.kind === "market-daily")?.description).toMatch(/5-minute/);
  });

  it("leaves the intraday job out of the installed cron", () => {
    const cron = readFileSync(new URL("../../engine/deploy.sh", import.meta.url), "utf8");
    expect(cron).toContain("market-daily");
    expect(cron).not.toMatch(/cli\.ts intraday/);
    expect(cron).not.toMatch(/"intraday"/);
  });
});
