import { hostname } from "node:os";
import { access } from "node:fs/promises";
import { engineSha } from "@/lib/mlive/engine-sha";
import {
  duplicateBlock,
  identityFromRun,
  makeIdentity,
  queueBlock,
  type ResearchIdentity,
  type StoredRun,
} from "@/lib/mlive/research-page";
import {
  heldbackBlock,
  lossDayOverlap,
  sampleWindow,
  assertBuildingWindow,
  byQuarter,
  type ResearchBook,
} from "@/lib/mlive/research-bar";
import { istMinutes, todayIst } from "@/lib/mlive/calendar";
import { DEFAULT_FUND } from "@/lib/mlive/rules";
import { raiseAlert } from "../alerts";
import { jsonValue, mq, q } from "../db";
import { filesRoot, syncUniverse } from "../jobs/market";
import { loadSettings } from "../load";
import { strategiesFor } from "../strategies";
import type { ResearchArgs } from "./args";
import { strategiesForSwingVariants, type SwingVariantName } from "./swing-variants";
import { VERIFIED_ACTIONS } from "./actions";
import { CLEAN_THRESHOLDS, CLEAN_VERSION, cleanSymbol, fingerprintSeries, type CleanedSeries } from "./clean";
import {
  dailyBars,
  deleteTrades,
  ensureTradeTable,
  forEachSession,
  insertTrades,
  intersectMask,
  lastDailyDate,
  pruneTrades,
  tradesInRuns,
  universe,
  type TradeRow,
} from "./data";
import { formatAudits, formatComparison, formatEligibility, formatIntersections, formatOpens, formatOverlap } from "./report";
import { simulateIntraday } from "./intraday";
import type { DayRules } from "./intraday-sim";
import { returns90, percentileRanks } from "./ranks";
import type { ScoredRun } from "./score";
import { guardResearchAnytime, shouldStopResearch } from "./schedule";
import { simulateSwing } from "./swing";
import type { SwingRules } from "./portfolio";
import type { Bar } from "../strategies/math";

let skipResearchWindow = false;

const SURVIVORSHIP = "Results with today's Nifty 500 still have residual survivorship bias. The clean-history and traded-value rules reduce it but do not remove it. Names that left the index are missing, and when each name joined is not stored.";
const JOIN_DATES = "When each name joined the Nifty 500 is not stored, so trades in names that joined after the trade date cannot be counted.";
const WINDOW_STOP = "Stopped at the window end so trading jobs have the server";
const PORT_NOTE =
  "RS entries follow the Python scanner, including the rule that RS only buys when Nifty's 10-day return is under 1%. EMA buys are the live 09:45 limit at the signal close plus the limit offset, filled only when the next day trades there, and skipped when the open is past the chase limit or the fill is within 1% of the EMA stop. The scanner's paper book bought at the 20 EMA and sold at a fixed target or stop; this test does not. Exits follow the live engine: the RS chandelier and the EMA20 stop only move up, and a close under the stop sells at the next open. The GTT, 3% under that stop, is the intraday backstop for RS and EMA only. The scanner's own target and stop are not used. RSI uses the scanner's exponential average rather than a simple mean.";
const MOMENTUM_NOTE =
  "Momentum has no price stop. A name in the weekly list is sized to the order cap and can be bought on a later day of that spell when the first day was already full. The rebalance is the last session of the week, so a Friday holiday uses the session before it.";

type Capital = SwingRules & {
  leverage: number;
  maxTrades: number;
  dayLossPct: number;
  short: boolean;
  entryAfter: string;
  exitTime: string;
  gttGap: number;
  limitOffset: number;
  chasePct: number;
};

