import { estimateCharges } from "@/lib/mlive/charges";
import { mq, q } from "./db";
import { emaV2 } from "./strategies/ema-v2";
import type { Bar, ClosedTrade } from "./strategies/math";
import { momentum } from "./strategies/momentum";
import { orb } from "./strategies/orb";
import { rsi2 } from "./strategies/rsi2";
import { trendBreakout } from "./strategies/trend-breakout";
import { vwapTrend } from "./strategies/vwap";

type Sample = "building" | "held";

type Scored = {
  strategy: string;
  book: "swing" | "intraday";
  sample: Sample;
  profitFactor: number;
  averageNet: number;
  trades: number;
  winRate: number;
  worstDrawdown: number;
  longestLosingRun: number;
  halfYears: number;
  passed: boolean;
  note: string;
  lossDays: Set<string>;
};

const SWING_BUILD = { pf: 1.4, trades: 150, half: 0.7, dd: 0.15, avg: 0.008 };
const SWING_HELD = { pf: 1.2, trades: 150, half: 0.7, dd: 0.15, avg: 0.008 };
const DAY_BUILD = { pf: 1.3, trades: 300, half: 0.7, dd: 0.1, avg: 0.001 };
const DAY_HELD = { pf: 1.2, trades: 300, half: 0.7, dd: 0.1, avg: 0.001 };

function net(trade: ClosedTrade, intraday: boolean): number {
  const slip = intraday ? 0.001 : 0.0005;
  const buy = trade.side === "long" ? trade.entryPx * (1 + slip) : trade.exitPx * (1 + slip);
  const sell = trade.side === "long" ? trade.exitPx * (1 - slip) : trade.entryPx * (1 - slip);
  const charges = estimateCharges("BUY", buy, undefined, intraday).total + estimateCharges("SELL", sell, undefined, intraday).total;
  return (sell - buy - charges) / buy;
}

function sampleOf(entry: string): Sample | null {
  const year = Number(entry.slice(0, 4));
  if (year >= 2019 && year <= 2023) return "building";
  if (year >= 2024 && year <= 2026) return "held";
  return null;
}

function score(strategy: string, book: "swing" | "intraday", sample: Sample, trades: ClosedTrade[]): Scored {
  const intraday = book === "intraday";
  const returns = trades.map((trade) => ({ day: trade.exit.slice(0, 10), value: net(trade, intraday) }));
  const wins = returns.filter((row) => row.value > 0);
  const losses = returns.filter((row) => row.value < 0);
  const grossWin = wins.reduce((sum, row) => sum + row.value, 0);
  const grossLoss = Math.abs(losses.reduce((sum, row) => sum + row.value, 0));
  const profitFactor = grossLoss === 0 ? (grossWin > 0 ? 99 : 0) : grossWin / grossLoss;
  const averageNet = returns.length ? returns.reduce((sum, row) => sum + row.value, 0) / returns.length : 0;
  let equity = 0;
  let peak = 0;
  let worst = 0;
  let run = 0;
  let longest = 0;
  const halves = new Map<string, number>();
  for (const row of returns) {
    equity += row.value;
    peak = Math.max(peak, equity);
    worst = Math.min(worst, equity - peak);
    if (row.value < 0) {
      run += 1;
      longest = Math.max(longest, run);
    } else run = 0;
    const year = row.day.slice(0, 4);
    const half = Number(row.day.slice(5, 7)) <= 6 ? "H1" : "H2";
    const key = `${year}-${half}`;
    halves.set(key, (halves.get(key) ?? 0) + row.value);
  }
  const halfYears = halves.size ? [...halves.values()].filter((value) => value > 0).length / halves.size : 0;
  const bar = book === "swing" ? (sample === "building" ? SWING_BUILD : SWING_HELD) : sample === "building" ? DAY_BUILD : DAY_HELD;
  const passed = profitFactor >= bar.pf && returns.length >= bar.trades && halfYears >= bar.half && Math.abs(worst) <= bar.dd && averageNet >= bar.avg;
  return {
    strategy,
    book,
    sample,
    profitFactor,
    averageNet,
    trades: returns.length,
    winRate: returns.length ? wins.length / returns.length : 0,
    worstDrawdown: Math.abs(worst),
    longestLosingRun: longest,
    halfYears,
    passed,
    note: returns.length ? "" : "No stored candles in this sample.",
    lossDays: new Set(returns.filter((row) => row.value < 0).map((row) => row.day)),
  };
}

async function dailyBars(): Promise<Map<string, Bar[]>> {
  const rows = await mq<{ symbol: string; ts: string; open: string; high: string; low: string; close: string; volume: string }>(
    `SELECT symbol, ts::text AS ts, open, high, low, close, volume FROM candles_daily ORDER BY symbol, ts`
  );
  const map = new Map<string, Bar[]>();
  for (const row of rows) {
    const list = map.get(row.symbol) ?? [];
    list.push({ t: row.ts.slice(0, 10), o: Number(row.open), h: Number(row.high), l: Number(row.low), c: Number(row.close), v: Number(row.volume) });
    map.set(row.symbol, list);
  }
  return map;
}

async function intradayBars(table: "candles_5m" | "candles_1m"): Promise<Map<string, Bar[]>> {
  const rows = await mq<{ symbol: string; ts: string; open: string; high: string; low: string; close: string; volume: string }>(
    `SELECT symbol, (ts AT TIME ZONE 'Asia/Kolkata')::text AS ts, open, high, low, close, volume FROM ${table} ORDER BY symbol, ts`
  );
  const map = new Map<string, Bar[]>();
  for (const row of rows) {
    const list = map.get(row.symbol) ?? [];
    list.push({ t: row.ts.slice(0, 16), o: Number(row.open), h: Number(row.high), l: Number(row.low), c: Number(row.close), v: Number(row.volume) });
    map.set(row.symbol, list);
  }
  return map;
}

