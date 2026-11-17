import { describe, expect, it } from "vitest";
import { estimateCharges } from "@/lib/mlive/charges";
import { heldbackBlock, profitablePeriods, profitFactor, scoreResearch, worstDrawdownPct } from "@/lib/mlive/research-bar";
import { STRATEGIES } from "../strategies";
import type { Bar } from "../strategies/math";
import { orbStrategy } from "../strategies/orb";
import { defaultParams, emptyContext, type Signal, type SignalContext, type StrategyDef } from "../strategies/types";
import { parseResearchArgs } from "./args";
import { selectIntraday, walkSession, type SessionTrade } from "./intraday-sim";
import { roundTrip } from "./money";
import { runSwingPortfolio, type Candidate } from "./portfolio";
import { researchWindowEnded, researchWindowOpen } from "./schedule";

function daily(count: number): Bar[] {
  const out: Bar[] = [];
  let price = 100;
  let cursor = Date.UTC(2018, 0, 2);
  for (let i = 0; i < count; i++) {
    while (new Date(cursor).getUTCDay() % 6 === 0) cursor += 86400000;
    const open = price;
    const close = Math.max(1, price * (1 + 0.0015 + Math.sin(i / 11) * 0.008));
    const dipped = i % 21 === 0 ? close * 0.97 : close;
    out.push({
      t: new Date(cursor).toISOString().slice(0, 10),
      o: open,
      h: Math.max(open, dipped) * 1.008,
      l: Math.min(open, dipped) * 0.992,
      c: dipped,
      v: 100000 + (i % 23) * 4000,
    });
    price = dipped;
    cursor += 86400000;
  }
  return out;
}

function contextFor(strategy: StrategyDef, bars: Bar[], index: Bar[]): SignalContext {
  const ctx = emptyContext(bars, defaultParams(strategy));
  const up = new Map<string, number>();
  for (let i = 199; i < index.length; i++) {
    let sum = 0;
    for (let k = i - 199; k <= i; k++) sum += index[k].c;
    up.set(index[i].t, index[i].c > sum / 200 ? 1 : 0);
  }
  const indexClose = new Map(index.map((bar) => [bar.t, bar.c]));
  for (let i = 0; i < bars.length; i++) {
    ctx.indexClose[i] = indexClose.get(bars[i].t) ?? Number.NaN;
    ctx.indexUp[i] = up.get(bars[i].t) ?? 0;
    if (i >= 90) {
      ctx.rank[i] = 1;
      ctx.rankN[i] = 50;
    }
  }
  ctx.atr = 1.5;
  return ctx;
}

function sameSignals(left: Signal[], right: Signal[]) {
  expect(right.map((signal) => signal.at)).toEqual(left.map((signal) => signal.at));
  right.forEach((signal, index) => {
    expect(signal.side).toBe(left[index].side);
    expect(signal.score).toBeCloseTo(left[index].score, 6);
    expect(signal.stop).toBeCloseTo(left[index].stop, 6);
  });
}

