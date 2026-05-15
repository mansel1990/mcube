"use client";

import { useEffect, useState } from "react";
import { Activity, RefreshCw, Info } from "lucide-react";
import { SignalCard, SwingSignal } from "@/components/stocks/swing/signal-card";
import { StrategyInfoDrawer } from "@/components/stocks/swing/strategy-info-drawer";

export function EmaPullbackClient() {
  const [signals, setSignals]         = useState<SwingSignal[]>([]);
  const [loading, setLoading]         = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [infoOpen, setInfoOpen]       = useState(false);

  async function fetchSignals() {
    setLoading(true);
    try {
      const res = await fetch("/api/stocks/swing/ema-pullback");
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
    <div className="min-h-full bg-[#F8FAFC]">
      {/* Page header */}
      <div className="bg-white border-b border-border px-4 md:px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
              <Activity size={20} className="text-emerald-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">EMA Pullback Scanner</h1>
              <p className="text-xs text-muted">
                Uptrend stocks bouncing off the 20 EMA — buy the dip
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
              className="w-8 h-8 flex items-center justify-center rounded-lg text-emerald-500 hover:bg-emerald-50 transition-colors"
              title="How this strategy works"
            >
              <Info size={16} />
            </button>
            <button
              onClick={fetchSignals}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-sm font-medium hover:bg-emerald-100 transition-colors disabled:opacity-50"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>
        </div>

        {/* Strategy legend */}
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted">
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500" />20 EMA &gt; 50 EMA (uptrend)</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-blue-500" />Touched 20 EMA in last 3 days</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-violet-500" />Low-volume pullback</span>
          <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500" />RSI 40–62</span>
        </div>
      </div>

      <div className="px-4 md:px-6 py-5">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-8 h-8 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
            <p className="text-sm text-muted">Scanning signals…</p>
          </div>
        ) : signals.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <p className="text-sm text-muted mb-4">
              <span className="font-semibold text-slate-900">{signals.length}</span> setup{signals.length !== 1 ? "s" : ""} found today
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
              {signals.map((s) => (
                <SignalCard key={s.id} signal={s} accentColor="emerald" levelLabel="20 EMA Support" />
              ))}
            </div>
          </>
        )}
      </div>

      <StrategyInfoDrawer strategy="ema" open={infoOpen} onClose={() => setInfoOpen(false)} />
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center">
      <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mb-4">
        <Activity size={28} className="text-emerald-300" />
      </div>
      <h3 className="text-base font-semibold text-slate-900 mb-1">No EMA pullback setups today</h3>
      <p className="text-sm text-muted max-w-xs">
        The scanner runs every evening at 6 PM IST. Check back after market hours.
      </p>
    </div>
  );
}
