import { estimateCharges, type ChargeRates } from "@/lib/mlive/charges";
import { roundTick, type Side as OrderSide } from "@/lib/mlive/rules";
import type { Side } from "../strategies/types";

export function slipped(price: number, side: Side, kind: "entry" | "exit", slip: number, tick: number): number {
  const adverse = kind === "entry" ? (side === "long" ? 1 : -1) : side === "long" ? -1 : 1;
  return roundTick(price * (1 + adverse * slip), tick > 0 ? tick : 0.05);
}

export function roundTrip(args: {
  side: Side;
  entryPx: number;
  exitPx: number;
  qty: number;
  intraday: boolean;
  rates?: ChargeRates;
}): { gross: number; charges: number; net: number; netPct: number } {
  const entryTurnover = args.entryPx * args.qty;
  const exitTurnover = args.exitPx * args.qty;
  const buyTurnover = args.side === "long" ? entryTurnover : exitTurnover;
  const sellTurnover = args.side === "long" ? exitTurnover : entryTurnover;
  const buy: OrderSide = "BUY";
  const sell: OrderSide = "SELL";
  const charges =
    estimateCharges(buy, buyTurnover, args.rates, args.intraday).total +
    estimateCharges(sell, sellTurnover, args.rates, args.intraday).total;
  const gross = args.side === "long" ? (args.exitPx - args.entryPx) * args.qty : (args.entryPx - args.exitPx) * args.qty;
  const net = gross - charges;
  const basis = entryTurnover > 0 ? entryTurnover : 1;
  return { gross, charges, net, netPct: (net / basis) * 100 };
}
