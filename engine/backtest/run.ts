import { execSync } from "node:child_process";
import {
  heldbackBlock,
  lossDayOverlap,
  sampleWindow,
  byQuarter,
  type ResearchBook,
} from "@/lib/mlive/research-bar";
import { istMinutes, todayIst } from "@/lib/mlive/calendar";
import { DEFAULT_FUND } from "@/lib/mlive/rules";
import { raiseAlert } from "../alerts";
import { jsonValue, q } from "../db";
import { loadSettings } from "../load";
import { strategiesFor } from "../strategies";
import type { ResearchArgs } from "./args";
import {
  dailyBars,
  deleteTrades,
  ensureTradeTable,
  forEachSession,
  insertTrades,
  lastDailyDate,
  pruneTrades,
  universe,
  type TradeRow,
} from "./data";
import { simulateIntraday } from "./intraday";
import type { DayRules } from "./intraday-sim";
import { returns90, percentileRanks } from "./ranks";
import type { ScoredRun } from "./score";
import { researchWindowEnded } from "./schedule";
import { simulateSwing } from "./swing";
import type { SwingRules } from "./portfolio";
import type { Bar } from "../strategies/math";

const SURVIVORSHIP = "Universe is today's Nifty list, so names that left the index are missing (survivorship bias).";
const WINDOW_STOP = "Stopped at the window end so trading jobs have the server";
const PORT_NOTE =
  "RS and EMA entries follow the Python scanner, including the rule that RS only buys when Nifty's 10-day return is under 1%. Exits follow the live engine: the RS chandelier and the EMA20 stop only move up, and a close under the stop sells at the next open. The scanner's own target and stop are not used. RSI uses the scanner's exponential average rather than a simple mean.";

type Capital = SwingRules & {
  leverage: number;
  maxTrades: number;
  dayLossPct: number;
  short: boolean;
  entryAfter: string;
  exitTime: string;
  gttGap: number;
};

export async function runResearch(args: ResearchArgs, opts?: { runId?: number; requestedBy?: string }): Promise<number> {
  const names = strategiesFor(args.book, args.strategies).map((strategy) => strategy.name);
  const requestedBy = opts?.requestedBy ?? "cli";
  const runId = opts?.runId ?? (await insertRun(args, names, "running", requestedBy));
  let peak = process.memoryUsage().rss;
  const noteRss = () => {
    peak = Math.max(peak, process.memoryUsage().rss);
  };
  try {
    if (await otherRunning(runId)) throw new Error("A research run is already going.");
    await execute(runId, { ...args, strategies: names }, noteRss);
    return runId;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await q(
      `UPDATE mlive.mlive_research_runs SET status = 'error', finished_at = now(), error = $2 WHERE id = $1`,
      [runId, message]
    ).catch(() => undefined);
    if (message === WINDOW_STOP) {
      console.log(message);
      return runId;
    }
    await raiseAlert({ level: "problem", code: "engine_error", message: `research failed: ${message}` }).catch(() => undefined);
    throw error;
  } finally {
    noteRss();
    console.log(`research rss ${Math.round(peak / (1024 * 1024))} MB`);
  }
}

