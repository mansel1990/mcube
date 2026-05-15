"use client";

import { useEffect, useState } from "react";
import { SuggestionCard, StockSuggestion } from "./suggestion-card";
import { HistoryDashboard } from "./history-dashboard";
import { TradesDashboard } from "./trades-dashboard";

type CurrentPriceData = { price: number; change: number; changePct: number } | null;

export function SuggestionsPage() {
  const [all, setAll] = useState<StockSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"active" | "trades" | "history">("active");
  const [currentPrices, setCurrentPrices] = useState<Record<string, CurrentPriceData>>({});

  useEffect(() => {
    fetch("/api/stocks/suggestions")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load");
        return r.json();
      })
      .then((data: StockSuggestion[]) => {
        setAll(data);
        const openTickers = [...new Set(data.filter((s) => s.status === "OPEN").map((s) => s.ticker))];
        if (openTickers.length > 0) {
          fetch(`/api/stocks/current-price?tickers=${openTickers.join(",")}`)
            .then((r) => r.ok ? r.json() : null)
            .then((prices) => { if (prices) setCurrentPrices(prices); })
            .catch(() => {});
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const open = all.filter((s) => s.status === "OPEN");
  const closed = all.filter((s) => s.status !== "OPEN");

  const tabs = [
    { key: "active" as const, label: `Signals${!loading ? ` (${open.length})` : ""}` },
    { key: "trades" as const, label: "Buy & Sell" },
    { key: "history" as const, label: `History${!loading ? ` (${closed.length})` : ""}` },
  ];

  return (
    <div className="flex flex-col min-h-0 h-full">
      {/* Tab bar */}
      <div className="px-4 pt-4 pb-2 flex gap-2 shrink-0">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors cursor-pointer ${
              tab === t.key
                ? "bg-primary text-white"
                : "text-slate-500 hover:text-slate-900 bg-slate-100"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto px-4 pb-4">
        {loading && (
          <div className="flex items-center justify-center h-40">
            <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        )}

        {!loading && error && (
          <div className="mt-8 text-center text-sm text-red-400">{error}</div>
        )}

        {!loading && !error && tab === "active" && (
          <>
            {open.length === 0 ? (
              <div className="mt-8 text-center text-sm text-slate-400">
                No active signals.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
                {open.map((s) => (
                  <SuggestionCard key={s.id} suggestion={s} currentPrice={currentPrices[s.ticker] ?? undefined} />
                ))}
              </div>
            )}
          </>
        )}

        {!loading && !error && tab === "trades" && (
          <TradesDashboard all={all} />
        )}

        {!loading && !error && tab === "history" && (
          <HistoryDashboard closed={closed} />
        )}
      </div>
    </div>
  );
}
