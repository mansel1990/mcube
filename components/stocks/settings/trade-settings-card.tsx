"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, TrendingUp } from "lucide-react";

export function TradeSettingsCard() {
  const [amount, setAmount] = useState(10000);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/stocks/settings");
      if (res.ok) {
        const data = await res.json();
        setAmount(data.defaultTradeAmount ?? 10000);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSettings(); }, [fetchSettings]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);
    try {
      const res = await fetch("/api/stocks/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultTradeAmount: amount }),
      });
      if (res.ok) setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl dota-panel p-6">
      <div className="flex items-start gap-3 mb-5">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#6b4c16] bg-[#1c1610] text-[var(--dota-gold)]">
          <TrendingUp size={18} />
        </div>
        <div>
          <h3 className="cz text-[11px] font-bold">Gold Per Pick · Default Trade Size</h3>
          <p className="text-xs text-[var(--dota-dim)] mt-0.5">
            Target ₹ per buy. Quantity is calculated from live price, rounded down to whole shares.
            You can adjust qty on each signal before buying.
          </p>
        </div>
      </div>

      {loading ? (
        <Loader2 size={18} className="animate-spin text-[var(--dota-dim)]" />
      ) : (
        <form onSubmit={handleSave} className="space-y-3">
          <div>
            <label
              htmlFor="trade-amount"
              className="text-[10px] uppercase tracking-wide text-[var(--dota-dim)] font-semibold"
            >
              Amount per trade (₹)
            </label>
            <input
              id="trade-amount"
              type="number"
              min={100}
              step={500}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="mt-1 w-full max-w-xs px-3 py-2.5 rounded-lg border border-[var(--dota-border)] bg-black/30 text-[var(--dota-head)] [color-scheme:dark] text-sm focus:outline-none focus:border-[#6b4c16]"
            />
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={saving}
              className="btn-pick inline-flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-bold disabled:opacity-50"
            >
              {saving && <Loader2 size={14} className="animate-spin" />}
              {saving ? "Saving…" : "Save preference"}
            </button>
            {saved && <span className="text-xs text-[var(--dota-radiant-bright)]">Saved.</span>}
          </div>
        </form>
      )}
    </div>
  );
}
