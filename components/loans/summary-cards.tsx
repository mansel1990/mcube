"use client";

import { formatINR, formatINRCompact } from "./format";

interface SummaryCardsProps {
  totalBorrowed: number;
  totalPaid: number;
  totalRemaining: number;
  progressPercent: number;
}

function Card({
  label,
  value,
  sub,
  accent,
  textColor,
  bgColor,
}: {
  label: string;
  value: string;
  sub?: string;
  accent: string;
  textColor: string;
  bgColor: string;
}) {
  return (
    <div className={`rounded-2xl p-5 flex flex-col gap-2 ${bgColor} border border-slate-100`}>
      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{label}</span>
      <span className={`text-3xl font-black leading-none tracking-tight ${textColor}`}>{value}</span>
      {sub && (
        <span className="text-xs text-slate-400 font-medium">{sub}</span>
      )}
      <div className={`h-0.5 w-8 rounded-full ${accent} mt-1`} />
    </div>
  );
}

export function SummaryCards({
  totalBorrowed,
  totalPaid,
  totalRemaining,
  progressPercent,
}: SummaryCardsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Card
        label="Total Borrowed"
        value={formatINRCompact(totalBorrowed)}
        sub={formatINR(totalBorrowed)}
        accent="bg-blue-500"
        textColor="text-slate-800"
        bgColor="bg-white"
      />
      <Card
        label="Repaid"
        value={formatINRCompact(totalPaid)}
        sub={formatINR(totalPaid)}
        accent="bg-emerald-500"
        textColor="text-emerald-600"
        bgColor="bg-emerald-50"
      />
      <Card
        label="Remaining"
        value={formatINRCompact(totalRemaining)}
        sub={formatINR(totalRemaining)}
        accent="bg-rose-500"
        textColor="text-rose-600"
        bgColor="bg-rose-50"
      />
      <div className="rounded-2xl p-5 flex flex-col gap-2 bg-blue-600 border border-blue-500">
        <span className="text-xs font-semibold text-blue-200 uppercase tracking-wider">Progress</span>
        <span className="text-3xl font-black leading-none tracking-tight text-white">
          {progressPercent}%
        </span>
        <div className="h-2 w-full rounded-full bg-blue-500/50 overflow-hidden mt-1">
          <div
            className="h-full rounded-full bg-white transition-all duration-700"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
        <span className="text-xs text-blue-200">{100 - progressPercent}% left to go</span>
      </div>
    </div>
  );
}
