import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SCHEDULE_KINDS } from "./schedule";

describe("schedule", () => {
  it("has an entry for every job engine/deploy.sh installs", () => {
    const script = readFileSync(new URL("../../engine/deploy.sh", import.meta.url), "utf8");
    const jobs = [...script.matchAll(/cli\.ts ([a-z0-9-]+)/g)].map((match) => match[1]);
    expect(jobs.length).toBeGreaterThan(0);
    for (const job of new Set(jobs)) expect(SCHEDULE_KINDS).toContain(job);
  });
});
