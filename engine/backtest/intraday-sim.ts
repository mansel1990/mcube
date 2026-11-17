import { estimateCharges, type ChargeRates } from "@/lib/mlive/charges";
import { sizeOrder } from "@/lib/mlive/rules";
import type { Bar } from "../strategies/math";
import { emptyContext, type Signal, type SignalContext, type StrategyDef } from "../strategies/types";
import { roundTrip, slipped } from "./money";
import type { BookResult, FilledTrade } from "./portfolio";
import { barClock, barDay, inCashSession } from "./session";

export type SessionTrade = {
  symbol: string;
  day: string;
  side: "long" | "short";
  score: number;
  entryTs: string;
  exitTs: string;
  entryPx: number;
  exitPx: number;
  stop: number;
  exitReason: string;
  barsHeld: number;
};

export type SessionOptions = {
  symbol: string;
  tick: number;
  slip: number;
  exitTime: string;
  entryAfter: string;
};

type OpenPos = {
  signal: Signal;
  entryIndex: number;
  entryPx: number;
  stop: number;
  target: number | null;
};

export function walkSession(strategy: StrategyDef, ctx: SignalContext, opts: SessionOptions): SessionTrade[] {
  const kept: Bar[] = [];
  for (const bar of ctx.bars) {
    if (!inCashSession(bar.t)) continue;
    if (barClock(bar.t) > opts.exitTime) break;
    kept.push(bar);
  }
  if (kept.length < 3) return [];
  const view = emptyContext(kept, ctx.params);
  view.atr = ctx.atr;
  view.cache = new Map();
  const at = new Map<number, Signal>();
  for (const signal of strategy.signals(view)) {
    if (signal.at < 0 || signal.at >= kept.length - 1) continue;
    const prev = at.get(signal.at);
    if (!prev || signal.score > prev.score) at.set(signal.at, signal);
  }
  const trades: SessionTrade[] = [];
  let enterNext: Signal | null = null;
  let exitNext = false;
  let pos: OpenPos | null = null;

  const close = (index: number, exitPx: number, reason: string) => {
    if (!pos) return;
    trades.push({
      symbol: opts.symbol,
      day: barDay(kept[pos.entryIndex].t),
      side: pos.signal.side,
      score: pos.signal.score,
      entryTs: kept[pos.entryIndex].t,
      exitTs: kept[index].t,
      entryPx: pos.entryPx,
      exitPx,
      stop: pos.stop,
      exitReason: reason,
      barsHeld: Math.max(0, index - pos.entryIndex),
    });
    pos = null;
    exitNext = false;
  };

  for (let i = 0; i < kept.length; i++) {
    const bar = kept[i];
    const clock = barClock(bar.t);
    if (pos && clock >= opts.exitTime) {
      const hit = hitBracket(bar, pos);
      if (hit) close(i, hit.price, hit.reason);
      else close(i, slipped(bar.c, pos.signal.side, "exit", opts.slip, opts.tick), "time");
      break;
    }
    if (exitNext && pos) {
      const hit = hitBracket(bar, pos);
      if (hit && (pos.signal.side === "long" ? bar.o <= pos.stop : bar.o >= pos.stop)) close(i, hit.price, "stop");
      else close(i, slipped(bar.o, pos.signal.side, "exit", opts.slip, opts.tick), "rule");
    }
    if (enterNext && !pos) {
      if (clock <= opts.entryAfter) {
        const signal = enterNext;
        const entryPx = slipped(bar.o, signal.side, "entry", opts.slip, opts.tick);
        const bracket = strategy.bracket ? strategy.bracket(entryPx, signal, view) : { stop: signal.stop, target: signal.target ?? null };
        if (entryPx > 0 && bracket.stop > 0 && (signal.side === "long" ? bracket.stop < entryPx : bracket.stop > entryPx)) {
          pos = { signal, entryIndex: i, entryPx, stop: bracket.stop, target: bracket.target };
          const hit = hitBracket(bar, pos);
          if (hit) close(i, hit.price, hit.reason);
        }
      }
      enterNext = null;
    }
    if (pos && i > pos.entryIndex) {
      const hit = hitBracket(bar, pos);
      if (hit) close(i, hit.price, hit.reason);
      else {
        const decision = strategy.afterClose({ ...view, entryAt: pos.entryIndex, side: pos.signal.side, stop: pos.stop }, i);
        if (decision.exit) exitNext = true;
        else if (decision.stop > 0) pos.stop = decision.stop;
      }
    }
    if (!pos && !exitNext && i < kept.length - 1 && clock <= opts.entryAfter) {
      const signal = at.get(i);
      const nextClock = barClock(kept[i + 1].t);
      if (signal && nextClock <= opts.entryAfter && nextClock < opts.exitTime) enterNext = signal;
    }
  }
  if (pos) {
    const last = kept.length - 1;
    close(last, slipped(kept[last].c, pos.signal.side, "exit", opts.slip, opts.tick), "time");
  }
  return trades;
}

