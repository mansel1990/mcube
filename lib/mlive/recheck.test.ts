import { describe, expect, it } from "vitest";
import { recheckPoll, recheckRequestPlan } from "./recheck";

describe("recheck request", () => {
  it("returns the open request instead of inserting another", () => {
    const first = recheckRequestPlan(null, 4);
    const second = recheckRequestPlan(first.id, 9);
    expect(first).toEqual({ id: 4, inserted: true });
    expect(second).toEqual({ id: 4, inserted: false });
  });

  it("stays open until done_at is set, then reports how many ideas were revived", () => {
    expect(recheckPoll(null, null)).toEqual({ done: false, doneAt: null, rechecked: 0 });
    expect(recheckPoll("2026-11-06T05:02:00.000Z", 2)).toEqual({
      done: true,
      doneAt: "2026-11-06T05:02:00.000Z",
      rechecked: 2,
    });
  });
});
