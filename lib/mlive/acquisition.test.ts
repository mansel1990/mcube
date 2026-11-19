import { describe, expect, it } from "vitest";
import { acquisitionRecord, assumedLongTermDate } from "./acquisition";

describe("acquisition assumptions", () => {
  it("stores a known month as the first day", () => {
    expect(acquisitionRecord("2024-03", "2026-11-19")).toEqual({
      acquisitionDate: "2024-03-01",
      acquiredOn: "2024-03-01",
      registeredOn: "2026-11-19",
      taxDateAssumption: "month_start",
      estimated: true,
    });
  });

  it("keeps an unknown date blank and uses registration plus 12 months", () => {
    const record = acquisitionRecord("", "2026-11-19");
    expect(record.acquisitionDate).toBeNull();
    expect(record.acquiredOn).toBe("2026-11-19");
    expect(record.taxDateAssumption).toBe("registration_plus_12_months");
    expect(assumedLongTermDate(record.registeredOn)).toBe("2027-11-19");
  });
});
