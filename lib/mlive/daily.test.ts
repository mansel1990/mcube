import { describe, expect, it } from "vitest";
import { dayStepResult } from "./day-steps";

describe("how the day ran", () => {
  const base = {
    bought: 0,
    skipped: 2,
    stops: 0,
    kiteAt: "08:21",
    remind: "push" as const,
    matched: 3,
    cash: 27000,
    noBuys: "All ideas skipped: METROPOLIS and PERSISTENT",
  };

  it("gives a finished step its one-line result", () => {
    expect(dayStepResult({ ...base, id: "remind", ran: true })).toBe("Push sent");
    expect(dayStepResult({ ...base, id: "preflight", ran: true })).toBe("3 holdings match Kite · cash ₹27,000");
    expect(dayStepResult({ ...base, id: "preflight", ran: true, matched: 2, checked: 3 })).toBe("2 of 3 holdings match Kite · cash ₹27,000");
    expect(dayStepResult({ ...base, id: "buys", ran: true })).toBe("All ideas skipped: METROPOLIS and PERSISTENT");
  });

  it("leaves a step that has not run blank", () => {
    expect(dayStepResult({ ...base, id: "preflight", ran: false })).toBe("");
    expect(dayStepResult({ ...base, id: "report", ran: false })).toBe("");
  });
});