async function execute(runId: number, args: ResearchArgs & { strategies: string[] }, noteRss: () => void): Promise<void> {
  const capital = await loadCapital(args.book);
  const last = args.book === "swing" ? await lastDailyDate() : todayIst();
  const window = sampleWindow(args.book, args.sample, last);
  const quarters = byQuarter(args.book, window.from, window.to);
  if (args.sample === "heldback") {
    const used = await heldbackUsed(args.book, args.strategies);
    const blocked = heldbackBlock(used, args.strategies, args.force);
    if (blocked) throw new Error(blocked);
  }
  const params = {
    strategies: args.strategies,
    grid: args.grid,
    only: args.only ?? null,
    window,
    slippage: args.book === "swing" ? 0.0005 : 0.001,
    costs: { intraday: args.book === "intraday", rates: capital.rates ?? null },
    capital: {
      fund: capital.capital,
      riskPct: capital.riskPct,
      maxOrderPct: capital.maxOrderPct,
      minOrderInr: capital.minOrderInr,
      cashReserve: capital.cashReserve,
      maxNewBuys: capital.maxNewBuys,
      maxOpen: capital.maxOpen,
      maxPerSector: capital.maxPerSector,
      maxDailyDeployPct: capital.maxDailyDeployPct,
      leverage: capital.leverage,
      maxTrades: capital.maxTrades,
      dayLossPct: capital.dayLossPct,
      short: capital.short,
      entryAfter: capital.entryAfter,
      exitTime: capital.exitTime,
      gttGap: capital.gttGap,
    },
    quarters,
  };
  await q(
    `UPDATE mlive.mlive_research_runs
        SET status = 'running', started_at = COALESCE(started_at, now()), params = $2::jsonb, error = NULL
      WHERE id = $1`,
    [runId, JSON.stringify(params)]
  );
  await q(`DELETE FROM mlive.mlive_research_results WHERE run_id = $1`, [runId]);
  await q(`DELETE FROM mlive.mlive_research_overlap WHERE run_id = $1`, [runId]);
  await ensureTradeTable();
  await deleteTrades(runId);

  const ranges = new Map<string, { first: string; last: string }>();
  let niftyOk = false;
  let scored: ScoredRun[] = [];
  if (args.book === "swing") {
    const loaded = await loadSwingUniverse(args.only);
    niftyOk = loaded.nifty.length > 200;
    const built = await buildRanks(loaded.symbols.map((row) => row.symbol), loaded.nifty, window.to, ranges, noteRss);
    console.log(`research ${args.book} ${args.sample} ranks ${loaded.symbols.length} symbols`);
    scored = await simulateSwing({
      symbols: loaded.symbols.map((row) => ({ symbol: row.symbol, tick: row.tick, sector: loaded.sectors.get(row.symbol) || row.symbol })),
      load: (symbol) => loadDaily(symbol),
      calendar: built.calendar,
      ranks: built.ranks,
      rankN: built.rankN,
      indexClose: built.indexClose,
      indexUp: built.indexUp,
      strategies: strategiesFor("swing", args.strategies),
      grid: args.grid,
      sample: args.sample,
      window,
      rules: capital,
      slip: 0.0005,
      gttGap: capital.gttGap,
      onSymbol: (symbol, index, total) => {
        stopForTradingWindow();
        noteRss();
        if (index % 25 === 0 || index + 1 === total) console.log(`research swing ${index + 1}/${total} ${symbol}`);
      },
    });
  } else {
    const loaded = await loadIntradayUniverses(args.only);
    niftyOk = true;
    const dayRules: DayRules = {
      capital: capital.capital,
      riskPct: capital.riskPct,
      leverage: capital.leverage,
      maxTrades: capital.maxTrades,
      dayLossPct: capital.dayLossPct,
      short: capital.short,
      rates: capital.rates,
    };
    scored = await simulateIntraday({
      strategies: strategiesFor("intraday", args.strategies),
      grid: args.grid,
      sample: args.sample,
      window,
      rules: dayRules,
      slip: 0.001,
      tick: loaded.ticks,
      exitTime: capital.exitTime,
      entryAfter: capital.entryAfter,
      orbSymbols: loaded.orb,
      vwapSymbols: loaded.vwap,
      daily: (symbol) => loadDaily(symbol),
      stream: async (symbol, kind, from, to, visit) => {
        stopForTradingWindow();
        const found = await forEachSession(symbol, kind, from, to, visit);
        if (found.first && found.last) ranges.set(symbol, { first: found.first, last: found.last });
        noteRss();
      },
      onSymbol: (label) => {
        stopForTradingWindow();
        console.log(`research intraday ${label}`);
      },
    });
  }
  noteRss();
  const note = buildNote(args, capital, window, quarters, niftyOk);
  const data = {
    universe: args.book === "swing" ? "nifty500" : "nifty200+nifty100",
    survivorship: SURVIVORSHIP,
    symbols: ranges.size,
    first: earliest(ranges),
    last: latest(ranges),
    perSymbol: Object.fromEntries(ranges),
    nifty: niftyOk,
  };
  if (ranges.size === 0) {
    await finish(runId, "ok", note, data);
    console.log("research finished with no candles");
    return;
  }
  await saveResults(runId, scored);
  await saveOverlap(runId, scored.filter((row) => row.isDefault));
  await saveTrades(runId, scored);
  await pruneOldTrades();
  await finish(runId, "ok", note, data);
  for (const row of scored.filter((item) => item.isDefault)) {
    console.log(`research ${row.strategy} ${row.paramsKey} trades ${row.score.trades} pf ${row.score.profitFactor.toFixed(2)} ${row.score.passed ? "pass" : "fail"}`);
  }
}

