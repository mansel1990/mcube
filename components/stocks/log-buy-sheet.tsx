"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { UnifiedSignal } from "@/lib/stocks/types";
import { suggestedEntry } from "@/lib/stocks/signal-mappers";

function todayIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

const fieldClass =
  "mt-1 w-full px-3 py-2 rounded-lg border border-[var(--dota-border)] bg-black/30 text-[var(--dota-head)] [color-scheme:dark] text-sm placeholder:text-[var(--dota-dim)] focus:outline-none focus:border-[#6b4c16]";

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
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full md:max-w-md bg-[#1b2230] border border-[#38415a] text-[var(--dota-text)] [color-scheme:dark] rounded-t-2xl md:rounded-2xl shadow-2xl shadow-black/60 p-5 pb-8 md:pb-5 anim-rise">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="cz text-sm font-bold">Log buy · {signal.ticker}</h2>
            <p className="text-xs text-[var(--dota-dim)] capitalize">{signal.source.replace(/_/g, " ")}</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-[var(--dota-dim)] hover:text-[var(--dota-head)] hover:bg-white/5"
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-[10px] text-[var(--dota-dim)] uppercase tracking-wide font-semibold">Quantity</label>
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
            <label className="text-[10px] text-[var(--dota-dim)] uppercase tracking-wide font-semibold">Entry price (₹)</label>
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
            <label className="text-[10px] text-[var(--dota-dim)] uppercase tracking-wide font-semibold">Entry date</label>
            <input
              type="date"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              required
              className={fieldClass}
            />
          </div>
          <div>
            <label className="text-[10px] text-[var(--dota-dim)] uppercase tracking-wide font-semibold">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className={`${fieldClass} resize-none`}
            />
          </div>

          {error && <p className="text-sm text-[var(--dota-dire-bright)]">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="btn-pick w-full py-2.5 rounded-lg text-sm font-bold disabled:opacity-50"
          >
            {loading ? "Saving…" : "Confirm log buy"}
          </button>
        </form>
      </div>
    </div>
  );
}
