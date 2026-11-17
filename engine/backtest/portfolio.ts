import { estimateCharges, type ChargeRates } from "@/lib/mlive/charges";
import { sizeOrder } from "@/lib/mlive/rules";
import { roundTrip } from "./money";
import type { WalkTrade } from "./walk";

export type Candidate = WalkTrade & { sector: string; group?: string };

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
  /** Each strategy group may hold at most this many names. Unset means no extra cap. */
  maxPerStrategy?: number;
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
  exitOpen?: number;
  protective?: number;
  group?: string;
  scaleOut?: { date: string; px: number };
};

export type OpenPosition = {
  symbol: string;
  sector: string;
  side: "long" | "short";
  group?: string;
  qty: number;
  entryDate: string;
  entryTs: string;
  entryPx: number;
  mark: number;
  markDate: string;
  stop: number;
  unrealised: number;
  pendingExit: boolean;
};

export type SwingBlocks = {
  candidates: number;
  filled: number;
  cappedBuys: number;
  cappedOpen: number;
  held: number;
  sector: number;
  deploy: number;
  size: number;
};

export type BookResult = {
  trades: FilledTrade[];
  equity: { date: string; value: number }[];
  /** Average of invested value ÷ that day's equity. */
  exposurePct: number;
  minCash: number;
  blocks: SwingBlocks;
  openPositions: OpenPosition[];
  unrealised: number;
  /** Mark-to-market uses the session close. Estimated exit charges are not deducted. */
  unrealisedIncludesExitCharges: false;
};

export type PortfolioOpts = {
  /** Completed trades whose positive net is removed after the exit. Identity is symbol|entryTs|exitTs. */
  mute?: ReadonlySet<string>;
};

function combinedSale(
  candidate: Candidate,
  qty: number,
  partQty: number,
  rates: ChargeRates | undefined,
  intraday: boolean
): { gross: number; charges: number; net: number; netPct: number } {
  const sale = candidate.scaleOut;
  const first = roundTrip({
    side: candidate.side,
    entryPx: candidate.entryPx,
    exitPx: sale?.px ?? candidate.exitPx,
    qty: partQty,
    intraday,
    rates,
  });
  const rest = roundTrip({
    side: candidate.side,
    entryPx: candidate.entryPx,
    exitPx: candidate.exitPx,
    qty: qty - partQty,
    intraday,
    rates,
  });
  const gross = first.gross + rest.gross;
  const charges = first.charges + rest.charges;
  const net = first.net + rest.net;
  const basis = candidate.entryPx * qty;
  return { gross, charges, net, netPct: basis > 0 ? (net / basis) * 100 : 0 };
}

function emptyBlocks(): SwingBlocks {
  return { candidates: 0, filled: 0, cappedBuys: 0, cappedOpen: 0, held: 0, sector: 0, deploy: 0, size: 0 };
}

type Lot = {
  trade: FilledTrade;
  marks: Map<string, number>;
  opens: Map<string, number>;
  last: number;
  /** Shares still open. A half sale reduces this before the final exit. */
  openQty: number;
  originalQty: number;
  entryCharges: number;
  intraday: boolean;
  scaled: boolean;
  muted: boolean;
  pendingExit: boolean;
};

export function muteKey(trade: { symbol: string; entryTs: string; exitTs: string }): string {
  return `${trade.symbol}|${trade.entryTs}|${trade.exitTs}`;
}