export async function runResearch(args: ResearchArgs, opts?: { runId?: number; requestedBy?: string }): Promise<number> {
  guardResearchAnytime(args.anytime, hostname());
  const requested = args.variants?.length ? strategiesForSwingVariants(args.variants) : args.strategies;
  const names = strategiesFor(args.book, requested).map((strategy) => strategy.name);
  const requestedBy = opts?.requestedBy ?? "cli";
  const identity = await researchIdentityFor({ book: args.book, sample: args.sample, grid: args.grid, only: args.only, strategies: names, variants: args.variants });
  if (!args.force) {
    const blocked = await duplicateIdentityError(identity, opts?.runId);
    if (blocked) {
      if (opts?.runId) {
        await q(
          `UPDATE mlive.mlive_research_runs
              SET status = 'error', finished_at = now(), error = $2,
                  params = jsonb_set(COALESCE(params, '{}'::jsonb), '{identity}', $3::jsonb, true)
            WHERE id = $1`,
          [opts.runId, blocked, JSON.stringify(identity)]
        );
        console.log(blocked);
        return opts.runId;
      }
      throw new Error(blocked);
    }
  }
  const runId = opts?.runId ?? (await insertRun(args, names, "running", requestedBy, identity));
  let peak = process.memoryUsage().rss;
  const noteRss = () => {
    peak = Math.max(peak, process.memoryUsage().rss);
  };
  try {
    skipResearchWindow = args.anytime;
    if (await otherRunning(runId)) throw new Error("A research run is already going.");
    await execute(runId, { ...args, strategies: names }, noteRss, identity);
    return runId;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await q(
      `UPDATE mlive.mlive_research_runs SET status = 'error', finished_at = now(), error = $2 WHERE id = $1`,
      [runId, message]
    ).catch(() => undefined);
    if (message === WINDOW_STOP || message.startsWith("Already run on ") || message.startsWith("A run with this setup") || message.startsWith("This setup is already running")) {
      console.log(message);
      return runId;
    }
    await raiseAlert({ level: "problem", code: "engine_error", message: `research failed: ${message}` }).catch(() => undefined);
    throw error;
  } finally {
    skipResearchWindow = false;
    noteRss();
    console.log(`research rss ${Math.round(peak / (1024 * 1024))} MB`);
  }
}