function hitBracket(bar: Bar, pos: OpenPos): { price: number; reason: string } | null {
  const hitStop = pos.signal.side === "long" ? bar.l <= pos.stop : bar.h >= pos.stop;
  const hitTarget = pos.target == null ? false : pos.signal.side === "long" ? bar.h >= pos.target : bar.l <= pos.target;
  if (hitStop) {
    const gapped = pos.signal.side === "long" ? bar.o < pos.stop : bar.o > pos.stop;
    return { price: gapped ? bar.o : pos.stop, reason: "stop" };
  }
  if (hitTarget && pos.target != null) {
    const gapped = pos.signal.side === "long" ? bar.o > pos.target : bar.o < pos.target;
    return { price: gapped ? bar.o : pos.target, reason: "target" };
  }
  return null;
}

export type DayRules = {
  capital: number;
  riskPct: number;
  leverage: number;
  maxTrades: number;
  dayLossPct: number;
  short: boolean;
  rates?: ChargeRates;
};

type DayLot = { exitTs: string; notional: number; net: number };

export function selectIntraday(candidates: SessionTrade[], rules: DayRules, calendar: string[]): BookResult {
  const days = calendar.length ? calendar : [...new Set(candidates.map((candidate) => candidate.day))].sort();
  const byDay = new Map<string, SessionTrade[]>();
  for (const candidate of candidates) {
    const list = byDay.get(candidate.day) ?? [];
    list.push(candidate);
    byDay.set(candidate.day, list);
  }
  let equityValue = rules.capital;
  let minCash = equityValue;
  let exposureSum = 0;
  const trades: FilledTrade[] = [];
  const equity: { date: string; value: number }[] = [];
  const buyingPower = rules.capital * rules.leverage;

  for (const day of days) {
    const ordered = (byDay.get(day) ?? []).slice().sort((a, b) => a.entryTs.localeCompare(b.entryTs) || b.score - a.score);
    const open: DayLot[] = [];
    let used = 0;
    let dayPnl = 0;
    const halt = { at: null as string | null };
    let count = 0;
    let peakUsed = 0;
    const release = (until: string) => {
      const due = open.filter((lot) => lot.exitTs <= until).sort((a, b) => a.exitTs.localeCompare(b.exitTs));
      const keep = open.filter((lot) => lot.exitTs > until);
      for (const lot of due) {
        dayPnl += lot.net;
        used -= lot.notional;
        if (!halt.at && dayPnl <= -rules.capital * rules.dayLossPct + 1e-9) halt.at = lot.exitTs;
      }
      open.length = 0;
      open.push(...keep);
    };
    for (const candidate of ordered) {
      release(candidate.entryTs);
      if (halt.at !== null && candidate.entryTs > halt.at) continue;
      if (count >= rules.maxTrades) continue;
      if (candidate.side === "short" && !rules.short) continue;
      const room = buyingPower - used;
      if (room <= candidate.entryPx) continue;
      const sized = sizeOrder({
        fund: rules.capital,
        entry: candidate.entryPx,
        stop: candidate.stop,
        spendable: room,
        riskPct: rules.riskPct,
        maxOrderPct: rules.leverage,
        minOrderInr: 0,
      });
      let qty = sized.qty;
      while (qty > 0) {
        const notional = qty * candidate.entryPx;
        const charges = estimateCharges(candidate.side === "long" ? "BUY" : "SELL", notional, rules.rates, true).total;
        if (notional + charges <= room + 1e-6) break;
        qty -= 1;
      }
      if (qty < 1) continue;
      const money = roundTrip({
        side: candidate.side,
        entryPx: candidate.entryPx,
        exitPx: candidate.exitPx,
        qty,
        intraday: true,
        rates: rules.rates,
      });
      const notional = qty * candidate.entryPx;
      used += notional;
      peakUsed = Math.max(peakUsed, used);
      count += 1;
      const risk = Math.abs(candidate.entryPx - candidate.stop) * qty;
      open.push({ exitTs: candidate.exitTs, notional, net: money.net });
      trades.push({
        symbol: candidate.symbol,
        sector: candidate.symbol,
        side: candidate.side,
        score: candidate.score,
        entryDate: candidate.day,
        exitDate: candidate.day,
        entryTs: candidate.entryTs,
        exitTs: candidate.exitTs,
        entryPx: candidate.entryPx,
        exitPx: candidate.exitPx,
        stop: candidate.stop,
        qty,
        gross: money.gross,
        charges: money.charges,
        net: money.net,
        netPct: money.netPct,
        r: risk > 0 ? money.net / risk : null,
        exitReason: candidate.exitReason,
        barsHeld: candidate.barsHeld,
      });
      minCash = Math.min(minCash, equityValue - used);
    }
    release("99:99");
    equityValue += dayPnl;
    minCash = Math.min(minCash, equityValue);
    exposureSum += peakUsed / rules.capital;
    equity.push({ date: day, value: equityValue });
  }

  return {
    trades,
    equity,
    exposurePct: days.length ? (exposureSum / days.length) * 100 : 0,
    minCash,
  };
}
