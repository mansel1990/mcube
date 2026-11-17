import { describe, expect, it } from "vitest";
import {
  LONGTERM_SERIES,
  type LongtermDataset,
  type LongtermSeriesKey,
} from "./data";
import { compareLongterm, simulateLongterm } from "./simulate";
import { getLongtermVariant } from "./variants";

describe("Long Game pure simulator", () => {
  it("keeps weekly signals causal, executes next session, and accepts a holiday-shortened week", () => {
    const full = fixture("normal");
    const base = simulateLongterm(full, "RADAR-NEXT", window("2011-01-03", "2011-05-31"));
    const first = base.events.find((event) => event.kind === "stage" && event.sleeve === "nifty50");
    expect(first).toBeDefined();
    expect(first?.executionDate).toBe(nextSession(full.dates, first!.signalDate));
    expect(first?.executionDate).not.toBe(first?.signalDate);

    const holidayDate = first!.signalDate;
    const holiday = removeSession(full, holidayDate);
    const shortened = simulateLongterm(holiday, "RADAR-NEXT", window("2011-01-03", "2011-05-31"));
    const replacement = shortened.events.find((event) => event.kind === "stage" && event.sleeve === "nifty50");
    expect(replacement).toBeDefined();
    expect(weekKey(replacement!.signalDate)).toBe(weekKey(holidayDate));
    expect(replacement!.signalDate).toBe(previousSession(full.dates, holidayDate));
    expect(replacement!.executionDate).toBe(nextSession(holiday.dates, replacement!.signalDate));

    const cutoff = first!.signalDate;
    const changed = mutateAfter(full, cutoff, (value, index) => value * (index % 2 ? 4 : 0.25));
    const changedRun = simulateLongterm(changed, "RADAR-NEXT", window("2011-01-03", "2011-05-31"));
    expect(eventsThrough(changedRun.events, cutoff)).toEqual(eventsThrough(base.events, cutoff));
  });

  it("deploys exact 30/30/40 stages, only one per sleeve per week, with caps and liquid residual", () => {
    const result = simulateLongterm(fixture("normal"), "RADAR-MID", window("2011-01-03", "2011-05-31"));
    for (const sleeve of ["nifty50", "secondary", "gold"] as const) {
      const stages = result.events.filter((event) => event.kind === "stage" && event.sleeve === sleeve);
      expect(stages.map((event) => event.stage)).toEqual([1, 2, 3]);
      expect(new Set(stages.map((event) => weekKey(event.signalDate))).size).toBe(3);
      expect(stages.every((event) => event.regime === "normal")).toBe(true);
    }
    for (const event of result.events.filter((item) => item.kind === "stage")) {
      if (event.sleeve === "portfolio" || event.sleeve === "liquid") continue;
      const target = event.sleeve === "nifty50" ? 0.4 : event.sleeve === "secondary" ? 0.2 : 0.25;
      expect(event.allocationAfter[event.sleeve]).toBeLessThanOrEqual(target + 1e-9);
      expect(event.allocationAfter.liquid).toBeGreaterThanOrEqual(0.15 - 1e-9);
    }
  });

  it("arms a crisis without buying the threshold and waits for the four-week reversal", () => {
    const dataset = fixture("crisis");
    const result = simulateLongterm(dataset, "RADAR-NEXT", window("2011-01-03", "2011-06-30"));
    const stages = result.events.filter((event) => event.kind === "stage" && event.sleeve === "nifty50");
    expect(stages[0]?.stage).toBe(1);
    expect(stages[0]?.regime).toBe("crisis");
    expect(stages[0]?.signalDate >= "2011-03-11").toBe(true);
    expect(result.events.filter((event) => event.kind === "stage" && event.signalDate < "2011-03-11")).toHaveLength(0);
  });

  it("sells half and then the remainder on consecutive warnings, but cancels the second exit if warning clears", () => {
    const falling = fixture("warnings");
    const exited = simulateLongterm(falling, "RADAR-NEXT", window("2011-01-03", "2012-12-31"));
    const warningSells = exited.events.filter((event) => event.kind === "warning" && event.sleeve === "nifty50");
    expect(warningSells.length).toBeGreaterThanOrEqual(2);
    expect(warningSells[1].signalDate.slice(0, 7)).not.toBe(warningSells[0].signalDate.slice(0, 7));
    expect(warningSells[0].executionDate).toBe(nextSession(falling.dates, warningSells[0].signalDate));
    expect(warningSells[1].gross).toBeLessThanOrEqual(warningSells[0].gross * 1.1);

    const clearedData = mutateAfter(falling, warningSells[0].signalDate, (value) => value * 4);
    const cleared = simulateLongterm(clearedData, "RADAR-NEXT", window("2011-01-03", "2012-12-31"));
    const clearedWarnings = cleared.events.filter((event) => event.kind === "warning" && event.sleeve === "nifty50");
    expect(clearedWarnings[0]?.signalDate).toBe(warningSells[0].signalDate);
    expect(clearedWarnings[0]?.executionDate).toBe(warningSells[0].executionDate);
    const immediatelyFollowingMonth = nextMonth(warningSells[0].signalDate);
    expect(clearedWarnings.filter((event) => event.signalDate.slice(0, 7) === immediatelyFollowingMonth)).toHaveLength(0);
  });

  it("invests STATIC on the first session and rebalances after March and >5pp month-end drift", () => {
    const dataset = fixture("static-drift");
    const result = simulateLongterm(dataset, "STATIC-NEXT", window("2011-01-03", "2011-08-31"));
    const initial = result.events.find((event) => event.kind === "initial" && event.action === "REBALANCE");
    expect(initial?.executionDate).toBe("2011-01-03");
    const annual = result.events.find((event) => event.kind === "annual" && event.action === "REBALANCE");
    expect(annual?.signalDate.slice(5, 7)).toBe("03");
    expect(annual?.executionDate).toBe(nextSession(dataset.dates, annual!.signalDate));
    const drift = result.events.find((event) => event.kind === "drift" && event.action === "REBALANCE");
    expect(drift).toBeDefined();
    expect(drift?.executionDate).toBe(nextSession(dataset.dates, drift!.signalDate));
    expect(result.metrics.annualRebalances).toBe(1);
    expect(result.metrics.driftRebalances).toBeGreaterThanOrEqual(1);
  });

  it("applies total-return levels, percentage costs, slippage, drag, tax and whole-unit rounding", () => {
    const dataset = fixture("distribution");
    const free = simulateLongterm(dataset, "STATIC-NEXT", {
      ...window("2011-01-03", "2011-12-30"),
      costs: { transactionCostPct: 0, slippagePct: 0 },
      drag: { nifty50: 0, secondary: 0, gold: 0 },
    });
    const charged = simulateLongterm(dataset, "STATIC-NEXT", window("2011-01-03", "2011-12-30"));
    expect(free.metrics.endingValue).toBeGreaterThan(100_000);
    expect(charged.metrics.endingValue).toBeLessThan(free.metrics.endingValue);
    expect(charged.metrics.charges).toBeGreaterThan(0);
    expect(charged.metrics.slippage).toBeGreaterThan(0);
    expect(charged.metrics.trackingDrag).toBeGreaterThan(0);
    expect(charged.stress.doubledCosts.endingValue).toBeLessThan(charged.metrics.endingValue);
    expect(charged.stress.doubledDrag.endingValue).toBeLessThan(charged.metrics.endingValue);
    expect(Number.isFinite(charged.wholeUnit.differenceFromFractional)).toBe(true);
    expect(charged.stress.currentTax.asOf).toBe("2026-11-17");
  });

  it("fails missing data and held-back windows, and keeps identity and acceptance deterministic", () => {
    const dataset = fixture("normal");
    dataset.values.nifty50_tri.delete("2011-02-01");
    expect(() => simulateLongterm(dataset, "RADAR-NEXT", window("2011-01-03", "2011-05-31"))).toThrow(/missing.*no forward-fill/i);
    const clean = fixture("normal");
    expect(() => simulateLongterm(clean, "STATIC-NEXT", window("2024-01-01", "2024-02-01"))).toThrow(/held-back/i);
    expect(() => getLongtermVariant("RADAR-SMALL")).toThrow(/Unknown Long Game variant/);
    const left = simulateLongterm(clean, "RADAR-NEXT", window("2011-01-03", "2011-05-31"));
    const right = simulateLongterm(clean, "RADAR-NEXT", window("2011-01-03", "2011-05-31"));
    expect(left.runIdentity.id).toBe(right.runIdentity.id);
    const control = simulateLongterm(clean, "STATIC-NEXT", window("2011-01-03", "2011-05-31"));
    expect(compareLongterm(left, control).benchmark).toBe("STATIC-NEXT");
    expect(() => compareLongterm(left, simulateLongterm(clean, "STATIC-MID", window("2011-01-03", "2011-05-31")))).toThrow(/compared only/);
  });
});

