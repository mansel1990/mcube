import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("post-v3 completion surface", () => {
  const research = readFileSync(new URL("./research-view.tsx", import.meta.url), "utf8");
  const dossier = readFileSync(new URL("./research-dossier.tsx", import.meta.url), "utf8");
  const help = readFileSync(new URL("./reason-help.tsx", import.meta.url), "utf8");
  const today = readFileSync(new URL("./today-board.tsx", import.meta.url), "utf8");
  const book = readFileSync(new URL("./long-game-book.tsx", import.meta.url), "utf8");
  const suggestion = readFileSync(new URL("./long-game-suggestion.tsx", import.meta.url), "utf8");
  const loading = readFileSync(new URL("./loading.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../../app/(mlive)/mlive.css", import.meta.url), "utf8");

  it("keeps the research header to the title and tabs", () => {
    const head = research.slice(research.indexOf("page-head"), research.indexOf("research-panel"));
    expect(head).toContain(">Research<");
    expect(head).not.toContain("The evidence behind");
    expect(head).not.toContain("New run");
    expect(research).toContain("Research archive");
    expect(research).not.toContain("Live pilot · owner's choice · did not pass all tests");
    expect(dossier).not.toContain("RESEARCH_DECISIONS.filter");
    expect(help).not.toContain(">Reason<");
    expect(help).toContain('aria-describedby');
  });

  it("loads Long Game research without the live book and draws the fall bar", () => {
    expect(dossier).toContain("/api/mlive/long-term/dossier");
    expect(dossier).not.toContain("/api/mlive/long-term\"");
    expect(dossier).toContain("fall-bars");
    expect(dossier).toContain("compare-phone");
    expect(suggestion).not.toContain("This is a preview");
    expect(suggestion).toContain("/api/mlive/long-term/proposal");
  });

  it("uses compact health capsules and keeps Auto decisions out of an approval card", () => {
    expect(today).toContain("health-capsules");
    expect(today).toContain("Waiting for Kite login");
    expect(today).not.toContain("No orders today");
    expect(today).not.toContain("Jobs ok");
    expect(today).toContain("jobs failed");
    expect(today).toContain("mode === \"auto\" ? []");
    expect(today).toContain("chart-legend");
    expect(book).toContain("No suggestion waiting");
    expect(book).toContain("Pocket cash");
    expect(book).toContain("Register from Kite");
    expect(book).not.toContain("Radar");
  });

  it("announces one status and hides skeleton motion when requested", () => {
    expect(loading).toContain('role="status"');
    expect(loading).toContain('aria-hidden="true"');
    expect(loading).toContain(">Retry<");
    expect(css).toContain("prefers-reduced-motion");
    expect(css).toContain("skel-shimmer");
  });
});
