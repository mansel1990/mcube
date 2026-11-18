import { heldbackAccessGate, type HeldbackGatePair } from "@/engine/longterm/heldback";

export const SUPERSEDED_LONGTERM_LABEL = "Superseded: Gold BeES 1:100 split not normalized (2019-12-23)";
export const SUPERSEDED_LONGTERM_RUNS = [9, 10] as const;

export type LongtermRunRef = { id: number; sample: string; status: string };

export function isSupersededLongtermRun(id: number): boolean {
  return (SUPERSEDED_LONGTERM_RUNS as readonly number[]).includes(id);
}

export function latestValidRun<T extends LongtermRunRef>(runs: readonly T[], sample: string): T | null {
  const valid = runs.filter((run) => run.sample === sample && run.status === "ok" && !isSupersededLongtermRun(run.id));
  return valid.sort((a, b) => b.id - a.id)[0] ?? null;
}

export function heldbackStatusForVariant(input: {
  variant: string;
  conclusion: string | null;
  gate: { pass: boolean; failures: string[] } | null;
}): { label: string; detail: string } {
  if (input.conclusion === "qualifies for live design" || input.conclusion === "does not qualify") {
    return { label: input.conclusion, detail: "" };
  }
  if (input.gate && !input.gate.pass) {
    const pair = input.variant.includes("NEXT") ? "NEXT" : input.variant.includes("MID") ? "MID" : input.variant;
    const relevant = input.gate.failures.filter((line) => line.includes(input.variant) || line.includes(pair));
    return {
      label: "blocked by building gate",
      detail: (relevant.length ? relevant : input.gate.failures).join(" "),
    };
  }
  return { label: "not run", detail: "" };
}

export function buildingGateFromPairs(pairs: readonly HeldbackGatePair[] | null): { pass: boolean; failures: string[] } | null {
  if (!pairs) return { pass: false, failures: ["A corrected all-four building run is required before held-back can run."] };
  return heldbackAccessGate(pairs);
}
