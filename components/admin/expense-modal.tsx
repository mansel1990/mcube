"use client";

import { useState } from "react";
import { X } from "lucide-react";

const CATEGORIES = ["Domain", "Hardware", "Office", "Marketing", "Freelance", "Other"];

interface ExpenseModalProps {
  onClose: () => void;
  onSaved: () => void;
}

export function ExpenseModal({ onClose, onSaved }: ExpenseModalProps) {
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("Other");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!title.trim() || !amount) return setError("Title and amount are required.");
    setSaving(true);
    try {
      const res = await fetch("/api/admin/expenses", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          category,
          amount: parseFloat(amount),
          date,
          notes: notes.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      onSaved();
      onClose();
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative glass-panel rounded-2xl border border-white/10 w-full max-w-md p-6 flex flex-col gap-5 shadow-[0_0_40px_rgba(0,0,0,0.6)]">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">Add One-time Expense</h2>
          <button onClick={onClose} className="text-foreground/40 hover:text-foreground transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-foreground/50">Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Domain for mcube.studio"
              className="px-4 py-2.5 rounded-lg bg-surface border border-rose-400/20 text-foreground text-sm focus:outline-none focus:border-rose-400/60 placeholder:text-foreground/20"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground/50">Category</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="px-4 py-2.5 rounded-lg bg-surface border border-rose-400/20 text-foreground text-sm focus:outline-none focus:border-rose-400/60"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground/50">Amount (₹)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="px-4 py-2.5 rounded-lg bg-surface border border-rose-400/20 text-foreground text-sm focus:outline-none focus:border-rose-400/60 placeholder:text-foreground/20"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-foreground/50">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="px-4 py-2.5 rounded-lg bg-surface border border-rose-400/20 text-foreground text-sm focus:outline-none focus:border-rose-400/60"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-foreground/50">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Any notes..."
              className="px-4 py-2.5 rounded-lg bg-surface border border-rose-400/20 text-foreground text-sm focus:outline-none focus:border-rose-400/60 placeholder:text-foreground/20 resize-none"
            />
          </div>

          {error && <p className="text-rose-400 text-xs">{error}</p>}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium text-foreground/50 hover:text-foreground bg-white/5 hover:bg-white/10 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium bg-rose-500 text-white hover:bg-rose-500/80 disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving…" : "Add Expense"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
