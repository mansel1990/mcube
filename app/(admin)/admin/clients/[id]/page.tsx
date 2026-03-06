"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft, Pencil, Trash2, Github, Globe, Mail, Phone, Plus, Save,
} from "lucide-react";
import Link from "next/link";
import { ClientModal } from "@/components/admin/client-modal";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Client {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
  billingCycle: "monthly" | "yearly" | "one-time";
  cycleAmount: number;
  contractValue?: number;
  startDate: string;
  status: "active" | "inactive";
  projectPhase: "discovery" | "design" | "development" | "maintenance" | "complete";
  nextAction?: string;
  githubUrl?: string;
  websiteUrl?: string;
  notes?: string;
}

interface Payment {
  _id: string;
  clientId: string;
  clientName: string;
  amount: number;
  date: string;
  monthsCovered: number;
  periodLabel?: string;
  notes?: string;
}

interface Note {
  _id: string;
  clientId: string;
  text: string;
  createdAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

function relativeTime(d: string) {
  const diff = Date.now() - new Date(d).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return fmtDate(d);
}

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

function buildPeriodLabel(fromMonth: number, fromYear: number, months: number): string {
  const m = fromMonth - 1; // 0-indexed
  if (months <= 1) return `${MONTHS[m]} ${fromYear}`;
  const endIdx = (m + months - 1) % 12;
  const endYear = fromYear + Math.floor((m + months - 1) / 12);
  return endYear === fromYear
    ? `${MONTHS[m]}–${MONTHS[endIdx]} ${fromYear}`
    : `${MONTHS[m]} ${fromYear}–${MONTHS[endIdx]} ${endYear}`;
}


const PHASE_BADGE: Record<Client["projectPhase"], string> = {
  discovery: "bg-indigo-500/10 text-indigo-400",
  design: "bg-violet-500/10 text-violet-400",
  development: "bg-blue-500/10 text-blue-400",
  maintenance: "bg-cyan-500/10 text-cyan-400",
  complete: "bg-green-500/10 text-green-400",
};

const CYCLE_BADGE: Record<Client["billingCycle"], string> = {
  monthly: "bg-primary/10 text-primary",
  yearly: "bg-accent/10 text-accent",
  "one-time": "bg-champagne/10 text-champagne",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function ClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const router = useRouter();

  const [client, setClient] = useState<Client | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const [showEditModal, setShowEditModal] = useState(false);

  // Payment form
  const [payAmount, setPayAmount] = useState("");
  const [payDate, setPayDate] = useState(new Date().toISOString().slice(0, 10));
  const [payFromMonth, setPayFromMonth] = useState(new Date().getMonth() + 1);
  const [payFromYear, setPayFromYear] = useState(new Date().getFullYear());
  const [payMonths, setPayMonths] = useState(1);
  const [payNotes, setPayNotes] = useState("");
  const [savingPay, setSavingPay] = useState(false);

  // Next action
  const [nextAction, setNextAction] = useState("");
  const [savingNext, setSavingNext] = useState(false);

  // Notes
  const [noteText, setNoteText] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  function refresh() { setRefreshKey((k) => k + 1); }

  useEffect(() => {
    Promise.all([
      fetch(`/api/admin/clients/${id}`).then((r) => r.json()),
      fetch(`/api/admin/payments?clientId=${id}`).then((r) => r.json()),
      fetch(`/api/admin/client-notes?clientId=${id}`).then((r) => r.json()),
    ]).then(([cl, pays, nts]) => {
      setClient(cl);
      setPayments(pays);
      setNotes(nts);
      setPayAmount(String(cl.cycleAmount ?? ""));
      setNextAction(cl.nextAction ?? "");
      setLoading(false);
    });
  }, [id, refreshKey]);


  // ── Mutations ───────────────────────────────────────────────────────────────

  async function submitPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!payAmount) return;
    setSavingPay(true);
    await fetch("/api/admin/payments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: id,
        clientName: client?.name,
        amount: parseFloat(payAmount),
        date: payDate,
        periodStart: `${payFromYear}-${String(payFromMonth).padStart(2, "0")}-01`,
        monthsCovered: payMonths,
        periodLabel: buildPeriodLabel(payFromMonth, payFromYear, payMonths),
        notes: payNotes.trim() || undefined,
      }),
    });
    setPayAmount(String(client?.cycleAmount ?? ""));
    setPayDate(new Date().toISOString().slice(0, 10));
    setPayFromMonth(new Date().getMonth() + 1);
    setPayFromYear(new Date().getFullYear());
    setPayMonths(1);
    setPayNotes("");
    setSavingPay(false);
    refresh();
  }

  async function deletePayment(payId: string) {
    if (!confirm("Delete this payment record?")) return;
    await fetch(`/api/admin/payments/${payId}`, { method: "DELETE" });
    refresh();
  }

  async function saveNextAction() {
    setSavingNext(true);
    await fetch(`/api/admin/clients/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nextAction: nextAction.trim() || undefined }),
    });
    setSavingNext(false);
    refresh();
  }

  async function submitNote(e: React.FormEvent) {
    e.preventDefault();
    if (!noteText.trim()) return;
    setSavingNote(true);
    await fetch("/api/admin/client-notes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: id, text: noteText.trim() }),
    });
    setNoteText("");
    setSavingNote(false);
    refresh();
  }

  async function deleteNote(noteId: string) {
    await fetch(`/api/admin/client-notes/${noteId}`, { method: "DELETE" });
    refresh();
  }

  async function deleteClient() {
    if (!confirm(`Delete ${client?.name}? This cannot be undone.`)) return;
    await fetch(`/api/admin/clients/${id}`, { method: "DELETE" });
    router.push("/admin/clients");
  }

  const totalReceived = payments.reduce((s, p) => s + p.amount, 0);

  if (loading) {
    return (
      <div className="p-6 text-foreground/30 text-sm">Loading…</div>
    );
  }

  if (!client || (client as unknown as Record<string, unknown>).error) {
    return (
      <div className="p-6 text-foreground/50 text-sm">Client not found.</div>
    );
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      {/* Back */}
      <Link
        href="/admin/clients"
        className="inline-flex items-center gap-1.5 text-sm text-foreground/40 hover:text-foreground transition-colors"
      >
        <ArrowLeft size={14} /> All Clients
      </Link>

      {/* ── Header ──────────────────────────────────────────────────────────── */}
      <div className="glass-panel rounded-xl border border-white/5 p-5 space-y-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-bold text-foreground">{client.name}</h1>
              <span
                className={`w-2 h-2 rounded-full ${client.status === "active" ? "bg-accent" : "bg-foreground/20"}`}
                title={client.status}
              />
            </div>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide ${CYCLE_BADGE[client.billingCycle]}`}>
                {client.billingCycle}
              </span>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide ${PHASE_BADGE[client.projectPhase]}`}>
                {client.projectPhase}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={() => setShowEditModal(true)}
              className="w-9 h-9 flex items-center justify-center rounded-lg text-foreground/40 hover:text-foreground hover:bg-white/5 transition-colors"
            >
              <Pencil size={15} />
            </button>
            <button
              onClick={deleteClient}
              className="w-9 h-9 flex items-center justify-center rounded-lg text-foreground/40 hover:text-rose-400 hover:bg-rose-400/10 transition-colors"
            >
              <Trash2 size={15} />
            </button>
          </div>
        </div>

        {/* Contact row */}
        <div className="flex items-center gap-4 flex-wrap text-sm text-foreground/50">
          {client.email && (
            <a href={`mailto:${client.email}`} className="flex items-center gap-1.5 hover:text-foreground transition-colors">
              <Mail size={13} /> {client.email}
            </a>
          )}
          {client.phone && (
            <span className="flex items-center gap-1.5">
              <Phone size={13} /> {client.phone}
            </span>
          )}
          {client.githubUrl && (
            <a href={client.githubUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-foreground transition-colors">
              <Github size={13} /> GitHub
            </a>
          )}
          {client.websiteUrl && (
            <a href={client.websiteUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1.5 hover:text-foreground transition-colors">
              <Globe size={13} /> Website
            </a>
          )}
        </div>

        {/* Financials row */}
        <div className="flex items-center gap-6 flex-wrap text-sm">
          <div>
            <span className="text-foreground/40 text-xs">Cycle Amount</span>
            <div className="font-semibold text-foreground">
              {fmt(client.cycleAmount)}
              {client.billingCycle !== "one-time" && (
                <span className="text-foreground/40 font-normal text-xs">/{client.billingCycle === "monthly" ? "mo" : "yr"}</span>
              )}
            </div>
          </div>
          {client.contractValue && (
            <div>
              <span className="text-foreground/40 text-xs">Contract Value</span>
              <div className="font-semibold text-foreground">{fmt(client.contractValue)}</div>
            </div>
          )}
          <div>
            <span className="text-foreground/40 text-xs">Total Received</span>
            <div className="font-semibold text-accent">{fmt(totalReceived)}</div>
          </div>
          {client.contractValue && (
            <div>
              <span className="text-foreground/40 text-xs">Remaining</span>
              <div className={`font-semibold ${client.contractValue - totalReceived > 0 ? "text-champagne" : "text-green-400"}`}>
                {fmt(Math.max(0, client.contractValue - totalReceived))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Next Action ─────────────────────────────────────────────────────── */}
      <div className="glass-panel rounded-xl border border-white/5 p-5">
        <h2 className="text-sm font-semibold text-foreground mb-3">Next Action</h2>
        <div className="flex gap-2">
          <input
            value={nextAction}
            onChange={(e) => setNextAction(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && saveNextAction()}
            placeholder="e.g. Send invoice end of month"
            className="flex-1 px-4 py-2.5 rounded-lg bg-surface border border-primary/20 text-foreground text-sm focus:outline-none focus:border-primary/60 placeholder:text-foreground/20"
          />
          <button
            onClick={saveNextAction}
            disabled={savingNext}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50 transition-colors shrink-0"
          >
            <Save size={14} /> {savingNext ? "Saving…" : "Save"}
          </button>
        </div>
      </div>

      {/* ── Record Payment ──────────────────────────────────────────────────── */}
      <div className="glass-panel rounded-xl border border-accent/20 p-5 shadow-[0_0_24px_rgba(6,182,212,0.06)]">
        <h2 className="text-sm font-semibold text-foreground mb-4">Record Payment</h2>
        <form onSubmit={submitPayment} className="space-y-4">
          {/* Payment For */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-foreground/50">Payment For</label>
            <div className="grid grid-cols-3 gap-2">
              <select
                value={payFromMonth}
                onChange={(e) => setPayFromMonth(Number(e.target.value))}
                className="px-3 py-2.5 rounded-lg bg-surface border border-accent/20 text-foreground text-sm focus:outline-none focus:border-accent/60"
              >
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </select>
              <select
                value={payFromYear}
                onChange={(e) => setPayFromYear(Number(e.target.value))}
                className="px-3 py-2.5 rounded-lg bg-surface border border-accent/20 text-foreground text-sm focus:outline-none focus:border-accent/60"
              >
                {Array.from({ length: 4 }, (_, i) => new Date().getFullYear() - 1 + i).map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="1"
                  max="12"
                  value={payMonths}
                  onChange={(e) => setPayMonths(Math.max(1, Number(e.target.value)))}
                  className="w-full px-3 py-2.5 rounded-lg bg-surface border border-accent/20 text-foreground text-sm focus:outline-none focus:border-accent/60 text-center"
                  title="Number of months"
                />
                <span className="text-xs text-foreground/40 shrink-0">mo</span>
              </div>
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-xs text-foreground/30">Period:</span>
              <span className="text-xs font-semibold text-accent bg-accent/10 px-2 py-0.5 rounded-full">
                {buildPeriodLabel(payFromMonth, payFromYear, payMonths)}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground/50">Amount (₹)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                className="px-4 py-2.5 rounded-lg bg-surface border border-accent/20 text-foreground text-sm focus:outline-none focus:border-accent/60 placeholder:text-foreground/20"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-foreground/50">Date Received</label>
              <input
                type="date"
                value={payDate}
                onChange={(e) => setPayDate(e.target.value)}
                className="px-4 py-2.5 rounded-lg bg-surface border border-accent/20 text-foreground text-sm focus:outline-none focus:border-accent/60"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-foreground/50">Notes (optional)</label>
            <input
              value={payNotes}
              onChange={(e) => setPayNotes(e.target.value)}
              placeholder="Any notes about this payment..."
              className="px-4 py-2.5 rounded-lg bg-surface border border-accent/20 text-foreground text-sm focus:outline-none focus:border-accent/60 placeholder:text-foreground/20"
            />
          </div>

          <button
            type="submit"
            disabled={savingPay || !payAmount}
            className="w-full px-4 py-2.5 rounded-lg text-sm font-medium bg-accent text-background hover:bg-accent/80 disabled:opacity-50 transition-colors"
          >
            {savingPay ? "Recording…" : "Record Payment"}
          </button>
        </form>
      </div>

      {/* ── Payment History ─────────────────────────────────────────────────── */}
      <div className="glass-panel rounded-xl border border-white/5 overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-foreground">Payment History</h2>
          <span className="text-xs text-foreground/40">{payments.length} payment{payments.length !== 1 ? "s" : ""}</span>
        </div>

        {payments.length === 0 ? (
          <div className="px-5 py-8 text-foreground/30 text-sm">No payments recorded yet.</div>
        ) : (
          <>
            <div className="divide-y divide-white/5">
              {payments.map((p) => (
                <div key={p._id} className="flex items-center gap-4 px-5 py-3.5">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-foreground">
                      {p.periodLabel ?? fmtDate(p.date)}
                    </div>
                    <div className="text-xs text-foreground/40">
                      {fmtDate(p.date)}
                      {p.monthsCovered > 1 ? ` · ${p.monthsCovered} months` : ""}
                      {p.notes ? ` · ${p.notes}` : ""}
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-accent shrink-0">{fmt(p.amount)}</span>
                  <button
                    onClick={() => deletePayment(p._id)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-foreground/30 hover:text-rose-400 hover:bg-rose-400/10 transition-colors shrink-0"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
            <div className="px-5 py-3 border-t border-white/5 flex items-center justify-between text-xs text-foreground/40">
              <span>Total received</span>
              <span className="font-semibold text-accent">{fmt(totalReceived)}</span>
            </div>
          </>
        )}
      </div>

      {/* ── Notes Log ───────────────────────────────────────────────────────── */}
      <div className="glass-panel rounded-xl border border-white/5 overflow-hidden">
        <div className="px-5 py-4 border-b border-white/5">
          <h2 className="text-sm font-semibold text-foreground">Notes</h2>
        </div>

        <div className="divide-y divide-white/5">
          {notes.length === 0 ? (
            <div className="px-5 py-6 text-foreground/30 text-sm">No notes yet.</div>
          ) : (
            notes.map((n) => (
              <div key={n._id} className="flex items-start gap-3 px-5 py-3.5">
                <div className="flex-1 min-w-0">
                  <p className="text-sm text-foreground/80">{n.text}</p>
                  <span className="text-xs text-foreground/30">{relativeTime(n.createdAt)}</span>
                </div>
                <button
                  onClick={() => deleteNote(n._id)}
                  className="w-7 h-7 flex items-center justify-center rounded-lg text-foreground/20 hover:text-rose-400 hover:bg-rose-400/10 transition-colors shrink-0 mt-0.5"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))
          )}
        </div>

        <form onSubmit={submitNote} className="px-5 py-4 border-t border-white/5 flex gap-2">
          <input
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Add a note…"
            className="flex-1 px-4 py-2.5 rounded-lg bg-surface border border-primary/20 text-foreground text-sm focus:outline-none focus:border-primary/60 placeholder:text-foreground/20"
          />
          <button
            type="submit"
            disabled={savingNote || !noteText.trim()}
            className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-medium bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-50 transition-colors shrink-0"
          >
            <Plus size={14} /> Add
          </button>
        </form>
      </div>

      {showEditModal && (
        <ClientModal
          initial={client}
          onClose={() => setShowEditModal(false)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
