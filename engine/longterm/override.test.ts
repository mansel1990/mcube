import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseResearchArgs } from "../backtest/args";
import { openHeldbackDataset } from "./heldback";
import { LONGTERM_VARIANT_NAMES } from "./variants";
import {
  FROZEN_V3_VARIANTS,
  frozenV3OverrideCommand,
  overrideBlocksSecondUse,
  overrideConsumedByCommit,
  overrideRecord,
  radarQualifiesV3,
} from "./override";
import { LONGTERM_FROZEN_V2, LONGTERM_FROZEN_V3 } from "./rules";

const EXACT = [
  "--book", "longterm", "--heldback", "--confirm-heldback", "--owner-override", "longgame-frozen-v3",
  "--no-grid", "--variant", "STATIC-MID,RADAR-MID",
];

describe("longgame-frozen-v3 override", () => {
  it("keeps v2 and records the owner reason without turning run 15 into a pass", () => {
    expect(LONGTERM_FROZEN_V2.version).toBe("longgame-frozen-v2");
    expect(LONGTERM_FROZEN_V3.version).toBe("longgame-frozen-v3");
    expect(LONGTERM_FROZEN_V3.convertsFailToPass).toBe(false);
    expect(LONGTERM_FROZEN_V3.run15.failedBuildingGate).toBe(true);
    expect(LONGTERM_FROZEN_V3.ownerReason).toContain("caps a fall at about 15%");
    expect(LONGTERM_FROZEN_V3.run15.staticMidAfterTaxCagrPct).toBe(11.28);
    expect(LONGTERM_FROZEN_V3.run15.radarMidBuildingDrawdownPct).toBe(12.4);
  });

  it("accepts only the exact inspection command", () => {
    expect(parseResearchArgs(EXACT)).toMatchObject({
      book: "longterm",
      sample: "heldback",
      confirmHeldback: true,
      grid: false,
      ownerOverride: "longgame-frozen-v3",
      variants: ["STATIC-MID", "RADAR-MID"],
    });
    expect(frozenV3OverrideCommand(parseResearchArgs(EXACT))).toBe(true);
    expect(() => parseResearchArgs(EXACT.filter((item) => item !== "--owner-override" && item !== "longgame-frozen-v3"))).toThrow(/all four/);
    expect(() => parseResearchArgs(EXACT.map((item) => item === "longgame-frozen-v3" ? "longgame-frozen-v2" : item))).toThrow(/exactly longgame-frozen-v3/);
    expect(() => parseResearchArgs(["--book", "longterm", "--heldback", "--confirm-heldback", "--owner-override", "longgame-frozen-v3", "--no-grid", "--variant", "STATIC-MID"])).toThrow(/exactly STATIC-MID,RADAR-MID/);
    expect(() => parseResearchArgs(["--book", "longterm", "--heldback", "--confirm-heldback", "--owner-override", "longgame-frozen-v3", "--variant", "STATIC-MID,RADAR-MID"])).toThrow(/no-grid/);
    expect(() => parseResearchArgs(["--book", "longterm", "--heldback", "--owner-override", "longgame-frozen-v3", "--no-grid", "--variant", "STATIC-MID,RADAR-MID"])).toThrow(/confirm-heldback/);
    expect(() => parseResearchArgs(["--book", "swing", "--owner-override", "longgame-frozen-v3"])).toThrow(/only for Long Game/);
  });

  it("consumes the override only after an ok commit of both result rows", () => {
    expect(overrideConsumedByCommit("ok", [...FROZEN_V3_VARIANTS])).toBe(true);
    for (const status of ["queued", "running", "error", "cancelled", "oom"]) {
      expect(overrideConsumedByCommit(status, [...FROZEN_V3_VARIANTS])).toBe(false);
    }
    expect(overrideConsumedByCommit("ok", ["STATIC-MID"])).toBe(false);
    expect(overrideBlocksSecondUse({ consumed: true, runningLease: false, force: false })).toMatch(/already been used/);
    expect(overrideBlocksSecondUse({ consumed: false, runningLease: true, force: true })).toMatch(/already running/);
    expect(overrideBlocksSecondUse({ consumed: true, runningLease: false, force: true })).toBeNull();
    expect(overrideRecord(true).inspectionOnly).toBe(true);
    expect(overrideRecord(false).consumed).toBe(false);
  });

  it("does not load held-back data when the override was already used", async () => {
    const calls = { heldback: 0 };
    const open = (consumed: boolean, runningLease: boolean, force: boolean) => openHeldbackDataset({
      loadBuilding: async () => ({ dates: ["2011-01-03"], values: {}, provenance: [], fingerprint: "build" }) as never,
      buildingRows: async () => [],
      usedVariants: async () => [],
      requested: [...FROZEN_V3_VARIANTS],
      force,
      ownerOverride: "longgame-frozen-v3",
      overrideState: async () => ({ consumed, runningLease }),
      loadHeldback: async () => {
        calls.heldback += 1;
        return { dates: ["2024-01-02"], values: {}, provenance: [], fingerprint: "held" } as never;
      },
    });
    await expect(open(true, false, false)).rejects.toThrow(/already been used/);
    expect(calls.heldback).toBe(0);
    await expect(open(false, true, false)).rejects.toThrow(/already running/);
    expect(calls.heldback).toBe(0);
    await expect(open(false, false, false)).resolves.toMatchObject({ fingerprint: "held" });
    expect(calls.heldback).toBe(1);
  });

  it("still stops a held-back load that has no exact override", async () => {
    const calls = { heldback: 0 };
    await expect(openHeldbackDataset({
      loadBuilding: async () => ({ dates: ["2011-01-03"], values: {}, provenance: [], fingerprint: "build" }) as never,
      buildingRows: async () => [],
      usedVariants: async () => [],
      requested: [...LONGTERM_VARIANT_NAMES],
      force: true,
      loadHeldback: async () => {
        calls.heldback += 1;
        return { dates: ["2024-01-02"], values: {}, provenance: [], fingerprint: "held" } as never;
      },
    })).rejects.toThrow(/stopped before loading held-back data/);
    expect(calls.heldback).toBe(0);
  });

  it("qualifies Radar only on the v3 drawdown rule", () => {
    expect(radarQualifiesV3({ variants: ["STATIC-MID", "RADAR-MID"], radarMaxDrawdownPct: 12.4, staticMaxDrawdownPct: 23.6 })).toBe(true);
    expect(radarQualifiesV3({ variants: ["STATIC-MID", "RADAR-MID"], radarMaxDrawdownPct: 15, staticMaxDrawdownPct: 23.6 })).toBe(true);
    expect(radarQualifiesV3({ variants: ["STATIC-MID", "RADAR-MID"], radarMaxDrawdownPct: 15.1, staticMaxDrawdownPct: 23.6 })).toBe(false);
    expect(radarQualifiesV3({ variants: ["STATIC-MID", "RADAR-MID"], radarMaxDrawdownPct: 20, staticMaxDrawdownPct: 18 })).toBe(false);
    expect(radarQualifiesV3({ variants: ["RADAR-MID"], radarMaxDrawdownPct: 12, staticMaxDrawdownPct: 20 })).toBe(false);
    expect(radarQualifiesV3({ variants: ["RADAR-NEXT", "STATIC-NEXT"], radarMaxDrawdownPct: 10, staticMaxDrawdownPct: 20 })).toBe(false);
  });

  it("keeps research from creating decisions", () => {
    const research = readFileSync(new URL("../jobs/research.ts", import.meta.url), "utf8");
    const runner = readFileSync(new URL("./run.ts", import.meta.url), "utf8");
    expect(research).not.toContain("insertLongtermDecisions");
    expect(research).not.toContain("sendLongtermDecisions");
    expect(runner).not.toContain("insertLongtermDecisions");
    expect(runner).not.toContain("placeOrder");
  });
});
