import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Core-only live Long Game", () => {
  const book = readFileSync(new URL("./long-game-book.tsx", import.meta.url), "utf8");
  const register = readFileSync(new URL("./long-game-register.tsx", import.meta.url), "utf8");
  const research = readFileSync(new URL("./research-view.tsx", import.meta.url), "utf8");
  const guard = readFileSync(new URL("../../engine/longterm/override.ts", import.meta.url), "utf8");

  it("hides Radar from the live book and registration", () => {
    expect(book).not.toContain('value="radar"');
    expect(book).not.toContain("Radar pocket");
    expect(book).toContain("Radar remains off");
    const beforeConfirm = book.slice(0, book.indexOf("async function turnOn"));
    expect(beforeConfirm).not.toContain("long-game/enable");
    expect(book).toContain('fetch("/api/mlive/long-game/enable"');
    expect(register).not.toContain("radar");
    expect(register).toContain("Register from Kite");
  });

  it("keeps Radar evidence in Research and the engine guard in place", () => {
    expect(research).toContain("LongGameResearch");
    expect(research).not.toContain("LongTermView");
    expect(research).toContain("New run");
    expect(guard).toContain("radarQualifiesV3");
  });
});
