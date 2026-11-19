import { describe, expect, it } from "vitest";
import { RADAR_RULES_PARAGRAPH, RESEARCH_DECISIONS, retiredStoppedRecords } from "./decision-registry";

describe("research decision registry", () => {
  it("records lifecycle without reading strategies_enabled", () => {
    const momentum = RESEARCH_DECISIONS.find((row) => row.id === "swing:momentum:M10-6");
    const radar = RESEARCH_DECISIONS.find((row) => row.id === "longterm:RADAR-MID");
    expect(momentum?.status).toBe("live_pilot");
    expect(radar?.status).toBe("parked");
    expect(radar?.reason).toContain("run 17");
    expect(RADAR_RULES_PARAGRAPH).toContain("14.2%");
    expect(RADAR_RULES_PARAGRAPH).toContain("12.5%");
  });

  it("counts retired and stopped records", () => {
    const rows = retiredStoppedRecords();
    expect(rows.map((row) => row.label)).toEqual(["Opening Range", "VWAP", "EMA Pullback", "RS Resilience"]);
    expect(rows).toHaveLength(4);
  });
});
