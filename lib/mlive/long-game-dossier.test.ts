import { describe, expect, it } from "vitest";
import { goldContributionNote, longGameComparison, radarDecisionSentence } from "./long-game-dossier";

const heldCore = {
  metrics: { maxDrawdown: { pct: 12.5, recoveryDate: "2025-04-01" }, eventsPerYear: 0 },
  stresses: { currentTax: { cagrPct: 12.78 } },
};
const heldRadar = {
  metrics: { maxDrawdown: { pct: 14.2, recoveryDate: "2025-06-01" }, eventsPerYear: 4.5, contributionApprox: { gold: 0.65 } },
  stresses: { currentTax: { cagrPct: 8.89 } },
};

describe("Long Game dossier", () => {
  it("reads stored held-back values and does not invent a missing building cell", () => {
    const rows = longGameComparison({ heldCore, heldRadar });
    const returns = rows.find((row) => row.metric === "Return/year after tax");
    const falls = rows.find((row) => row.metric === "Worst fall");
    const moves = rows.find((row) => row.metric === "Moves/year");
    expect(returns?.heldCore).toBe("12.78%");
    expect(returns?.heldRadar).toBe("8.89%");
    expect(returns?.buildingCore).toBeNull();
    expect(falls?.heldCore).toBe("12.5%");
    expect(falls?.heldRadar).toBe("14.2%");
    expect(moves?.heldRadar).toBe("4.5");
  });

  it("states why run 17 did not qualify", () => {
    expect(radarDecisionSentence(12.5, 14.2)).toContain("did not qualify");
    expect(goldContributionNote(heldRadar.metrics)).toBe("65% of Radar's profit came from gold, indicating concentrated contribution.");
  });
});
