"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";
import { CreditorWithStats } from "./creditor-card";
import { TYPE_LABELS } from "./format";

const COLOR_PALETTE = [
  "#3b82f6", "#ef4444", "#f59e0b", "#10b981",
  "#8b5cf6", "#ec4899", "#06b6d4", "#f97316",
];

const TYPES = Object.entries(TYPE_LABELS);

interface CreditorFormProps {
  creditor?: CreditorWithStats | null;
  onClose: () => void;
  onSaved: () => void;
}

export function CreditorForm({ creditor, onClose, onSaved }: CreditorFormProps) {
  const isEdit = Boolean(creditor);

  const [name, setName] = useState(creditor?.name ?? "");
  const [type, setType] = useState(creditor?.type ?? "family");
  const [originalAmount, setOriginalAmount] = useState(creditor ? String(creditor.originalAmount) : "");
  const [interestRate, setInterestRate] = useState(creditor ? String(creditor.interestRate) : "0");
  const [notes, setNotes] = useState(creditor?.notes ?? "");
  const [color, setColor] = useState(creditor?.color ?? COLOR_PALETTE[0]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (creditor) {
      setName(creditor.name);
      setType(creditor.type);
      setOriginalAmount(String(creditor.originalAmount));
      setInterestRate(String(creditor.interestRate));
      setNotes(creditor.notes ?? "");
      setColor(creditor.color);
    }
  }, [creditor]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const amount = parseInt(originalAmount.replace(/,/g, ""), 10);
    const rate = parseFloat(interestRate);

    if (!name.trim()) { setError("Name is required"); return; }
    if (isNaN(amount) || amount <= 0) { setError("Enter a valid amount"); return; }
    if (isNaN(rate) || rate < 0) { setError("Enter a valid interest rate (0 for interest-free)"); return; }

    setSaving(true);
    try {
      const body = { name: name.trim(), type, originalAmount: amount, interestRate: rate, notes, color };
      const res = isEdit
        ? await fetch(`/api/house-loan/creditors/${creditor!._id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          })
        : await fetch("/api/house-loan/creditors", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error ?? "Failed to save");
        return;
      }
      onSaved();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg border border-slate-200 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 sticky top-0 bg-white z-10">
          <h2 className="text-base font-bold text-slate-800">
            {isEdit ? "Edit Creditor" : "Add Creditor"}
          </h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-600">Name</label>
            <input
              type="text"
              placeholder="e.g. Ravi, Mom, Bank Loan"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 placeholder:text-slate-300"
            />
          </div>

          {/* Type */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-600">Type</label>
            <div className="grid grid-cols-4 gap-2">
              {TYPES.map(([val, label]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => setType(val)}
                  className={`py-2 rounded-xl text-xs font-semibold border-2 transition-all ${
                    type === val
                      ? "border-blue-500 bg-blue-50 text-blue-600"
                      : "border-slate-200 text-slate-500 hover:border-slate-300"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Amount + Rate */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-600">Amount (₹)</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="e.g. 500000"
                value={originalAmount}
                onChange={(e) => setOriginalAmount(e.target.value)}
                className="px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 placeholder:text-slate-300"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-semibold text-slate-600">Interest % p.a.</label>
              <input
                type="number"
                min="0"
                step="0.1"
                placeholder="0"
                value={interestRate}
                onChange={(e) => setInterestRate(e.target.value)}
                className="px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 placeholder:text-slate-300"
              />
            </div>
          </div>

          {/* Notes */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-600">Notes <span className="text-slate-400 font-normal">(optional)</span></label>
            <input
              type="text"
              placeholder="e.g. Clear by Dec 2026"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-400 placeholder:text-slate-300"
            />
          </div>

          {/* Color */}
          <div className="flex flex-col gap-2">
            <label className="text-xs font-semibold text-slate-600">Color</label>
            <div className="flex gap-2.5 flex-wrap">
              {COLOR_PALETTE.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  className={`w-8 h-8 rounded-xl transition-transform shadow-sm ${
                    color === c ? "scale-125 ring-2 ring-offset-2 ring-slate-300" : "hover:scale-110"
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          {error && <p className="text-xs font-medium text-rose-500 bg-rose-50 px-3 py-2 rounded-lg">{error}</p>}

          <button
            type="submit"
            disabled={saving}
            className="w-full py-3 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-colors disabled:opacity-50 shadow-sm"
          >
            {saving ? "Saving…" : isEdit ? "Save Changes" : "Add Creditor"}
          </button>
        </form>
      </div>
    </div>
  );
}
