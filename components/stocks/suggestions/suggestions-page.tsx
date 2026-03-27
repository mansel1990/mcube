"use client";

import { useEffect, useState } from "react";
import { SuggestionCard, StockSuggestion } from "./suggestion-card";
import { HistoryDashboard } from "./history-dashboard";

export function SuggestionsPage() {
  const [all, setAll] = useState<StockSuggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"active" | "history">("active");

  useEffect(() => {
    fetch("/api/stocks/suggestions")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load");
        return r.json();
      })
      .then(setAll)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const open = all.filter((s) => s.status === "OPEN");
  const closed = all.filter((s) => s.status !== "OPEN");

  return (
    <div className="flex flex-col min-h-0 h-full">
      {/* Tab bar */}
      <div className="px-4 pt-4 pb-2 flex gap-2 shrink-0">
        <button
          onClick={() => setTab("active")}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors cursor-pointer ${
            tab === "active"
              ? "bg-primary text-white"
              : "text-foreground/50 hover:text-foreground bg-white/5"
          }`}
        >
          Signals {!loading && `(${open.length})`}
        </button>
        <button
          onClick={() => setTab("history")}
          className={`px-4 py-1.5 rounded-full text-sm font-medium transition-colors cursor-pointer ${
            tab === "history"
              ? "bg-primary text-white"
              : "text-foreground/50 hover:text-foreground bg-white/5"
          }`}
        >
          History {!loading && `(${closed.length})`}
        </button>
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
              <div className="mt-8 text-center text-sm text-foreground/30">
                No active signals.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
                {open.map((s) => (
                  <SuggestionCard key={s.id} suggestion={s} />
                ))}
              </div>
            )}
          </>
        )}

        {!loading && !error && tab === "history" && (
          <HistoryDashboard closed={closed} />
        )}
      </div>
    </div>
  );
}
