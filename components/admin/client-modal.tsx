"use client";

import { useState, useEffect } from "react";
import { X } from "lucide-react";

const PHASES = ["discovery", "design", "development", "maintenance", "complete"] as const;

interface ClientForm {
  name: string;
  email: string;
  phone: string;
  billingCycle: "monthly" | "yearly" | "one-time";
  cycleAmount: string;
  contractValue: string;
  startDate: string;
  status: "active" | "inactive";
  projectPhase: (typeof PHASES)[number];
  nextAction: string;
  githubUrl: string;
  websiteUrl: string;
  notes: string;
}

const empty: ClientForm = {
  name: "",
  email: "",
  phone: "",
  billingCycle: "monthly",
  cycleAmount: "",
  contractValue: "",
  startDate: new Date().toISOString().slice(0, 10),
  status: "active",
  projectPhase: "development",
  nextAction: "",
  githubUrl: "",
  websiteUrl: "",
  notes: "",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ClientData = Record<string, any>;

interface ClientModalProps {
  initial?: ClientData | null;
  onClose: () => void;
  onSaved: () => void;
}

export function ClientModal({ initial, onClose, onSaved }: ClientModalProps) {
  const [form, setForm] = useState<ClientForm>(empty);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (initial) {
      setForm({
        name: initial.name ?? "",
        email: initial.email ?? "",
        phone: initial.phone ?? "",
        billingCycle: initial.billingCycle ?? "monthly",
        cycleAmount: String(initial.cycleAmount ?? ""),
        contractValue: initial.contractValue ? String(initial.contractValue) : "",
        startDate: (initial.startDate ?? "").slice(0, 10),
        status: initial.status ?? "active",
        projectPhase: initial.projectPhase ?? "development",
        nextAction: initial.nextAction ?? "",
        githubUrl: initial.githubUrl ?? "",
        websiteUrl: initial.websiteUrl ?? "",
        notes: initial.notes ?? "",
      });
    } else {
      setForm(empty);
    }
  }, [initial]);

  function set(key: keyof ClientForm, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (!form.name.trim() || !form.cycleAmount) return setError("Name and cycle amount are required.");
    setSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        email: form.email.trim() || undefined,
        phone: form.phone.trim() || undefined,
        billingCycle: form.billingCycle,
        cycleAmount: parseFloat(form.cycleAmount),
        contractValue: form.contractValue ? parseFloat(form.contractValue) : undefined,
        startDate: form.startDate,
        status: form.status,
        projectPhase: form.projectPhase,
        nextAction: form.nextAction.trim() || undefined,
        githubUrl: form.githubUrl.trim() || undefined,
        websiteUrl: form.websiteUrl.trim() || undefined,
        notes: form.notes.trim() || undefined,
      };
      const res = initial
        ? await fetch(`/api/admin/clients/${initial._id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/admin/clients", {
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
      <div className="relative glass-panel rounded-2xl border border-white/10 w-full max-w-lg p-6 flex flex-col gap-5 shadow-[0_0_40px_rgba(0,0,0,0.6)] max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-foreground">
            {initial ? "Edit Client" : "Add Client"}
          </h2>
          <button onClick={onClose} className="text-foreground/40 hover:text-foreground transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-foreground/50">Client Name *</label>
            <input
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Acme Ltd"
              className="px-4 py-2.5 rounded-lg bg-surface border border-primary/20 text-foreground text-sm focus:outline-none focus:border-primary/60 placeholder:text-foreground/20"
            />
          </div>

          {/* Email + Phone */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground/50">Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
                placeholder="client@example.com"
                className="px-4 py-2.5 rounded-lg bg-surface border border-primary/20 text-foreground text-sm focus:outline-none focus:border-primary/60 placeholder:text-foreground/20"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground/50">Phone</label>
              <input
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="+44 7700 000000"
                className="px-4 py-2.5 rounded-lg bg-surface border border-primary/20 text-foreground text-sm focus:outline-none focus:border-primary/60 placeholder:text-foreground/20"
              />
            </div>
          </div>

          {/* Billing */}
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground/50">Billing Cycle *</label>
              <select
                value={form.billingCycle}
                onChange={(e) => set("billingCycle", e.target.value as ClientForm["billingCycle"])}
                className="px-4 py-2.5 rounded-lg bg-surface border border-primary/20 text-foreground text-sm focus:outline-none focus:border-primary/60"
              >
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
                <option value="one-time">One-time</option>
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground/50">Cycle Amount (₹) *</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.cycleAmount}
                onChange={(e) => set("cycleAmount", e.target.value)}
                placeholder="0.00"
                className="px-4 py-2.5 rounded-lg bg-surface border border-primary/20 text-foreground text-sm focus:outline-none focus:border-primary/60 placeholder:text-foreground/20"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground/50">Contract Value (₹)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={form.contractValue}
                onChange={(e) => set("contractValue", e.target.value)}
                placeholder="optional"
                className="px-4 py-2.5 rounded-lg bg-surface border border-primary/20 text-foreground text-sm focus:outline-none focus:border-primary/60 placeholder:text-foreground/20"
              />
            </div>
          </div>

          {/* Start date + Status */}
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
                onChange={(e) => set("status", e.target.value as "active" | "inactive")}
                className="px-4 py-2.5 rounded-lg bg-surface border border-primary/20 text-foreground text-sm focus:outline-none focus:border-primary/60"
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          {/* Project Phase */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-foreground/50">Project Phase</label>
            <select
              value={form.projectPhase}
              onChange={(e) => set("projectPhase", e.target.value as ClientForm["projectPhase"])}
              className="px-4 py-2.5 rounded-lg bg-surface border border-primary/20 text-foreground text-sm focus:outline-none focus:border-primary/60"
            >
              {PHASES.map((p) => (
                <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>
              ))}
            </select>
          </div>

          {/* Next Action */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-foreground/50">Next Action</label>
            <input
              value={form.nextAction}
              onChange={(e) => set("nextAction", e.target.value)}
              placeholder="e.g. Send invoice end of month"
              className="px-4 py-2.5 rounded-lg bg-surface border border-primary/20 text-foreground text-sm focus:outline-none focus:border-primary/60 placeholder:text-foreground/20"
            />
          </div>

          {/* Links */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground/50">GitHub URL</label>
              <input
                value={form.githubUrl}
                onChange={(e) => set("githubUrl", e.target.value)}
                placeholder="https://github.com/..."
                className="px-4 py-2.5 rounded-lg bg-surface border border-primary/20 text-foreground text-sm focus:outline-none focus:border-primary/60 placeholder:text-foreground/20"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground/50">Website URL</label>
              <input
                value={form.websiteUrl}
                onChange={(e) => set("websiteUrl", e.target.value)}
                placeholder="https://..."
                className="px-4 py-2.5 rounded-lg bg-surface border border-primary/20 text-foreground text-sm focus:outline-none focus:border-primary/60 placeholder:text-foreground/20"
              />
            </div>
          </div>

          {/* Notes */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-foreground/50">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => set("notes", e.target.value)}
              rows={2}
              placeholder="General notes about this client..."
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
              {saving ? "Saving…" : initial ? "Save Changes" : "Add Client"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
