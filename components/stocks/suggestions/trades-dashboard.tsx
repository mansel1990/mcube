"use client";

import { StockSuggestion } from "./suggestion-card";

interface TradeEvent {
  id: string;
  action: "BUY" | "SELL";
  ticker: string;
  date: string;
  price: string | null;
  pnl_pct: string | null;
  exit_reason: string | null;
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}

function fmtPrice(p: string | null) {
  if (!p) return "—";
  return "₹" + parseFloat(p).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(p: string | null) {
  if (!p) return null;
  const n = parseFloat(p);
  const sign = n >= 0 ? "+" : "";
  return sign + n.toFixed(2) + "%";
}

function isWithinDays(dateStr: string | null, days: number): boolean {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  const cutoff = new Date();
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - days);
  return d >= cutoff;
}

interface Props {
  all: StockSuggestion[];
}

export function TradesDashboard({ all }: Props) {
  const events: TradeEvent[] = [];

  for (const s of all) {
    if (isWithinDays(s.entry_date, 2)) {
      events.push({
        id: `buy-${s.id}`,
        action: "BUY",
        ticker: s.ticker,
        date: s.entry_date!,
        price: s.entry_price,
        pnl_pct: null,
        exit_reason: null,
      });
    }
    if (isWithinDays(s.exit_date, 2)) {
      events.push({
        id: `sell-${s.id}`,
        action: "SELL",
        ticker: s.ticker,
        date: s.exit_date!,
        price: s.exit_price,
        pnl_pct: s.pnl_pct,
        exit_reason: s.exit_reason,
      });
    }
  }

  // Sort newest first
  events.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (events.length === 0) {
    return (
      <div className="mt-8 text-center text-sm text-foreground/30">
        No buys or sells in the last 2 days.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 pt-2">
      {events.map((e) => {
        const isBuy = e.action === "BUY";
        const pnl = e.pnl_pct ? parseFloat(e.pnl_pct) : null;
        const isProfit = pnl !== null && pnl >= 0;

        return (
          <div
            key={e.id}
            className={`rounded-xl border flex items-center gap-4 px-4 py-3 ${
              isBuy
                ? "border-blue-500/20 bg-blue-950/20"
                : isProfit
                ? "border-emerald-500/20 bg-emerald-950/20"
                : "border-red-500/20 bg-red-950/20"
            }`}
          >
            {/* Action badge */}
            <span
              className={`text-[11px] font-bold px-2.5 py-1 rounded-full shrink-0 ${
                isBuy
                  ? "bg-blue-500/15 text-blue-300 border border-blue-500/25"
                  : isProfit
                  ? "bg-emerald-500/15 text-emerald-400 border border-emerald-500/25"
                  : "bg-red-500/15 text-red-400 border border-red-500/25"
              }`}
            >
              {isBuy ? "BUY" : "SELL"}
            </span>

            {/* Ticker + date */}
            <div className="flex-1 min-w-0">
              <p className="text-base font-bold text-foreground leading-tight">{e.ticker}</p>
              <p className="text-[11px] text-foreground/40">{fmtDate(e.date)}</p>
            </div>

            {/* Price */}
            <div className="text-right shrink-0">
              <p className="text-sm font-semibold text-foreground">{fmtPrice(e.price)}</p>
              {!isBuy && e.pnl_pct && (
                <p className={`text-[11px] font-medium ${isProfit ? "text-emerald-400" : "text-red-400"}`}>
                  {isProfit ? "▲" : "▼"} {fmtPct(e.pnl_pct)}
                </p>
              )}
              {!isBuy && e.exit_reason && (
                <p className="text-[10px] text-foreground/30 truncate max-w-[100px]">{e.exit_reason}</p>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
