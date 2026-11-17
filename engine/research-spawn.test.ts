import { describe, expect, it } from "vitest";
import { researchRespawnArgv } from "./research-spawn";

describe("research re-spawn", () => {
  it("keeps the tsx loader when the heap is raised", () => {
    const args = researchRespawnArgv(
      ["--import", "tsx", "--max-old-space-size=256"],
      ["/usr/bin/node", "/opt/mcube-src/mcube/engine/cli.ts", "research", "--book", "intraday"],
    );
    expect(args.slice(0, 2)).toEqual(["--import", "tsx"]);
    expect(args).not.toContain("--max-old-space-size=256");
    expect(args).toContain("/opt/mcube-src/mcube/engine/cli.ts");
    expect(args.slice(-3)).toEqual(["research", "--book", "intraday"]);
  });
});
