import { floorToTick } from "@/lib/mlive/rules";
import { LONGTERM_FROZEN_V3 } from "./rules";
import { radarQualifiesV3 } from "./override";
import type { Sleeve } from "./variants";

export const LONG_GAME_RULES = LONGTERM_FROZEN_V3.version;
export const MIN_ADD = 10_000;
export const MAX_ADD = 100_000;
export const RADAR_MOVE_CAP = 12;

const SLEEVES: Sleeve[] = ["nifty50", "secondary", "gold", "liquid"];

function money(value: number): number {
  return Math.round(value * 100) / 100;
}

export function coreDue(input: {
  firstTradingDay: boolean;
  afterClose: boolean;
  driftPoints: number;
  monthsSinceExecuted: number | null;
  neverEntered: boolean;
}): { due: boolean; reason: string } {
  if (!input.afterClose || !input.firstTradingDay) return { due: false, reason: "Core is checked after the close on the first trading day of the month." };
  if (input.neverEntered) return { due: true, reason: "Core has never been entered." };
  if (input.monthsSinceExecuted != null && input.monthsSinceExecuted >= 6) {
    return { due: true, reason: "Six months have passed since Core's last executed suggestion." };
  }
  if (input.driftPoints > 5) return { due: true, reason: "A sleeve is more than five points from its target." };
  return { due: false, reason: "Core is inside the band and the six-month gap has not passed." };
}

export function driftPoints(values: Record<Sleeve, number>, targets: Record<Sleeve, number>): number {
  const total = SLEEVES.reduce((sum, sleeve) => sum + (values[sleeve] ?? 0), 0);
  if (!(total > 0)) return 0;
  return SLEEVES.reduce((max, sleeve) => {
    const weight = (values[sleeve] ?? 0) / total;
    return Math.max(max, Math.abs(weight - (targets[sleeve] ?? 0)) * 100);
  }, 0);
}

/** Smallest no-sale top-up: max(sleeve value / target weight) minus the pocket value, then clamped. */
export function coreTopUp(
  values: Record<Sleeve, number>,
  targets: Record<Sleeve, number>,
  minAdd = MIN_ADD,
  maxAdd = MAX_ADD,
): { raw: number; amount: number; capped: "up" | "down" | null; note: string } {
  let scale = 0;
  for (const sleeve of SLEEVES) {
    const target = targets[sleeve] ?? 0;
    if (!(target > 0)) continue;
    scale = Math.max(scale, (values[sleeve] ?? 0) / target);
  }
  const pocket = SLEEVES.reduce((sum, sleeve) => sum + (values[sleeve] ?? 0), 0);
  const raw = money(Math.max(0, scale - pocket));
  if (raw > maxAdd) {
    return { raw, amount: maxAdd, capped: "down", note: `The no-sale top-up is ₹${raw}. It is capped at ₹${maxAdd}.` };
  }
  if (raw < minAdd) {
    return { raw, amount: minAdd, capped: "up", note: `The no-sale top-up is ₹${raw}. The smallest add is ₹${minAdd}.` };
  }
  return { raw, amount: raw, capped: null, note: `No-sale top-up ₹${raw}.` };
}

export function radarGate(input: {
  radarEnabled: boolean;
  secondary: string;
  variants: readonly string[];
  radarMaxDrawdownPct: number;
  staticMaxDrawdownPct: number;
}): { allowed: boolean; reason: string } {
  if (!input.radarEnabled) return { allowed: false, reason: "Radar is off." };
  if (input.secondary === "next") return { allowed: false, reason: "Secondary is Next 50, so Radar stays off." };
  if (input.secondary !== "mid") return { allowed: false, reason: "Radar runs only when the secondary sleeve is Midcap 150." };
  if (!radarQualifiesV3(input)) return { allowed: false, reason: "Radar has not met the held-back drawdown condition." };
  return { allowed: true, reason: "Radar may run after the close." };
}

export function radarNewMoney(input: {
  requested: number;
  coreValue: number;
  firstEntry: boolean;
  minAdd?: number;
  maxAdd?: number;
}): { amount: number; fundingRequired: boolean; error: string | null } {
  const minAdd = input.minAdd ?? MIN_ADD;
  const maxAdd = input.maxAdd ?? MAX_ADD;
  if (input.firstEntry) {
    const base = input.coreValue > 0 ? input.coreValue : minAdd;
    const amount = Math.min(maxAdd, Math.max(minAdd, money(base)));
    return { amount, fundingRequired: amount > 0, error: null };
  }
  if (input.requested === 0) return { amount: 0, fundingRequired: false, error: null };
  if (input.requested < minAdd || input.requested > maxAdd) {
    return { amount: 0, fundingRequired: false, error: "New money is ₹0 or ₹10,000–₹1,00,000." };
  }
  return { amount: money(input.requested), fundingRequired: true, error: null };
}

export function sellsBeforeBuys<T extends { side: "BUY" | "SELL" }>(lines: readonly T[]): T[] {
  return [...lines.filter((line) => line.side === "SELL"), ...lines.filter((line) => line.side === "BUY")];
}

