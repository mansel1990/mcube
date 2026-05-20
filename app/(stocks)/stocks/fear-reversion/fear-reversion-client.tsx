"use client";

import { useEffect, useState } from "react";
import { Flame, Info } from "lucide-react";
import { SignalCard, SwingSignal } from "@/components/stocks/swing/signal-card";
import { StrategyInfoDrawer } from "@/components/stocks/swing/strategy-info-drawer";

export default function FearReversionClient() {
  const [signals, setSignals] = useState<SwingSignal[]>([]);
  const [loading, setLoading] = useState(true);
  const [infoOpen, setInfoOpen] = useState(false);

  useEffect(() => {
    fetch("/api/stocks/swing/fear-reversion")
      .then((r) => r.json())
      .then((data) => setSignals(data.signals ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
            <Flame className="text-orange-600" size={20} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Fear Reversion</h1>
            <p className="text-xs text-muted mt-0.5">VIX spike + large-cap panic reversal → bounce to 20 EMA</p>
          </div>
        </div>
        <button
          onClick={() => setInfoOpen(true)}
          className="flex items-center gap-1.5 text-xs text-orange-600 hover:text-orange-800 font-medium px-3 py-1.5 rounded-lg hover:bg-orange-50 transition-colors"
        >
          <Info size={14} />
          How it works
        </button>
      </div>

      {/* Signals */}
      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-56 bg-slate-100 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : signals.length === 0 ? (
        <div className="text-center py-16 text-muted">
          <Flame className="mx-auto mb-3 text-orange-300" size={36} />
          <p className="font-medium text-slate-700">No Fear Reversion signals today</p>
          <p className="text-xs mt-1">
            This scan runs only when India VIX &gt; 15 and a large-cap blue chip hits oversold
            support with a reversal candle. Zero signals = market fear is calm right now.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
          {signals.map((s) => (
            <SignalCard
              key={s.id}
              signal={s}
              accentColor="orange"
              levelLabel="Support"
            />
          ))}
        </div>
      )}

      <StrategyInfoDrawer
        strategy="fr"
        open={infoOpen}
        onClose={() => setInfoOpen(false)}
      />
    </div>
  );
}
