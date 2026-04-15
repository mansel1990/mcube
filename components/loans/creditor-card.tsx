"use client";

import { formatINR, formatINRCompact, TYPE_LABELS } from "./format";

export interface CreditorWithStats {
  _id: string;
  name: string;
  type: string;
  originalAmount: number;
  interestRate: number;
  notes?: string;
  color: string;
  isActive: boolean;
  totalPaid: number;
  remaining: number;
}

interface CreditorCardProps {
  creditor: CreditorWithStats;
  onQuickPay: (creditor: CreditorWithStats) => void;
}

function hexToRgb(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `${r}, ${g}, ${b}`;
}

export function CreditorCard({ creditor, onQuickPay }: CreditorCardProps) {
  const pct =
    creditor.originalAmount > 0
      ? Math.min(100, Math.round((creditor.totalPaid / creditor.originalAmount) * 100))
      : 0;

  const isFullyPaid = creditor.remaining <= 0;
  const rgb = hexToRgb(creditor.color);

  return (
    <div
      className={`bg-white rounded-2xl border border-slate-100 overflow-hidden shadow-sm transition-opacity ${
        !creditor.isActive || isFullyPaid ? "opacity-60" : ""
      }`}
    >
      {/* Colored top strip */}
      <div className="h-1.5 w-full" style={{ backgroundColor: creditor.color }} />

      <div className="p-5 flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center text-white text-xs font-bold shrink-0"
              style={{ backgroundColor: creditor.color }}
            >
              {creditor.name[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="font-bold text-slate-800 text-sm truncate">{creditor.name}</p>
              <p className="text-[11px] text-slate-400">{TYPE_LABELS[creditor.type] ?? creditor.type}</p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            {creditor.interestRate > 0 && (
              <span
                className="text-[10px] font-semibold px-2 py-0.5 rounded-full"
                style={{
                  backgroundColor: `rgba(${rgb}, 0.1)`,
                  color: creditor.color,
                }}
              >
                {creditor.interestRate}% p.a.
              </span>
            )}
            {isFullyPaid && (
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-600">
                Paid off
              </span>
            )}
          </div>
        </div>

        {/* Big remaining amount */}
        <div>
          <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-0.5">Remaining</p>
          <p className="text-2xl font-black text-slate-800 leading-none" style={{ color: creditor.color }}>
            {formatINRCompact(creditor.remaining)}
          </p>
          <p className="text-[11px] text-slate-400 mt-0.5">of {formatINRCompact(creditor.originalAmount)}</p>
        </div>

        {/* Progress bar */}
        <div className="flex flex-col gap-1.5">
          <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${pct}%`, backgroundColor: creditor.color }}
            />
          </div>
          <div className="flex justify-between text-[11px]">
            <span className="text-slate-400">{pct}% repaid</span>
            <span className="font-medium text-slate-600">{formatINR(creditor.totalPaid)} paid</span>
          </div>
        </div>

        {/* Notes */}
        {creditor.notes && (
          <p className="text-[11px] text-slate-400 leading-relaxed border-t border-slate-50 pt-3">{creditor.notes}</p>
        )}

        {/* Quick Pay */}
        {creditor.isActive && !isFullyPaid && (
          <button
            onClick={() => onQuickPay(creditor)}
            className="w-full py-2.5 rounded-xl text-xs font-bold border-2 transition-all hover:text-white"
            style={{
              borderColor: creditor.color,
              color: creditor.color,
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = creditor.color;
              (e.currentTarget as HTMLButtonElement).style.color = "white";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.backgroundColor = "transparent";
              (e.currentTarget as HTMLButtonElement).style.color = creditor.color;
            }}
          >
            + Log Payment
          </button>
        )}
      </div>
    </div>
  );
}
