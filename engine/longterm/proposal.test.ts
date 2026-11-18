import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  activationAllowed,
  afterClose,
  buildAllocationChange,
  ownerDecision,
  type AllocationChange,
  type StoredProposal,
} from "./proposal";

const holidays = new Set<string>();

function change(): AllocationChange {
  const built = buildAllocationChange({
    variant: "RADAR-NEXT",
    signalDate: "2026-11-18",
    reason: "Second consecutive completed warning month: sell the remainder on the next session.",
    currentWeights: { nifty50: 0.4, secondary: 0.2, gold: 0.25, liquid: 0.15 },
    targetWeights: { nifty50: 0.2, secondary: 0.2, gold: 0.4, liquid: 0.2 },
    bookValue: 100_000,
    prices: { nifty50: 300, secondary: 850, gold: 120 },
  });
  if (!built) throw new Error("expected a change");
  return built;
}

function pending(over: Partial<StoredProposal> = {}): StoredProposal {
  return {
    id: 1,
    status: "pending",
    proposedOn: "2026-11-18",
    expiresOn: "2026-11-23",
    eventsUsed: 0,
    eventsCap: 12,
    note: "",
    ...change(),
    ...over,
  };
}

describe("Long Game approval stays off until the guard passes", () => {
  it("does not propose or create decisions while the guard is off", () => {
    expect(activationAllowed({ enabled: ["momentum"], heldbackConclusion: "qualifies for live design" })).toBe(false);
    expect(activationAllowed({ enabled: ["longterm"], heldbackConclusion: "does not qualify" })).toBe(false);
    expect(activationAllowed({ enabled: ["longterm"], heldbackConclusion: null })).toBe(false);
    expect(activationAllowed({ enabled: ["momentum", "longterm"], heldbackConclusion: "qualifies for live design" })).toBe(true);
    const result = afterClose({
      allowed: false,
      cap: 12,
      expiryDays: 3,
      today: "2026-11-18",
      holidays,
      pending: null,
      approvedThisYear: 0,
      change: change(),
    });
    expect(result.created).toBeNull();
    expect(result.decisions).toEqual([]);
    expect(result.alert).toBeNull();
    expect(ownerDecision({
      allowed: false,
      proposal: pending(),
      action: "approve",
      note: "",
      tradeDate: "2026-11-19",
    }).decisions).toEqual([]);
  });

  it("keeps a single pending proposal", () => {
    const result = afterClose({
      allowed: true,
      cap: 12,
      expiryDays: 3,
      today: "2026-11-19",
      holidays,
      pending: pending(),
      approvedThisYear: 0,
      change: change(),
    });
    expect(result.created).toBeNull();
    expect(result.expiredId).toBeNull();
    expect(result.decisions).toEqual([]);
  });

  it("creates decisions only when the owner approves, sells before buys", () => {
    const proposal = pending();
    const approved = ownerDecision({
      allowed: true,
      proposal,
      action: "approve",
      note: "go",
      tradeDate: "2026-11-19",
    });
    expect(approved.status).toBe("approved");
    expect(approved.decisions.length).toBeGreaterThan(0);
    expect(approved.decisions.map((row) => row.side)).toEqual([...approved.decisions.map((row) => row.side)].sort((a, b) => (a === b ? 0 : a === "SELL" ? -1 : 1)));
    expect(approved.decisions[0]?.side).toBe("SELL");
    expect(approved.decisions.every((row) => row.tradeDate === "2026-11-19")).toBe(true);
    expect(approved.decisions.map((row) => row.symbol)).toContain("NIFTYBEES");
    const rejected = ownerDecision({ allowed: true, proposal, action: "reject", note: "no", tradeDate: "2026-11-19" });
    expect(rejected.decisions).toEqual([]);
    expect(rejected.status).toBe("rejected");
  });

  it("expires a stale proposal without creating decisions, then can propose afresh", () => {
    const expired = afterClose({
      allowed: true,
      cap: 12,
      expiryDays: 3,
      today: "2026-11-24",
      holidays,
      pending: pending({ expiresOn: "2026-11-23" }),
      approvedThisYear: 1,
      change: null,
    });
    expect(expired.expiredId).toBe(1);
    expect(expired.decisions).toEqual([]);
    expect(expired.created).toBeNull();
    const fresh = afterClose({
      allowed: true,
      cap: 12,
      expiryDays: 3,
      today: "2026-11-24",
      holidays,
      pending: pending({ expiresOn: "2026-11-23" }),
      approvedThisYear: 1,
      change: change(),
    });
    expect(fresh.expiredId).toBe(1);
    expect(fresh.created?.eventsUsed).toBe(1);
    expect(fresh.created?.eventsCap).toBe(12);
    expect(fresh.decisions).toEqual([]);
  });

  it("blocks the 13th approved change in a calendar year", () => {
    const blocked = afterClose({
      allowed: true,
      cap: 12,
      expiryDays: 3,
      today: "2026-11-18",
      holidays,
      pending: null,
      approvedThisYear: 12,
      change: change(),
    });
    expect(blocked.created).toBeNull();
    expect(blocked.decisions).toEqual([]);
    expect(blocked.alert?.code).toBe("longterm_cap");
    expect(blocked.alert?.message).toMatch(/12 of 12/);
  });

  it("does not let research create Long Game decisions", () => {
    const files = [
      "../backtest/run.ts",
      "../jobs/research.ts",
      "../jobs/research-queue.ts",
      "./run.ts",
      "./simulate.ts",
      "./heldback.ts",
    ];
    for (const file of files) {
      const source = readFileSync(new URL(file, import.meta.url), "utf8");
      expect(source).not.toContain("mlive_decisions");
      expect(source).not.toContain("sendLongtermDecisions");
    }
    const job = readFileSync(new URL("../jobs/longterm-proposal.ts", import.meta.url), "utf8");
    expect(job).not.toContain("mlive_decisions");
    expect(job).not.toContain("placeOrder");
  });
});