export function runSwingPortfolio(candidates: Candidate[], rules: SwingRules, calendar: string[], opts: PortfolioOpts = {}): BookResult {
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
  let exposureSum = 0;
  const blocks = emptyBlocks();

  const closedOn = (lot: Lot, day: string) => lot.trade.exitReason !== "open" && lot.trade.exitDate === day;

  const closeLot = (lot: Lot) => {
    const sellTurnover = lot.trade.exitPx * lot.openQty;
    const charges = estimateCharges("SELL", sellTurnover, rules.rates, lot.intraday).total;
    let credit = sellTurnover - charges;
    if (lot.muted && lot.trade.net > 0) {
      credit -= lot.trade.net;
      lot.trade.net = 0;
      lot.trade.netPct = 0;
    }
    cash += credit;
    minCash = Math.min(minCash, cash);
  };

  const scaleLot = (lot: Lot) => {
    const sale = lot.trade.scaleOut;
    if (!sale || lot.scaled || sale.date > lot.trade.exitDate) return;
    const part = Math.floor(lot.openQty / 2);
    if (part < 1) return;
    const turnover = sale.px * part;
    const charges = estimateCharges("SELL", turnover, rules.rates, lot.intraday).total;
    cash += turnover - charges;
    minCash = Math.min(minCash, cash);
    lot.openQty -= part;
    lot.scaled = true;
  };

  for (const day of days) {
    for (const lot of open) {
      if (lot.trade.scaleOut?.date === day && lot.trade.entryDate < day) scaleLot(lot);
    }
    for (const lot of open.filter((item) => closedOn(item, day) && item.trade.entryDate < day)) closeLot(lot);
    const still = open.filter((item) => !(closedOn(item, day) && item.trade.entryDate < day));
    open.length = 0;
    open.push(...still);

    let fund = cash;
    for (const lot of open) {
      const morning = lot.opens.get(day);
      fund += (morning != null && morning > 0 ? morning : lot.last) * lot.openQty;
    }
    let newBuys = 0;
    let deployed = 0;
    for (const candidate of byDay.get(day) ?? []) {
      blocks.candidates += 1;
      if (newBuys >= rules.maxNewBuys) {
        blocks.cappedBuys += 1;
        continue;
      }
      if (open.length >= rules.maxOpen) {
        blocks.cappedOpen += 1;
        continue;
      }
      if (rules.maxPerStrategy && candidate.group && open.filter((lot) => lot.trade.group === candidate.group).length >= rules.maxPerStrategy) {
        blocks.cappedOpen += 1;
        continue;
      }
      if (open.some((lot) => lot.trade.symbol === candidate.symbol)) {
        blocks.held += 1;
        continue;
      }
      const sector = candidate.sector || candidate.symbol;
      if (open.filter((lot) => lot.trade.sector === sector).length >= rules.maxPerSector) {
        blocks.sector += 1;
        continue;
      }
      const spendable = Math.max(0, cash - rules.cashReserve);
      const room = rules.maxDailyDeployPct * fund - deployed;
      if (room <= 0) {
        blocks.deploy += 1;
        continue;
      }
      const sameDay = candidate.exitReason !== "open" && candidate.entryDate === candidate.exitDate;
      const toCap = candidate.sizeToCap === true || candidate.priceStop === false;
      const sizingStop = candidate.riskStop != null && candidate.riskStop > 0 ? candidate.riskStop : candidate.stop;
      let qty = toCap
        ? Math.min(Math.floor((rules.maxOrderPct * fund + 1e-9) / candidate.entryPx), Math.floor((spendable + 1e-9) / candidate.entryPx))
        : sizeOrder({
            fund,
            entry: candidate.entryPx,
            stop: sizingStop,
            spendable,
            riskPct: rules.riskPct,
            maxOrderPct: rules.maxOrderPct,
            minOrderInr: rules.minOrderInr,
          }).qty;
      qty = Math.min(qty, Math.floor((room + 1e-9) / candidate.entryPx));
      while (qty > 0) {
        const notional = qty * candidate.entryPx;
        const buyCharges = estimateCharges("BUY", notional, rules.rates, sameDay).total;
        if (notional <= rules.maxOrderPct * fund + 1e-6 && notional + buyCharges <= cash - rules.cashReserve + 1e-6 && notional + 1e-6 >= rules.minOrderInr) break;
        qty -= 1;
      }
      if (qty < 1) {
        blocks.size += 1;
        continue;
      }
      const notional = qty * candidate.entryPx;
      const buyCharges = estimateCharges("BUY", notional, rules.rates, sameDay).total;
      cash -= notional + buyCharges;
      minCash = Math.min(minCash, cash);
      deployed += notional;
      newBuys += 1;
      blocks.filled += 1;
      const partQty = candidate.exitReason !== "open" && candidate.scaleOut && candidate.scaleOut.date < candidate.exitDate ? Math.floor(qty / 2) : 0;
      const money = candidate.exitReason === "open"
        ? { gross: 0, charges: buyCharges, net: 0, netPct: 0 }
        : partQty > 0 && candidate.scaleOut
          ? combinedSale(candidate, qty, partQty, rules.rates, sameDay)
          : roundTrip({ side: candidate.side, entryPx: candidate.entryPx, exitPx: candidate.exitPx, qty, intraday: sameDay, rates: rules.rates });
      const riskDistance = candidate.priceStop === false ? 0 : Math.abs(candidate.entryPx - sizingStop);
      const risk = riskDistance * qty;
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
        exitOpen: candidate.exitOpen,
        protective: candidate.protective,
        group: candidate.group,
        scaleOut: partQty > 0 ? candidate.scaleOut : undefined,
      };
      const marks = new Map(candidate.marks.map((mark) => [mark.date, mark.close]));
      const mornings = new Map(candidate.marks.flatMap((mark) => (mark.open != null ? [[mark.date, mark.open] as const] : [])));
      open.push({
        trade,
        marks,
        opens: mornings,
        last: candidate.entryPx,
        openQty: qty,
        originalQty: qty,
        entryCharges: buyCharges,
        intraday: sameDay,
        scaled: false,
        muted: opts.mute?.has(muteKey(candidate)) === true,
        pendingExit: candidate.pendingExit === true,
      });
      if (candidate.exitReason !== "open") taken.push(trade);
    }

    for (const lot of open.filter((item) => closedOn(item, day) && item.trade.entryDate === day)) closeLot(lot);
    const overnight = open.filter((item) => !(closedOn(item, day) && item.trade.entryDate === day));
    open.length = 0;
    open.push(...overnight);

    let invested = 0;
    for (const lot of open) {
      const mark = lot.marks.get(day) ?? lot.last;
      lot.last = mark;
      invested += mark * lot.openQty;
    }
    const value = cash + invested;
    exposureSum += value > 0 ? invested / value : 0;
    equity.push({ date: day, value });
  }

  const carried: Lot[] = [];
  for (const lot of open) {
    if (lot.trade.exitReason === "open") carried.push(lot);
    else closeLot(lot);
  }
  const openPositions = carried.map((lot) => toOpen(lot, days[days.length - 1] ?? lot.trade.entryDate));
  const unrealised = openPositions.reduce((sum, lot) => sum + lot.unrealised, 0);
  return {
    trades: taken,
    equity,
    exposurePct: days.length ? (exposureSum / days.length) * 100 : 0,
    minCash,
    blocks,
    openPositions,
    unrealised,
    unrealisedIncludesExitCharges: false,
  };
}

function toOpen(lot: Lot, fallbackDate: string): OpenPosition {
  const share = lot.originalQty > 0 ? lot.entryCharges * (lot.openQty / lot.originalQty) : lot.entryCharges;
  const gross = lot.trade.side === "long"
    ? (lot.last - lot.trade.entryPx) * lot.openQty
    : (lot.trade.entryPx - lot.last) * lot.openQty;
  return {
    symbol: lot.trade.symbol,
    sector: lot.trade.sector,
    side: lot.trade.side,
    group: lot.trade.group,
    qty: lot.openQty,
    entryDate: lot.trade.entryDate,
    entryTs: lot.trade.entryTs,
    entryPx: lot.trade.entryPx,
    mark: lot.last,
    markDate: fallbackDate,
    stop: lot.trade.stop,
    unrealised: gross - share,
    pendingExit: lot.pendingExit,
  };
}
