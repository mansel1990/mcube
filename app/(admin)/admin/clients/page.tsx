"use client";

import { useEffect, useState } from "react";
import { Plus, Github, Globe, ArrowRight } from "lucide-react";
import Link from "next/link";
import { ClientModal } from "@/components/admin/client-modal";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Client {
  _id: string;
  name: string;
  email?: string;
  billingCycle: "monthly" | "yearly" | "one-time";
  cycleAmount: number;
  contractValue?: number;
  status: "active" | "inactive";
  projectPhase: "discovery" | "design" | "development" | "maintenance" | "complete";
  nextAction?: string;
  githubUrl?: string;
  websiteUrl?: string;
}

interface Payment {
  _id: string;
  clientId: string;
  amount: number;
  date: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const CYCLE_BADGE: Record<Client["billingCycle"], string> = {
  monthly: "bg-primary/10 text-primary",
  yearly: "bg-accent/10 text-accent",
  "one-time": "bg-champagne/10 text-champagne",
};

const PHASE_BADGE: Record<Client["projectPhase"], string> = {
  discovery: "bg-indigo-500/10 text-indigo-700",
  design: "bg-violet-500/10 text-violet-700",
  development: "bg-blue-500/10 text-blue-700",
  maintenance: "bg-cyan-500/10 text-cyan-700",
  complete: "bg-green-500/10 text-green-700",
};

function getPaymentHealth(
  client: Client,
  lastPayment: Payment | undefined
): "paid-up" | "due-soon" | "overdue" | null {
  if (client.billingCycle === "one-time") return null;
  if (!lastPayment) return "overdue";
  const days = (Date.now() - new Date(lastPayment.date).getTime()) / 86_400_000;
  const threshold = client.billingCycle === "monthly" ? 35 : 370;
  const warnAt = client.billingCycle === "monthly" ? 28 : 355;
  if (days > threshold) return "overdue";
  if (days > warnAt) return "due-soon";
  return "paid-up";
}

const HEALTH_BADGE = {
  "paid-up": "bg-accent/10 text-accent",
  "due-soon": "bg-champagne/10 text-champagne",
  overdue: "bg-rose-400/10 text-rose-400",
};

const HEALTH_LABEL = {
  "paid-up": "Paid Up",
  "due-soon": "Due Soon",
  overdue: "Overdue",
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const [showModal, setShowModal] = useState(false);

  function refresh() { setRefreshKey((k) => k + 1); }

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/clients").then((r) => r.json()),
      fetch("/api/admin/payments").then((r) => r.json()),
    ]).then(([cls, pays]) => {
      setClients(cls);
      setPayments(pays);
      setLoading(false);
    });
  }, [refreshKey]);

  function lastPaymentFor(clientId: string) {
    return payments
      .filter((p) => p.clientId === clientId)
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold text-slate-900">Clients</h1>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center gap-1.5 text-sm font-medium bg-primary text-white px-4 py-2 rounded-lg hover:bg-primary/80 transition-colors"
        >
          <Plus size={15} /> Add Client
        </button>
      </div>

      {loading ? (
        <div className="text-slate-400 text-sm py-16 text-center">Loading…</div>
      ) : clients.length === 0 ? (
        <div className="text-slate-400 text-sm py-16 text-center">No clients yet. Add one to get started.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {clients.map((client) => {
            const last = lastPaymentFor(client._id);
            const health = getPaymentHealth(client, last);

            return (
              <div
                key={client._id}
                className="bg-white shadow-sm rounded-xl border border-slate-100 p-5 flex flex-col gap-3 hover:border-slate-200 transition-colors"
              >
                {/* Top row */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <h2 className="text-base font-semibold text-slate-900 truncate">{client.name}</h2>
                    <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide ${CYCLE_BADGE[client.billingCycle]}`}>
                        {client.billingCycle}
                      </span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide ${PHASE_BADGE[client.projectPhase]}`}>
                        {client.projectPhase}
                      </span>
                      {health && (
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide ${HEALTH_BADGE[health]}`}>
                          {HEALTH_LABEL[health]}
                        </span>
                      )}
                    </div>
                  </div>
                  <span
                    className={`mt-0.5 w-2 h-2 rounded-full shrink-0 ${client.status === "active" ? "bg-accent" : "bg-slate-200"}`}
                    title={client.status}
                  />
                </div>

                {/* Amount */}
                <div className="text-sm text-slate-600">
                  <span className="text-slate-900 font-medium">{fmt(client.cycleAmount)}</span>
                  {client.billingCycle !== "one-time" && (
                    <span className="text-slate-400">
                      /{client.billingCycle === "monthly" ? "mo" : "yr"}
                    </span>
                  )}
                  {client.contractValue && (
                    <span className="text-slate-400 text-xs ml-2">· {fmt(client.contractValue)} total</span>
                  )}
                </div>

                {/* Last payment */}
                <div className="text-xs text-slate-400">
                  {last
                    ? `Last payment: ${fmt(last.amount)} on ${fmtDate(last.date)}`
                    : "No payments recorded"}
                </div>

                {/* Next action */}
                {client.nextAction && (
                  <div className="text-xs text-slate-500 bg-slate-50 rounded-lg px-3 py-2 border border-slate-100 italic">
                    {client.nextAction}
                  </div>
                )}

                {/* Footer row */}
                <div className="flex items-center justify-between mt-auto pt-1">
                  <div className="flex items-center gap-2">
                    {client.githubUrl && (
                      <a
                        href={client.githubUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-400 hover:text-slate-900 transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Github size={15} />
                      </a>
                    )}
                    {client.websiteUrl && (
                      <a
                        href={client.websiteUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-400 hover:text-slate-900 transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Globe size={15} />
                      </a>
                    )}
                  </div>
                  <Link
                    href={`/admin/clients/${client._id}`}
                    className="flex items-center gap-1 text-xs font-medium text-primary hover:text-primary/70 transition-colors"
                  >
                    View <ArrowRight size={13} />
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <ClientModal
          initial={null}
          onClose={() => setShowModal(false)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
