"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, ToggleLeft, ToggleRight } from "lucide-react";
import { CreditorForm } from "@/components/loans/creditor-form";
import { CreditorWithStats } from "@/components/loans/creditor-card";
import { formatINRCompact, TYPE_LABELS } from "@/components/loans/format";

export default function CreditorsPage() {
  const [creditors, setCreditors] = useState<CreditorWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [editCreditor, setEditCreditor] = useState<CreditorWithStats | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [deleteError, setDeleteError] = useState<Record<string, string>>({});
  const [working, setWorking] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/house-loan/creditors");
    setCreditors(await res.json());
    setLoading(false);
  }, []);

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);

  async function toggleActive(c: CreditorWithStats) {
    setWorking(c._id);
    await fetch(`/api/house-loan/creditors/${c._id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ isActive: !c.isActive }),
    });
    setWorking(null);
    load();
  }

  async function deleteCreditor(c: CreditorWithStats) {
    setWorking(c._id);
    const res = await fetch(`/api/house-loan/creditors/${c._id}`, { method: "DELETE" });
    if (!res.ok) {
      const data = await res.json();
      setDeleteError((prev) => ({ ...prev, [c._id]: data.error }));
    } else {
      load();
    }
    setConfirmDelete(null);
    setWorking(null);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="w-8 h-8 border-2 border-blue-200 border-t-blue-600 rounded-full animate-spin" />
      </div>
    );
  }

  const active = creditors.filter((c) => c.isActive);
  const inactive = creditors.filter((c) => !c.isActive);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="p-6 sm:p-10 flex flex-col gap-7">

        {/* Header */}
        <div className="flex items-center justify-between pt-1">
          <div>
            <h1 className="text-2xl font-black text-slate-800">Creditors</h1>
            <p className="text-sm text-slate-400 mt-0.5">
              {creditors.length} creditor{creditors.length !== 1 ? "s" : ""}
            </p>
          </div>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus size={15} />
            Add
          </button>
        </div>

        {creditors.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-10 text-center">
            <p className="text-slate-400 text-sm">No creditors yet. Add your first one.</p>
          </div>
        ) : (
          <>
            {[
              { label: "Active", list: active },
              { label: "Inactive", list: inactive },
            ].map(({ label, list }) =>
              list.length === 0 ? null : (
                <div key={label}>
                  {inactive.length > 0 && (
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">{label}</p>
                  )}
                  <div className="flex flex-col gap-3">
                    {list.map((c) => {
                      const pct = c.originalAmount > 0
                        ? Math.min(100, Math.round((c.totalPaid / c.originalAmount) * 100))
                        : 0;

                      return (
                        <div
                          key={c._id}
                          className={`bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden transition-opacity ${
                            !c.isActive ? "opacity-60" : ""
                          }`}
                        >
                          <div className="h-1" style={{ backgroundColor: c.color }} />
                          <div className="p-5">
                            <div className="flex items-start justify-between gap-3 mb-4">
                              <div className="flex items-center gap-3">
                                <div
                                  className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-base shrink-0"
                                  style={{ backgroundColor: c.color }}
                                >
                                  {c.name[0].toUpperCase()}
                                </div>
                                <div>
                                  <p className="font-bold text-slate-800">{c.name}</p>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <span className="text-[11px] text-slate-400">
                                      {TYPE_LABELS[c.type] ?? c.type}
                                    </span>
                                    {c.interestRate > 0 && (
                                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-600">
                                        {c.interestRate}% p.a.
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  onClick={() => toggleActive(c)}
                                  disabled={working === c._id}
                                  className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 transition-colors"
                                  title={c.isActive ? "Mark inactive" : "Reactivate"}
                                >
                                  {c.isActive
                                    ? <ToggleRight size={18} className="text-emerald-500" />
                                    : <ToggleLeft size={18} />
                                  }
                                </button>
                                <button
                                  onClick={() => setEditCreditor(c)}
                                  className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors"
                                >
                                  <Pencil size={14} />
                                </button>
                                {confirmDelete === c._id ? (
                                  <div className="flex items-center gap-1 bg-rose-50 rounded-xl px-2 py-1">
                                    <span className="text-[11px] text-rose-500 font-medium">Sure?</span>
                                    <button
                                      onClick={() => deleteCreditor(c)}
                                      disabled={working === c._id}
                                      className="text-rose-500 hover:text-rose-700 font-bold text-xs"
                                    >
                                      Yes
                                    </button>
                                    <button
                                      onClick={() => setConfirmDelete(null)}
                                      className="text-slate-400 text-xs"
                                    >
                                      No
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => setConfirmDelete(c._id)}
                                    className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:bg-rose-50 hover:text-rose-500 transition-colors"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                )}
                              </div>
                            </div>

                            <div className="grid grid-cols-3 gap-4 mb-4">
                              <div>
                                <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Borrowed</p>
                                <p className="text-lg font-black text-slate-700 mt-0.5">
                                  {formatINRCompact(c.originalAmount)}
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Paid</p>
                                <p className="text-lg font-black text-emerald-600 mt-0.5">
                                  {formatINRCompact(c.totalPaid)}
                                </p>
                              </div>
                              <div>
                                <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider">Remaining</p>
                                <p className="text-lg font-black mt-0.5" style={{ color: c.color }}>
                                  {formatINRCompact(c.remaining)}
                                </p>
                              </div>
                            </div>

                            <div className="flex items-center gap-3">
                              <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all duration-700"
                                  style={{ width: `${pct}%`, backgroundColor: c.color }}
                                />
                              </div>
                              <span className="text-xs font-bold text-slate-500 shrink-0">{pct}%</span>
                            </div>

                            {c.notes && (
                              <p className="text-[11px] text-slate-400 mt-3 border-t border-slate-50 pt-3">{c.notes}</p>
                            )}

                            {deleteError[c._id] && (
                              <p className="text-xs font-medium text-rose-500 bg-rose-50 px-3 py-2 rounded-lg mt-3">
                                {deleteError[c._id]}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )
            )}
          </>
        )}

        <div className="h-4" />
      </div>

      {showAdd && (
        <CreditorForm onClose={() => setShowAdd(false)} onSaved={() => { setShowAdd(false); load(); }} />
      )}
      {editCreditor && (
        <CreditorForm
          creditor={editCreditor}
          onClose={() => setEditCreditor(null)}
          onSaved={() => { setEditCreditor(null); load(); }}
        />
      )}
    </div>
  );
}