describe("research backtest", () => {
  it("does not look ahead on or before day N", () => {
    const stock = daily(320);
    const index = stock.map((bar, i) => ({ ...bar, o: 1000 + i, h: 1001 + i, l: 999 + i, c: 1000 + i }));
    const session = fiveMinute("2024-11-18");
    for (const strategy of STRATEGIES) {
      const bars = strategy.book === "swing" ? stock : session;
      const bench = strategy.book === "swing" ? index : session;
      const cut = strategy.book === "swing" ? 240 : 20;
      const before = strategy.signals(contextFor(strategy, bars, bench));
      const changed = bars.map((bar, i) => i <= cut ? bar : { ...bar, o: bar.o * 2.4, h: bar.h * 2.6, l: bar.l * 0.4, c: bar.c * 0.55, v: bar.v + 17 });
      const changedIndex = bench.map((bar, i) => i <= cut ? bar : { ...bar, o: bar.o * 0.4, h: bar.h * 0.5, l: bar.l * 0.3, c: bar.c * 0.45 });
      const after = strategy.signals(contextFor(strategy, changed, changedIndex));
      sameSignals(before.filter((signal) => signal.at <= cut), after.filter((signal) => signal.at <= cut));
      const full = contextFor(strategy, bars, bench);
      const next = contextFor(strategy, changed, changedIndex);
      for (let i = 40; i <= cut; i++) {
        const state = { entryAt: Math.max(0, i - 5), side: "long" as const, stop: bars[Math.max(0, i - 5)].c * 0.95 };
        const left = strategy.afterClose({ ...full, ...state }, i);
        const right = strategy.afterClose({ ...next, ...state }, i);
        expect(right.exit).toBe(left.exit);
        expect(right.stop).toBeCloseTo(left.stop, 5);
      }
    }
  });

  it("charges a delivery round trip and an MIS round trip on the real quantity", () => {
    const qty = 25;
    const entry = 400;
    const exit = 420;
    const delivery = roundTrip({ side: "long", entryPx: entry, exitPx: exit, qty, intraday: false });
    expect(delivery.charges).toBe(estimateCharges("BUY", entry * qty).total + estimateCharges("SELL", exit * qty).total);
    const mis = roundTrip({ side: "short", entryPx: entry, exitPx: 390, qty, intraday: true });
    expect(mis.charges).toBe(estimateCharges("SELL", entry * qty, undefined, true).total + estimateCharges("BUY", 390 * qty, undefined, true).total);
  });

  it("keeps the swing book inside the live order rules", () => {
    const names = ["AAA", "BBB", "CCC"];
    const candidates = names.map((symbol, index) => candidate(symbol, 3 - index));
    const result = runSwingPortfolio(candidates, {
      capital: 80_000,
      riskPct: 0.01,
      maxOrderPct: 0.25,
      minOrderInr: 8_000,
      cashReserve: 500,
      maxNewBuys: 2,
      maxOpen: 6,
      maxPerSector: 2,
      maxDailyDeployPct: 0.5,
    }, ["2024-01-02", "2024-01-03", "2024-01-04", "2024-01-05"]);
    expect(result.trades).toHaveLength(2);
    expect(result.trades.map((trade) => trade.symbol).sort()).toEqual(["AAA", "BBB"]);
    const buys = new Map<string, number>();
    for (const trade of result.trades) {
      expect(trade.qty * trade.entryPx).toBeLessThanOrEqual(80_000 * 0.25 + 1e-6);
      buys.set(trade.entryDate, (buys.get(trade.entryDate) ?? 0) + 1);
    }
    for (const count of buys.values()) expect(count).toBeLessThanOrEqual(2);
    expect(result.minCash).toBeGreaterThanOrEqual(-0.01);
  });

  it("ignores bars after 15:15, flattens at the exit time, and stops the day after −2%", () => {
    const bars = fiveMinute("2024-11-18");
    bars[3] = { ...bars[3], h: bars[3].h + 2, c: bars[3].c + 1 };
    const trades = walkSession(orbStrategy, contextFor(orbStrategy, bars, bars), {
      symbol: "INFY",
      tick: 0.05,
      slip: 0.001,
      exitTime: "15:00",
      entryAfter: "14:30",
    });
    expect(trades.length).toBeGreaterThan(0);
    for (const trade of trades) {
      expect(trade.exitTs.includes("15:2")).toBe(false);
      expect(trade.exitTs.slice(11, 16) <= "15:00").toBe(true);
      expect(trade.exitTs.slice(11, 16) >= "09:15").toBe(true);
    }
    const spiked = bars.map((bar, index) => index < bars.length - 2 ? bar : { ...bar, l: 1, c: 1, o: 1 });
    const again = walkSession(orbStrategy, contextFor(orbStrategy, spiked, spiked), {
      symbol: "INFY",
      tick: 0.05,
      slip: 0.001,
      exitTime: "15:00",
      entryAfter: "14:30",
    });
    expect(again.map((trade) => trade.exitPx)).toEqual(trades.map((trade) => trade.exitPx));

    const day = selectIntraday(
      [sessionTrade("AAA", "10:00:00", "10:30:00", 100, 90), sessionTrade("BBB", "11:00:00", "11:30:00", 100, 101)],
      { capital: 20_000, riskPct: 0.01, leverage: 1, maxTrades: 4, dayLossPct: 0.02, short: true },
      ["2024-11-18"]
    );
    expect(day.trades.map((trade) => trade.symbol)).toEqual(["AAA"]);
  });

  it("scores profit factor, drawdown and half-years on a fixed list", () => {
    expect(profitFactor([100, 50, -40])).toBeCloseTo(3.75);
    expect(worstDrawdownPct([10000, 10100, 10150, 10110])).toBeCloseTo((40 / 10150) * 100);
    const monthly = { "2024-01": 1, "2024-02": -2, "2024-03": 1, "2024-07": 1, "2024-08": -0.2 };
    expect(profitablePeriods(monthly, false)).toMatchObject({ profitable: 1, total: 2 });
    const scored = scoreResearch({
      book: "swing",
      sample: "building",
      nets: [10, -5],
      netPcts: [1, -0.4],
      monthly,
      equity: [80000, 79000],
      equityStart: 80000,
      equityEnd: 79000,
      windowFrom: "2019-01-01",
      windowTo: "2023-12-31",
    });
    expect(scored.passed).toBe(false);
    expect(scored.failReasons.some((reason) => reason.startsWith("Trades"))).toBe(true);
    expect(scored.quarters).toBe(false);
    const intraday = scoreResearch({
      book: "intraday",
      sample: "building",
      nets: [1],
      netPcts: [0.2],
      monthly: { "2024-11": 0.2, "2024-12": -0.1 },
      equity: [20000, 20020],
      equityStart: 20000,
      equityEnd: 20020,
      windowFrom: "2024-11-18",
      windowTo: "2026-04-30",
    });
    expect(intraday.quarters).toBe(true);
  });

  it("refuses a second held-back run unless forced", () => {
    expect(heldbackBlock(["ema_v2"], ["ema_v2", "rsi2"], false)).toMatch(/ema_v2/);
    expect(heldbackBlock(["ema_v2"], ["ema_v2"], true)).toBeNull();
    expect(heldbackBlock([], ["ema_v2"], false)).toBeNull();
    expect(parseResearchArgs(["--book", "intraday", "--heldback", "--no-grid", "--only", "infy,tcs", "--strategy", "orb"])).toEqual({
      book: "intraday",
      strategies: ["orb"],
      sample: "heldback",
      force: false,
      grid: false,
      only: ["INFY", "TCS"],
    });
  });

  it("starts only with 60 minutes left and stops at the trading window", () => {
    expect(researchWindowOpen(16 * 60)).toBe(true);
    expect(researchWindowOpen(16 * 60 + 55)).toBe(true);
    expect(researchWindowOpen(16 * 60 + 56)).toBe(false);
    expect(researchWindowOpen(17 * 60 + 54)).toBe(false);
    expect(researchWindowOpen(20 * 60)).toBe(true);
    expect(researchWindowOpen(0)).toBe(true);
    expect(researchWindowOpen(7 * 60)).toBe(true);
    expect(researchWindowOpen(7 * 60 + 1)).toBe(false);
    expect(researchWindowOpen(8 * 60)).toBe(false);
    expect(researchWindowOpen(15 * 60 + 59)).toBe(false);
    expect(researchWindowOpen(19 * 60)).toBe(false);

    expect(researchWindowEnded(16 * 60 + 56)).toBe(false);
    expect(researchWindowEnded(17 * 60 + 54)).toBe(false);
    expect(researchWindowEnded(17 * 60 + 55)).toBe(true);
    expect(researchWindowEnded(19 * 60)).toBe(true);
    expect(researchWindowEnded(20 * 60)).toBe(false);
    expect(researchWindowEnded(7 * 60)).toBe(false);
    expect(researchWindowEnded(7 * 60 + 59)).toBe(false);
    expect(researchWindowEnded(8 * 60)).toBe(true);
    expect(researchWindowEnded(15 * 60 + 59)).toBe(true);
  });
});

