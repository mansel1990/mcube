"use client";

import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from "recharts";
import { formatINRCompact, formatMonthYear } from "./format";

interface CreditorSummary {
  _id: string;
  name: string;
  originalAmount: number;
  totalPaid: number;
  remaining: number;
  color: string;
}

interface MonthlyBreakdown {
  month: string;
  total: number;
  byCreditor: Record<string, number>;
}

interface ProgressChartsProps {
  creditorSummary: CreditorSummary[];
  monthlyBreakdown: MonthlyBreakdown[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white rounded-xl shadow-lg border border-slate-100 px-3 py-2 text-xs">
      {label && <p className="text-slate-500 mb-1 font-medium">{label}</p>}
      {payload.map((p: { name: string; value: number; color: string }) => (
        <p key={p.name} style={{ color: p.color }} className="font-semibold">
          {p.name}: {formatINRCompact(p.value)}
        </p>
      ))}
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PieTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div className="bg-white rounded-xl shadow-lg border border-slate-100 px-3 py-2 text-xs">
      <p className="font-semibold" style={{ color: p.payload.fill }}>{p.name}</p>
      <p className="text-slate-600">{formatINRCompact(p.value)}</p>
    </div>
  );
}

export function ProgressCharts({ creditorSummary, monthlyBreakdown }: ProgressChartsProps) {
  // Donut: paid (solid) + remaining (faded) per creditor
  const donutData = creditorSummary.flatMap((c) => [
    ...(c.totalPaid > 0 ? [{ name: `${c.name} paid`, value: c.totalPaid, fill: c.color }] : []),
    ...(c.remaining > 0 ? [{ name: `${c.name} left`, value: c.remaining, fill: `${c.color}33` }] : []),
  ]);

  const last12 = monthlyBreakdown.slice(-12);
  const barData = last12.map((m) => ({
    month: formatMonthYear(m.month),
    total: m.total,
    ...creditorSummary.reduce((acc, c) => {
      acc[c.name] = m.byCreditor[c._id] ?? 0;
      return acc;
    }, {} as Record<string, number>),
  }));

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Donut */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
          Repayment Breakdown
        </p>
        <div className="flex items-center gap-4">
          <ResponsiveContainer width="60%" height={180}>
            <PieChart>
              <Pie
                data={donutData}
                cx="50%"
                cy="50%"
                innerRadius={52}
                outerRadius={78}
                paddingAngle={2}
                dataKey="value"
              >
                {donutData.map((entry, i) => (
                  <Cell key={i} fill={entry.fill} strokeWidth={0} />
                ))}
              </Pie>
              <Tooltip content={<PieTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex flex-col gap-2.5 flex-1">
            {creditorSummary.map((c) => {
              const pct = c.originalAmount > 0
                ? Math.round((c.totalPaid / c.originalAmount) * 100)
                : 0;
              return (
                <div key={c._id} className="flex flex-col gap-1">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: c.color }} />
                      <span className="text-[11px] text-slate-600 font-medium">{c.name}</span>
                    </div>
                    <span className="text-[10px] text-slate-400">{pct}%</span>
                  </div>
                  <div className="h-1 rounded-full bg-slate-100 overflow-hidden">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: c.color }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Monthly bar chart */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-5">
        <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4">
          Monthly Payments
        </p>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={barData} margin={{ top: 0, right: 0, left: -22, bottom: 0 }}>
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
            <Tooltip content={<CustomTooltip />} />
            {creditorSummary.map((c) => (
              <Bar key={c._id} dataKey={c.name} stackId="a" fill={c.color} radius={[0, 0, 0, 0]} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
