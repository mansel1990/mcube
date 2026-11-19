import { describe, expect, it } from "vitest";
import { decisionState, sendWindowState } from "./decision-state";

const reason = "Closed below its trend stop.";

describe("decision state", () => {
  it("keeps Approve and Reject available only in Approve mode", () => {
    const approve = decisionState({ mode: "approve", side: "BUY", outcome: "proposed", sendWindow: "before", reason });
    const paused = decisionState({ mode: "paused", side: "SELL", outcome: "proposed", sendWindow: "before", reason });
    const auto = decisionState({ mode: "auto", side: "BUY", outcome: "proposed", sendWindow: "before", reason });
    expect(approve.allowApproval).toBe(true);
    expect(approve.label).toBe("Approve buy");
    expect(paused.allowApproval).toBe(true);
    expect(auto.allowApproval).toBe(false);
    expect(auto.label).not.toMatch(/Approve|Reject/);
  });

  it("uses future-tense auto labels only before the send window", () => {
    const sell = decisionState({ mode: "auto", side: "SELL", outcome: "proposed", sendWindow: "before", reason });
    const buy = decisionState({ mode: "auto", side: "BUY", outcome: "proposed", sendWindow: "before", reason });
    expect(sell).toMatchObject({ label: "Selling at open · auto", tone: "loss" });
    expect(buy).toMatchObject({ label: "Buying at open · auto", tone: "swing" });
    expect(decisionState({ mode: "auto", side: "SELL", outcome: "proposed", sendWindow: "during" }).label).toBe("Selling · auto");
    expect(decisionState({ mode: "auto", side: "BUY", outcome: "proposed", sendWindow: "after" }).label).toBe("Buying · auto");
  });

  it("replaces the future tense once an order exists", () => {
    expect(decisionState({ mode: "auto", side: "SELL", outcome: "sent", orderStatus: "OPEN", ordered: 3, filled: 0, sendWindow: "before" }).label).toBe("Sell order open");
    expect(decisionState({ mode: "auto", side: "BUY", outcome: "sent", orderStatus: "OPEN", ordered: 4, filled: 0, sendWindow: "before" }).label).toBe("Buy order open");
    expect(decisionState({ mode: "auto", side: "SELL", outcome: "sent", orderStatus: "OPEN", ordered: 10, filled: 3, sendWindow: "before" }).label).toBe("3 of 10 sold");
    expect(decisionState({ mode: "auto", side: "BUY", outcome: "working", orderStatus: "OPEN", ordered: 8, filled: 2, sendWindow: "during" }).label).toBe("2 of 8 bought");
    expect(decisionState({ mode: "auto", side: "SELL", outcome: "filled", ordered: 3, filled: 3, sendWindow: "after" }).label).toBe("Sold");
    expect(decisionState({ mode: "auto", side: "BUY", outcome: "filled", ordered: 4, filled: 4, sendWindow: "after" }).label).toBe("Bought");
    expect(decisionState({ mode: "auto", side: "BUY", outcome: "skipped", sendWindow: "before" }).label).toBe("Skipped");
    expect(decisionState({ mode: "auto", side: "SELL", outcome: "cancelled", sendWindow: "after" }).label).toBe("Sell cancelled");
    expect(decisionState({ mode: "auto", side: "BUY", outcome: "rejected", sendWindow: "after" }).label).toBe("Buy rejected");
  });

  it("keeps the reason for the help control", () => {
    expect(decisionState({ mode: "auto", side: "SELL", outcome: "proposed", sendWindow: "before", reason }).explanation).toBe(reason);
  });

  it("uses the live sell and buy send windows", () => {
    expect(sendWindowState("SELL", 9 * 60 + 14)).toBe("before");
    expect(sendWindowState("SELL", 9 * 60 + 15)).toBe("during");
    expect(sendWindowState("SELL", 9 * 60 + 36)).toBe("after");
    expect(sendWindowState("BUY", 9 * 60 + 39)).toBe("before");
    expect(sendWindowState("BUY", 9 * 60 + 40)).toBe("during");
    expect(sendWindowState("BUY", 10 * 60 + 1)).toBe("after");
  });
});