function candidate(symbol: string, score: number): Candidate {
  return {
    symbol,
    sector: "Bank",
    side: "long",
    score,
    entryDate: "2024-01-02",
    exitDate: "2024-01-05",
    entryTs: "2024-01-02",
    exitTs: "2024-01-05",
    entryPx: 100,
    exitPx: 110,
    stop: 99,
    exitReason: "rule",
    barsHeld: 3,
    marks: [
      { date: "2024-01-02", close: 100 },
      { date: "2024-01-03", close: 104 },
      { date: "2024-01-04", close: 108 },
    ],
  };
}

function sessionTrade(symbol: string, entry: string, exit: string, entryPx: number, exitPx: number): SessionTrade {
  return {
    symbol,
    day: "2024-11-18",
    side: "long",
    score: 1,
    entryTs: `2024-11-18 ${entry}`,
    exitTs: `2024-11-18 ${exit}`,
    entryPx,
    exitPx,
    stop: 96,
    exitReason: "stop",
    barsHeld: 4,
  };
}

function fiveMinute(day: string): Bar[] {
  const out: Bar[] = [];
  let price = 100;
  for (let i = 0; i < 75; i++) {
    const minutes = 9 * 60 + 15 + i * 5;
    const hh = String(Math.floor(minutes / 60)).padStart(2, "0");
    const mm = String(minutes % 60).padStart(2, "0");
    const open = price;
    const close = price * 1.0002;
    out.push({
      t: `${day} ${hh}:${mm}:00`,
      o: open,
      h: Math.max(open, close) + 0.05,
      l: Math.min(open, close) - 0.05,
      c: close,
      v: 5000 + i,
    });
    price = close;
  }
  return out;
}
