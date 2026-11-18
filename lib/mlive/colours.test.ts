import { describe, expect, it } from "vitest";
import { contrastRatio, MLIVE_CONTRAST_PAIRS, MLIVE_COLOURS } from "./colours";

describe("Mansel Live colour tokens", () => {
  it("keeps every used text and background pair at 4.5:1 or better", () => {
    for (const pair of MLIVE_CONTRAST_PAIRS) {
      expect(contrastRatio(pair.text, pair.background), pair.name).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("uses saffron as a fill and ink as the primary button", () => {
    expect(MLIVE_COLOURS.longGame.book).toBe("#F2A20C");
    expect(MLIVE_COLOURS.ink).toBe("#14161C");
    expect(MLIVE_COLOURS.swing.book).toBe("#2F6FB5");
    expect(contrastRatio(MLIVE_COLOURS.onInk, MLIVE_COLOURS.longGame.book)).toBeLessThan(4.5);
  });
});
