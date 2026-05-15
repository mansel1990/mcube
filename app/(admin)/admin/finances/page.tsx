"use client";

import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { SubscriptionModal } from "@/components/admin/subscription-modal";
import { ExpenseModal } from "@/components/admin/expense-modal";

interface Subscription {
  _id: string;
  name: string;
  amount: number;
  billingCycle: "monthly" | "yearly";
  startDate: string;
  status: "active" | "paused" | "cancelled";
  notes?: string;
}

interface Expense {
  _id: string;
  title: string;
  category: string;
  amount: number;
  date: string;
}

interface Payment {
  _id: string;
  clientName: string;
  amount: number;
  date: string;
  monthsCovered: number;
  periodLabel?: string;
}

function fmt(n: number) {
  return `₹${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const STATUS_BADGE: Record<Subscription["status"], string> = {
  active: "bg-accent/10 text-accent",
  paused: "bg-champagne/10 text-champagne",
  cancelled: "bg-rose-400/10 text-rose-400",
};

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export default function FinancesPage() {
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  const now = new Date();
  const [expMonth, setExpMonth] = useState(now.getMonth() + 1);
  const [expYear, setExpYear] = useState(now.getFullYear());

  const [showSubModal, setShowSubModal] = useState(false);
  const [editSub, setEditSub] = useState<Subscription | null>(null);
  const [showExpModal, setShowExpModal] = useState(false);

  const yearOptions = Array.from({ length: 3 }, (_, i) => now.getFullYear() - i);

  function refresh() { setRefreshKey((k) => k + 1); }

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/subscriptions").then((r) => r.json()),
      fetch(`/api/admin/expenses?month=${expMonth}&year=${expYear}`).then((r) => r.json()),
      fetch("/api/admin/payments").then((r) => r.json()),
    ]).then(([subs, exps, pays]) => {
      setSubscriptions(subs);
      setExpenses(exps);
      setPayments(pays);
      setLoading(false);
    });
  }, [expMonth, expYear, refreshKey]);

  const activeSubs = subscriptions.filter((s) => s.status === "active");
  const subsMonthlyTotal = activeSubs.reduce(
    (s, sub) => s + (sub.billingCycle === "monthly" ? sub.amount : sub.amount / 12),
    0
  );
  const expensesTotal = expenses.reduce((s, e) => s + e.amount, 0);

  async function deleteSub(id: string) {
    if (!confirm("Remove this subscription?")) return;
    await fetch(`/api/admin/subscriptions/${id}`, { method: "DELETE" });
    refresh();
  }

  async function deleteExpense(id: string) {
    if (!confirm("Delete this expense?")) return;
    await fetch(`/api/admin/expenses/${id}`, { method: "DELETE" });
    refresh();
  }

  return (
    <div className="p-4 md:p-6 space-y-6">

      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-slate-900">Finances</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Track recurring subscriptions and one-time expenses
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setEditSub(null); setShowSubModal(true); }}
            className="flex items-center gap-1.5 text-sm font-medium bg-primary/10 text-primary px-4 py-2 rounded-lg hover:bg-primary/20 transition-colors"
          >
            <Plus size={15} /> Subscription
          </button>
          <button
            onClick={() => setShowExpModal(true)}
            className="flex items-center gap-1.5 text-sm font-medium bg-rose-400/10 text-rose-400 px-4 py-2 rounded-lg hover:bg-rose-400/20 transition-colors"
          >
            <Plus size={15} /> Expense
          </button>
        </div>
      </div>

      {/* Totals row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white shadow-sm rounded-xl p-4 border-l-4 border-l-champagne shadow-[0_0_20px_rgba(242,227,198,0.08)]">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">Active Subs</div>
          <div className="text-2xl font-bold text-champagne mt-1">{activeSubs.length}</div>
          <div className="text-xs text-slate-400">{fmt(subsMonthlyTotal)}/mo</div>
        </div>
        <div className="bg-white shadow-sm rounded-xl p-4 border-l-4 border-l-rose-400 shadow-[0_0_20px_rgba(251,113,133,0.08)]">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">Subs Cost</div>
          <div className="text-2xl font-bold text-rose-400 mt-1">{fmt(subsMonthlyTotal)}</div>
          <div className="text-xs text-slate-400">per month</div>
        </div>
        <div className="bg-white shadow-sm rounded-xl p-4 border-l-4 border-l-rose-400/50 col-span-2">
          <div className="text-xs font-medium text-slate-400 uppercase tracking-wider">
            One-time Expenses · {MONTHS[expMonth - 1]} {expYear}
          </div>
          <div className="text-2xl font-bold text-rose-600 mt-1">{fmt(expensesTotal)}</div>
          <div className="text-xs text-slate-400">{expenses.length} item{expenses.length !== 1 ? "s" : ""}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Subscriptions */}
        <div className="bg-white shadow-sm rounded-xl border border-slate-100 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900">Subscriptions</h2>
            <button
              onClick={() => { setEditSub(null); setShowSubModal(true); }}
              className="flex items-center gap-1.5 text-xs font-medium text-primary hover:text-primary/70 transition-colors"
            >
              <Plus size={14} /> Add
            </button>
          </div>

          {loading ? (
            <div className="px-5 py-8 text-slate-400 text-sm">Loading…</div>
          ) : subscriptions.length === 0 ? (
            <div className="px-5 py-8 text-slate-400 text-sm">No subscriptions yet.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {subscriptions.map((sub) => (
                <div
                  key={sub._id}
                  className={`flex items-center gap-4 px-5 py-3.5 ${sub.status === "cancelled" ? "opacity-35" : ""}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-slate-900">{sub.name}</span>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase tracking-wide ${STATUS_BADGE[sub.status]}`}>
                        {sub.status}
                      </span>
                    </div>
                    <span className="text-xs text-slate-400">
                      {sub.billingCycle === "monthly"
                        ? `${fmt(sub.amount)}/mo`
                        : `${fmt(sub.amount)}/yr · ${fmt(sub.amount / 12)}/mo`}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => { setEditSub(sub); setShowSubModal(true); }}
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-900 hover:bg-slate-100 transition-colors"
                    >
                      <Pencil size={13} />
                    </button>
                    <button
                      onClick={() => deleteSub(sub._id)}
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-400/10 transition-colors"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* One-time Expenses */}
        <div className="bg-white shadow-sm rounded-xl border border-slate-100 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-semibold text-slate-900">One-time Expenses</h2>
            <div className="flex items-center gap-2">
              <select
                value={expMonth}
                onChange={(e) => setExpMonth(Number(e.target.value))}
                className="text-xs bg-white border border-slate-200 rounded-md px-2 py-1 text-slate-600 focus:outline-none"
              >
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>{m}</option>
                ))}
              </select>
              <select
                value={expYear}
                onChange={(e) => setExpYear(Number(e.target.value))}
                className="text-xs bg-white border border-slate-200 rounded-md px-2 py-1 text-slate-600 focus:outline-none"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
              <button
                onClick={() => setShowExpModal(true)}
                className="flex items-center gap-1.5 text-xs font-medium text-rose-400 hover:text-rose-600 transition-colors"
              >
                <Plus size={14} /> Add
              </button>
            </div>
          </div>

          {loading ? (
            <div className="px-5 py-8 text-slate-400 text-sm">Loading…</div>
          ) : expenses.length === 0 ? (
            <div className="px-5 py-8 text-slate-400 text-sm">
              No expenses for {MONTHS[expMonth - 1]} {expYear}.
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {expenses.map((exp) => (
                <div key={exp._id} className="flex items-center gap-4 px-5 py-3.5">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-slate-900 truncate">{exp.title}</span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-rose-400/10 text-rose-400 uppercase tracking-wide">
                        {exp.category}
                      </span>
                    </div>
                    <span className="text-xs text-slate-400">{fmtDate(exp.date)}</span>
                  </div>
                  <span className="text-sm font-semibold text-rose-400 shrink-0">{fmt(exp.amount)}</span>
                  <button
                    onClick={() => deleteExpense(exp._id)}
                    className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-400/10 transition-colors shrink-0"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent Payments */}
      <div className="bg-white shadow-sm rounded-xl border border-slate-100 overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-semibold text-slate-900">Recent Payments</h2>
        </div>
        {loading ? (
          <div className="px-5 py-8 text-slate-400 text-sm">Loading…</div>
        ) : payments.length === 0 ? (
          <div className="px-5 py-8 text-slate-400 text-sm">No payments recorded yet.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {payments.slice(0, 8).map((p) => (
              <div key={p._id} className="flex items-center gap-4 px-5 py-3.5">
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-medium text-slate-900 block">{p.clientName}</span>
                  <span className="text-xs text-slate-400">
                    {p.periodLabel ?? fmtDate(p.date)}
                    {p.monthsCovered > 1 ? ` · ${p.monthsCovered} months` : ""}
                    {" · "}received {fmtDate(p.date)}
                  </span>
                </div>
                <span className="text-sm font-semibold text-accent shrink-0">{fmt(p.amount)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {showSubModal && (
        <SubscriptionModal
          initial={editSub}
          onClose={() => setShowSubModal(false)}
          onSaved={refresh}
        />
      )}
      {showExpModal && (
        <ExpenseModal
          onClose={() => setShowExpModal(false)}
          onSaved={refresh}
        />
      )}
    </div>
  );
}
