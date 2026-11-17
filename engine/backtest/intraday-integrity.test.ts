import { describe, expect, it } from "vitest";
import { seriesPlans } from "../jobs/market";
import { vwapStrategy } from "../strategies/vwap";
import type { Bar } from "../strategies/math";
import { defaultParams, emptyContext, type StrategyDef } from "../strategies/types";
import { intradayWarmup, intradayWarmupNote, simulateIntraday } from "./intraday";
import { shiftDays } from "./session";
import { orbStrategy } from "../strategies/orb";
import { selectIntraday, walkSession, type SessionTrade } from "./intraday-sim";

describe("intraday backtest integrity", () => {
  it("waits for a real post-warmup VWAP cross instead of entering from the first bar", () => {
    const bars = minuteBars([
      ...Array.from({ length: 15 }, () => 100),
      102,
      95,
      95,
      110,
      110,
    ]);
    const ctx = emptyContext(bars, defaultParams(vwapStrategy));
    ctx.atr = 1;
    ctx.cache = new Map([["selectionScore", 42]]);
    const signals = vwapStrategy.signals(ctx);

    expect(signals.map((signal) => [signal.at, signal.side])).toEqual([
      [16, "short"],
      [18, "long"],
    ]);
    expect(signals.every((signal) => signal.score === 42)).toBe(true);
  });

  it("exits and enters the opposite side at the same next-bar open", () => {
    const bars = minuteBars([100, 100, 100, 100, 100]);
    const strategy: StrategyDef = {
      name: "flip-test",
      book: "intraday",
      params: {},
      signals: () => [
        { at: 0, side: "long", score: 1, stop: 90 },
        { at: 2, side: "short", score: 1, stop: 110 },
      ],
      afterClose: (ctx, i) => ({ exit: i === 2, stop: ctx.stop }),
      bracket: (entry, signal) => ({
        stop: signal.side === "long" ? entry - 10 : entry + 10,
        target: null,
      }),
    };

    const trades = walkSession(strategy, emptyContext(bars), {
      symbol: "AAA",
      tick: 0.05,
      slip: 0,
      entryAfter: "09:18",
      exitTime: "09:19",
    });

    expect(trades).toHaveLength(2);
    expect(trades[0]).toMatchObject({ side: "long", exitReason: "rule" });
    expect(trades[1]).toMatchObject({ side: "short", exitReason: "time" });
    expect(trades[1].entryTs).toBe(trades[0].exitTs);
  });

  it("applies adverse slippage when a stop is gapped", () => {
    const bars = minuteBars([100, 100, 90]);
    bars[2] = { ...bars[2], o: 90, h: 91, l: 89, c: 90 };
    const strategy: StrategyDef = {
      name: "gap-test",
      book: "intraday",
      params: {},
      signals: () => [{ at: 0, side: "long", score: 1, stop: 95 }],
      afterClose: (ctx) => ({ exit: false, stop: ctx.stop }),
      bracket: () => ({ stop: 95, target: null }),
    };

    const trades = walkSession(strategy, emptyContext(bars), {
      symbol: "AAA",
      tick: 0.05,
      slip: 0.01,
      entryAfter: "14:30",
      exitTime: "15:00",
    });

    expect(trades).toHaveLength(1);
    expect(trades[0].exitReason).toBe("stop");
    expect(trades[0].exitPx).toBeCloseTo(89.1, 2);
  });

  it("compounds risk from start-of-day equity", () => {
    const first = candidate("2024-01-02", "AAA", "10:00:00", "11:00:00", 100, 102, 99);
    const second = candidate("2024-01-03", "BBB", "10:00:00", "11:00:00", 100, 102, 99);
    const result = selectIntraday([first, second], rules(), ["2024-01-02", "2024-01-03"]);

    expect(result.trades).toHaveLength(2);
    expect(result.trades[1].qty).toBeGreaterThan(result.trades[0].qty);
  });

  it("halts new trades on unrealised losses and at the exact loss timestamp", () => {
    const openLoss = candidate("2024-01-02", "AAA", "10:00:00", "12:00:00", 100, 100, 95);
    openLoss.marks = [
      { ts: "2024-01-02 10:00:00", close: 100 },
      { ts: "2024-01-02 11:00:00", close: 90 },
    ];
    const blocked = candidate("2024-01-02", "BBB", "11:00:00", "11:30:00", 100, 101, 99);
    const result = selectIntraday([openLoss, blocked], rules(), ["2024-01-02"]);

    expect(result.trades.map((trade) => trade.symbol)).toEqual(["AAA"]);

    const realisedLoss = candidate("2024-01-03", "CCC", "10:00:00", "11:00:00", 100, 85, 95);
    const sameTime = candidate("2024-01-03", "DDD", "11:00:00", "11:30:00", 100, 101, 99);
    const exact = selectIntraday([realisedLoss, sameTime], rules(), ["2024-01-03"]);
    expect(exact.trades.map((trade) => trade.symbol)).toEqual(["CCC"]);
  });

  it("keeps one-minute files for the full building sample", () => {
    const oneMinute = seriesPlans("2026-11-17").find((plan) => plan.id === "1m-files");
    expect(oneMinute?.from).toBe("2024-11-18");
  });

  it("fails research instead of treating missing selected sessions as flat days", async () => {
    const stock = dailyHistory("2024-01-02", 22);
    await expect(simulateIntraday({
      strategies: [vwapStrategy],
      grid: false,
      sample: "building",
      window: { from: "2024-01-02", to: "2024-01-02" },
      rules: rules(),
      slip: 0.001,
      tick: new Map([["AAA", 0.05]]),
      exitTime: "15:00",
      entryAfter: "14:30",
      stream: async () => undefined,
      orbSymbols: [],
      vwapSymbols: ["AAA"],
      daily: async (symbol) => symbol === "NIFTY 50"
        ? [{ t: "2024-01-02", o: 100, h: 101, l: 99, c: 100, v: 1 }]
        : stock,
    })).rejects.toThrow(/selected-session coverage 0%/);
  });

  it("starts ORB coverage after 20 sessions from the first 5-minute file", async () => {
    const days = sessions("2024-11-18", 25);
    const readFrom = shiftDays(days[0], -40);
    const warmup = intradayWarmup({ observedDays: days, windowDays: days, readFrom });
    expect(warmup.alreadyWarm).toBe(false);
    expect(warmup.firstFileDay).toBe("2024-11-18");
    expect(warmup.firstTradeDay).toBe(days[20]);
    expect(warmup.tradeDays).toEqual(days.slice(20));
    expect(intradayWarmupNote("ORB", warmup)).toMatch(/first 5-minute file day 2024-11-18/);
    expect(intradayWarmupNote("ORB", warmup)).toMatch(new RegExp(days[20]));

    const result = await simulateIntraday({
      strategies: [orbStrategy],
      grid: false,
      sample: "building",
      window: { from: days[0], to: days[24] },
      rules: rules(),
      slip: 0.001,
      tick: new Map([["AAA", 0.05]]),
      exitTime: "15:15",
      entryAfter: "09:20",
      stream: async (_symbol, _kind, _from, _to, visit) => {
        for (const day of days) visit(day, sessionBars(day));
      },
      orbSymbols: ["AAA"],
      vwapSymbols: [],
      daily: async () => days.map((day) => ({ t: day, o: 100, h: 101, l: 99, c: 100, v: 1 })),
    });
    expect(result.note).toMatch(/first trade day/);
    expect(result.scored.length).toBeGreaterThan(0);
  });

  it("does not treat the first ORB file day as a coverage failure", async () => {
    const days = sessions("2024-11-18", 5);
    await expect(simulateIntraday({
      strategies: [orbStrategy],
      grid: false,
      sample: "building",
      window: { from: days[0], to: days[4] },
      rules: rules(),
      slip: 0.001,
      tick: new Map([["INFY", 0.05]]),
      exitTime: "15:15",
      entryAfter: "09:20",
      stream: async (_symbol, _kind, _from, _to, visit) => {
        for (const day of days) visit(day, sessionBars(day));
      },
      orbSymbols: ["INFY"],
      vwapSymbols: [],
      daily: async () => days.map((day) => ({ t: day, o: 100, h: 101, l: 99, c: 100, v: 1 })),
    })).rejects.toThrow(/warm-up/);
  });

  it("keeps a later intraday sample when the warm-up was already loaded", () => {
    const windowDays = sessions("2026-05-01", 10);
    const observed = sessions("2026-03-22", 50);
    const warmup = intradayWarmup({ observedDays: observed, windowDays, readFrom: "2026-03-22" });
    expect(warmup.alreadyWarm).toBe(true);
    expect(warmup.tradeDays).toEqual(windowDays);
    expect(intradayWarmupNote("VWAP", { ...warmup, alreadyWarm: true })).toMatch(/already in the data/);
  });

  it("starts VWAP ranking coverage after 20 daily sessions", async () => {
    const days = sessions("2024-11-18", 25);
    const result = await simulateIntraday({
      strategies: [vwapStrategy],
      grid: false,
      sample: "building",
      window: { from: days[0], to: days[24] },
      rules: rules(),
      slip: 0.001,
      tick: new Map([["AAA", 0.05]]),
      exitTime: "15:00",
      entryAfter: "09:20",
      stream: async (_symbol, _kind, _from, _to, visit) => {
        for (const day of days) visit(day, sessionBars(day));
      },
      orbSymbols: [],
      vwapSymbols: ["AAA"],
      daily: async (symbol) => symbol === "NIFTY 50"
        ? days.map((day) => ({ t: day, o: 100, h: 101, l: 99, c: 100, v: 1 }))
        : days.map((day, index) => ({ t: day, o: 100, h: 101, l: 99, c: 100 + index, v: 1_000_000 })),
    });
    expect(result.note).toMatch(/first daily file day 2024-11-18/);
    expect(result.note).toContain(days[20]);
    expect(result.scored.length).toBeGreaterThan(0);
  });
});

