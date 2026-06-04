"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import {
  TrendingUp,
  TrendingDown,
  BarChart3,
  ChevronDown,
} from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";
import {
  PORTFOLIO_TRACKING_START,
  buildCumulativePnlSeries,
  computePortfolioSummary,
  filterTradesForTracking,
  fmtInr,
  formatMonthKey,
  getRealizedStatsForMonth,
  getRealizedStatsForYear,
  groupRealizedPnlByMonth,
  groupRealizedPnlByYear,
  listAvailableMonthKeys,
  listAvailableYears,
  listRecentClosedTrades,
  todayIST,
  type PnlViewMode,
  type TradeForAnalytics,
} from "@/lib/stocks/portfolio-analytics";

interface KiteHoldingLike {
  quantity: number;
  average_price: number;
  pnl: number;
}

function fmt(n: number, decimals = 0) {
  return fmtInr(n, decimals);
}

function signedInr(n: number, decimals = 0) {
  const prefix = n >= 0 ? "+" : "−";
  return `${prefix}₹${fmt(Math.abs(n), decimals)}`;
}

function pnlTone(n: number) {
  return n >= 0 ? "text-emerald-600" : "text-red-600";
}

function pnlBg(n: number) {
  return n >= 0 ? "bg-emerald-50 border-emerald-100" : "bg-red-50 border-red-100";
}

function useIsClient() {
  return useSyncExternalStore(
    () => () => {},
    () => true,
    () => false
  );
}

interface PortfolioOverviewProps {
  trades: TradeForAnalytics[];
  kiteClosedTrades?: TradeForAnalytics[];
  holdings: KiteHoldingLike[];
  kiteConnected: boolean;
}

