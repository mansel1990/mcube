import { CHARGE_TYPES, EXIT_REASONS, type BookedCharges, type ChargeType, type ExitReason, type PnlModel } from "@/lib/mlive/pnl";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Rupees with the sign before the symbol. Negative zero is ₹0.00. */
export function formatInr(value: number, options?: { sign?: boolean; digits?: number }): string {
  const digits = options?.digits ?? 2;
  const factor = 10 ** digits;
  const abs = Math.round(Math.abs(value) * factor) / factor;
  const negative = value < 0 && abs !== 0;
  const body = abs.toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits });
  if (negative) return `−₹${body}`;
  if (options?.sign && abs !== 0) return `+₹${body}`;
  return `₹${body}`;
}

export function shortDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) return iso;
  return `${Number(match[3])} ${MONTHS[Number(match[2]) - 1] ?? match[2]}`;
}

function utcDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, (m || 1) - 1, d || 1));
}

function isoMonday(key: string): string | null {
  const match = /^(\d{4})-W(\d{2})$/.exec(key);
  if (!match) return null;
  const year = Number(match[1]);
  const week = Number(match[2]);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const jan4Day = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - jan4Day + 1 + (week - 1) * 7);
  return monday.toISOString().slice(0, 10);
}

function addDaysIso(iso: string, days: number): string {
  const date = utcDate(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Human period labels. Day "Mon, 9 Nov", week "9–13 Nov", month "Nov 2026". */
export function periodLabel(kind: "day" | "week" | "month" | "all", key: string): string {
  if (kind === "all" || key === "All") return "All";
  if (kind === "day") {
    const date = utcDate(key);
    if (Number.isNaN(date.getTime())) return key;
    return `${WEEKDAYS[date.getUTCDay()]}, ${shortDate(key)}`;
  }
  if (kind === "month") {
    const match = /^(\d{4})-(\d{2})/.exec(key);
    if (!match) return key;
    return `${MONTHS[Number(match[2]) - 1] ?? match[2]} ${match[1]}`;
  }
  const monday = isoMonday(key);
  if (!monday) return key;
  const friday = addDaysIso(monday, 4);
  const start = shortDate(monday);
  const end = shortDate(friday);
  const startMonth = start.split(" ")[1];
  const endParts = end.split(" ");
  return startMonth === endParts[1] ? `${start.split(" ")[0]}–${endParts[0]} ${startMonth}` : `${start}–${end}`;
}

export type ChargeGroup = { id: string; label: string; total: number; parts: { label: string; value: number }[] };

/** Non-zero charge groups. Unsplit totals stay in their own bucket. */
export function chargeGroups(charges: BookedCharges): ChargeGroup[] {
  const groups: ChargeGroup[] = [
    { id: "taxes", label: "Taxes", total: 0, parts: [
      { label: "STT", value: charges.stt },
      { label: "Stamp", value: charges.stamp },
      { label: "GST", value: charges.gst },
    ] },
    { id: "brokerage", label: "Brokerage", total: 0, parts: [{ label: "Brokerage", value: charges.brokerage }] },
    { id: "exchange", label: "Exchange & SEBI", total: 0, parts: [
      { label: "Exchange", value: charges.exchange },
      { label: "SEBI", value: charges.sebi },
    ] },
    { id: "dp", label: "DP", total: 0, parts: [{ label: "DP", value: charges.dp }] },
    { id: "unclassified", label: "Unclassified", total: 0, parts: [{ label: "Not split yet", value: charges.unclassified ?? 0 }] },
  ];
  return groups.flatMap((group) => {
    const parts = group.parts.filter((part) => Math.abs(part.value) >= 0.005);
    const total = Math.round(parts.reduce((sum, part) => sum + part.value, 0) * 100) / 100;
    return Math.abs(total) >= 0.005 ? [{ ...group, parts, total }] : [];
  });
}

export const CHARGE_LABEL: Record<ChargeType, string> = {
  brokerage: "Brokerage",
  stt: "STT",
  exchange: "Exchange",
  sebi: "SEBI",
  stamp: "Stamp",
  gst: "GST",
  dp: "DP",
};

export const REASON_LABEL: Record<ExitReason, string> = {
  trend_stop: "Trend stop",
  gtt_exit: "GTT exit",
  gtt_fallback: "GTT fallback",
  manual: "Manual",
  breaker: "Breaker",
};

export function needsClosed(have: number, need: number): string {
  return `Needs ${need} closed trades · you have ${have}.`;
}

/** 0 wins reads as 0%, not 0.0%. */
export function formatWinRate(rate: number, wins: number): string {
  if (wins <= 0) return "0%";
  return `${(rate * 100).toFixed(1)}%`;
}

/** No wins is a dash. No losses, with at least one win, is infinity. */
export function formatProfitFactor(factor: number | null, wins: number): string {
  if (wins <= 0) return "—";
  if (factor == null) return "∞";
  return factor.toFixed(2);
}

/** A missing sample is a dash, otherwise the already formatted amount. */
export function formatSample(count: number, text: string): string {
  return count > 0 ? text : "—";
}

/** Every closed trade on the same day reads as Same day, not 0.0. */
export function formatAvgDays(avgDays: number, closed: { intraday: boolean }[]): string {
  if (closed.length > 0 && closed.every((trade) => trade.intraday)) return "Same day";
  return avgDays.toFixed(1);
}

export function axisInr(value: number): string {
  const sign = value < 0 ? "−" : "";
  const abs = Math.abs(value);
  const trim = (n: number) => {
    const text = n >= 10 ? n.toFixed(0) : n.toFixed(1);
    return text.endsWith(".0") ? text.slice(0, -2) : text;
  };
  if (abs >= 1_00_00_000) return `${sign}₹${trim(abs / 1_00_00_000)}Cr`;
  if (abs >= 1_00_000) return `${sign}₹${trim(abs / 1_00_000)}L`;
  if (abs >= 10_000) return `${sign}₹${trim(abs / 1000)}k`;
  return `${sign}₹${Math.round(abs).toLocaleString("en-IN")}`;
}

export function csvEscape(value: string | number | null): string {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(headers: string[], rows: (string | number | null)[][]): string {
  return [headers, ...rows].map((row) => row.map(csvEscape).join(",")).join("\n");
}

export function downloadCsv(name: string, csv: string): void {
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

export function periodRows(pnl: PnlModel, grain: "day" | "week" | "month" | "all") {
  if (grain === "all") {
    const closed = pnl.trades.filter((trade) => trade.status === "closed");
    const gross = closed.reduce((sum, trade) => sum + trade.gross, 0);
    const charges = closed.reduce((sum, trade) => sum + trade.charges.total, 0);
    const net = closed.reduce((sum, trade) => sum + trade.net, 0);
    return [{
      period: "All",
      trades: closed.length,
      wins: closed.filter((trade) => trade.net > 0).length,
      gross,
      charges,
      net,
      cumulative: net,
    }];
  }
  return pnl.byPeriod[grain];
}

export { CHARGE_TYPES, EXIT_REASONS };
