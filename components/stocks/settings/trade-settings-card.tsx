"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";

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
    <div className="rounded-xl border border-slate-200 bg-white p-6">
      <h3 className="text-sm font-semibold text-slate-900 mb-1">Default Trade Size</h3>
      <p className="text-xs text-slate-500 mb-4">
        Target ₹ per buy. Quantity is calculated from live price, rounded down to whole shares.
        You can adjust qty on each signal before buying.
      </p>

      {loading ? (
        <Loader2 size={18} className="animate-spin text-slate-400" />
      ) : (
        <form onSubmit={handleSave} className="flex gap-2 items-end">
          <div className="flex-1">
            <label className="text-[10px] uppercase text-slate-500 font-semibold">₹ per trade</label>
            <input
              type="number"
              min={100}
              step={500}
              value={amount}
              onChange={(e) => setAmount(Number(e.target.value))}
              className="w-full mt-1 px-3 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:border-primary"
            />
          </div>
          <button
            type="submit"
            disabled={saving}
            className="px-4 py-2 rounded-lg bg-primary text-white text-sm font-medium disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </form>
      )}
      {saved && <p className="text-xs text-emerald-600 mt-2">Saved.</p>}
    </div>
  );
}
