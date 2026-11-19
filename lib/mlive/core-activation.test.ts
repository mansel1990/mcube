import { describe, expect, it } from "vitest";
import { coreActivationPatch } from "./core-activation";

describe("Core activation patch", () => {
  it("adds longterm without dropping or duplicating strategies", () => {
    expect(coreActivationPatch(["rs", "ema", "momentum"])).toEqual({
      strategiesEnabled: ["rs", "ema", "momentum", "longterm"],
      longtermCoreEnabled: true,
    });
    expect(coreActivationPatch(["longterm", "momentum"]).strategiesEnabled).toEqual(["longterm", "momentum"]);
  });

  it("does not mention Radar", () => {
    expect(JSON.stringify(coreActivationPatch(["rs"]))).not.toContain("radar");
  });
});