async function execute(runId: number, args: ResearchArgs & { strategies: string[] }, noteRss: () => void, identity: ResearchIdentity): Promise<void> {
  const capital = await loadCapital(args.book);
  const last = identity.lastCandle || (args.book === "swing" ? await lastDailyDate() : todayIst());
  const window = sampleWindow(args.book, args.sample, last);
  if (args.book === "swing") {
    console.log(`research sample ${args.sample} window ${window.from} through ${window.to}`);
    assertBuildingWindow(args.sample, window);
  }
  const quarters = byQuarter(args.book, window.from, window.to);
  if (args.sample === "heldback") {
    const used = await heldbackUsed(args.book, args.strategies);
    const blocked = heldbackBlock(used, args.strategies, args.force);
    if (blocked) throw new Error(blocked);
  }
  const params = {
    strategies: args.strategies,
    variants: args.variants ?? [],
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
      limitOffset: capital.limitOffset,
      chasePct: capital.chasePct,
    },
    quarters,
    identity,
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
  let limitNote = "";
  let cleaningNote = "";
  if (args.book === "swing") {
    try {
      const count = await syncUniverse();
      console.log(`research universe industries ${count}`);
    } catch (error) {
      console.log(`research universe industries kept: ${error instanceof Error ? error.message : error}`);
    }
    const loaded = await loadSwingUniverse(args.only);
    const sink = { text: "" };
    niftyOk = loaded.nifty.length > 200;
    const niftyDays = loaded.nifty.map((bar) => bar.t.slice(0, 10));
    const cleaned = new Map<string, CleanedSeries>();
    const loadClean = async (symbol: string): Promise<CleanedSeries> => {
      const hit = cleaned.get(symbol);
      if (hit) return hit;
      const raw = await loadDaily(symbol);
      const series = cleanSymbol(symbol, raw, niftyDays, VERIFIED_ACTIONS);
      cleaned.set(symbol, series);
      if (raw.length) ranges.set(symbol, { first: raw[0].t.slice(0, 10), last: raw[raw.length - 1].t.slice(0, 10) });
      return series;
    };
    const built = await buildRanks(loaded.symbols.map((row) => row.symbol), loaded.nifty, window.to, loadClean, noteRss, (done, total) => {
      void writeProgress(runId, done, total);
    });
    console.log(`research ${args.book} ${args.sample} ranks ${loaded.symbols.length} symbols`);
    const sessions = new Map<string, Map<string, Bar[]>>();
    let haveIntraday = false;
    try {
      await access(filesRoot());
      haveIntraday = true;
    } catch {
      haveIntraday = false;
    }
    const output = await simulateSwing({
      symbols: loaded.symbols.map((row) => ({ symbol: row.symbol, tick: row.tick, sector: loaded.sectors.get(row.symbol) || row.symbol })),
      load: async (symbol) => {
        if (haveIntraday && !sessions.has(symbol)) {
          const days = new Map<string, Bar[]>();
          await forEachSession(symbol, "5m", window.from, window.to, (day, bars) => {
            if (bars.length) days.set(day, bars);
          });
          sessions.set(symbol, days);
        }
        return (await loadClean(symbol)).segments;
      },
      calendar: built.calendar,
      ranks: built.ranks,
      rankN: built.rankN,
      indexClose: built.indexClose,
      indexUp: built.indexUp,
      strategies: strategiesFor("swing", args.strategies),
      variants: args.variants,
      grid: args.grid,
      sample: args.sample,
      window,
      rules: capital,
      slip: 0.0005,
      gttGap: capital.gttGap,
      limitOffset: capital.limitOffset,
      chasePct: capital.chasePct,
      sink,
      intraday: haveIntraday ? (symbol, day) => sessions.get(symbol)?.get(day) : undefined,
      onSymbol: (symbol, index, total) => {
        stopForTradingWindow();
        noteRss();
        void writeProgress(runId, index + 1, total);
        if (index % 25 === 0 || index + 1 === total) console.log(`research swing ${index + 1}/${total} ${symbol}`);
      },
    });
    scored = output.scored;
    const fingerprint = fingerprintSeries([...cleaned.entries()].map(([symbol, series]) => ({ symbol, segments: series.segments })));
    const removed = [...cleaned.values()].flatMap((series) => series.removed);
    const adjusted = [...cleaned.values()].flatMap((series) => series.adjusted);
    const breaks = [...cleaned.values()].flatMap((series) => series.segmentsAudit.filter((row) => row.reason !== "series start"));
    const mask = [...cleaned.values()].flatMap((series) => series.masked);
    const stored = await tradesInRuns([1, 2, 3], [...cleaned.keys()]).catch((error: unknown) => {
      console.log(`research audit of runs 1-3 skipped: ${error instanceof Error ? error.message : error}`);
      return [];
    });
    const hits = intersectMask(stored, mask);
    cleaningNote = [
      formatComparison(scored),
      formatOpens(scored),
      formatAudits(removed, adjusted, breaks),
      formatEligibility(output.eligibility),
      `Approximated daily fills: ${output.fills.dailyApprox ?? 0}. Intraday 09:45-14:30 fills: ${output.fills.intraday ?? 0}. Same-bar ambiguity: ${output.fills.ambiguous ?? 0}.`,
      output.fills.intraday ? "" : "No 5-minute bars were supplied for this run, so limit fills are daily-candle approximations. A daily fill is the limit price only when the daily range contains it. A session that trades entirely below the limit is not filled, because the open and the low are not awarded.",
      formatIntersections(hits),
      formatOverlap(scored),
      "Execution stress doubles adverse market and open slippage from 0.05% to 0.10%. A buy limit does not fill above its limit. A touched stop stays at the stop. A gap exit and a rule exit take the adverse open slippage. Concentration stress removes the positive P&L of the largest completed winners and replays later sizing. It is not a separate strategy.",
    ].filter(Boolean).join("\n");
    console.log(cleaningNote);
    const universeSymbols = loaded.symbols.map((row) => row.symbol);
    Object.assign(params, {
      cleaning: {
        version: CLEAN_VERSION,
        thresholds: CLEAN_THRESHOLDS,
        engineSha: engineSha(),
        universe: universeSymbols,
        universeNote: SURVIVORSHIP,
        fingerprint,
        removed,
        adjusted,
        segments: breaks,
        maskRanges: mask.length,
        maskBars: mask.reduce((sum, row) => sum + row.bars, 0),
        intersections: hits.slice(0, 500),
        intersectionCount: hits.length,
        eligibility: output.eligibility,
        fills: output.fills,
      },
    });
    await q(
      `UPDATE mlive.mlive_research_runs SET params = $2::jsonb WHERE id = $1`,
      [runId, JSON.stringify(params)]
    );
    limitNote = sink.text;
    if (limitNote) console.log(limitNote);
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
      onSymbol: (label, index, total) => {
        stopForTradingWindow();
        if (index != null && total != null) void writeProgress(runId, index + 1, total);
        console.log(`research intraday ${label}`);
      },
    });
  }
  noteRss();
  const note = buildNote(args, capital, window, quarters, niftyOk, scored, limitNote, cleaningNote);
  const data = {
    universe: args.book === "swing" ? "nifty500" : "nifty200+nifty100",
    survivorship: SURVIVORSHIP,
    symbols: ranges.size,
    first: earliest(ranges),
    last: latest(ranges),
    perSymbol: Object.fromEntries(ranges),
    nifty: niftyOk,
    report: cleaningNote,
    openAtEnd: scored.map((row) => ({
      strategy: row.strategy,
      paramsKey: row.paramsKey,
      count: row.book.openPositions.length,
      unrealised: row.book.unrealised,
      unrealisedIncludesExitCharges: row.book.unrealisedIncludesExitCharges,
      positions: row.book.openPositions,
    })),
  };
  if (ranges.size === 0) {
    await finish(runId, "ok", note, data);
    console.log("research finished with no candles");
    return;
  }
  await saveResults(runId, scored);
  const overlapRows = scored.filter((row) =>
    (row.strategy === "rs" && row.isDefault) ||
    (row.strategy === "trend_breakout" && row.isDefault) ||
    (row.strategy === "momentum" && row.params.capPct === 15)
  );
  await saveOverlap(runId, overlapRows);
  await saveTrades(runId, scored);
  await pruneOldTrades();
  await finish(runId, "ok", note, data);
  for (const row of scored.filter((item) => item.isDefault)) {
    console.log(
      `research ${row.strategy} ${row.paramsKey} trades ${row.score.trades} pf ${row.score.profitFactor.toFixed(2)} exp ${row.book.exposurePct.toFixed(1)} cash ${row.book.minCash.toFixed(0)} ${row.score.passed ? "pass" : "fail"}`
    );
    if (row.strategy === "ema" || row.strategy === "rsi2") logLosses(row);
  }
}

