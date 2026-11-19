import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Core-only live Long Game", () => {
  const book = readFileSync(new URL("./long-game-book.tsx", import.meta.url), "utf8");
  const register = readFileSync(new URL("./long-game-register.tsx", import.meta.url), "utf8");
  const research = readFileSync(new URL("./research-view.tsx", import.meta.url), "utf8");
  const guard = readFileSync(new URL("../../engine/longterm/override.ts", import.meta.url), "utf8");

  it("shows the book when no suggestion is pending, and registration stays on Core", () => {
    expect(book).toContain("No suggestion waiting");
    expect(book).toContain("Register from Kite");
    expect(book).toContain("Turn on Core");
    expect(book).not.toContain("Radar");
    expect(book).toContain("vs Nifty");
    expect(book).toContain("Pocket cash");
    expect(book).not.toContain("Sample numbers");
    expect(book).not.toContain('value="radar"');
    expect(register).not.toContain('value="radar"');
    expect(register).toContain("Register from Kite");
  });

  it("keeps Radar evidence in Research and the engine guard in place", () => {
    expect(research).toContain("LongGameResearch");
    expect(research).not.toContain("LongTermView");
    expect(research).toContain("New run");
    expect(guard).toContain("radarQualifiesV3");
  });
});