export function PortfolioOverview({
  trades,
  kiteClosedTrades = [],
  holdings,
  kiteConnected,
}: PortfolioOverviewProps) {
  const isClient = useIsClient();
  const [viewMode, setViewMode] = useState<PnlViewMode>("all");
  const [selectedMonth, setSelectedMonth] = useState(PORTFOLIO_TRACKING_START.slice(0, 7));
  const [selectedYear, setSelectedYear] = useState(PORTFOLIO_TRACKING_START.slice(0, 4));

  function setViewModeWithDefaults(mode: PnlViewMode) {
    setViewMode(mode);
    if (!isClient) return;
    const today = todayIST();
    if (mode === "month") setSelectedMonth(today.slice(0, 7));
    if (mode === "year") setSelectedYear(today.slice(0, 4));
  }

  const tracked = useMemo(() => filterTradesForTracking(trades), [trades]);
  const trackedKite = useMemo(
    () => (kiteConnected ? filterTradesForTracking(kiteClosedTrades) : []),
    [kiteConnected, kiteClosedTrades]
  );
  const realizedTrades = kiteConnected ? trackedKite : tracked;
  const logSummary = useMemo(() => computePortfolioSummary(tracked), [tracked]);
  const kiteSummary = useMemo(
    () => (kiteConnected ? computePortfolioSummary(trackedKite) : null),
    [kiteConnected, trackedKite]
  );

  const holdingsUnrealized = useMemo(() => holdings.reduce((s, h) => s + (h.pnl ?? 0), 0), [holdings]);
  const holdingsInvested = useMemo(
    () => holdings.reduce((s, h) => s + h.quantity * h.average_price, 0),
    [holdings]
  );

  const unrealizedPnl = kiteConnected ? holdingsUnrealized : logSummary.unrealizedPnl;
  const openCount = kiteConnected ? holdings.length : logSummary.openCount;
  const investedOpen = kiteConnected ? holdingsInvested : logSummary.totalInvestedOpen;

  const monthOptions = useMemo(
    () => listAvailableMonthKeys(realizedTrades, isClient),
    [realizedTrades, isClient]
  );
  const yearOptions = useMemo(
    () => listAvailableYears(realizedTrades, isClient),
    [realizedTrades, isClient]
  );

  const realizedStats = useMemo(() => {
    if (viewMode === "month") return getRealizedStatsForMonth(realizedTrades, selectedMonth);
    if (viewMode === "year") return getRealizedStatsForYear(realizedTrades, selectedYear);
    const base = kiteConnected && kiteSummary ? kiteSummary : logSummary;
    return {
      realizedPnl: base.realizedPnl,
      closedCount: base.closedCount,
      wins: base.wins,
      losses: base.losses,
    };
  }, [viewMode, selectedMonth, selectedYear, realizedTrades, logSummary, kiteSummary, kiteConnected]);

  const netPnl = unrealizedPnl + realizedStats.realizedPnl;

  const monthlyRows = useMemo(() => groupRealizedPnlByMonth(realizedTrades), [realizedTrades]);
  const yearlyRows = useMemo(() => groupRealizedPnlByYear(realizedTrades), [realizedTrades]);
  const cumulativeSeries = useMemo(() => buildCumulativePnlSeries(realizedTrades), [realizedTrades]);

  const periodLabel =
    viewMode === "month"
      ? formatMonthKey(selectedMonth)
      : viewMode === "year"
        ? selectedYear
        : "All time";

  const chartRows = viewMode === "year" ? yearlyRows : monthlyRows;
  const hasAnyData = holdings.length > 0 || tracked.length > 0 || trackedKite.length > 0;

  const recentClosed = useMemo(() => {
    const periodKey =
      viewMode === "month" ? selectedMonth : viewMode === "year" ? selectedYear : undefined;
    return listRecentClosedTrades(realizedTrades, 8, viewMode, periodKey);
  }, [realizedTrades, viewMode, selectedMonth, selectedYear]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <PnlPanel
          title="Unrealized P&L"
          subtitle={
            kiteConnected
              ? `${openCount} Kite holding${openCount !== 1 ? "s" : ""} · live`
              : `${openCount} open logged trade${openCount !== 1 ? "s" : ""}`
          }
          value={unrealizedPnl}
          invested={investedOpen > 0 ? `Invested ₹${fmt(investedOpen)}` : undefined}
        />
        <PnlPanel
          title="Realized P&L"
          subtitle={`${periodLabel} · ${realizedStats.closedCount} closed`}
          value={realizedStats.realizedPnl}
          extra={`${realizedStats.wins}W · ${realizedStats.losses}L`}
        />
      </div>

      <div className={`flex items-center justify-between gap-4 px-4 py-3 rounded-xl border ${pnlBg(netPnl)}`}>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Net P&L · {periodLabel}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            Unrealized (current) + realized ({periodLabel.toLowerCase()})
          </p>
        </div>
        <p className={`text-xl font-bold tabular-nums ${pnlTone(netPnl)}`}>{signedInr(netPnl)}</p>
      </div>

      {recentClosed.length > 0 && (
        <RecentExitsStrip items={recentClosed} periodLabel={periodLabel} />
      )}

      <div className="bg-white rounded-2xl border border-slate-200 p-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
            <BarChart3 size={16} className="text-emerald-600" />
            P&L breakdown
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
              {(
                [
                  ["all", "All time"],
                  ["month", "Month"],
                  ["year", "Year"],
                ] as const
              ).map(([mode, label]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setViewModeWithDefaults(mode)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                    viewMode === mode ? "bg-white text-emerald-700 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {viewMode === "month" && (
              <label className="relative inline-flex items-center">
                <select
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(e.target.value)}
                  className="appearance-none pl-3 pr-8 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                >
                  {monthOptions.map((key) => (
                    <option key={key} value={key}>
                      {formatMonthKey(key)}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-2 pointer-events-none text-slate-400" />
              </label>
            )}

            {viewMode === "year" && (
              <label className="relative inline-flex items-center">
                <select
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(e.target.value)}
                  className="appearance-none pl-3 pr-8 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                >
                  {yearOptions.map((year) => (
                    <option key={year} value={year}>
                      {year}
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-2 pointer-events-none text-slate-400" />
              </label>
            )}
          </div>
        </div>

        {!hasAnyData ? (
          <p className="text-sm text-slate-500 py-6 text-center">
            Buy from signals via Kite to see holdings P&L here. Realized history appears when a Kite position is sold (target, stop loss, or manual exit).
          </p>
        ) : chartRows.length === 0 && viewMode !== "all" ? (
          <p className="text-sm text-slate-500 py-6 text-center">
            No closed trades in {periodLabel}. Realized P&L updates when a Kite position is sold.
          </p>
        ) : (
          <>
            {chartRows.length > 0 && isClient && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
                <div>
                  <h3 className="text-[10px] font-semibold text-slate-500 mb-2 uppercase tracking-wide">
                    {viewMode === "year" ? "Yearly" : "Monthly"} realized
                  </h3>
                  <ResponsiveContainer width="100%" height={180}>
                    <BarChart data={chartRows} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94A3B8" }} />
                      <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} tickFormatter={(v) => `₹${v}`} />
                      <ReferenceLine y={0} stroke="#CBD5E1" />
                      <Tooltip
                        formatter={(v: number | undefined) => [signedInr(v ?? 0), "Realized"]}
                        contentStyle={{
                          background: "#fff",
                          border: "1px solid #E2E8F0",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                      />
                      <Bar dataKey="realized" radius={[6, 6, 0, 0]}>
                        {chartRows.map((row) => (
                          <Cell key={row.key} fill={row.realized >= 0 ? "#10B981" : "#EF4444"} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {cumulativeSeries.length > 1 && viewMode === "all" && (
                  <div>
                    <h3 className="text-[10px] font-semibold text-slate-500 mb-2 uppercase tracking-wide">
                      Cumulative realized
                    </h3>
                    <ResponsiveContainer width="100%" height={180}>
                      <LineChart data={cumulativeSeries} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#94A3B8" }} />
                        <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} tickFormatter={(v) => `₹${v}`} />
                        <Tooltip
                          formatter={(v: number | undefined) => [signedInr(v ?? 0), "Cumulative"]}
                          contentStyle={{
                            background: "#fff",
                            border: "1px solid #E2E8F0",
                            borderRadius: 8,
                            fontSize: 12,
                          }}
                        />
                        <ReferenceLine y={0} stroke="#CBD5E1" />
                        <Line
                          type="monotone"
                          dataKey="cumulative"
                          stroke="#059669"
                          strokeWidth={2}
                          dot={{ r: 3, fill: "#059669" }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {monthlyRows.length > 0 && viewMode !== "year" && (
                <BreakdownTable
                  title="By month"
                  rows={monthlyRows.map((r) => ({
                    key: r.key,
                    label: r.label,
                    trades: r.trades,
                    wins: r.wins,
                    losses: r.losses,
                    realized: r.realized,
                  }))}
                  highlightKey={viewMode === "month" ? selectedMonth : undefined}
                  onSelect={(key) => {
                    setViewMode("month");
                    setSelectedMonth(key);
                  }}
                />
              )}
              {yearlyRows.length > 0 && viewMode !== "month" && (
                <BreakdownTable
                  title="By year"
                  rows={yearlyRows.map((r) => ({
                    key: r.key,
                    label: r.label,
                    trades: r.trades,
                    wins: r.wins,
                    losses: r.losses,
                    realized: r.realized,
                  }))}
                  highlightKey={viewMode === "year" ? selectedYear : undefined}
                  onSelect={(key) => {
                    setViewMode("year");
                    setSelectedYear(key);
                  }}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function RecentExitsStrip({
  items,
  periodLabel,
}: {
  items: { ticker: string; pnl: number; exitDate: string }[];
  periodLabel: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500 mb-2">
        Recent exits · {periodLabel}
      </p>
      <div className="flex flex-wrap gap-1.5">
        {items.map((r) => {
          const win = r.pnl >= 0;
          return (
            <span
              key={`${r.ticker}-${r.exitDate}`}
              className={`inline-flex items-center gap-1.5 pl-2 pr-2.5 py-1 rounded-lg text-[11px] font-semibold border ${
                win
                  ? "bg-emerald-50 border-emerald-100 text-emerald-800"
                  : "bg-red-50 border-red-100 text-red-800"
              }`}
            >
              <span
                className={`w-4 h-4 rounded flex items-center justify-center text-[9px] font-bold ${
                  win ? "bg-emerald-200/80 text-emerald-900" : "bg-red-200/80 text-red-900"
                }`}
              >
                {win ? "W" : "L"}
              </span>
              <span>{r.ticker}</span>
              <span className="tabular-nums opacity-90">{signedInr(r.pnl)}</span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

function PnlPanel({
  title,
  subtitle,
  value,
  invested,
  extra,
}: {
  title: string;
  subtitle: string;
  value: number;
  invested?: string;
  extra?: string;
}) {
  const positive = value >= 0;
  return (
    <div className={`rounded-2xl border p-4 ${pnlBg(value)}`}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{title}</p>
          <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>
        </div>
        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${positive ? "bg-emerald-100" : "bg-red-100"}`}>
          {positive ? (
            <TrendingUp size={16} className="text-emerald-700" />
          ) : (
            <TrendingDown size={16} className="text-red-700" />
          )}
        </div>
      </div>
      <p className={`text-2xl font-bold tabular-nums mt-3 ${pnlTone(value)}`}>{signedInr(value)}</p>
      {(invested || extra) && (
        <p className="text-[10px] text-slate-500 mt-1">
          {invested}
          {invested && extra ? " · " : ""}
          {extra}
        </p>
      )}
    </div>
  );
}

function BreakdownTable({
  title,
  rows,
  highlightKey,
  onSelect,
}: {
  title: string;
  rows: { key: string; label: string; trades: number; wins: number; losses: number; realized: number }[];
  highlightKey?: string;
  onSelect: (key: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-slate-100">
      <div className="px-4 py-2 bg-slate-50 border-b border-slate-100">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{title}</p>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left border-b border-slate-100">
            <th className="px-3 py-2 text-[10px] font-semibold text-slate-400">Period</th>
            <th className="px-3 py-2 text-[10px] font-semibold text-slate-400 text-right">Trades</th>
            <th className="px-3 py-2 text-[10px] font-semibold text-slate-400 text-right">Realized</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-50">
          {[...rows].reverse().map((row) => (
            <tr
              key={row.key}
              onClick={() => onSelect(row.key)}
              className={`cursor-pointer transition-colors ${
                highlightKey === row.key ? "bg-emerald-50" : "hover:bg-slate-50"
              }`}
            >
              <td className="px-3 py-2.5">
                <span className="font-medium text-slate-900">{row.label}</span>
                <span className="block text-[10px] text-slate-400">
                  {row.wins}W · {row.losses}L
                </span>
              </td>
              <td className="px-3 py-2.5 text-right text-slate-600 tabular-nums">{row.trades}</td>
              <td className={`px-3 py-2.5 text-right font-semibold tabular-nums ${pnlTone(row.realized)}`}>
                {signedInr(row.realized)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