function logLosses(row: ScoredRun): void {
  const worst = [...row.book.trades].sort((a, b) => a.net - b.net).slice(0, 10);
  let beyond = 0;
  let beyondGap = 0;
  for (const trade of row.book.trades) {
    if (trade.r == null || trade.r >= -1.5) continue;
    beyond += 1;
    if (gappedThrough(trade)) beyondGap += 1;
  }
  console.log(`research ${row.strategy} losses beyond 1.5R ${beyond}, of which the open gapped through the backstop ${beyondGap}`);
  for (const trade of worst) {
    const gap = gappedThrough(trade) ? "gap" : "no-gap";
    console.log(
      `research loss ${row.strategy} ${trade.symbol} ${trade.entryDate} entry ${trade.entryPx} stop ${trade.stop} backstop ${trade.protective ?? ""} open ${trade.exitOpen ?? ""} exit ${trade.exitPx} ${trade.exitReason} r ${trade.r ?? ""} ${gap}`
    );
  }
}

function gappedThrough(trade: { side: "long" | "short"; exitOpen?: number; protective?: number }): boolean {
  if (trade.exitOpen == null || trade.protective == null || !(trade.protective > 0)) return false;
  return trade.side === "long" ? trade.exitOpen < trade.protective - 1e-6 : trade.exitOpen > trade.protective + 1e-6;
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
    limitOffset: settings.limitOffset,
    chasePct: settings.chasePct,
  };
}

