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
  });
});