async function loadCapital(book: ResearchBook): Promise<Capital> {
  const settings = await loadSettings();
  const rows = await q<{ value: unknown }>(`SELECT value FROM mlive.mlive_settings WHERE key = 'intraday_entry_window'`);
  const raw = jsonValue(rows[0]?.value);
  const after = raw && typeof raw === "object" && typeof (raw as { after?: unknown }).after === "string" ? (raw as { after: string }).after : "";
  return {
    capital: book === "swing" ? DEFAULT_FUND : settings.intradayCapital || 20_000,
    riskPct: book === "swing" ? settings.riskPct : settings.intradayRiskPct,
    maxOrderPct: book === "swing" ? settings.maxOrderPct : settings.intradayLeverage || 1,
    minOrderInr: book === "swing" ? settings.minOrderInr : 0,
    cashReserve: book === "swing" ? settings.cashReserve : 0,
    maxNewBuys: settings.maxNewBuys,
    maxOpen: settings.maxOpen,
    maxPerSector: settings.maxPerSector,
    maxDailyDeployPct: book === "swing" ? settings.maxDailyDeployPct : 1,
    rates: settings.charges,
    leverage: settings.intradayLeverage || 1,
    maxTrades: settings.intradayMaxTrades,
    dayLossPct: settings.intradayDayLossPct,
    short: settings.intradayShort,
    entryAfter: after || "14:30",
    exitTime: settings.intradayExitTime || "15:00",
    gttGap: settings.exitRs.gtt_gap_pct ?? 0.03,
  };
}

async function loadSwingUniverse(only?: string[]) {
  const rows = await universe("nifty500");
  const wanted = only?.length ? new Set(only) : null;
  const symbols = wanted ? rows.filter((row) => wanted.has(row.symbol)) : rows;
  const nifty = await dailyBars("NIFTY 50");
  const sectorRows = await q<{ symbol: string; sector: string | null }>(`SELECT symbol, sector FROM mlive.mlive_instruments`);
  const sectors = new Map(sectorRows.map((row) => [row.symbol, row.sector ?? ""]));
  return { symbols, nifty, sectors };
}

async function loadIntradayUniverses(only?: string[]) {
  const wanted = only?.length ? new Set(only) : null;
  const keep = (rows: { symbol: string; tick: number }[]) => (wanted ? rows.filter((row) => wanted.has(row.symbol)) : rows);
  const twoHundred = keep(await universe("nifty200"));
  const oneHundred = keep(await universe("nifty100"));
  const ticks = new Map<string, number>();
  for (const row of [...twoHundred, ...oneHundred]) ticks.set(row.symbol, row.tick);
  return { orb: twoHundred.map((row) => row.symbol), vwap: oneHundred.map((row) => row.symbol), ticks };
}

async function buildRanks(symbols: string[], nifty: Bar[], to: string, ranges: Map<string, { first: string; last: string }>, noteRss: () => void) {
  const calendar = (nifty.length ? nifty.map((bar) => bar.t) : await calendarFrom(symbols, to)).filter((day) => day <= to);
  const unique = [...new Set(calendar)].sort();
  const at = new Map(unique.map((day, index) => [day, index]));
  const matrix: Float64Array[] = [];
  const names: string[] = [];
  for (let i = 0; i < symbols.length; i++) {
    stopForTradingWindow();
    const bars = await dailyBars(symbols[i]);
    if (bars.length) ranges.set(symbols[i], { first: bars[0].t, last: bars[bars.length - 1].t });
    const closes = new Float64Array(unique.length);
    closes.fill(Number.NaN);
    for (const bar of bars) {
      const index = at.get(bar.t);
      if (index != null) closes[index] = bar.c;
    }
    matrix.push(returns90(closes));
    names.push(symbols[i]);
    if (i % 25 === 0) {
      noteRss();
      console.log(`research ranks ${i + 1}/${symbols.length} ${symbols[i]}`);
    }
  }
  const ranked = percentileRanks(matrix);
  const ranks = new Map<string, Float64Array>();
  names.forEach((symbol, index) => ranks.set(symbol, ranked.rank[index]));
  const indexClose = new Float64Array(unique.length);
  indexClose.fill(Number.NaN);
  for (const bar of nifty) {
    const index = at.get(bar.t);
    if (index != null) indexClose[index] = bar.c;
  }
  const indexUp = new Uint8Array(unique.length);
  for (let i = 199; i < unique.length; i++) {
    if (!Number.isFinite(indexClose[i])) continue;
    let sum = 0;
    let count = 0;
    for (let k = i - 199; k <= i; k++) {
      if (!Number.isFinite(indexClose[k])) continue;
      sum += indexClose[k];
      count += 1;
    }
    if (count >= 200 && indexClose[i] > sum / count) indexUp[i] = 1;
  }
  return { calendar: unique, ranks, rankN: ranked.n, indexClose, indexUp };
}

