import { describe, expect, it } from "vitest";
import { estimateCharges } from "@/lib/mlive/charges";
import { assertBuildingWindow, equityPeriods, orderedNets, overlapNote } from "@/lib/mlive/research-bar";
import type { Bar } from "../strategies/math";
import { emptyContext, type StrategyDef } from "../strategies/types";
import { VERIFIED_ACTIONS } from "./actions";
import { cleanSymbol, eligibilityAt } from "./clean";
import { roundTrip } from "./money";
import { runSwingPortfolio, type Candidate } from "./portfolio";
import { concentrationKeys } from "./stress";
import { walkSymbol } from "./walk";

describe("backtest integrity", () => {
  it("drops pre-listing bars and does not trade the placeholder scale", () => {
    const bars = [
      ...Array.from({ length: 9 }, (_, index) => bar(`2022-11-0${index + 1}`, 60, 1000)),
      bar("2022-11-16", 415.3, 100000),
    ];
    const cleaned = cleanSymbol("MEDANTA", bars, bars.map((item) => item.t), VERIFIED_ACTIONS);
    expect(cleaned.removed).toHaveLength(1);
    expect(cleaned.removed[0].bars).toBe(9);
    expect(cleaned.segments).toHaveLength(1);
    expect(cleaned.segments[0][0].t).toBe("2022-11-16");
    expect(cleaned.segments[0].some((item) => item.c < 100)).toBe(false);
  });

  it("starts a new segment on an unvalidated jump and keeps the earlier sessions", () => {
    const penny = Array.from({ length: 5 }, (_, index) => bar(`2020-08-${String(17 + index).padStart(2, "0")}`, 0.15, 1000));
    const real = bar("2020-08-21", 553.35, 20000);
    const days = [...penny, real].map((item) => item.t);
    const cleaned = cleanSymbol("PRIVISCL", [...penny, real], days, []);
    expect(cleaned.segments.length).toBeGreaterThan(1);
    expect(cleaned.segments.at(-1)?.[0].c).toBeCloseTo(553.35);
    expect(cleaned.segments[0].some((item) => item.c < 1)).toBe(true);
    expect(cleaned.removed).toHaveLength(0);
    expect(cleaned.segments.at(-1)?.[0].t).toBe("2020-08-21");
  });

  it("does not treat NMDC's opening gap as a valid demerger adjustment", () => {
    const before = Array.from({ length: 4 }, (_, index) => bar(`2022-10-${String(20 + index).padStart(2, "0")}`, 15.75, 5_000_000));
    const ex = { ...bar("2022-10-27", 29.25, 5_000_000), o: 25.8 };
    const cleaned = cleanSymbol("NMDC", [...before, ex], [...before, ex].map((item) => item.t), VERIFIED_ACTIONS);
    expect(cleaned.adjusted).toHaveLength(0);
    expect(cleaned.segments).toHaveLength(2);
    expect(cleaned.segments[1][0].c).toBeCloseTo(29.25);
    expect(cleaned.segments[0][0].c).toBeCloseTo(15.75);
    expect(cleaned.segmentsAudit[1].reason).toMatch(/demerger/i);
    expect(cleaned.segmentsAudit[1].reason).toMatch(/not treated as proof/i);
  });

  it("adjusts a confirmed split onto one scale, including volume", () => {
    const prior = [bar("2020-01-01", 200, 1000), bar("2020-01-02", 200, 1000)];
    const ex = { ...bar("2020-01-03", 102, 2000), o: 100 };
    const cleaned = cleanSymbol("SPLIT", [...prior, ex], ["2020-01-01", "2020-01-02", "2020-01-03"], [
      { symbol: "SPLIT", date: "2020-01-03", kind: "split", priceFactor: 0.5, note: "2-for-1 split" },
    ]);
    expect(cleaned.segments).toHaveLength(1);
    expect(cleaned.segments[0][0].c).toBeCloseTo(100);
    expect(cleaned.segments[0][0].v).toBeCloseTo(2000);
    expect(cleaned.adjusted).toHaveLength(1);
  });

  it("does not let a later gap invalidate the earlier segment", () => {
    const calendar = Array.from({ length: 40 }, (_, index) => `2020-01-${String(index + 1).padStart(2, "0")}`);
    const early = Array.from({ length: 10 }, (_, index) => bar(calendar[index], 100, 2_000_000));
    const late = [bar(calendar[35], 100, 2_000_000)];
    const cleaned = cleanSymbol("GAP", [...early, ...late], calendar, []);
    expect(cleaned.segments).toHaveLength(2);
    expect(cleaned.segments[0]).toHaveLength(10);
    expect(cleaned.masked.some((row) => row.symbol === "GAP" && row.from === early[0].t)).toBe(true);
  });

  it("requires 250 clean sessions before traded value is applied", () => {
    const thin = Array.from({ length: 260 }, (_, index) => bar(day(index), 100, 1000));
    const thick = thin.map((item) => ({ ...item, v: 2_000_000 }));
    expect(eligibilityAt(thin, 248)).toBe("history");
    expect(eligibilityAt(thin, 249)).toBe("value");
    expect(eligibilityAt(thick, 249)).toBe("ok");
  });

  it("refuses a window that is not the 2019-2023 building sample", () => {
    expect(() => assertBuildingWindow("heldback", { from: "2024-01-01", to: "2026-01-01" })).toThrow(/building/);
    expect(() => assertBuildingWindow("building", { from: "2019-01-01", to: "2023-12-31" })).not.toThrow();
  });

  it("scores half-years from equity endpoints, including a flat period", () => {
    const periods = equityPeriods(
      [
        { date: "2019-03-29", value: 90000 },
        { date: "2019-06-28", value: 88000 },
      ],
      80000,
      "2019-01-01",
      "2019-12-31",
      "half"
    );
    expect(periods.map((period) => period.key)).toEqual(["2019-H1", "2019-H2"]);
    expect(periods[0].start).toBe(80000);
    expect(periods[0].end).toBe(88000);
    expect(periods[0].profitable).toBe(true);
    expect(periods[1].start).toBe(88000);
    expect(periods[1].end).toBe(88000);
    expect(periods[1].profitable).toBe(false);
  });

  it("counts losing streaks in exit order and ignores nothing but the given trades", () => {
    const nets = orderedNets([
      { symbol: "BBB", exitDate: "2020-01-02", exitTs: "2020-01-02", net: -1 },
      { symbol: "AAA", exitDate: "2020-01-02", exitTs: "2020-01-02", net: -1 },
      { symbol: "CCC", exitDate: "2020-01-03", exitTs: "2020-01-03T10:00:00", net: 5 },
      { symbol: "DDD", exitDate: "2020-01-03", exitTs: "2020-01-03T09:00:00", net: -1 },
    ]);
    expect(nets).toEqual([-1, -1, -1, 5]);
  });

  it("keeps an end-of-window lot out of the closed trades and in the equity", () => {
    const held = heldCandidate("OPEN");
    held.exitReason = "open";
    held.exitPx = 150;
    held.marks = [
      { date: "2024-01-02", close: 100, open: 100 },
      { date: "2024-01-03", close: 120, open: 110 },
      { date: "2024-01-04", close: 150, open: 130 },
    ];
    const result = runSwingPortfolio([held], bookRules(80_000), ["2024-01-02", "2024-01-03", "2024-01-04"]);
    expect(result.trades).toHaveLength(0);
    expect(result.openPositions).toHaveLength(1);
    expect(result.unrealisedIncludesExitCharges).toBe(false);
    const end = result.equity[result.equity.length - 1].value;
    expect(end - 80_000).toBeCloseTo(result.unrealised, 6);
    expect(end).toBeGreaterThan(80_000);
  });

  it("sizes the next order from morning equity rather than the starting fund", () => {
    const first = heldCandidate("AAA");
    first.exitDate = "2024-01-03";
    first.exitPx = 200;
    first.marks = [{ date: "2024-01-02", close: 100, open: 100 }];
    const second = heldCandidate("BBB");
    second.entryDate = "2024-01-04";
    second.entryTs = "2024-01-04";
    second.marks = [{ date: "2024-01-04", close: 100, open: 100 }];
    const result = runSwingPortfolio([first, second], bookRules(80_000), ["2024-01-02", "2024-01-03", "2024-01-04"]);
    expect(result.trades[0].qty).toBe(80);
    expect(result.trades[1].qty).toBeGreaterThan(result.trades[0].qty);
  });

  it("sizes RS to the GTT plus a further 1% gap", () => {
    const held = heldCandidate("RS");
    held.riskStop = 90 * 0.97 * 0.99;
    const result = runSwingPortfolio([held], bookRules(80_000), ["2024-01-02", "2024-01-03"]);
    expect(result.trades[0].qty).toBe(58);
  });

  it("uses the intraday charge schedule when the round trip is the same session", () => {
    const held = heldCandidate("DAY");
    held.exitDate = "2024-01-02";
    held.exitTs = "2024-01-02";
    held.exitPx = 110;
    const result = runSwingPortfolio([held], bookRules(80_000), ["2024-01-02"]);
    const trade = result.trades[0];
    const intraday = roundTrip({ side: "long", entryPx: trade.entryPx, exitPx: trade.exitPx, qty: trade.qty, intraday: true });
    const delivery = roundTrip({ side: "long", entryPx: trade.entryPx, exitPx: trade.exitPx, qty: trade.qty, intraday: false });
    expect(trade.charges).toBeCloseTo(intraday.charges, 6);
    expect(delivery.charges).toBeGreaterThan(intraday.charges);
    expect(estimateCharges("SELL", trade.exitPx * trade.qty, undefined, true).dp).toBe(0);
  });

  it("fills from a 09:45 bar and ignores a better price before the order exists", () => {
    const bars = limitDays();
    const early: Bar[] = [
      { t: "2024-01-03 09:20:00", o: 90, h: 91, l: 89, c: 90, v: 100 },
      { t: "2024-01-03 09:50:00", o: 100.6, h: 100.8, l: 100.4, c: 100.7, v: 100 },
    ];
    const stats = { attempted: 0, unfilled: 0, dailyApprox: 0, intraday: 0, ambiguous: 0 };
    const missed = walkSymbol(limitStrategy(80), emptyContext(bars), {
      ...walkOpts(),
      stats,
      sessionBars: () => [early[0]],
    });
    expect(missed.opens).toHaveLength(0);
    const filled = walkSymbol(limitStrategy(80), emptyContext(bars), {
      ...walkOpts(),
      sessionBars: () => early,
    });
    expect(filled.opens).toHaveLength(1);
    expect(filled.opens[0].fill).toBe("intraday");
    expect(filled.opens[0].entryPx).toBeCloseTo(100.5, 2);
  });

  it("counts a same-bar daily stop as ambiguous and uses the adverse order", () => {
    const bars = limitDays();
    bars[1] = { ...bars[1], l: 70, h: 101, o: 100, c: 100 };
    const stats = { attempted: 0, unfilled: 0, dailyApprox: 0, intraday: 0, ambiguous: 0 };
    const walked = walkSymbol(limitStrategy(80), emptyContext(bars), { ...walkOpts(), stats });
    expect(walked.trades).toHaveLength(1);
    expect(walked.trades[0].exitReason).toBe("stop");
    expect(walked.trades[0].ambiguous).toBe(true);
    expect(stats.ambiguous).toBe(1);
    expect(walked.opens).toHaveLength(0);
  });

  it("removes a winner's profit and replays later size from the reduced equity", () => {
    const winner = heldCandidate("WIN");
    winner.exitDate = "2024-01-03";
    winner.exitPx = 200;
    winner.marks = [{ date: "2024-01-02", close: 100, open: 100 }];
    const next = heldCandidate("NEXT");
    next.entryDate = "2024-01-04";
    next.entryTs = "2024-01-04";
    next.marks = [{ date: "2024-01-04", close: 100, open: 100 }];
    const rules = bookRules(80_000);
    const days = ["2024-01-02", "2024-01-03", "2024-01-04"];
    const base = runSwingPortfolio([winner, next], rules, days);
    const muted = runSwingPortfolio([winner, next], rules, days, { mute: concentrationKeys(base.trades, 1) });
    expect(muted.trades[0].net).toBe(0);
    expect(muted.trades[1].qty).toBeLessThan(base.trades[1].qty);
  });

  it("states both overlap directions and the combined-book caveat", () => {
    expect(overlapNote("RS", "Momentum", 0.25, 0.5)).toMatch(/RS's losing days also lost by Momentum: 25\.0%/);
    expect(overlapNote("RS", "Momentum", 0.25, 0.5)).toMatch(/combined-book/);
  });
});

function bar(date: string, close: number, volume: number): Bar {
  return { t: date, o: close, h: close * 1.01, l: close * 0.99, c: close, v: volume };
}

function day(index: number): string {
  const date = new Date(Date.UTC(2019, 0, 1 + index));
  return date.toISOString().slice(0, 10);
}

function heldCandidate(symbol: string): Candidate {
  return {
    symbol,
    sector: symbol,
    side: "long",
    score: 1,
    entryDate: "2024-01-02",
    exitDate: "2024-01-04",
    entryTs: "2024-01-02",
    exitTs: "2024-01-04",
    entryPx: 100,
    exitPx: 110,
    stop: 90,
    exitReason: "rule",
    barsHeld: 2,
    priceStop: true,
    marks: [
      { date: "2024-01-02", close: 100, open: 100 },
      { date: "2024-01-03", close: 110, open: 105 },
    ],
  };
}

function bookRules(capital: number) {
  return {
    capital,
    riskPct: 0.01,
    maxOrderPct: 0.25,
    minOrderInr: 1000,
    cashReserve: 0,
    maxNewBuys: 2,
    maxOpen: 6,
    maxPerSector: 2,
    maxDailyDeployPct: 1,
  };
}

function limitStrategy(stop: number): StrategyDef {
  return {
    name: "limit",
    book: "swing",
    params: {},
    signals: () => [{ at: 0, side: "long", score: 1, stop, useLimit: true }],
    afterClose: () => ({ exit: false, stop }),
  };
}

function limitDays(): Bar[] {
  return [
    { t: "2024-01-02", o: 100, h: 101, l: 99, c: 100, v: 1000 },
    { t: "2024-01-03", o: 100, h: 101, l: 99, c: 100, v: 1000 },
    { t: "2024-01-04", o: 100, h: 101, l: 99, c: 100, v: 1000 },
  ];
}

function walkOpts() {
  return {
    symbol: "INFY",
    tick: 0.05,
    slip: 0,
    from: "2024-01-01",
    to: "2024-12-31",
    gttGap: 0.03,
    limitOffset: 0.005,
    chasePct: 0.03,
  };
}
