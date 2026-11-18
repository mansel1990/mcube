import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { estimateCharges } from "@/lib/mlive/charges";
import {
  approvalPlan,
  coreDue,
  coreTopUp,
  fundsShortfall,
  longgameOrderAction,
  orderLimit,
  partialFill,
  radarGate,
  radarMoveCounts,
  radarNewMoney,
  repricedBuyFits,
  retryOrStop,
  sellsBeforeBuys,
  wholeUnitPlan,
} from "./suggest";

const targets = { nifty50: 0.4, secondary: 0.2, gold: 0.25, liquid: 0.15 };
const empty = { nifty50: 0, secondary: 0, gold: 0, liquid: 0 };

describe("Long Game suggestions", () => {
  it("uses one Radar signal implementation", () => {
    const simulate = readFileSync(new URL("./simulate.ts", import.meta.url), "utf8");
    const job = readFileSync(new URL("../jobs/longterm-proposal.ts", import.meta.url), "utf8");
    expect(simulate).toContain('from "./signal"');
    expect(simulate).not.toContain("function buildSignalFrame");
    expect(job).toContain("considerLongGameSuggestions");
    expect(job).not.toContain("placeOrder");
    expect(job).not.toContain("mlive_decisions");
  });

  it("suggests the minimum for an empty Core and caps a large top-up", () => {
    const first = coreTopUp(empty, targets);
    expect(first.amount).toBe(10_000);
    expect(first.capped).toBe("up");
    const heavy = { nifty50: 400_000, secondary: 0, gold: 0, liquid: 0 };
    const capped = coreTopUp(heavy, targets);
    expect(capped.raw).toBeGreaterThan(100_000);
    expect(capped.amount).toBe(100_000);
    expect(capped.capped).toBe("down");
    expect(capped.note).toContain("capped");
  });

  it("rounds a plan to whole units and names below, equal, and above", () => {
    const chargeFor = (side: "BUY" | "SELL", turnover: number) => estimateCharges(side, turnover).total;
    const equal = wholeUnitPlan({ selected: 10_000, suggested: 10_000, price: 300, side: "BUY", chargeFor });
    expect(equal.relation).toBe("equal");
    expect(equal.units).toBe(33);
    expect(equal.leftover).toBeGreaterThanOrEqual(0);
    expect(equal.charges).toBeGreaterThan(0);
    expect(wholeUnitPlan({ selected: 9_000, suggested: 10_000, price: 300, side: "BUY", chargeFor }).relation).toBe("below");
    expect(wholeUnitPlan({ selected: 12_000, suggested: 10_000, price: 300, side: "BUY", chargeFor }).relation).toBe("above");
  });

  it("keeps Radar off for Next 50 and for a failed drawdown", () => {
    expect(radarGate({
      radarEnabled: true,
      secondary: "next",
      variants: ["STATIC-MID", "RADAR-MID"],
      radarMaxDrawdownPct: 12,
      staticMaxDrawdownPct: 20,
    }).allowed).toBe(false);
    expect(radarGate({
      radarEnabled: true,
      secondary: "mid",
      variants: ["STATIC-MID", "RADAR-MID"],
      radarMaxDrawdownPct: 16,
      staticMaxDrawdownPct: 20,
    }).allowed).toBe(false);
    expect(radarGate({
      radarEnabled: true,
      secondary: "mid",
      variants: ["STATIC-MID", "RADAR-MID"],
      radarMaxDrawdownPct: 12.4,
      staticMaxDrawdownPct: 23.6,
    }).allowed).toBe(true);
  });

  it("asks for funding only when new money is above zero, and a retry does not take another Radar slot", () => {
    expect(radarNewMoney({ requested: 0, coreValue: 50_000, firstEntry: false }).fundingRequired).toBe(false);
    expect(radarNewMoney({ requested: 10_000, coreValue: 50_000, firstEntry: false }).fundingRequired).toBe(true);
    const first = radarNewMoney({ requested: 0, coreValue: 250_000, firstEntry: true });
    expect(first.amount).toBe(100_000);
    expect(radarMoveCounts({ movesThisYear: 12, retry: true })).toEqual({ accept: true, consumesSlot: false });
    expect(radarMoveCounts({ movesThisYear: 12, retry: false }).accept).toBe(false);
    expect(sellsBeforeBuys([{ side: "BUY" as const }, { side: "SELL" as const }]).map((row) => row.side)).toEqual(["SELL", "BUY"]);
  });

  it("approves only a pending unexpired suggestion and deposits only new money", () => {
    const base = { status: "pending", expiresOn: "2026-12-01", today: "2026-11-18", rulesVersion: "longgame-frozen-v3", fundingConfirmed: true };
    expect(approvalPlan({ ...base, amount: 0 })).toEqual({ ok: true, deposit: 0 });
    expect(approvalPlan({ ...base, amount: 20_000, fundingConfirmed: false }).ok).toBe(false);
    expect(approvalPlan({ ...base, amount: 20_000 })).toEqual({ ok: true, deposit: 20_000 });
    expect(approvalPlan({ ...base, status: "approved", amount: 0 }).ok).toBe(false);
    expect(approvalPlan({ ...base, expiresOn: "2026-11-01", amount: 0 }).ok).toBe(false);
  });

  it("refuses a stale quote, reprices without the 14:30 escalation, and stops leftover buys when Kite is short", () => {
    expect(orderLimit("BUY", 100, 0.05, 20)).toBeNull();
    expect(orderLimit("BUY", 100, 0.05, 1)).toBe(100.3);
    expect(orderLimit("SELL", 100, 0.05, 1)).toBe(99.7);
    const afternoon = new Date("2026-11-18T14:30:00+05:30");
    expect(longgameOrderAction(afternoon, new Date("2026-11-18T14:00:00+05:30"), afternoon)).toBe("reprice");
    const close = new Date("2026-11-18T15:10:00+05:30");
    expect(longgameOrderAction(close, new Date("2026-11-18T15:00:00+05:30"), close)).toBe("cancel");
    expect(fundsShortfall(5000, 10000)).toContain("Kite has ₹5000 available");
    expect(repricedBuyFits(10, 100, 20, 900, 5000)).toBe(false);
    expect(repricedBuyFits(10, 100, 20, 2000, 5000)).toBe(true);
    expect(retryOrStop("stop", 10000, 100)).toEqual({ units: 0, leaveRemainder: true });
    expect(retryOrStop("retry", 10000, 300).units).toBe(33);
    expect(partialFill(2, 5, 100)).toEqual({ qty: 3, notional: 300 });
    expect(coreDue({ firstTradingDay: true, afterClose: true, driftPoints: 1, monthsSinceExecuted: 1, neverEntered: true }).due).toBe(true);
  });
});