function bySample(trades: ClosedTrade[]): Record<Sample, ClosedTrade[]> {
  const out: Record<Sample, ClosedTrade[]> = { building: [], held: [] };
  for (const trade of trades) {
    const sample = sampleOf(trade.entry);
    if (sample) out[sample].push(trade);
  }
  return out;
}

async function save(row: Scored): Promise<void> {
  await q(
    `DELETE FROM mlive.mlive_research WHERE strategy = $1 AND book = $2 AND sample = $3`,
    [row.strategy, row.book, row.sample]
  );
  await q(
    `INSERT INTO mlive.mlive_research
      (strategy, book, sample, profit_factor, average_net, trades, win_rate, worst_drawdown, longest_losing_run, half_years_profitable, passed, note)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
    [row.strategy, row.book, row.sample, row.profitFactor, row.averageNet, row.trades, row.winRate, row.worstDrawdown, row.longestLosingRun, row.halfYears, row.passed, row.note]
  );
}

function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const day of a) if (b.has(day)) shared += 1;
  return shared / Math.min(a.size, b.size);
}

export async function research(): Promise<void> {
  let daily = new Map<string, Bar[]>();
  try {
    daily = await dailyBars();
  } catch (error) {
    const message = error instanceof Error ? error.message : "market database is not ready";
    console.error(message);
  }
  const symbols = [...daily.keys()];
  const returns90 = new Map<string, Map<string, number>>();
  for (const symbol of symbols) {
    const bars = daily.get(symbol) ?? [];
    const byDay = new Map<string, number>();
    for (let i = 90; i < bars.length; i++) byDay.set(bars[i].t, bars[i].c / bars[i - 90].c - 1);
    returns90.set(symbol, byDay);
  }
  const strong = new Map<string, boolean[]>();
  const held = new Map<string, boolean[]>();
  for (const symbol of symbols) {
    const bars = daily.get(symbol) ?? [];
    const flags: boolean[] = [];
    const members: boolean[] = [];
    for (let i = 0; i < bars.length; i++) {
      const day = bars[i].t;
      const mine = returns90.get(symbol)?.get(day);
      if (mine == null) {
        flags.push(false);
        members.push(false);
        continue;
      }
      const peers = symbols.map((name) => returns90.get(name)?.get(day)).filter((value): value is number => value != null).sort((a, b) => a - b);
      const rank = peers.findIndex((value) => value >= mine) / Math.max(1, peers.length);
      flags.push(rank >= 0.7);
      members.push(rank >= 0.97);
    }
    strong.set(symbol, flags);
    held.set(symbol, members);
  }

  const collected = new Map<string, ClosedTrade[]>();
  const add = (name: string, trades: ClosedTrade[]) => {
    const list = collected.get(name) ?? [];
    list.push(...trades);
    collected.set(name, list);
  };
  for (const symbol of symbols) {
    const bars = daily.get(symbol) ?? [];
    add("trend_breakout", trendBreakout(bars, strong.get(symbol) ?? []));
    add("rsi2", rsi2(bars));
    add("momentum", momentum(bars, held.get(symbol) ?? []));
    add("ema_v2", emaV2(bars));
  }
  const swingNames = ["trend_breakout", "rsi2", "momentum", "ema_v2"];
  const swingScores: Scored[] = [];
  for (const name of swingNames) {
    const split = bySample(collected.get(name) ?? []);
    for (const sample of ["building", "held"] as const) {
      const row = score(name, "swing", sample, split[sample]);
      if (symbols.length === 0) row.note = "No daily candles stored yet. The backtest did not call Kite.";
      swingScores.push(row);
      await save(row);
    }
  }
  const building = swingScores.filter((row) => row.sample === "building" && row.passed);
  const dropped = new Set<string>();
  for (let i = 0; i < building.length; i++) {
    for (let j = i + 1; j < building.length; j++) {
      if (overlap(building[i].lossDays, building[j].lossDays) > 0.5) dropped.add(building[j].profitFactor < building[i].profitFactor ? building[j].strategy : building[i].strategy);
    }
  }
  const passedSwing = building.filter((row) => !dropped.has(row.strategy)).slice(0, 2);
  if (passedSwing.length >= 2) {
    await q(`INSERT INTO mlive.mlive_settings (key, value) VALUES ('swing_half_size', 'true') ON CONFLICT (key) DO UPDATE SET value = 'true', updated_at = now()`);
  }

  let five = new Map<string, Bar[]>();
  let one = new Map<string, Bar[]>();
  try {
    five = await intradayBars("candles_5m");
    one = await intradayBars("candles_1m");
  } catch {
    five = new Map();
    one = new Map();
  }
  const intradayCollected = new Map<string, ClosedTrade[]>([
    ["orb", []],
    ["vwap", []],
  ]);
  for (const bars of five.values()) intradayCollected.get("orb")?.push(...orb(bars, 3));
  for (const bars of one.values()) intradayCollected.get("vwap")?.push(...vwapTrend(bars));
  for (const name of ["orb", "vwap"]) {
    const split = bySample(intradayCollected.get(name) ?? []);
    for (const sample of ["building", "held"] as const) {
      const row = score(name, "intraday", sample, split[sample]);
      if ((name === "orb" ? five.size : one.size) === 0) row.note = "Those candles are not stored yet. A backtest only reads rows that were actually stored.";
      await save(row);
    }
  }
  console.log(`research: ${symbols.length} daily symbols, ${five.size} five-minute, ${one.size} one-minute`);
}
