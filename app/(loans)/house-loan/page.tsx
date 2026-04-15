"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Settings2 } from "lucide-react";
import { SummaryCards } from "@/components/loans/summary-cards";
import { ProjectionBanner } from "@/components/loans/projection-banner";
import { CreditorList } from "@/components/loans/creditor-list";
import { ProgressCharts } from "@/components/loans/progress-charts";
import { RecentPayments } from "@/components/loans/recent-payments";
import { PaymentForm } from "@/components/loans/payment-form";
import { CreditorForm } from "@/components/loans/creditor-form";
import { CreditorWithStats } from "@/components/loans/creditor-card";
import { formatINR, formatINRCompact, formatMonthYear } from "@/components/loans/format";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

interface Stats {
  totalBorrowed: number;
  totalPaid: number;
  totalRemaining: number;
  progressPercent: number;
  monthlyBudget: number;
  projection: { months: number; clearByDate: string };
  creditorSummary: {
    _id: string;
    name: string;
    originalAmount: number;
    totalPaid: number;
    remaining: number;
    color: string;
  }[];
  monthlyBreakdown: { month: string; total: number; byCreditor: Record<string, number> }[];
}

interface Payment {
  _id: string;
  amount: number;
  date: string;
  method: string;
  notes?: string;
  creditorId: { _id: string; name: string; color: string };
}