type Profile = "normal" | "crisis" | "warnings" | "static-drift" | "distribution";

function fixture(profile: Profile): LongtermDataset {
  const dates = weekdays("2010-01-01", "2012-12-31");
  const values = Object.fromEntries(LONGTERM_SERIES.map((key) => [key, new Map<string, number>()])) as Record<LongtermSeriesKey, Map<string, number>>;
  let risky = 100;
  let gold = 100;
  let liquid = 100;
  let normalCrash = false;
  let crisisCrash = false;
  for (let index = 0; index < dates.length; index++) {
    const date = dates[index];
    risky *= 1.0008;
    gold *= 1.00045;
    liquid *= 1.00018;
    if ((profile === "normal" || profile === "warnings") && date === "2011-02-07") {
      risky *= 0.9;
      gold *= 0.9;
      normalCrash = true;
    } else if (normalCrash && date <= "2011-03-11") {
      risky *= 1.02;
      gold *= 1.02;
    }
    if (profile === "warnings" && date >= "2011-07-01") {
      risky *= 0.992;
      gold *= 0.992;
    }
    if (profile === "crisis" && date === "2011-02-07") {
      risky *= 0.72;
      gold *= 0.72;
      crisisCrash = true;
    } else if (crisisCrash && date < "2011-03-07") {
      risky *= index % 2 ? 1.001 : 0.999;
      gold *= index % 2 ? 1.001 : 0.999;
    } else if (crisisCrash && date >= "2011-03-07" && date <= "2011-03-11") {
      risky *= 1.025;
      gold *= 1.025;
    }
    if (profile === "static-drift" && date === "2011-05-31") gold *= 1.8;
    if (profile === "distribution" && date === "2011-06-15") {
      risky *= 1.12;
      gold *= 1.08;
    }
    values.nifty50_tri.set(date, risky);
    values.nifty_next50_tri.set(date, risky * (1 + Math.sin(index / 31) * 0.001));
    values.nifty_midcap150_tri.set(date, risky * (1 + Math.cos(index / 29) * 0.001));
    values.goldbees_nav.set(date, gold);
    if (date >= "2011-01-01") values.nifty_1d_rate.set(date, liquid);
  }
  return { dates, values, provenance: [], fingerprint: `fixture-${profile}` };
}