export function wholeUnitPlan(input: {
  selected: number;
  suggested: number;
  price: number;
  side: "BUY" | "SELL";
  tax?: number;
  chargeFor: (side: "BUY" | "SELL", turnover: number) => number;
}): {
  relation: "below" | "equal" | "above";
  units: number;
  charges: number;
  tax: number;
  leftover: number;
  rulesVersion: string;
} {
  const relation = input.selected < input.suggested ? "below" : input.selected > input.suggested ? "above" : "equal";
  const tax = input.side === "SELL" ? input.tax ?? 0 : 0;
  let units = input.price > 0 ? Math.floor(input.selected / input.price) : 0;
  let charges = 0;
  let leftover = money(input.selected);
  while (units >= 0) {
    const turnover = units * input.price;
    charges = input.chargeFor(input.side, turnover);
    const used = input.side === "SELL" ? charges + tax : turnover + charges;
    leftover = money(input.selected - used);
    if (units === 0 || leftover >= 0) break;
    units -= 1;
  }
  return { relation, units, charges: money(charges), tax: money(tax), leftover, rulesVersion: LONG_GAME_RULES };
}

export function orderLimit(side: "BUY" | "SELL", last: number | null, tick: number | null, ageMinutes: number | null): number | null {
  if (last == null || !(last > 0) || tick == null || !(tick > 0) || ageMinutes == null || ageMinutes < 0 || ageMinutes > 15) return null;
  if (side === "BUY") return ceilToTick(last * 1.003, tick);
  return floorToTick(last * 0.997, tick);
}

function ceilToTick(price: number, tick: number): number | null {
  if (!(price > 0) || !(tick > 0)) return null;
  const tickPaise = Math.round(tick * 100);
  const pricePaise = Math.round(price * 100);
  if (tickPaise < 1 || pricePaise < 1) return null;
  return (Math.ceil(pricePaise / tickPaise) * tickPaise) / 100;
}

export function longgameOrderAction(
  now: Date,
  lastRepriceAt: string | Date | null,
  placedAt: string | Date | null,
): "wait" | "reprice" | "cancel" {
  const minute = minutesOfDay(now);
  const last = lastRepriceAt ?? placedAt;
  const lastMinute = last ? minutesOfDay(new Date(last)) : -1;
  const due = elapsedMinutes(now, last) >= 15;
  if (minute >= 15 * 60 + 10) return lastMinute < 15 * 60 + 10 || due ? "cancel" : "wait";
  return due ? "reprice" : "wait";
}

export function fundsShortfall(available: number, needed: number): string | null {
  if (available + 0.009 >= needed) return null;
  return `Kite has ₹${money(available)} available; this plan needs ₹${money(needed)}. Add funds or reduce the amount.`;
}

export function repricedBuyFits(qty: number, limit: number, charges: number, etfAllocation: number, approvedTotal: number): boolean {
  const need = qty * limit + charges;
  return need <= etfAllocation + 0.009 && need <= approvedTotal + 0.009;
}

export function radarMoveCounts(input: { movesThisYear: number; cap?: number; retry: boolean }): { accept: boolean; consumesSlot: boolean } {
  if (input.retry) return { accept: true, consumesSlot: false };
  const cap = input.cap ?? RADAR_MOVE_CAP;
  if (input.movesThisYear >= cap) return { accept: false, consumesSlot: false };
  return { accept: true, consumesSlot: true };
}

export function approvalPlan(input: {
  status: string;
  expiresOn: string;
  today: string;
  rulesVersion: string;
  amount: number;
  minAdd?: number;
  maxAdd?: number;
  fundingConfirmed: boolean;
}): { ok: true; deposit: number } | { ok: false; error: string } {
  const minAdd = input.minAdd ?? MIN_ADD;
  const maxAdd = input.maxAdd ?? MAX_ADD;
  if (input.status !== "pending") return { ok: false, error: "That suggestion is not pending." };
  if (input.expiresOn < input.today) return { ok: false, error: "That suggestion has expired." };
  if (input.rulesVersion !== LONG_GAME_RULES) return { ok: false, error: "That suggestion is not on the active rules." };
  if (!(input.amount >= 0)) return { ok: false, error: "Amount cannot be negative." };
  if (input.amount > 0 && (input.amount < minAdd || input.amount > maxAdd)) {
    return { ok: false, error: "Amount is outside ₹10,000–₹1,00,000." };
  }
  if (input.amount > 0 && !input.fundingConfirmed) return { ok: false, error: "Confirm the funding before approving new money." };
  return { ok: true, deposit: input.amount > 0 ? money(input.amount) : 0 };
}

export function retryOrStop(choice: "retry" | "stop", approvedAmount: number, price: number): { units: number; leaveRemainder: boolean } {
  if (choice === "stop") return { units: 0, leaveRemainder: true };
  const units = price > 0 ? Math.floor(approvedAmount / price) : 0;
  return { units, leaveRemainder: false };
}

export function partialFill(previousFilled: number, filled: number, price: number): { qty: number; notional: number } {
  const qty = Math.max(0, filled - previousFilled);
  return { qty, notional: money(qty * price) };
}

function minutesOfDay(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  return hour * 60 + minute;
}

function elapsedMinutes(now: Date, previous: string | Date | null): number {
  if (!previous) return Number.POSITIVE_INFINITY;
  return (now.getTime() - new Date(previous).getTime()) / 60_000;
}
