import { describe, expect, it } from "vitest";
import { researchThresholds } from "./research-bar";
import { passedCount, researchTiles, tilesForSample } from "./research-tiles";

const m10 = {
  profitFactor: 1.25,
  trades: 140,
  halfYearsPct: 60,
  worstDrawdownPct: 12,
  avgNetPct: 0.9,
};

describe("sample-matched research tiles", () => {
  it("passes M10-6 held-back profit factor 1.25 against 1.20", () => {
    const tiles = tilesForSample(m10, "swing", "heldback");
    const profit = tiles.find((tile) => tile.id === "profit-factor");
    expect(profit).toMatchObject({ value: "1.25", requirement: "Needs 1.20", passed: true });
    expect(passedCount(tiles)).toBe(3);
  });

  it("does not reuse the building 1.40 bar on a held-back metric", () => {
    const held = researchTiles(m10, researchThresholds("swing", "heldback"));
    const building = researchTiles(m10, researchThresholds("swing", "building"));
    expect(held.find((tile) => tile.id === "profit-factor")?.passed).toBe(true);
    expect(building.find((tile) => tile.id === "profit-factor")?.passed).toBe(false);
    expect(building.find((tile) => tile.id === "profit-factor")?.requirement).toBe("Needs 1.40");
  });
});
