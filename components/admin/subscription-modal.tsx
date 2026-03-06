"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";

interface SubscriptionForm {
  name: string;
  amount: string;
  billingCycle: "monthly" | "yearly";
  startDate: string;
  status: "active" | "paused" | "cancelled";
  notes: string;
}

interface SubscriptionModalProps {
  initial?: {
    _id: string;
    name: string;
    amount: number;
    billingCycle: "monthly" | "yearly";
    startDate: string;
    status: "active" | "paused" | "cancelled";
    notes?: string;
  } | null;
  onClose: () => void;
  onSaved: () => void;
}

const empty: SubscriptionForm = {
  name: "",
  amount: "",
  billingCycle: "monthly",
  startDate: new Date().toISOString().slice(0, 10),
  status: "active",
  notes: "",
};

export function SubscriptionModal({ initial, onClose, onSaved }: SubscriptionModalProps) {
  const [form, setForm] = useState<SubscriptionForm>(empty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (initial) {
      setForm({
        name: initial.name,
        amount: String(initial.amount),
        billingCycle: initial.billingCycle,
        startDate: initial.startDate.slice(0, 10),
        status: initial.status,
        notes: initial.notes ?? "",
      });
    } else {
      setForm(empty);
    }
  }, [initial]);

  function set(key: keyof SubscriptionForm, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.name.trim() || !form.amount) return setError("Name and amount are required.");
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        amount: parseFloat(form.amount),
        billingCycle: form.billingCycle,
        startDate: form.startDate,
        status: form.status,
        notes: form.notes.trim() || undefined,
      };
      const res = initial
        ? await fetch(`/api/admin/subscriptions/${initial._id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/admin/subscriptions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
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
          <h2 className="text-lg font-semibold text-foreground">
            {initial ? "Edit Subscription" : "Add Subscription"}
          </h2>
          <button onClick={onClose} className="text-foreground/40 hover:text-foreground transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-foreground/50">Name</label>
            <input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Vercel Pro"
              className="px-4 py-2.5 rounded-lg bg-surface border border-primary/20 text-foreground text-sm focus:outline-none focus:border-primary/60 placeholder:text-foreground/20"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground/50">Amount (₹)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(e) => set("amount", e.target.value)}
                placeholder="0.00"
                className="px-4 py-2.5 rounded-lg bg-surface border border-primary/20 text-foreground text-sm focus:outline-none focus:border-primary/60 placeholder:text-foreground/20"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground/50">Billing Cycle</label>
              <select
                value={form.billingCycle}
                onChange={(e) => set("billingCycle", e.target.value as "monthly" | "yearly")}
                className="px-4 py-2.5 rounded-lg bg-surface border border-primary/20 text-foreground text-sm focus:outline-none focus:border-primary/60"
              >
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground/50">Start Date</label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => set("startDate", e.target.value)}
                className="px-4 py-2.5 rounded-lg bg-surface border border-primary/20 text-foreground text-sm focus:outline-none focus:border-primary/60"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground/50">Status</label>
              <select
                value={form.status}
                onChange={(e) => set("status", e.target.value as SubscriptionForm["status"])}
                className="px-4 py-2.5 rounded-lg bg-surface border border-primary/20 text-foreground text-sm focus:outline-none focus:border-primary/60"
              >
                <option value="active">Active</option>
                <option value="paused">Paused</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-foreground/50">Notes (optional)</label>
            <textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={2}
              placeholder="Any notes..."
              className="px-4 py-2.5 rounded-lg bg-surface border border-primary/20 text-foreground text-sm focus:outline-none focus:border-primary/60 placeholder:text-foreground/20 resize-none"
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
              className="flex-1 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary text-white hover:bg-primary/80 disabled:opacity-50 transition-colors"
            >
              {saving ? "Saving…" : initial ? "Save Changes" : "Add Subscription"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
