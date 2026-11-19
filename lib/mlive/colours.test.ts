import { readFileSync } from "node:fs";
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
    expect(MLIVE_COLOURS.swing.book).toBe("#6B4FB3");
    expect(MLIVE_COLOURS.nifty.book).toBe("#2F6FB5");
    expect(contrastRatio(MLIVE_COLOURS.onInk, MLIVE_COLOURS.longGame.book)).toBeLessThan(4.5);
    expect([MLIVE_COLOURS.profit.book, MLIVE_COLOURS.loss.book]).not.toContain(MLIVE_COLOURS.swing.book);
    expect([MLIVE_COLOURS.profit.book, MLIVE_COLOURS.loss.book]).not.toContain(MLIVE_COLOURS.longGame.book);
    expect([MLIVE_COLOURS.profit.book, MLIVE_COLOURS.loss.book]).not.toContain(MLIVE_COLOURS.nifty.book);
  });

  it("keeps Swing, Long Game, and Nifty distinct, with Nifty dashed as a benchmark", () => {
    expect(new Set([MLIVE_COLOURS.swing.book, MLIVE_COLOURS.longGame.book, MLIVE_COLOURS.nifty.book]).size).toBe(3);
    const css = readFileSync(new URL("../../app/(mlive)/mlive.css", import.meta.url), "utf8");
    const today = readFileSync(new URL("../../components/mlive/today-board.tsx", import.meta.url), "utf8");
    const research = readFileSync(new URL("../../components/mlive/research-view.tsx", import.meta.url), "utf8");
    const charts = readFileSync(new URL("../../components/mlive/charts-board.tsx", import.meta.url), "utf8");
    const frame = readFileSync(new URL("../../components/mlive/frame.tsx", import.meta.url), "utf8");
    expect(css).toContain("--swing: #6B4FB3");
    expect(css).toContain("--nifty: #2F6FB5");
    expect(css).toContain(".btn.primary { background: var(--ink);");
    expect(frame).not.toContain("book-dot");
    expect(today).toContain('line.id === "nifty" ? "6 4"');
    expect(today).toContain('var(--nifty)');
    expect(research).toContain('strokeDasharray="4 4"');
    expect(research).toContain('stroke="var(--nifty)"');
    expect(charts).toContain('strokeDasharray="6 4"');
    expect(charts).toContain('stroke="var(--nifty)"');
  });
});
