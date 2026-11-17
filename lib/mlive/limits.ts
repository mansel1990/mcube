import { accountDrawdown } from "./charts";

/** The new-buy rule. `max_buys_per_day` is the order cap and is not this number. */
export function newBuyLimit(value: unknown, fallback = 2): number {
  if (value == null || value === "") return fallback;
  const n = Number(String(value).replace(/"/g, ""));
  return Number.isFinite(n) ? n : fallback;
}

/** A cancelled or rejected order did not use a buy. */
export function isCountedBuy(status: string): boolean {
  const name = status.toUpperCase();
  return name !== "CANCELLED" && name !== "REJECTED";
}

/** "₹0 of ₹40,000". */
export function moneySpan(used: number, cap: number): string {
  const rupee = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
  return cap > 0 ? `${rupee(used)} of ${rupee(cap)}` : rupee(used);
}

/** Drawdown from the peak, in percent, to one decimal. 0.4 means 0.4%. */
export function breakerReading(account: number, peak: number): number {
  return Math.round(accountDrawdown(account, peak) * 10) / 10;
}
