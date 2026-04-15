"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { CreditorWithStats } from "./creditor-card";
import { METHOD_LABELS, formatINRCompact } from "./format";

const METHODS = Object.entries(METHOD_LABELS);

interface PaymentFormProps {
  creditors: CreditorWithStats[];
  preselectedCreditorId?: string;
  onClose: () => void;
  onSaved: () => void;
}

export function PaymentForm({
  creditors,
  preselectedCreditorId,
  onClose,
  onSaved,
}: PaymentFormProps) {
  const today = new Date().toISOString().split("T")[0];

  const [creditorId, setCreditorId] = useState(preselectedCreditorId ?? "");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(today);
  const [method, setMethod] = useState("bank_transfer");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (preselectedCreditorId) setCreditorId(preselectedCreditorId);
  }, [preselectedCreditorId]);

  const selectedCreditor = creditors.find((c) => c._id === creditorId);

  function parseAmount(val: string) {
    return parseInt(val.replace(/,/g, ""), 10);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const parsedAmount = parseAmount(amount);
    if (!creditorId) { setError("Select a creditor"); return; }
    if (isNaN(parsedAmount) || parsedAmount <= 0) { setError("Enter a valid amount"); return; }

    setSaving(true);
    try {
      const res = await fetch("/api/house-loan/payments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ creditorId, amount: parsedAmount, date, method, notes }),
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to save payment");
        return;
      }
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const activeCreditors = creditors.filter((c) => c.isActive && c.remaining > 0);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-md border border-slate-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div>
            <h2 className="text-base font-bold text-slate-800">Log Payment</h2>
            {selectedCreditor && (
              <p className="text-xs text-slate-500 mt-0.5">
                {selectedCreditor.name} — {formatINRCompact(selectedCreditor.remaining)} remaining
              </p>
            )}
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          {/* Creditor */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-600">Creditor</label>
            <select
              value={creditorId}
              onChange={(e) => setCreditorId(e.target.value)}
              className="px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 appearance-none"
            >
              <option value="">Select creditor…</option>
              {activeCreditors.map((c) => (
                <option key={c._id} value={c._id}>{c.name}</option>
              ))}
            </select>
          </div>

          {/* Amount */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-600">Amount (₹)</label>
            <input
              type="text"
              inputMode="numeric"
              placeholder="e.g. 50000"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 placeholder:text-slate-300"
            />
          </div>

          {/* Date + Method row */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-600">Date</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-600">Method</label>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
                className="px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 appearance-none"
              >
                {METHODS.map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Notes */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-600">Notes <span className="text-slate-400 font-normal">(optional)</span></label>
            <input
              type="text"
              placeholder="e.g. April salary"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 placeholder:text-slate-300"
            />
          </div>

          {error && <p className="text-xs font-medium text-rose-500 bg-rose-50 px-3 py-2 rounded-lg">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full py-3 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-colors disabled:opacity-50 shadow-sm"
          >
            {saving ? "Saving…" : "Log Payment"}
          </button>
        </form>
      </div>
    </div>
  );
}
