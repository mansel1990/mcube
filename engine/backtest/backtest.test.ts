import { describe, expect, it } from "vitest";
import { estimateCharges } from "@/lib/mlive/charges";
import { heldbackBlock, heldbackSubjects, profitablePeriods, profitFactor, scoreResearch, worstDrawdownPct } from "@/lib/mlive/research-bar";
import { STRATEGIES } from "../strategies";
import type { Bar } from "../strategies/math";
import { orbStrategy } from "../strategies/orb";
import { defaultParams, emptyContext, type Signal, type SignalContext, type StrategyDef } from "../strategies/types";
import { parseResearchArgs, queueResearchArgs } from "./args";
import { selectIntraday, walkSession, type SessionTrade } from "./intraday-sim";
import { roundTrip } from "./money";
import { runSwingPortfolio, type Candidate } from "./portfolio";
import { walkSymbol } from "./walk";
import { indexAllows } from "../strategies/index-filter";
import { momentum } from "../strategies/momentum";
import { rsResilience } from "../strategies/rs";
import { weekdayUtc } from "../strategies/indicators";
import { ANYTIME_ON_SERVER, guardResearchAnytime, researchWindowEnded, researchWindowOpen, shouldStopResearch } from "./schedule";

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

  it("measures exposure against that day's equity", () => {
    const held = candidate("WIN", 1);
    held.entryPx = 100;
    held.exitPx = 200;
    held.stop = 50;
    held.marks = [
      { date: "2024-01-02", close: 100 },
      { date: "2024-01-03", close: 150 },
      { date: "2024-01-04", close: 200 },
    ];
    const result = runSwingPortfolio([held], {
      capital: 10_000,
      riskPct: 1,
      maxOrderPct: 1,
      minOrderInr: 1,
      cashReserve: 0,
      maxNewBuys: 2,
      maxOpen: 6,
      maxPerSector: 2,
      maxDailyDeployPct: 1,
    }, ["2024-01-02", "2024-01-03", "2024-01-04", "2024-01-05"]);
    expect(result.trades).toHaveLength(1);
    expect(result.minCash).toBeGreaterThanOrEqual(-0.01);
    expect(result.exposurePct).toBeLessThanOrEqual(100);
    expect(result.exposurePct).toBeGreaterThan(70);
    expect(result.exposurePct).toBeLessThan(80);
  });

  it("buys a skipped momentum name on the next day and sizes it to the order cap", () => {
    const first = capCandidate("BBB", 2, "2024-01-02");
    const skipped = capCandidate("AAA", 1, "2024-01-02");
    const later = capCandidate("AAA", 1, "2024-01-03");
    const result = runSwingPortfolio([first, skipped, later], {
      capital: 80_000,
      riskPct: 0.01,
      maxOrderPct: 0.25,
      minOrderInr: 8_000,
      cashReserve: 500,
      maxNewBuys: 1,
      maxOpen: 6,
      maxPerSector: 2,
      maxDailyDeployPct: 1,
    }, ["2024-01-02", "2024-01-03", "2024-01-04", "2024-01-05"]);
    expect(result.trades.map((trade) => `${trade.symbol}:${trade.entryDate}`)).toEqual(["BBB:2024-01-02", "AAA:2024-01-03"]);
    for (const trade of result.trades) expect(trade.qty * trade.entryPx).toBeGreaterThan(18_000);
    expect(result.blocks).toMatchObject({ candidates: 3, filled: 2, cappedBuys: 1 });
    expect(result.minCash).toBeGreaterThanOrEqual(-0.01);
  });

  it("sizes the volatility variant from 0.5% of current equity divided by ATR20", () => {
    const row = { ...capCandidate("ATR", 1, "2024-01-02"), sizingAtr: 10 };
    const result = runSwingPortfolio([row], {
      capital: 80_000,
      riskPct: 0.01,
      maxOrderPct: 0.15,
      minOrderInr: 4_000,
      cashReserve: 500,
      maxNewBuys: 2,
      maxOpen: 8,
      maxPerSector: 2,
      maxDailyDeployPct: 0.5,
      maxGrossExposurePct: 0.8,
      atrExposurePct: 0.005,
    }, ["2024-01-02", "2024-01-03", "2024-01-04", "2024-01-05"]);
    expect(result.trades[0].qty).toBe(40);
    expect(result.trades[0].qty * result.trades[0].entryPx).toBe(4_000);
  });

  it("records the gross exposure cap separately from other portfolio blocks", () => {
    const first = capCandidate("ONE", 2, "2024-01-02");
    const second = capCandidate("TWO", 1, "2024-01-02");
    const result = runSwingPortfolio([first, second], {
      capital: 80_000,
      riskPct: 0.01,
      maxOrderPct: 0.1,
      minOrderInr: 4_000,
      cashReserve: 500,
      maxNewBuys: 2,
      maxOpen: 8,
      maxPerSector: 2,
      maxDailyDeployPct: 0.5,
      maxGrossExposurePct: 0.1,
    }, ["2024-01-02", "2024-01-03", "2024-01-04", "2024-01-05"]);
    expect(result.trades).toHaveLength(1);
    expect(result.blocks).toMatchObject({ filled: 1, grossExposure: 1, cappedOpen: 0, deploy: 0 });
  });

  it("rebalances momentum on the session before a Friday holiday and keeps the top N", () => {
    const bars = daily(320);
    const friday = bars.findIndex((bar, index) => index > 250 && weekdayUtc(bar.t) === 5);
    const without = bars.filter((_, index) => index !== friday);
    const ctx = contextFor(momentum, without, without);
    const at = without.findIndex((bar) => bar.t === bars[friday - 1].t);
    ctx.rank[at] = 1;
    ctx.rankN[at] = 50;
    ctx.indexUp[at] = 1;
    expect(momentum.signals(ctx).some((signal) => signal.at === at)).toBe(true);
    ctx.indexUp[at] = 0;
    expect(momentum.signals(ctx).some((signal) => signal.at === at)).toBe(false);

    const full = contextFor(momentum, bars, bars);
    const kept = bars.findIndex((bar, index) => index > 250 && weekdayUtc(bar.t) === 5);
    full.rank[kept] = 1;
    full.rankN[kept] = 50;
    full.indexUp[kept] = 1;
    expect(momentum.signals(full).some((signal) => signal.at === kept)).toBe(true);
    full.rank[kept] = 1 - 8 / 49;
    full.rankN[kept] = 50;
    expect(momentum.signals(full).some((signal) => signal.at === kept)).toBe(false);
    full.rank[kept] = 1 - 7 / 49;
    expect(momentum.signals(full).some((signal) => signal.at === kept)).toBe(true);

    const walked = walkSymbol(momentum, contextFor(momentum, bars, bars), {
      symbol: "AAA",
      tick: 0.05,
      slip: 0.0005,
      from: bars[210].t,
      to: bars[250].t,
      gttGap: 0,
    });
    const rows = [...walked.trades, ...walked.opens];
    const exits = new Map<string, number>();
    for (const trade of rows) exits.set(trade.exitDate, (exits.get(trade.exitDate) ?? 0) + 1);
    expect([...exits.values()].some((count) => count > 1)).toBe(true);
    expect(rows.every((trade) => trade.priceStop === false)).toBe(true);
  });

  it("fills a daily limit only when the range contains it", () => {
    const through = limitBars(99, 101, 98, 100);
    const filled = walkSymbol(limitStrategy(90), emptyContext(through), walkOpts());
    expect(filled.trades).toHaveLength(0);
    expect(filled.opens).toHaveLength(1);
    expect(filled.opens[0].entryPx).toBeCloseTo(100.5, 2);
    expect(filled.opens[0].fill).toBe("daily");

    const below = limitBars(99, 100.2, 98, 100);
    expect(walkSymbol(limitStrategy(90), emptyContext(below), walkOpts()).opens).toHaveLength(0);

    const chase = limitBars(106, 106, 90, 100);
    const chased = walkSymbol(limitStrategy(90), emptyContext(chase), walkOpts());
    expect(chased.trades).toHaveLength(0);
    expect(chased.opens).toHaveLength(0);

    const rested = limitBars(102, 103, 100, 101);
    const limitFill = walkSymbol(limitStrategy(90), emptyContext(rested), walkOpts());
    expect(limitFill.opens).toHaveLength(1);
    expect(limitFill.opens[0].entryPx).toBeCloseTo(100.5, 2);

    const close = limitBars(100.4, 101, 100, 100.6);
    expect(walkSymbol(limitStrategy(100), emptyContext(close), walkOpts()).opens).toHaveLength(0);
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
    expect(heldbackSubjects(["momentum"], ["M10-6"])).toEqual(["M10-6"]);
    expect(heldbackBlock(["M10-8"], heldbackSubjects(["momentum"], ["M10-6"]), false)).toBeNull();
    expect(heldbackBlock(["M10-6"], heldbackSubjects(["momentum"], ["M10-6"]), false)).toMatch(/M10-6/);
    expect(heldbackBlock(["M10-6"], heldbackSubjects(["momentum"], ["M10-6"]), true)).toBeNull();
    expect(parseResearchArgs(["--book", "intraday", "--heldback", "--no-grid", "--only", "infy,tcs", "--strategy", "orb"])).toEqual({
      book: "intraday",
      strategies: ["orb"],
      variants: undefined,
      sample: "heldback",
      confirmHeldback: false,
      force: false,
      grid: false,
      only: ["INFY", "TCS"],
      anytime: false,
    });
    expect(parseResearchArgs([
      "--book", "swing", "--variant", "M10-6", "--heldback", "--confirm-heldback", "--no-grid",
    ])).toMatchObject({
      book: "swing",
      variants: ["M10-6"],
      sample: "heldback",
      confirmHeldback: true,
      force: false,
      grid: false,
    });
  });

  it("parses only declared swing variants and rejects ambiguous variant runs", () => {
    expect(parseResearchArgs([
      "--book", "swing", "--variant", "M15-control,M10-10,TB+M10", "--no-grid",
    ])).toMatchObject({
      book: "swing",
      variants: ["M15-control", "M10-10", "TB+M10"],
      grid: false,
    });
    expect(() => parseResearchArgs(["--book", "swing", "--variant", "M7-12", "--no-grid"])).toThrow(/Unknown swing variant/);
    expect(() => parseResearchArgs(["--book", "intraday", "--variant", "M10-8", "--no-grid"])).toThrow(/only with --book swing/);
    expect(() => parseResearchArgs(["--book", "swing", "--variant", "M10-8"])).toThrow(/requires --no-grid/);
    expect(() => parseResearchArgs(["--book", "swing", "--variant", "M10-8", "--strategy", "momentum", "--no-grid"])).toThrow(/without --strategy/);
  });

  it("parses only frozen Long Game building variants and refuses held-back", () => {
    expect(parseResearchArgs([
      "--book", "longterm", "--sample", "building",
      "--variant", "STATIC-NEXT,STATIC-MID,RADAR-NEXT,RADAR-MID", "--no-grid", "--anytime",
    ])).toMatchObject({
      book: "longterm",
      sample: "building",
      variants: ["STATIC-NEXT", "STATIC-MID", "RADAR-NEXT", "RADAR-MID"],
      grid: false,
    });
    expect(() => parseResearchArgs(["--book", "longterm", "--variant", "RADAR-SMALL", "--no-grid"])).toThrow(/Unknown longterm variant/);
    expect(() => parseResearchArgs(["--book", "longterm", "--heldback", "--no-grid"])).toThrow(/held-back data is locked/);
    expect(() => parseResearchArgs(["--book", "longterm", "--heldback", "--confirm-heldback", "--no-grid"])).toThrow(/held-back data is locked/);
    expect(() => parseResearchArgs(["--book", "longterm"])).toThrow(/requires --no-grid/);
  });

  it("lets --anytime skip the window off the server and refuses it on mcube-server", () => {
    expect(parseResearchArgs(["--book", "swing", "--anytime"])).toMatchObject({ book: "swing", anytime: true });
    expect(shouldStopResearch(true, 10 * 60)).toBe(false);
    expect(shouldStopResearch(false, 10 * 60)).toBe(true);
    expect(() => guardResearchAnytime(true, "office-pc")).not.toThrow();
    expect(() => guardResearchAnytime(false, "mcube-server")).not.toThrow();
    expect(() => guardResearchAnytime(true, "mcube-server")).toThrow(ANYTIME_ON_SERVER);
    expect(queueResearchArgs({
      book: "swing",
      strategies: ["ema"],
      sample: "building",
      confirmHeldback: true,
      force: true,
      grid: true,
      anytime: true,
    })).toMatchObject({ anytime: false, confirmHeldback: true });
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

  it("blocks a new buy under the index average and leaves the exit alone", () => {
    expect(indexAllows([10, 10, 10, 9], 3, 3)).toBe(false);
    expect(indexAllows([10, 10, 10, 11], 3, 3)).toBe(true);
    expect(indexAllows([11], 0, 0)).toBe(true);
    const bars = daily(320);
    const ctx = contextFor(momentum, bars, bars);
    for (let i = 0; i < bars.length; i++) ctx.indexUp[i] = 1;
    const open = momentum.signals(ctx).length;
    expect(open).toBeGreaterThan(0);
    for (let i = 0; i < bars.length; i++) ctx.indexClose[i] = i < 100 ? 100 : 50;
    ctx.params.indexDays = 100;
    expect(momentum.signals(ctx)).toHaveLength(0);
    ctx.params.indexDays = 0;
    expect(momentum.signals(ctx)).toHaveLength(open);
    ctx.rank[110] = 0;
    ctx.rankN[110] = 50;
    ctx.params.exitTop = 25;
    expect(momentum.afterClose({ ...ctx, entryAt: 100, side: "long", stop: 0, entryPx: 100 }, 110).exit).toBe(true);
  });

  it("sells a momentum gap through the 12% stop at the open", () => {
    const bars = daily(320);
    const ctx = contextFor(momentum, bars, bars);
    for (let i = 0; i < bars.length; i++) ctx.indexUp[i] = 1;
    ctx.params.stopPct = 0.12;
    const at = momentum.signals(ctx)[0]?.at ?? -1;
    expect(at).toBeGreaterThan(0);
    const entry = at + 1;
    const entryOpen = bars[entry].o;
    bars[entry + 1].o = entryOpen * 0.8;
    bars[entry + 1].h = entryOpen * 0.81;
    bars[entry + 1].l = entryOpen * 0.79;
    bars[entry + 1].c = entryOpen * 0.8;
    const walked = walkSymbol(momentum, ctx, {
      symbol: "AAA",
      tick: 0.05,
      slip: 0,
      from: bars[entry].t,
      to: bars[entry + 3].t,
      gttGap: 0,
      limitOffset: 0.005,
      chasePct: 0.03,
    });
    const stopped = walked.trades.find((trade) => trade.entryDate === bars[entry].t);
    expect(stopped?.exitReason).toBe("stop");
    expect(stopped?.exitPx).toBeCloseTo(entryOpen * 0.8, 2);
    expect(stopped?.sizeToCap).toBe(true);
  });

  it("tightens the RS trail after a 10% gain and still only lifts the stop", () => {
    const bars = daily(80);
    const ctx = contextFor(rsResilience, bars, bars);
    ctx.params.tight = 1;
    const close = bars[70].c;
    const wide = rsResilience.afterClose({ ...ctx, entryAt: 60, side: "long", stop: 1, entryPx: close }, 70);
    const tight = rsResilience.afterClose({ ...ctx, entryAt: 60, side: "long", stop: 1, entryPx: close / 1.1 }, 70);
    expect(tight.stop).toBeGreaterThan(wide.stop);
    const held = rsResilience.afterClose({ ...ctx, entryAt: 60, side: "long", stop: tight.stop + 5, entryPx: close / 1.1 }, 70);
    expect(held.stop).toBe(tight.stop + 5);
  });

  it("charges both sells when half the position is taken off", () => {
    const held = candidate("AAA", 1);
    held.entryPx = 100;
    held.exitPx = 140;
    held.stop = 90;
    held.scaleOut = { date: "2024-01-04", px: 130 };
    held.exitDate = "2024-01-05";
    held.marks = [
      { date: "2024-01-02", close: 100 },
      { date: "2024-01-03", close: 120 },
      { date: "2024-01-04", close: 130 },
    ];
    const rules = {
      capital: 100_000,
      riskPct: 0.01,
      maxOrderPct: 0.25,
      minOrderInr: 1000,
      cashReserve: 0,
      maxNewBuys: 2,
      maxOpen: 6,
      maxPerSector: 2,
      maxDailyDeployPct: 1,
    };
    const split = runSwingPortfolio([held], rules, ["2024-01-02", "2024-01-03", "2024-01-04", "2024-01-05"]);
    const whole = runSwingPortfolio([{ ...held, scaleOut: undefined }], rules, ["2024-01-02", "2024-01-03", "2024-01-04", "2024-01-05"]);
    expect(split.trades).toHaveLength(1);
    expect(split.trades[0].charges).toBeGreaterThan(whole.trades[0].charges + 15);
    expect(split.minCash).toBeGreaterThanOrEqual(-0.01);
  });

  it("caps each strategy at half the open slots and shares a real sector", () => {
    const rules = {
      capital: 100_000,
      riskPct: 0.01,
      maxOrderPct: 0.3,
      minOrderInr: 1,
      cashReserve: 0,
      maxNewBuys: 5,
      maxOpen: 2,
      maxPerSector: 2,
      maxPerStrategy: 1,
      maxDailyDeployPct: 1,
    };
    const day = "2024-01-02";
    const left = { ...candidate("AAA", 3), group: "rs", entryDate: day, priceStop: false, stop: 0 };
    const again = { ...candidate("BBB", 2), group: "rs", entryDate: day, priceStop: false, stop: 0 };
    const right = { ...candidate("CCC", 1), group: "momentum", entryDate: day, priceStop: false, stop: 0 };
    const paired = runSwingPortfolio([left, again, right], rules, [day, "2024-01-03"]);
    expect(paired.trades.map((trade) => trade.symbol).sort()).toEqual(["AAA", "CCC"]);

    const banks = ["AAA", "BBB", "CCC"].map((symbol, index) => ({
      ...candidate(symbol, 3 - index),
      sector: "Banks",
      entryDate: day,
      priceStop: false as const,
      stop: 0,
    }));
    const capped = runSwingPortfolio(banks, { ...rules, maxOpen: 6, maxPerStrategy: undefined, maxPerSector: 2 }, [day, "2024-01-03"]);
    expect(capped.trades).toHaveLength(2);
    expect(capped.blocks.sector).toBe(1);
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

function capCandidate(symbol: string, score: number, entry: string): Candidate {
  const row = candidate(symbol, score);
  return { ...row, symbol, score, sector: symbol, entryDate: entry, entryTs: entry, priceStop: false, stop: 0, entryPx: 100 };
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

function limitBars(open: number, high: number, low: number, close: number): Bar[] {
  return [
    { t: "2024-01-02", o: 100, h: 101, l: 99, c: 100, v: 1000 },
    { t: "2024-01-03", o: open, h: high, l: low, c: close, v: 1000 },
    { t: "2024-01-04", o: close, h: close + 0.2, l: close * 0.99, c: close, v: 1000 },
  ];
}

function walkOpts() {
  return {
    symbol: "INFY",
    tick: 0.05,
    slip: 0.0005,
    from: "2024-01-01",
    to: "2024-12-31",
    gttGap: 0.03,
    limitOffset: 0.005,
    chasePct: 0.03,
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
