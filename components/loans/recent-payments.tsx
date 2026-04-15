"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { formatINR, formatDate, METHOD_LABELS } from "./format";

interface Payment {
  _id: string;
  amount: number;
  date: string;
  method: string;
  notes?: string;
  creditorId: {
    _id: string;
    name: string;
    color: string;
  };
}

interface RecentPaymentsProps {
  payments: Payment[];
}

export function RecentPayments({ payments }: RecentPaymentsProps) {
  if (payments.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center">
        <p className="text-sm text-slate-400">No payments logged yet.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-5 py-4 border-b border-slate-50 flex items-center justify-between">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
          Recent Activity
        </p>
        <Link
          href="/house-loan/history"
          className="flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
        >
          View all <ArrowRight size={12} />
        </Link>
      </div>

      <div className="divide-y divide-slate-50">
        {payments.map((p) => (
          <div key={p._id} className="px-5 py-3.5 flex items-center gap-3 hover:bg-slate-50/50 transition-colors">
            {/* Color dot */}
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-[10px] font-bold shrink-0"
              style={{ backgroundColor: p.creditorId?.color ?? "#94a3b8" }}
            >
              {p.creditorId?.name?.[0]?.toUpperCase() ?? "?"}
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-700 truncate">
                {p.creditorId?.name ?? "—"}
              </p>
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500">
                  {METHOD_LABELS[p.method] ?? p.method}
                </span>
                {p.notes && (
                  <span className="text-[11px] text-slate-400 truncate">{p.notes}</span>
                )}
              </div>
            </div>

            <div className="text-right shrink-0">
              <p className="text-sm font-bold text-emerald-600">{formatINR(p.amount)}</p>
              <p className="text-[10px] text-slate-400">{formatDate(p.date)}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
