import { estimateCharges, type ChargeRates } from "@/lib/mlive/charges";
import { sizeOrder } from "@/lib/mlive/rules";
import { roundTrip } from "./money";
import type { WalkTrade } from "./walk";

export type Candidate = WalkTrade & { sector: string };

export type SwingRules = {
  capital: number;
  riskPct: number;
  maxOrderPct: number;
  minOrderInr: number;
  cashReserve: number;
  maxNewBuys: number;
  maxOpen: number;
  maxPerSector: number;
  maxDailyDeployPct: number;
  rates?: ChargeRates;
};

export type FilledTrade = {
  symbol: string;
  sector: string;
  side: "long" | "short";
  score: number;
  entryDate: string;
  exitDate: string;
  entryTs: string;
  exitTs: string;
  entryPx: number;
  exitPx: number;
  stop: number;
  qty: number;
  gross: number;
  charges: number;
  net: number;
  netPct: number;
  r: number | null;
  exitReason: string;
  barsHeld: number;
};

export type BookResult = {
  trades: FilledTrade[];
  equity: { date: string; value: number }[];
  exposurePct: number;
  minCash: number;
};

type Lot = {
  trade: FilledTrade;
  marks: Map<string, number>;
  last: number;
};

export function runSwingPortfolio(candidates: Candidate[], rules: SwingRules, calendar: string[]): BookResult {
  const byDay = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const list = byDay.get(candidate.entryDate) ?? [];
    list.push(candidate);
    byDay.set(candidate.entryDate, list);
  }
  for (const list of byDay.values()) {
    list.sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol));
  }
  const days = calendar.length
    ? calendar
    : [...new Set(candidates.flatMap((candidate) => [candidate.entryDate, candidate.exitDate]))].sort();
  let cash = rules.capital;
  let minCash = cash;
  const open: Lot[] = [];
  const taken: FilledTrade[] = [];
  const equity: { date: string; value: number }[] = [];
  let investedSum = 0;

  const closeLot = (lot: Lot) => {
    const sellTurnover = lot.trade.exitPx * lot.trade.qty;
    const charges = estimateCharges("SELL", sellTurnover, rules.rates, false).total;
    cash += sellTurnover - charges;
    minCash = Math.min(minCash, cash);
  };

  for (const day of days) {
    for (const lot of open.filter((item) => item.trade.exitDate === day && item.trade.entryDate < day)) closeLot(lot);
    const still = open.filter((item) => !(item.trade.exitDate === day && item.trade.entryDate < day));
    open.length = 0;
    open.push(...still);

    let newBuys = 0;
    let deployed = 0;
    for (const candidate of byDay.get(day) ?? []) {
      if (newBuys >= rules.maxNewBuys || open.length >= rules.maxOpen) break;
      if (open.some((lot) => lot.trade.symbol === candidate.symbol)) continue;
      const sector = candidate.sector || candidate.symbol;
      if (open.filter((lot) => lot.trade.sector === sector).length >= rules.maxPerSector) continue;
      const spendable = Math.max(0, cash - rules.cashReserve);
      const sized = sizeOrder({
        fund: rules.capital,
        entry: candidate.entryPx,
        stop: candidate.stop,
        spendable,
        riskPct: rules.riskPct,
        maxOrderPct: rules.maxOrderPct,
        minOrderInr: rules.minOrderInr,
      });
      let qty = sized.qty;
      const room = rules.maxDailyDeployPct * rules.capital - deployed;
      if (room <= 0) continue;
      qty = Math.min(qty, Math.floor((room + 1e-9) / candidate.entryPx));
      while (qty > 0) {
        const notional = qty * candidate.entryPx;
        const buyCharges = estimateCharges("BUY", notional, rules.rates, false).total;
        if (notional <= rules.maxOrderPct * rules.capital + 1e-6 && notional + buyCharges <= cash - rules.cashReserve + 1e-6 && notional + 1e-6 >= rules.minOrderInr) break;
        qty -= 1;
      }
      if (qty < 1) continue;
      const notional = qty * candidate.entryPx;
      const buyCharges = estimateCharges("BUY", notional, rules.rates, false).total;
      cash -= notional + buyCharges;
      minCash = Math.min(minCash, cash);
      deployed += notional;
      newBuys += 1;
      const money = roundTrip({ side: candidate.side, entryPx: candidate.entryPx, exitPx: candidate.exitPx, qty, intraday: false, rates: rules.rates });
      const risk = Math.abs(candidate.entryPx - candidate.stop) * qty;
      const trade: FilledTrade = {
        symbol: candidate.symbol,
        sector,
        side: candidate.side,
        score: candidate.score,
        entryDate: candidate.entryDate,
        exitDate: candidate.exitDate,
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
      };
      const marks = new Map(candidate.marks.map((mark) => [mark.date, mark.close]));
      open.push({ trade, marks, last: candidate.entryPx });
      taken.push(trade);
    }

    for (const lot of open.filter((item) => item.trade.exitDate === day && item.trade.entryDate === day)) closeLot(lot);
    const overnight = open.filter((item) => !(item.trade.exitDate === day && item.trade.entryDate === day));
    open.length = 0;
    open.push(...overnight);

    let invested = 0;
    for (const lot of open) {
      const mark = lot.marks.get(day) ?? lot.last;
      lot.last = mark;
      invested += mark * lot.trade.qty;
    }
    investedSum += invested;
    equity.push({ date: day, value: cash + invested });
  }

  for (const lot of open) closeLot(lot);
  return {
    trades: taken,
    equity,
    exposurePct: days.length ? (investedSum / days.length / rules.capital) * 100 : 0,
    minCash,
  };
}
