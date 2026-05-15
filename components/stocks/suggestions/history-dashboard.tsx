"use client";

import { useMemo } from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Cell,
} from "recharts";
import { StockSuggestion } from "./suggestion-card";

const SIM_CAPITAL = 10_000;

function computeTrade(s: StockSuggestion) {
  const pct = s.pnl_pct ? parseFloat(s.pnl_pct) : 0; // e.g. 15 = 15%
  const pnlRupees = SIM_CAPITAL * (pct / 100);
  return { pct, pnlRupees };
}

function fmtRupee(n: number) {
  const abs = Math.abs(n);
  const sign = n < 0 ? "-" : n > 0 ? "+" : "";
  return sign + "₹" + abs.toLocaleString("en-IN", { maximumFractionDigits: 0 });
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ payload: { name: string; value: number; pct: number } }>;
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;
  const isPositive = d.value >= 0;
  return (
    <div className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs shadow-lg">
      <p className="font-semibold text-slate-900 mb-1">{d.name}</p>
      <p className={isPositive ? "text-emerald-600" : "text-red-600"}>
        {fmtRupee(d.value)}
      </p>
      <p className="text-slate-400">
        {d.pct >= 0 ? "+" : ""}
        {d.pct.toFixed(2)}%
      </p>
    </div>
  );
}

interface Props {
  closed: StockSuggestion[];
}

export function HistoryDashboard({ closed }: Props) {
  const stats = useMemo(() => {
    if (closed.length === 0) return null;
    const trades = closed.map((s) => ({ ...s, ...computeTrade(s) }));
    const wins = trades.filter((t) => t.pct >= 0);
    const totalInvested = SIM_CAPITAL * trades.length;
    const totalReturn = trades.reduce((sum, t) => sum + t.pnlRupees, 0);
    const winRate = (wins.length / trades.length) * 100;
    const avgHoldDays =
      trades.reduce((sum, t) => sum + (t.hold_days ?? 0), 0) / trades.length;
    const best = trades.reduce((a, b) => (b.pct > a.pct ? b : a), trades[0]);
    const worst = trades.reduce((a, b) => (b.pct < a.pct ? b : a), trades[0]);
    const maxHoldDays = Math.max(...trades.map((t) => t.hold_days ?? 0));
    const chartData = trades.map((t) => ({
      name: t.ticker,
      value: t.pnlRupees,
      pct: t.pct,
    }));
    return {
      trades,
      totalInvested,
      totalReturn,
      winRate,
      avgHoldDays,
      best,
      worst,
      maxHoldDays,
      chartData,
    };
  }, [closed]);

  if (!stats) {
    return (
      <div className="mt-8 text-center text-sm text-slate-400">
        No closed trades yet.
      </div>
    );
  }

  const returnPositive = stats.totalReturn >= 0;

  return (
    <div className="flex flex-col gap-4 pt-2">
      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Total Invested */}
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">
            Total Invested
          </p>
          <p className="text-lg font-bold text-slate-900">
            ₹{stats.totalInvested.toLocaleString("en-IN")}
          </p>
          <p className="text-[10px] text-slate-400 mt-1">
            {stats.trades.length} trade{stats.trades.length !== 1 ? "s" : ""} × ₹10k
          </p>
        </div>

        {/* Net Return */}
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">
            Net Return
          </p>
          <p
            className={`text-lg font-bold ${
              returnPositive ? "text-emerald-600" : "text-red-600"
            }`}
          >
            {fmtRupee(stats.totalReturn)}
          </p>
          <p className="text-[10px] text-slate-400 mt-1">
            Best: {stats.best.ticker} · Worst: {stats.worst.ticker}
          </p>
        </div>

        {/* Win Rate */}
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">
            Win Rate
          </p>
          <p
            className={`text-lg font-bold ${
              stats.winRate >= 50 ? "text-emerald-600" : "text-red-600"
            }`}
          >
            {stats.winRate.toFixed(1)}%
          </p>
          <p className="text-[10px] text-slate-400 mt-1">
            {stats.trades.filter((t) => t.pct >= 0).length}W /{" "}
            {stats.trades.filter((t) => t.pct < 0).length}L
          </p>
        </div>

        {/* Avg Hold */}
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">
            Avg Hold
          </p>
          <p className="text-lg font-bold text-slate-900">
            {stats.avgHoldDays.toFixed(1)}d
          </p>
          <p className="text-[10px] text-slate-400 mt-1">
            Max: {stats.maxHoldDays}d
          </p>
        </div>
      </div>

      {/* Bar chart */}
      <div className="bg-white border border-slate-200 rounded-xl p-4">
        <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-3">
          P&amp;L per Trade (₹10k simulated)
        </p>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart
            data={stats.chartData}
            margin={{ top: 4, right: 8, bottom: 4, left: 0 }}
          >
            <XAxis
              dataKey="name"
              tick={{ fill: "#94a3b8", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              width={42}
              tickFormatter={(v) =>
                v === 0 ? "₹0" : `₹${(v / 1000).toFixed(0)}k`
              }
              tick={{ fill: "#94a3b8", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(0,0,0,0.04)" }} />
            <Bar dataKey="value" radius={[3, 3, 0, 0]}>
              {stats.chartData.map((entry, i) => (
                <Cell
                  key={i}
                  fill={entry.value >= 0 ? "#10b981" : "#f87171"}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Trade table */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <p className="text-[10px] text-slate-400 uppercase tracking-wide px-4 pt-4 pb-2">
          Trade History
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-slate-100 text-slate-400">
                <th className="text-left px-4 py-2 font-medium">Ticker</th>
                <th className="text-left px-4 py-2 font-medium">Signal Date</th>
                <th className="text-left px-4 py-2 font-medium">Hold</th>
                <th className="text-right px-4 py-2 font-medium">P&amp;L %</th>
                <th className="text-right px-4 py-2 font-medium">₹ P&amp;L</th>
              </tr>
            </thead>
            <tbody>
              {stats.trades.map((t) => {
                const isPos = t.pct >= 0;
                return (
                  <tr
                    key={t.id}
                    className="border-b border-slate-100 last:border-0 hover:bg-slate-50 transition-colors"
                  >
                    <td className="px-4 py-2.5 font-semibold text-slate-900">
                      {t.ticker}
                    </td>
                    <td className="px-4 py-2.5 text-slate-400">
                      {fmtDate(t.signal_date)}
                    </td>
                    <td className="px-4 py-2.5 text-slate-500">
                      <div className="flex items-center gap-1.5">
                        <span>{t.hold_days ?? 0}d</span>
                        <div className="h-1 rounded-full bg-slate-100 w-10 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-primary/40"
                            style={{
                              width: `${
                                stats.maxHoldDays > 0
                                  ? Math.min(
                                      100,
                                      ((t.hold_days ?? 0) / stats.maxHoldDays) * 100
                                    )
                                  : 0
                              }%`,
                            }}
                          />
                        </div>
                      </div>
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right font-medium ${
                        isPos ? "text-emerald-600" : "text-red-600"
                      }`}
                    >
                      {isPos ? "+" : ""}
                      {t.pct.toFixed(2)}%
                    </td>
                    <td
                      className={`px-4 py-2.5 text-right font-medium ${
                        isPos ? "text-emerald-600" : "text-red-600"
                      }`}
                    >
                      {fmtRupee(t.pnlRupees)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
