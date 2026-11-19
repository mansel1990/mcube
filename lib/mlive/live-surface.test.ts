import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { contrastRatio, MLIVE_COLOURS } from "./colours";

describe("navigation colour", () => {
  const frame = readFileSync(new URL("../../components/mlive/frame.tsx", import.meta.url), "utf8");
  const swing = readFileSync(new URL("../../components/mlive/swing-view.tsx", import.meta.url), "utf8");
  const settings = readFileSync(new URL("../../components/mlive/settings-view.tsx", import.meta.url), "utf8");
  const home = readFileSync(new URL("../../components/mlive/home-view.tsx", import.meta.url), "utf8");

  it("keeps book dots off navigation, titles, and settings headers", () => {
    for (const source of [frame, swing, settings, home]) expect(source).not.toContain("book-dot");
    expect(contrastRatio(MLIVE_COLOURS.onInk, MLIVE_COLOURS.raised)).toBeGreaterThanOrEqual(4.5);
  });
});