async function loadSwingUniverse(only?: string[]) {
  const rows = await universe("nifty500");
  const wanted = only?.length ? new Set(only) : null;
  const symbols = wanted ? rows.filter((row) => wanted.has(row.symbol)) : rows;
  const nifty = await dailyBars("NIFTY 50");
  const sectorRows = await mq<{ symbol: string; industry: string | null }>(
    `SELECT symbol, industry FROM universe WHERE industry IS NOT NULL AND industry <> ''`
  );
  const sectors = new Map(sectorRows.map((row) => [row.symbol, row.industry ?? ""]));
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

async function buildRanks(
  symbols: string[],
  nifty: Bar[],
  to: string,
  loadClean: (symbol: string) => Promise<CleanedSeries>,
  noteRss: () => void,
  onProgress?: (done: number, total: number) => void,
) {
  const calendar = (nifty.length ? nifty.map((bar) => bar.t) : await calendarFrom(symbols, to)).filter((day) => day <= to);
  const unique = [...new Set(calendar)].sort();
  const at = new Map(unique.map((day, index) => [day, index]));
  const matrix: Float64Array[] = [];
  const names: string[] = [];
  for (let i = 0; i < symbols.length; i++) {
    stopForTradingWindow();
    const series = await loadClean(symbols[i]);
    const closes = new Float64Array(unique.length);
    const segments = new Int16Array(unique.length);
    closes.fill(Number.NaN);
    let segmentId = 1;
    for (const segment of series.segments) {
      for (const bar of segment) {
        const index = at.get(bar.t);
        if (index == null) continue;
        closes[index] = bar.c;
        segments[index] = segmentId;
      }
      segmentId += 1;
    }
    matrix.push(returns90(closes, segments));
    names.push(symbols[i]);
    onProgress?.(i + 1, symbols.length);
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
  if (shouldStopResearch(skipResearchWindow, istMinutes())) throw new Error(WINDOW_STOP);
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

function buildNote(
  args: ResearchArgs,
  capital: Capital,
  window: { from: string; to: string },
  quarters: boolean,
  niftyOk: boolean,
  scored: ScoredRun[],
  limitNote = "",
  cleaningNote = ""
): string {
  const fund = `₹${capital.capital.toLocaleString("en-IN")}`;
  const cost = args.book === "swing"
    ? "Costs are Zerodha charges on the simulated quantity. A swing entry and exit on the same trading day uses the intraday schedule and does not pay the delivery DP charge. Other sells pay delivery charges, including DP. Market and open fills use 0.05% slippage. Open-at-end marks do not include estimated exit charges."
    : "Costs are MIS charges on the simulated quantity and turnover, plus 0.1% slippage.";
  const rules = args.book === "swing"
    ? `Starting capital is ${fund}. Position caps, the daily deployment cap and the ${pct(capital.riskPct)} risk budget use that morning's equity, cash plus open positions marked at the open. ₹${capital.cashReserve.toLocaleString("en-IN")} stays in cash. At most ${pct(capital.maxOrderPct)} per order, ${capital.maxNewBuys} new buys a day, ${pct(capital.maxDailyDeployPct)} deployed in one day, ${capital.maxOpen} open positions and ${capital.maxPerSector} per sector.`
    : `Capital is ${fund}, ${capital.leverage}× buying power, ${pct(capital.riskPct)} risk, at most ${capital.maxTrades} trades a day, and the day stops at −${pct(capital.dayLossPct)}. Shorts are ${capital.short ? "allowed" : "off"}. No new entry after ${capital.entryAfter}. Positions close at ${capital.exitTime}.`;
  const stop = args.book === "swing"
    ? `For RS and EMA, a low through the GTT, ${(capital.gttGap * 100).toFixed(0)}% under the trend stop, sells at that trigger, or at the open when the bar gaps through it. Other strategies sell at their own stop.`
    : "Bars before 09:15 and from 15:15 onward are ignored, including days before 3 Aug 2026.";
  const names = new Set(args.strategies ?? []);
  const momentum = scored.find((row) => row.strategy === "momentum" && (row.isDefault || row.params.capPct === 15));
  const gates = args.variants?.length
    ? scored.map((row) => {
        const block = row.book.blocks;
        return `${row.variant}: ${block.candidates} candidates, ${block.filled} filled; blocks held ${block.held}, daily-buy ${block.cappedBuys}, max-open ${block.cappedOpen}, per-strategy ${block.cappedStrategy}, sector ${block.sector}, daily-deploy ${block.deploy}, gross-cap ${block.grossExposure}, position-cap ${block.positionCap}, cash ${block.insufficientCash}, minimum/whole-share ${block.minimumOrder}, unfilled-limit ${block.unfilledLimit}.`;
      }).join(" ")
    : momentum
    ? `Momentum entry gates: ${momentum.book.blocks.candidates} candidates, ${momentum.book.blocks.filled} filled, ${momentum.book.blocks.cappedBuys} blocked by the new-buy cap, ${momentum.book.blocks.cappedOpen} by the open-position cap, ${momentum.book.blocks.held} because the name was already held, ${momentum.book.blocks.sector} by the sector cap, ${momentum.book.blocks.deploy} by the daily deploy cap, ${momentum.book.blocks.size} because the order could not be sized. Lowest cash was ₹${Math.round(momentum.book.minCash).toLocaleString("en-IN")}.`
    : "";
  return [
    `${args.sample === "heldback" ? "Held-back" : "Building"} sample ${window.from} to ${window.to}.`,
    SURVIVORSHIP,
    args.book === "swing" ? JOIN_DATES : "",
    cost,
    rules,
    stop,
    quarters ? "Profitable periods are calendar quarters because this window is under two years." : "",
    niftyOk ? "" : "NIFTY 50 daily candles are missing, so momentum and RS do not take trades.",
    names.has("rs") || names.has("ema") ? PORT_NOTE : "",
    names.has("momentum") ? MOMENTUM_NOTE : "",
    limitNote,
    cleaningNote,
    args.variants?.length ? `Declarative swing variants: ${args.variants.join(", ")}. Each row uses its frozen ₹4,000 minimum, position/open/gross caps and sizing rule; live strategy settings are unchanged.` : "",
    gates,
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
        JSON.stringify(row.variant ? { ...row.params, variant: row.variant } : row.params),
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
  const keep = new Set(rows.map((row) => Number(row.id)));
  keep.add(1);
  keep.add(2);
  keep.add(3);
  await pruneTrades([...keep]);
}

async function finish(runId: number, status: string, note: string, data: unknown): Promise<void> {
  await q(
    `UPDATE mlive.mlive_research_runs
        SET status = $2, finished_at = now(), note = $3, data = $4::jsonb, engine_sha = $5
      WHERE id = $1`,
    [runId, status, note, JSON.stringify(data), engineSha()]
  );
}

async function insertRun(args: ResearchArgs, strategies: string[], status: string, requestedBy: string, identity?: ResearchIdentity | null): Promise<number> {
  const rows = await q<{ id: string }>(
    `INSERT INTO mlive.mlive_research_runs
       (book, sample, status, requested_by, started_at, params, engine_sha)
     VALUES ($1,$2,$3,$4, CASE WHEN $3 = 'running' THEN now() ELSE NULL END, $5::jsonb,$6)
     RETURNING id::text AS id`,
    [args.book, args.sample, status, requestedBy, JSON.stringify({ strategies, variants: args.variants ?? [], grid: args.grid, only: args.only ?? null, sample: args.sample, identity: identity ?? null }), identity?.engineSha || engineSha()]
  );
  return Number(rows[0].id);
}

export async function researchIdentityFor(input: {
  book: ResearchBook;
  sample: ResearchArgs["sample"];
  grid: boolean;
  only?: string[];
  strategies: string[];
  variants?: SwingVariantName[];
}): Promise<ResearchIdentity> {
  const last = input.book === "swing" ? await lastDailyDate() : todayIst();
  return makeIdentity({
    book: input.book,
    sample: input.sample,
    strategies: input.strategies,
    variants: input.variants,
    grid: input.grid,
    engineSha: engineSha(),
    lastCandle: last ?? "",
    only: input.only ?? [],
  });
}

export async function duplicateIdentityError(identity: ResearchIdentity, ignoreId?: number): Promise<string | null> {
  const rows = await q<{ id: string; status: string; sample: string; finished_at: string | null; params: unknown; data: unknown; engine_sha: string | null }>(
    `SELECT id::text AS id, status, sample, finished_at::text AS finished_at, params, data, engine_sha
       FROM mlive.mlive_research_runs
      WHERE book = $1 AND status IN ('ok', 'queued', 'running')
      ORDER BY id DESC
      LIMIT 200`,
    [identity.book]
  );
  const stored: StoredRun[] = rows.map((row) => ({
    id: Number(row.id),
    status: row.status,
    finishedAt: row.finished_at,
    identity: identityFromRun({
      book: identity.book,
      sample: row.sample,
      params: jsonValue(row.params),
      engineSha: row.engine_sha ?? "",
      dataLast: dataLastOf(row.data),
    }),
  }));
  return duplicateBlock(identity, stored, false, ignoreId) ?? queueBlock(identity, stored, ignoreId);
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
  return insertRun({ book: input.book, strategies: names, sample: input.sample, force: input.force, grid: true, anytime: false }, names, "queued", input.requestedBy);
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

function dataLastOf(data: unknown): string | null {
  const row = jsonValue(data);
  if (!row || typeof row !== "object" || Array.isArray(row)) return null;
  const last = (row as { last?: unknown }).last;
  return typeof last === "string" ? last : null;
}

async function writeProgress(runId: number, done: number, total: number): Promise<void> {
  if (total <= 0 || (done !== 1 && done !== total && done % 10 !== 0)) return;
  await q(
    `UPDATE mlive.mlive_research_runs
        SET data = jsonb_set(COALESCE(data, '{}'::jsonb), '{progress}', $2::jsonb, true)
      WHERE id = $1`,
    [runId, JSON.stringify({ done, total })]
  ).catch(() => undefined);
}