function window(from: string, to: string) {
  return { window: { from, to } };
}

function weekdays(from: string, to: string): string[] {
  const dates: string[] = [];
  for (let cursor = Date.parse(`${from}T00:00:00Z`); cursor <= Date.parse(`${to}T00:00:00Z`); cursor += 86_400_000) {
    const day = new Date(cursor).getUTCDay();
    if (day !== 0 && day !== 6) dates.push(new Date(cursor).toISOString().slice(0, 10));
  }
  return dates;
}

function removeSession(dataset: LongtermDataset, date: string): LongtermDataset {
  const dates = dataset.dates.filter((item) => item !== date);
  const values = Object.fromEntries(LONGTERM_SERIES.map((key) => {
    const map = new Map(dataset.values[key]);
    map.delete(date);
    return [key, map];
  })) as Record<LongtermSeriesKey, Map<string, number>>;
  return { ...dataset, dates, values, fingerprint: `${dataset.fingerprint}-without-${date}` };
}

function mutateAfter(dataset: LongtermDataset, date: string, mutate: (value: number, index: number) => number): LongtermDataset {
  const values = Object.fromEntries(LONGTERM_SERIES.map((key) => {
    const map = new Map(dataset.values[key]);
    let changed = 0;
    for (const session of dataset.dates) {
      if (session <= date || key === "nifty_1d_rate") continue;
      map.set(session, mutate(map.get(session)!, changed++));
    }
    return [key, map];
  })) as Record<LongtermSeriesKey, Map<string, number>>;
  return { ...dataset, values, fingerprint: `${dataset.fingerprint}-changed-${date}` };
}

function nextSession(dates: string[], date: string): string {
  return dates.find((item) => item > date)!;
}

function previousSession(dates: string[], date: string): string {
  return [...dates].reverse().find((item) => item < date)!;
}

function weekKey(date: string): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - (value.getUTCDay() + 6) % 7);
  return value.toISOString().slice(0, 10);
}

function nextMonth(date: string): string {
  const value = new Date(`${date.slice(0, 7)}-01T00:00:00Z`);
  value.setUTCMonth(value.getUTCMonth() + 1);
  return value.toISOString().slice(0, 7);
}

function eventsThrough(events: { signalDate: string; sleeve: string; kind: string; stage?: number }[], date: string) {
  return events
    .filter((event) => event.signalDate <= date)
    .map((event) => ({ signalDate: event.signalDate, sleeve: event.sleeve, kind: event.kind, stage: event.stage }));
}
