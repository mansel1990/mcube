"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { UnifiedSignal } from "@/lib/stocks/types";
import { suggestedEntry } from "@/lib/stocks/signal-mappers";

function todayIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

const fieldClass =
  "mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-900 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500";

interface LogBuySheetProps {
  signal: UnifiedSignal;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function LogBuySheet({ signal, open, onClose, onSuccess }: LogBuySheetProps) {
  const entry = suggestedEntry(signal);
  const [quantity, setQuantity] = useState("1");
  const [entryPrice, setEntryPrice] = useState(entry?.toFixed(2) ?? "");
  const [entryDate, setEntryDate] = useState(todayIST());
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/stocks/trades", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          source: signal.source,
          signalRef: signal.id,
          ticker: signal.ticker,
          quantity: Number(quantity),
          entryPrice: Number(entryPrice),
          entryDate,
          target: signal.target,
          stopLoss: signal.stopLoss,
          notes: notes || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to log trade");
      }
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to log trade");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full md:max-w-md bg-white text-slate-900 [color-scheme:light] rounded-t-2xl md:rounded-2xl shadow-2xl p-5 pb-8 md:pb-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">Log buy · {signal.ticker}</h2>
            <p className="text-xs text-slate-500 capitalize">{signal.source.replace(/_/g, " ")}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-slate-500 uppercase tracking-wide">Quantity</label>
            <input
              type="number"
              min="1"
              step="1"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              required
              className={fieldClass}
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 uppercase tracking-wide">Entry price (₹)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={entryPrice}
              onChange={(e) => setEntryPrice(e.target.value)}
              required
              className={fieldClass}
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 uppercase tracking-wide">Entry date</label>
            <input
              type="date"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              required
              className={fieldClass}
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 uppercase tracking-wide">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className={`${fieldClass} resize-none`}
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50"
          >
            {loading ? "Saving…" : "Confirm log buy"}
          </button>
        </form>
      </div>
    </div>
  );
}
