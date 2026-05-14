"use client";

import { useEffect, useState } from "react";
import { RotateCcw, RefreshCw, Zap, Info } from "lucide-react";
import { SignalCard, SwingSignal } from "@/components/stocks/swing/signal-card";
import { StrategyInfoDrawer } from "@/components/stocks/swing/strategy-info-drawer";

export function MeanReversionClient() {
  const [signals, setSignals] = useState<SwingSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);

  async function fetchSignals() {
    setLoading(true);
    try {
      const res = await fetch("/api/stocks/swing/mean-reversion");
      if (res.ok) {
        setSignals(await res.json());
        setLastUpdated(new Date());
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchSignals(); }, []);

  return (
    <div className="min-h-full bg-background">
      <div className="bg-white border-b border-border px-4 md:px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-teal-100 flex items-center justify-center">
              <RotateCcw size={20} className="text-teal-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">Mean Reversion Scanner</h1>
              <p className="text-xs text-muted">
                Oversold extremes bouncing off major support — snap back to the 20 EMA
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {lastUpdated && (
              <span className="text-[11px] text-muted hidden sm:block">
                {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <button
              onClick={() => setInfoOpen(true)}
              className="w-8 h-8 flex items-center justify-center rounded-lg text-teal-500 hover:bg-teal-50 transition-colors"
              title="How this strategy works"
            >
              <Info size={16} />
            </button>
            <button
              onClick={fetchSignals}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-teal-50 text-teal-700 text-sm font-medium hover:bg-teal-100 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-teal-500" />RSI &lt; 30 (extreme oversold)</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500" />At 200 EMA / swing-low support</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" />Bullish reversal candle</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500" />Volume confirmation</span>
        </div>
      </div>

      <div className="px-4 md:px-6 py-5">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-8 h-8 border-2 border-teal-200 border-t-teal-600 rounded-full animate-spin" />
            <p className="text-sm text-muted">Scanning signals…</p>
          </div>
        ) : signals.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <p className="text-sm text-muted mb-4">
              <span className="font-semibold text-foreground">{signals.length}</span> oversold bounce{signals.length !== 1 ? "s" : ""} today
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {signals.map((s) => (
                <SignalCard key={s.id} signal={s} accentColor="teal" levelLabel="Support" />
              ))}
            </div>
          </>
        )}
      </div>

      <StrategyInfoDrawer strategy="mr" open={infoOpen} onClose={() => setInfoOpen(false)} />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-16 h-16 rounded-2xl bg-teal-50 flex items-center justify-center mb-4">
        <Zap size={28} className="text-teal-300" />
      </div>
      <h3 className="text-base font-semibold text-foreground mb-1">No mean-reversion bounces today</h3>
      <p className="text-sm text-muted max-w-xs">
        This scan needs RSI&lt;30 + a clean reversal candle at support. Some days there are zero — that's normal.
      </p>
    </div>
  );
}
