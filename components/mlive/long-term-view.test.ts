import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("Long Game research-only surface", () => {
  const view = readFileSync(new URL("./long-term-view.tsx", import.meta.url), "utf8");
  const route = readFileSync(new URL("../../app/api/mlive/long-term/route.ts", import.meta.url), "utf8");

  it("keeps the required locked copy and uses only the read endpoint", () => {
    expect(view).toContain("Research only · not activated");
    expect(view).toContain("No live recommendation. Long Game is still being researched.");
    expect(view).toContain("Available after a strategy passes held-back");
    expect(view).toContain('fetch("/api/mlive/long-term"');
    for (const unsafe of ["/api/mlive/approvals", "/api/mlive/fund", "/api/mlive/state", "/api/mlive/research"]) {
      expect(view).not.toContain(unsafe);
    }
  });

  it("exports a GET contract and no mutation handler", () => {
    expect(route).toContain("export async function GET");
    expect(route).not.toMatch(/export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)/);
    expect(route).not.toContain("mlive_positions");
    expect(route).not.toContain("mlive_orders");
    expect(route).not.toContain("mlive_ideas");
    expect(route).not.toContain("mlive_decisions");
    expect(route).not.toContain("mlive_gtts");
    expect(route).not.toContain("strategies_enabled");
    expect(view).toContain("Known weakness: profit concentrated in");
    expect(view).toContain("Superseded: Gold BeES 1:100 split not normalized (2019-12-23)");
    expect(view).not.toContain("Frozen rules");
    expect(view).not.toMatch(/\brecommended\b/);
    expect(view).toContain("After-tax CAGR");
    expect(view).toContain("No more than 12 events a year");
    expect(view).not.toMatch(/export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)/);
    const rules = readFileSync(new URL("../../engine/longterm/rules.ts", import.meta.url), "utf8");
    expect(rules).toContain("longgame-frozen-v2");
    expect(rules).toContain("2026-11-18");
    expect(rules).toContain('decider: "owner"');
  });
});
