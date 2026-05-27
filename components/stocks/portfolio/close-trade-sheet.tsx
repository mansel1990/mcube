"use client";

import { useState } from "react";
import { X } from "lucide-react";

interface CloseTradeSheetProps {
  tradeId: string;
  ticker: string;
  defaultPrice?: number;
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

function todayIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

const fieldClass =
  "mt-1 w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-900 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-500/20 focus:border-slate-500";

export function CloseTradeSheet({ tradeId, ticker, defaultPrice, open, onClose, onSuccess }: CloseTradeSheetProps) {
  const [exitPrice, setExitPrice] = useState(defaultPrice?.toFixed(2) ?? "");
  const [exitDate, setExitDate] = useState(todayIST());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/stocks/trades/${tradeId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ exitPrice: Number(exitPrice), exitDate }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to close trade");
      }
      onSuccess();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to close trade");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full md:max-w-md bg-white text-slate-900 [color-scheme:light] rounded-t-2xl md:rounded-2xl shadow-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-900">Close · {ticker}</h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100"
          >
            <X size={16} />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-slate-500 uppercase tracking-wide">Exit price (₹)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={exitPrice}
              onChange={(e) => setExitPrice(e.target.value)}
              required
              className={fieldClass}
            />
          </div>
          <div>
            <label className="text-xs text-slate-500 uppercase tracking-wide">Exit date</label>
            <input
              type="date"
              value={exitDate}
              onChange={(e) => setExitDate(e.target.value)}
              required
              className={fieldClass}
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 rounded-lg bg-slate-800 text-white text-sm font-semibold disabled:opacity-50"
          >
            {loading ? "Closing…" : "Confirm close"}
          </button>
        </form>
      </div>
    </div>
  );
}
