import { describe, expect, it } from "vitest";
import { initialMomentumWeeklySell, momentumSellAction, momentumSellLimit } from "./momentum-sell-watch";

const ist = (time: string) => new Date(`2026-11-20T${time}:00+05:30`);

describe("momentum weekly sell policy", () => {
  it("reprices no more than every 15 minutes", () => {
    expect(momentumSellAction(ist("09:34"), null, ist("09:20"))).toBe("wait");
    expect(momentumSellAction(ist("09:35"), null, ist("09:20"))).toBe("reprice");
    expect(momentumSellAction(ist("10:00"), ist("09:50"), ist("09:20"))).toBe("wait");
    expect(momentumSellAction(ist("10:05"), ist("09:50"), ist("09:20"))).toBe("reprice");
  });

  it("escalates immediately at 14:30, then keeps the 15-minute cadence", () => {
    expect(momentumSellAction(ist("14:30"), ist("14:25"), ist("09:20"))).toBe("aggressive");
    expect(momentumSellAction(ist("14:40"), ist("14:30"), ist("09:20"))).toBe("wait");
    expect(momentumSellAction(ist("14:45"), ist("14:30"), ist("09:20"))).toBe("aggressive");
  });

  it("requests cancellation immediately at 15:10 and throttles retries", () => {
    expect(momentumSellAction(ist("15:10"), ist("15:05"), ist("09:20"))).toBe("cancel");
    expect(momentumSellAction(ist("15:20"), ist("15:10"), ist("09:20"))).toBe("wait");
    expect(momentumSellAction(ist("15:25"), ist("15:10"), ist("09:20"))).toBe("cancel");
  });

  it("rounds normal and aggressive sell limits down to the tick", () => {
    expect(momentumSellLimit(100.03, 0.05, "reprice")).toBe(99.5);
    expect(momentumSellLimit(100.03, 0.05, "aggressive")).toBe(98);
  });

  it("prepares the opening sell from the live quote and current remaining position", () => {
    expect(initialMomentumWeeklySell(12, 8, 100.03, 0.05)).toEqual({ qty: 8, limit: 99.5 });
    expect(initialMomentumWeeklySell(12, 0, 100.03, 0.05)).toBeNull();
    expect(initialMomentumWeeklySell(12, 8, 100.03, 0)).toBeNull();
  });
});
