"use client";

import { useState } from "react";
import { Pencil, Trash2, X, Check } from "lucide-react";
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

interface PaymentHistoryTableProps {
  payments: Payment[];
  onRefresh: () => void;
}

const METHODS = Object.entries(METHOD_LABELS);

export function PaymentHistoryTable({ payments, onRefresh }: PaymentHistoryTableProps) {
  const [editId, setEditId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editMethod, setEditMethod] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function startEdit(p: Payment) {
    setEditId(p._id);
    setEditAmount(String(p.amount));
    setEditDate(p.date.split("T")[0]);
    setEditMethod(p.method);
    setEditNotes(p.notes ?? "");
  }

  async function saveEdit(id: string) {
    setSaving(true);
    try {
      await fetch(`/api/house-loan/payments/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: parseInt(editAmount.replace(/,/g, ""), 10),
          date: editDate,
          method: editMethod,
          notes: editNotes,
        }),
      });
      setEditId(null);
      onRefresh();
    } finally {
      setSaving(false);
    }
  }

  async function deletePayment(id: string) {
    setSaving(true);
    try {
      await fetch(`/api/house-loan/payments/${id}`, { method: "DELETE" });
      setDeletingId(null);
      onRefresh();
    } finally {
      setSaving(false);
    }
  }

  if (payments.length === 0) {
    return (
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-8 text-center">
        <p className="text-sm text-slate-400">No payments found.</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 bg-slate-50">
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Date</th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Creditor</th>
              <th className="text-right px-5 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">Amount</th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider hidden sm:table-cell">Method</th>
              <th className="text-left px-5 py-3 text-[11px] font-semibold text-slate-500 uppercase tracking-wider hidden md:table-cell">Notes</th>
              <th className="px-5 py-3 w-20" />
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {payments.map((p) => {
              const isEditing = editId === p._id;
              const isDeleting = deletingId === p._id;

              return (
                <tr key={p._id} className="hover:bg-slate-50/50 transition-colors">
                  <td className="px-5 py-3.5">
                    {isEditing ? (
                      <input
                        type="date"
                        value={editDate}
                        onChange={(e) => setEditDate(e.target.value)}
                        className="px-2 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-slate-700 text-xs focus:outline-none w-32"
                      />
                    ) : (
                      <span className="text-xs text-slate-600 font-medium">{formatDate(p.date)}</span>
                    )}
                  </td>

                  <td className="px-5 py-3.5">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-6 h-6 rounded-lg flex items-center justify-center text-white text-[10px] font-bold shrink-0"
                        style={{ backgroundColor: p.creditorId?.color ?? "#94a3b8" }}
                      >
                        {p.creditorId?.name?.[0]?.toUpperCase() ?? "?"}
                      </div>
                      <span className="text-xs font-semibold text-slate-700">{p.creditorId?.name ?? "—"}</span>
                    </div>
                  </td>

                  <td className="px-5 py-3.5 text-right">
                    {isEditing ? (
                      <input
                        type="text"
                        value={editAmount}
                        onChange={(e) => setEditAmount(e.target.value)}
                        className="px-2 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-slate-700 text-xs focus:outline-none w-24 text-right"
                      />
                    ) : (
                      <span className="text-sm font-bold text-emerald-600">{formatINR(p.amount)}</span>
                    )}
                  </td>

                  <td className="px-5 py-3.5 hidden sm:table-cell">
                    {isEditing ? (
                      <select
                        value={editMethod}
                        onChange={(e) => setEditMethod(e.target.value)}
                        className="px-2 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-slate-700 text-xs focus:outline-none appearance-none"
                      >
                        {METHODS.map(([val, label]) => (
                          <option key={val} value={val}>{label}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                        {METHOD_LABELS[p.method] ?? p.method}
                      </span>
                    )}
                  </td>

                  <td className="px-5 py-3.5 hidden md:table-cell">
                    {isEditing ? (
                      <input
                        type="text"
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        className="px-2 py-1.5 rounded-lg border border-blue-200 bg-blue-50 text-slate-700 text-xs focus:outline-none w-full"
                        placeholder="Notes…"
                      />
                    ) : (
                      <span className="text-xs text-slate-400">{p.notes || "—"}</span>
                    )}
                  </td>

                  <td className="px-5 py-3.5">
                    {isDeleting ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => deletePayment(p._id)}
                          disabled={saving}
                          className="w-6 h-6 flex items-center justify-center rounded-md bg-rose-50 text-rose-500 hover:bg-rose-100"
                          title="Confirm delete"
                        >
                          <Check size={12} />
                        </button>
                        <button
                          onClick={() => setDeletingId(null)}
                          className="w-6 h-6 flex items-center justify-center rounded-md bg-slate-50 text-slate-400 hover:bg-slate-100"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ) : isEditing ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => saveEdit(p._id)}
                          disabled={saving}
                          className="w-6 h-6 flex items-center justify-center rounded-md bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                        >
                          <Check size={12} />
                        </button>
                        <button
                          onClick={() => setEditId(null)}
                          className="w-6 h-6 flex items-center justify-center rounded-md bg-slate-50 text-slate-400 hover:bg-slate-100"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => startEdit(p)}
                          className="w-6 h-6 flex items-center justify-center rounded-md text-slate-300 hover:text-slate-600 hover:bg-slate-100 transition-colors"
                        >
                          <Pencil size={11} />
                        </button>
                        <button
                          onClick={() => setDeletingId(p._id)}
                          className="w-6 h-6 flex items-center justify-center rounded-md text-slate-300 hover:text-rose-500 hover:bg-rose-50 transition-colors"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