function sessions(start: string, count: number): string[] {
  const days = [start];
  for (let i = 1; i < count; i++) days.push(shiftDays(days[i - 1], 1));
  return days;
}

function sessionBars(day: string): Bar[] {
  return [15, 20, 25, 30].map((minute) => ({
    t: `${day} 09:${String(minute).padStart(2, "0")}:00`,
    o: 100,
    h: 101,
    l: 99,
    c: 100,
    v: 1000,
  }));
}

function minuteBars(closes: number[]): Bar[] {
  return closes.map((close, index) => {
    const minute = 9 * 60 + 15 + index;
    const clock = `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}:00`;
    return {
      t: `2024-01-02 ${clock}`,
      o: close,
      h: close + 0.01,
      l: close - 0.01,
      c: close,
      v: 1000,
    };
  });
}

function candidate(
  day: string,
  symbol: string,
  entry: string,
  exit: string,
  entryPx: number,
  exitPx: number,
  stop: number
): SessionTrade {
  return {
    symbol,
    day,
    side: "long",
    score: 1,
    entryTs: `${day} ${entry}`,
    exitTs: `${day} ${exit}`,
    entryPx,
    exitPx,
    stop,
    exitReason: "rule",
    barsHeld: 1,
  };
}

function rules() {
  return {
    capital: 10_000,
    riskPct: 0.01,
    leverage: 1,
    maxTrades: 4,
    dayLossPct: 0.02,
    short: true,
  };
}

function dailyHistory(last: string, count: number): Bar[] {
  const end = Date.parse(`${last}T00:00:00Z`);
  return Array.from({ length: count }, (_, index) => {
    const t = new Date(end - (count - 1 - index) * 86400000).toISOString().slice(0, 10);
    return { t, o: 100, h: 101, l: 99, c: 100 + index * 0.1, v: 1_000_000 };
  });
}
