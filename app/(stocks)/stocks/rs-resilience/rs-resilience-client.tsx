"use client";

import { useEffect, useState } from "react";
import { Shield, RefreshCw, Zap, Info } from "lucide-react";
import { SignalCard, SwingSignal } from "@/components/stocks/swing/signal-card";
import { StrategyInfoDrawer } from "@/components/stocks/swing/strategy-info-drawer";

export function RsResilienceClient() {
  const [signals, setSignals] = useState<SwingSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [infoOpen, setInfoOpen] = useState(false);

  async function fetchSignals() {
    setLoading(true);
    try {
      const res = await fetch("/api/stocks/swing/rs-resilience");
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
            <div className="w-10 h-10 rounded-xl bg-rose-100 flex items-center justify-center">
              <Shield size={20} className="text-rose-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">RS Resilience Scanner</h1>
              <p className="text-xs text-muted">
                Stocks holding their ground while Nifty weakens — tomorrow's leaders
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
              className="w-8 h-8 flex items-center justify-center rounded-lg text-rose-500 hover:bg-rose-50 transition-colors"
              title="How this strategy works"
            >
              <Info size={16} />
            </button>
            <button
              onClick={fetchSignals}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-50 text-rose-700 text-sm font-medium hover:bg-rose-100 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-rose-500" />Outperforming Nifty &gt;5pp</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500" />Mansfield RS rising</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" />Above own 50 EMA</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500" />Higher lows pattern</span>
        </div>
      </div>

      <div className="px-4 md:px-6 py-5">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-8 h-8 border-2 border-rose-200 border-t-rose-600 rounded-full animate-spin" />
            <p className="text-sm text-muted">Scanning signals…</p>
          </div>
        ) : signals.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <p className="text-sm text-muted mb-4">
              <span className="font-semibold text-foreground">{signals.length}</span> resilient leader{signals.length !== 1 ? "s" : ""} today
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {signals.map((s) => (
                <SignalCard key={s.id} signal={s} accentColor="rose" levelLabel="20 EMA Support" />
              ))}
            </div>
          </>
        )}
      </div>

      <StrategyInfoDrawer strategy="rs" open={infoOpen} onClose={() => setInfoOpen(false)} />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-16 h-16 rounded-2xl bg-rose-50 flex items-center justify-center mb-4">
        <Zap size={28} className="text-rose-300" />
      </div>
      <h3 className="text-base font-semibold text-foreground mb-1">No RS leaders today</h3>
      <p className="text-sm text-muted max-w-xs">
        This scan only fires when Nifty is weak. If the market is healthy, expect zero signals here.
      </p>
    </div>
  );
}
