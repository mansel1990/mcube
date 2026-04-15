"use client";

import { useState, useEffect, useCallback } from "react";
import { Filter } from "lucide-react";
import { PaymentHistoryTable } from "@/components/loans/payment-history-table";
import { CreditorWithStats } from "@/components/loans/creditor-card";
import { formatINR, METHOD_LABELS } from "@/components/loans/format";

interface Payment {
  _id: string;
  amount: number;
  date: string;
  method: string;
  notes?: string;
  creditorId: { _id: string; name: string; color: string };
}

const PAGE_SIZE = 20;
const METHODS = Object.entries(METHOD_LABELS);

export default function HistoryPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [creditors, setCreditors] = useState<CreditorWithStats[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);

  const [filterCreditor, setFilterCreditor] = useState("");
  const [filterMethod, setFilterMethod] = useState("");
  const [filterStart, setFilterStart] = useState("");
  const [filterEnd, setFilterEnd] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ limit: String(PAGE_SIZE), page: String(page) });
    if (filterCreditor) params.set("creditorId", filterCreditor);
    if (filterMethod) params.set("method", filterMethod);
    if (filterStart) params.set("startDate", filterStart);
    if (filterEnd) params.set("endDate", filterEnd);

    const [paymentsRes, creditorsRes] = await Promise.all([
      fetch(`/api/house-loan/payments?${params}`),
      fetch("/api/house-loan/creditors"),
    ]);
    const [paymentsData, creditorsData] = await Promise.all([
      paymentsRes.json(),
      creditorsRes.json(),
    ]);
    setPayments(paymentsData.payments ?? []);
    setTotal(paymentsData.total ?? 0);
    setCreditors(creditorsData);
    setLoading(false);
  }, [page, filterCreditor, filterMethod, filterStart, filterEnd]);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  function resetFilters() {
    setFilterCreditor("");
    setFilterMethod("");
    setFilterStart("");
    setFilterEnd("");
    setPage(1);
  }

  const activeFilters = [filterCreditor, filterMethod, filterStart, filterEnd].filter(Boolean).length;
  const filteredTotal = payments.reduce((s, p) => s + p.amount, 0);
  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="p-6 sm:p-10 flex flex-col gap-7">

        {/* Header */}
        <div className="flex items-center justify-between pt-1">
          <div>
            <h1 className="text-2xl font-black text-slate-800">Payment History</h1>
            <p className="text-sm text-slate-400 mt-0.5">
              {total} payment{total !== 1 ? "s" : ""} total
            </p>
          </div>
          <button
            onClick={() => setShowFilters((f) => !f)}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-xl border-2 text-sm font-semibold transition-colors ${
              activeFilters > 0
                ? "border-blue-400 bg-blue-50 text-blue-600"
                : "border-slate-200 text-slate-500 hover:border-slate-300"
            }`}
          >
            <Filter size={14} />
            Filter
            {activeFilters > 0 && (
              <span className="w-4 h-4 rounded-full bg-blue-600 text-white text-[10px] font-bold flex items-center justify-center">
                {activeFilters}
              </span>
            )}
          </button>
        </div>

        {/* Filters panel */}
        {showFilters && (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Creditor</label>
                <select
                  value={filterCreditor}
                  onChange={(e) => { setFilterCreditor(e.target.value); setPage(1); }}
                  className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-sm focus:outline-none focus:border-blue-400 appearance-none"
                >
                  <option value="">All</option>
                  {creditors.map((c) => (
                    <option key={c._id} value={c._id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Method</label>
                <select
                  value={filterMethod}
                  onChange={(e) => { setFilterMethod(e.target.value); setPage(1); }}
                  className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-sm focus:outline-none focus:border-blue-400 appearance-none"
                >
                  <option value="">All</option>
                  {METHODS.map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">From</label>
                <input
                  type="date"
                  value={filterStart}
                  onChange={(e) => { setFilterStart(e.target.value); setPage(1); }}
                  className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-sm focus:outline-none focus:border-blue-400"
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">To</label>
                <input
                  type="date"
                  value={filterEnd}
                  onChange={(e) => { setFilterEnd(e.target.value); setPage(1); }}
                  className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-700 text-sm focus:outline-none focus:border-blue-400"
                />
              </div>
            </div>
            {activeFilters > 0 && (
              <button
                onClick={resetFilters}
                className="mt-3 text-xs font-semibold text-rose-500 hover:text-rose-700"
              >
                Clear filters
              </button>
            )}
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
          </div>
        ) : (
          <>
            <PaymentHistoryTable payments={payments} onRefresh={load} />

            {/* Totals + pagination */}
            {payments.length > 0 && (
              <div className="flex items-center justify-between px-1">
                <span className="text-xs text-slate-400">
                  Showing {payments.length} of {total}
                </span>
                <span className="text-sm font-black text-emerald-600">
                  {formatINR(filteredTotal)}
                </span>
              </div>
            )}

            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-2">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="px-4 py-2 rounded-xl border-2 border-slate-200 text-xs font-semibold text-slate-500 hover:border-slate-300 disabled:opacity-30 transition-colors"
                >
                  Prev
                </button>
                <span className="text-xs font-semibold text-slate-500 px-2">
                  {page} / {totalPages}
                </span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="px-4 py-2 rounded-xl border-2 border-slate-200 text-xs font-semibold text-slate-500 hover:border-slate-300 disabled:opacity-30 transition-colors"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}

        <div className="h-4" />
      </div>
    </div>
  );
}