function stopForTradingWindow(): void {
  if (researchWindowEnded(istMinutes())) throw new Error(WINDOW_STOP);
}

async function loadDaily(symbol: string) {
  stopForTradingWindow();
  return dailyBars(symbol);
}

async function calendarFrom(symbols: string[], to: string): Promise<string[]> {
  const days = new Set<string>();
  for (const symbol of symbols) {
    const bars = await loadDaily(symbol);
    for (const bar of bars) if (bar.t <= to) days.add(bar.t);
  }
  return [...days].sort();
}

function buildNote(args: ResearchArgs, capital: Capital, window: { from: string; to: string }, quarters: boolean, niftyOk: boolean): string {
  const fund = `₹${capital.capital.toLocaleString("en-IN")}`;
  const cost = args.book === "swing"
    ? "Costs are delivery charges on the simulated quantity and turnover, including the DP charge on sells, plus 0.05% slippage."
    : "Costs are MIS charges on the simulated quantity and turnover, plus 0.1% slippage.";
  const rules = args.book === "swing"
    ? `Capital is ${fund}, ${pct(capital.riskPct)} risk, at most ${pct(capital.maxOrderPct)} per order, ${capital.maxNewBuys} new buys a day, ${pct(capital.maxDailyDeployPct)} of capital in one day, ${capital.maxOpen} open positions, ${capital.maxPerSector} per sector, and ₹${capital.cashReserve.toLocaleString("en-IN")} kept back.`
    : `Capital is ${fund}, ${capital.leverage}× buying power, ${pct(capital.riskPct)} risk, at most ${capital.maxTrades} trades a day, and the day stops at −${pct(capital.dayLossPct)}. Shorts are ${capital.short ? "allowed" : "off"}. No new entry after ${capital.entryAfter}. Positions close at ${capital.exitTime}.`;
  const stop = args.book === "swing"
    ? `A low through the GTT, ${(capital.gttGap * 100).toFixed(0)}% under the trend stop, sells at that trigger, or at the open when the bar gaps through it.`
    : "Bars before 09:15 and from 15:15 onward are ignored, including days before 3 Aug 2026.";
  const names = new Set(args.strategies ?? []);
  return [
    `${args.sample === "heldback" ? "Held-back" : "Building"} sample ${window.from} to ${window.to}.`,
    SURVIVORSHIP,
    cost,
    rules,
    stop,
    quarters ? "Profitable periods are calendar quarters because this window is under two years." : "",
    niftyOk ? "" : "NIFTY 50 daily candles are missing, so momentum and RS do not take trades.",
    names.has("rs") || names.has("ema") ? PORT_NOTE : "",
    args.only?.length ? `This run only used ${args.only.join(", ")}, so ranks are inside that list.` : "",
  ].filter(Boolean).join(" ");
}

function pct(value: number): string {
  return `${Math.round(value * 1000) / 10}%`;
}

async function saveResults(runId: number, rows: ScoredRun[]): Promise<void> {
  for (const row of rows) {
    await q(
      `INSERT INTO mlive.mlive_research_results
        (run_id, strategy, params, params_key, is_default, trades, win_rate, profit_factor, avg_net_pct,
         worst_drawdown_pct, longest_losing_run, half_years_profitable_pct, cagr_pct, exposure_pct,
         monthly, equity, passed, fail_reasons)
       VALUES ($1,$2,$3::jsonb,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16::jsonb,$17,
         ARRAY(SELECT jsonb_array_elements_text($18::jsonb)))`,
      [
        runId,
        row.strategy,
        JSON.stringify(row.params),
        row.paramsKey,
        row.isDefault,
        row.score.trades,
        row.score.winRate,
        row.score.profitFactor,
        row.score.avgNetPct,
        row.score.worstDrawdownPct,
        row.score.longestLosingRun,
        row.score.halfYearsProfitablePct,
        row.score.cagrPct,
        row.book.exposurePct,
        JSON.stringify(row.monthly),
        JSON.stringify(row.equity),
        row.score.passed,
        JSON.stringify(row.score.failReasons),
      ]
    );
  }
}

async function saveOverlap(runId: number, rows: ScoredRun[]): Promise<void> {
  for (const left of rows) {
    for (const right of rows) {
      if (left.strategy === right.strategy) continue;
      await q(
        `INSERT INTO mlive.mlive_research_overlap (run_id, a, b, loss_day_overlap)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (run_id, a, b) DO UPDATE SET loss_day_overlap = EXCLUDED.loss_day_overlap`,
        [runId, left.strategy, right.strategy, lossDayOverlap(left.lossDays, right.lossDays)]
      );
    }
  }
}

