import { describe, expect, it } from "vitest";
import { breakerReading, isCountedBuy, moneySpan, newBuyLimit } from "./limits";

describe("shared limits", () => {
  it("uses the new-buy rule, not the order cap", () => {
    expect(newBuyLimit(2)).toBe(2);
    expect(newBuyLimit("2")).toBe(2);
    expect(newBuyLimit(undefined)).toBe(2);
  });

  it("formats the cash rule in rupees", () => {
    expect(moneySpan(0, 40000)).toBe("₹0 of ₹40,000");
  });

  it("reads the breaker from the account and the peak", () => {
    expect(breakerReading(99600, 100000)).toBe(0.4);
    expect(breakerReading(100000, 100000)).toBe(0);
  });

  it("does not count a cancelled buy", () => {
    expect(isCountedBuy("COMPLETE")).toBe(true);
    expect(isCountedBuy("CANCELLED")).toBe(false);
    expect(isCountedBuy("REJECTED")).toBe(false);
  });
});