export default function HouseLoanPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [creditors, setCreditors] = useState<CreditorWithStats[]>([]);
  const [recentPayments, setRecentPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPayForm, setShowPayForm] = useState(false);
  const [payPreselect, setPayPreselect] = useState<string | undefined>(undefined);
  const [showCreditorForm, setShowCreditorForm] = useState(false);
  const [monthlyBudget, setMonthlyBudget] = useState(350000);

  const loadData = useCallback(async () => {
    const [statsRes, creditorsRes, paymentsRes] = await Promise.all([
      fetch("/api/house-loan/stats"),
      fetch("/api/house-loan/creditors"),
      fetch("/api/house-loan/payments?limit=10"),
    ]);
    const [statsData, creditorsData, paymentsData] = await Promise.all([
      statsRes.json(),
      creditorsRes.json(),
      paymentsRes.json(),
    ]);
    setStats(statsData);
    setCreditors(creditorsData);
    setRecentPayments(paymentsData.payments ?? []);
    setMonthlyBudget(statsData.monthlyBudget ?? 350000);
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { loadData(); }, [loadData]);

  function handleQuickPay(creditor: CreditorWithStats) {
    setPayPreselect(creditor._id);
    setShowPayForm(true);
  }

  async function handleSeed() {
    await fetch("/api/house-loan/seed", { method: "POST" });
    loadData();
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  // Empty state
  if (creditors.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-5 sm:p-7">
        <div className="bg-white rounded-3xl border border-slate-100 shadow-sm p-10 max-w-md w-full text-center">
          <div className="w-16 h-16 rounded-2xl bg-blue-100 flex items-center justify-center mx-auto mb-5">
            <span className="text-3xl">🏠</span>
          </div>
          <h2 className="text-xl font-black text-slate-800 mb-2">Welcome to Casa Loans</h2>
          <p className="text-sm text-slate-500 mb-2">
            Track your property loan repayments across all creditors.
          </p>
          <p className="text-xs text-slate-400 mb-7">
            Add each friend individually with their real name, amount, and interest rate.
          </p>
          <div className="flex flex-col gap-3">
            <button
              onClick={() => setShowCreditorForm(true)}
              className="w-full py-3 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-colors shadow-sm"
            >
              Set up your creditors
            </button>
            <button
              onClick={handleSeed}
              className="w-full py-3 rounded-xl border-2 border-slate-200 text-slate-500 text-sm font-semibold hover:border-slate-300 hover:text-slate-700 transition-colors"
            >
              Load sample data
            </button>
          </div>
        </div>
        {showCreditorForm && (
          <CreditorForm onClose={() => setShowCreditorForm(false)} onSaved={loadData} />
        )}
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="p-6 sm:p-10 flex flex-col gap-8">

        {/* Page header */}
        <div className="flex items-center justify-between pt-1">
          <div>
            <h1 className="text-2xl font-black text-slate-800">Casa Loans</h1>
            <p className="text-sm text-slate-400 mt-0.5">Property purchase repayment tracker</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCreditorForm(true)}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border-2 border-slate-200 text-xs font-semibold text-slate-500 hover:border-slate-300 hover:text-slate-700 transition-colors"
            >
              <Settings2 size={13} />
              <span className="hidden sm:inline">Manage</span>
            </button>
            <button
              onClick={() => { setPayPreselect(undefined); setShowPayForm(true); }}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-colors shadow-sm"
            >
              <Plus size={15} />
              <span className="hidden sm:inline">Log Payment</span>
            </button>
          </div>
        </div>

        {/* Summary cards */}
        {stats && (
          <SummaryCards
            totalBorrowed={stats.totalBorrowed}
            totalPaid={stats.totalPaid}
            totalRemaining={stats.totalRemaining}
            progressPercent={stats.progressPercent}
          />
        )}

        {/* Projection + what-if */}
        {stats && (
          <ProjectionBanner
            totalRemaining={stats.totalRemaining}
            monthlyBudget={monthlyBudget}
            projectionMonths={stats.projection.months}
            clearByDate={stats.projection.clearByDate}
            onBudgetChange={(newBudget) => {
              setMonthlyBudget(newBudget);
              loadData();
            }}
          />
        )}

        {/* This month allocation + trend */}
        {stats && stats.creditorSummary.some((c) => c.remaining > 0) && (() => {
          const thisMonth = stats.monthlyBreakdown[stats.monthlyBreakdown.length - 1];
          const thisMonthTotal = thisMonth?.total ?? 0;

          return (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Left — allocation bars */}
              <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6">
                <div className="flex items-center justify-between mb-5">
                  <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                    This Month&apos;s Payments
                  </p>
                  <span className="text-xs font-bold text-slate-500">
                    Budget: <span className="text-slate-800">{formatINRCompact(monthlyBudget)}</span>
                  </span>
                </div>
                <div className="flex flex-col gap-4">
                  {stats.creditorSummary
                    .filter((c) => c.remaining > 0)
                    .map((c) => {
                      const paid = thisMonth?.byCreditor[c._id] ?? 0;
                      const pct = Math.min(100, (paid / monthlyBudget) * 100);
                      return (
                        <div key={c._id} className="flex flex-col gap-1.5">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <div
                                className="w-5 h-5 rounded-md flex items-center justify-center text-white text-[9px] font-bold shrink-0"
                                style={{ backgroundColor: c.color }}
                              >
                                {c.name[0].toUpperCase()}
                              </div>
                              <span className="text-xs font-semibold text-slate-600">{c.name}</span>
                            </div>
                            <span className="text-xs font-bold text-slate-700">
                              {paid > 0 ? formatINR(paid) : <span className="text-slate-300">—</span>}
                            </span>
                          </div>
                          <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden">
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{ width: `${pct}%`, backgroundColor: c.color }}
                            />
                          </div>
                        </div>
                      );
                    })}
                </div>
                {/* Total paid this month */}
                <div className="mt-5 pt-4 border-t border-slate-50 flex items-center justify-between">
                  <span className="text-xs text-slate-400">Total paid this month</span>
                  <span className="text-sm font-black text-emerald-600">{formatINR(thisMonthTotal)}</span>
                </div>
              </div>

              {/* Right — monthly trend line chart */}
              {(() => {
                const lineData = stats.monthlyBreakdown.slice(-6).map((m) => ({
                  month: formatMonthYear(m.month),
                  total: m.total,
                }));
                return (
                  <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-6 flex flex-col">
                    <div className="flex items-center justify-between mb-5">
                      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                        6-Month Trend
                      </p>
                      <span className="text-xs font-bold text-slate-500">
                        Monthly total paid
                      </span>
                    </div>
                    <div className="flex-1">
                      <ResponsiveContainer width="100%" height={180}>
                        <LineChart data={lineData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                          <XAxis
                            dataKey="month"
                            tick={{ fill: "#94a3b8", fontSize: 10 }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <YAxis
                            tickFormatter={(v) => formatINRCompact(v)}
                            tick={{ fill: "#94a3b8", fontSize: 10 }}
                            axisLine={false}
                            tickLine={false}
                          />
                          <Tooltip
                            formatter={(val: number | undefined) => val != null ? [formatINR(val), "Paid"] : ""}
                            contentStyle={{
                              background: "white",
                              border: "1px solid #f1f5f9",
                              borderRadius: 12,
                              fontSize: 12,
                              boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
                            }}
                          />
                          <Line
                            type="monotone"
                            dataKey="total"
                            stroke="#2563eb"
                            strokeWidth={2.5}
                            dot={{ r: 4, fill: "#2563eb", strokeWidth: 0 }}
                            activeDot={{ r: 6, fill: "#2563eb", strokeWidth: 0 }}
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    {/* Budget reference */}
                    <div className="mt-4 pt-4 border-t border-slate-50 flex items-center justify-between">
                      <span className="text-xs text-slate-400">Monthly budget</span>
                      <span className="text-xs font-bold text-slate-700">{formatINRCompact(monthlyBudget)}</span>
                    </div>
                  </div>
                );
              })()}
            </div>
          );
        })()}

        {/* Creditors */}
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
            Creditors
          </p>
          <CreditorList creditors={creditors} onQuickPay={handleQuickPay} />
        </div>

        {/* Charts */}
        {stats && stats.creditorSummary.length > 0 && stats.monthlyBreakdown.length > 0 && (
          <div>
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
              Analytics
            </p>
            <ProgressCharts
              creditorSummary={stats.creditorSummary}
              monthlyBreakdown={stats.monthlyBreakdown}
            />
          </div>
        )}

        {/* Recent payments */}
        <RecentPayments payments={recentPayments} />

        <div className="h-4" />
      </div>

      {/* Floating + Log Payment (mobile) */}
      <button
        onClick={() => { setPayPreselect(undefined); setShowPayForm(true); }}
        className="sm:hidden fixed bottom-6 right-4 z-40 w-14 h-14 rounded-full bg-blue-600 text-white flex items-center justify-center shadow-lg hover:bg-blue-700 transition-colors"
      >
        <Plus size={22} />
      </button>

      {showPayForm && (
        <PaymentForm
          creditors={creditors}
          preselectedCreditorId={payPreselect}
          onClose={() => setShowPayForm(false)}
          onSaved={loadData}
        />
      )}
      {showCreditorForm && (
        <CreditorForm
          onClose={() => setShowCreditorForm(false)}
          onSaved={loadData}
        />
      )}
    </div>
  );
}