async function saveTrades(runId: number, rows: ScoredRun[]): Promise<void> {
  const trades: TradeRow[] = [];
  for (const row of rows) {
    for (const trade of row.book.trades) {
      trades.push({
        runId,
        strategy: row.strategy,
        paramsKey: row.paramsKey,
        symbol: trade.symbol,
        side: trade.side,
        entryTs: trade.entryTs,
        exitTs: trade.exitTs,
        entryPx: trade.entryPx,
        exitPx: trade.exitPx,
        qty: trade.qty,
        gross: trade.gross,
        charges: trade.charges,
        net: trade.net,
        netPct: trade.netPct,
        r: trade.r,
        exitReason: trade.exitReason,
        barsHeld: trade.barsHeld,
      });
    }
  }
  await insertTrades(trades);
}

async function pruneOldTrades(): Promise<void> {
  const rows = await q<{ id: string }>(`SELECT id::text AS id FROM mlive.mlive_research_runs ORDER BY id DESC LIMIT 20`);
  await pruneTrades(rows.map((row) => Number(row.id)));
}

async function finish(runId: number, status: string, note: string, data: unknown): Promise<void> {
  await q(
    `UPDATE mlive.mlive_research_runs
        SET status = $2, finished_at = now(), note = $3, data = $4::jsonb, engine_sha = $5
      WHERE id = $1`,
    [runId, status, note, JSON.stringify(data), engineSha()]
  );
}

async function insertRun(args: ResearchArgs, strategies: string[], status: string, requestedBy: string): Promise<number> {
  const rows = await q<{ id: string }>(
    `INSERT INTO mlive.mlive_research_runs
       (book, sample, status, requested_by, started_at, params, engine_sha)
     VALUES ($1,$2,$3,$4, CASE WHEN $3 = 'running' THEN now() ELSE NULL END, $5::jsonb,$6)
     RETURNING id::text AS id`,
    [args.book, args.sample, status, requestedBy, JSON.stringify({ strategies, grid: args.grid, only: args.only ?? null, sample: args.sample }), engineSha()]
  );
  return Number(rows[0].id);
}

export async function createQueuedRun(input: {
  book: ResearchBook;
  strategies: string[];
  sample: ResearchArgs["sample"];
  force: boolean;
  requestedBy: string;
}): Promise<number> {
  const names = strategiesFor(input.book, input.strategies).map((strategy) => strategy.name);
  if (input.sample === "heldback") {
    const blocked = heldbackBlock(await heldbackUsed(input.book, names), names, input.force);
    if (blocked) throw new Error(blocked);
  }
  return insertRun({ book: input.book, strategies: names, sample: input.sample, force: input.force, grid: true }, names, "queued", input.requestedBy);
}

async function heldbackUsed(book: string, names: string[]): Promise<string[]> {
  if (names.length === 0) return [];
  const rows = await q<{ strategy: string }>(
    `SELECT DISTINCT r.strategy
       FROM mlive.mlive_research_results r
       JOIN mlive.mlive_research_runs u ON u.id = r.run_id
      WHERE u.book = $1 AND u.sample = 'heldback' AND u.status = 'ok' AND r.is_default
        AND r.strategy = ANY($2::text[])`,
    [book, names]
  );
  return rows.map((row) => row.strategy);
}

async function otherRunning(runId: number): Promise<boolean> {
  const rows = await q<{ id: string; started_at: string | null }>(
    `SELECT id::text AS id, started_at::text AS started_at
       FROM mlive.mlive_research_runs
      WHERE status = 'running' AND id <> $1`,
    [runId]
  );
  return rows.some((row) => {
    const at = row.started_at ? Date.parse(row.started_at) : Date.now();
    return Number.isFinite(at) && Date.now() - at < 6 * 60 * 60 * 1000;
  });
}

function earliest(ranges: Map<string, { first: string; last: string }>): string | null {
  let value: string | null = null;
  for (const row of ranges.values()) if (!value || row.first < value) value = row.first;
  return value;
}

function latest(ranges: Map<string, { first: string; last: string }>): string | null {
  let value: string | null = null;
  for (const row of ranges.values()) if (!value || row.last > value) value = row.last;
  return value;
}

function engineSha(): string {
  try {
    return execSync("git rev-parse --short HEAD", { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() || "unknown";
  } catch {
    return "unknown";
  }
}
