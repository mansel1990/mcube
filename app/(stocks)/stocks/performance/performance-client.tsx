"use client";

import { useEffect, useState } from "react";
import {
  BarChart3, TrendingUp, TrendingDown, Target, ShieldAlert,
  Clock, RefreshCw, IndianRupee, Percent, Trophy, Flame,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell, Legend,
} from "recharts";

interface Trade {
  id: number;
  signal_date: string;
  strategy: string;
  symbol: string;
  entry_price: number;
  target_price: number;
  stop_loss_price: number;
  investment: number;
  exit_date: string | null;
  exit_price: number | null;
  exit_reason: string | null;
  pnl: number | null;
  pnl_pct: number | null;
  status: string;
}

interface StratStats {
  strategy: string;
  total_trades: number;
  closed_trades: number;
  open_trades: number;
  wins: number;
  losses: number;
  total_pnl: number;
  avg_pnl: number;
  best_trade: number;
  worst_trade: number;
  avg_pnl_pct: number;
}

interface PerformanceData {
  trades: Trade[];
  stats: StratStats[];
}

const STRATEGY_META: Record<string, { label: string; color: string; bg: string; border: string }> = {
  breakout:     { label: "Breakout",     color: "text-violet-700",  bg: "bg-violet-50",  border: "border-violet-200" },
  ema_pullback: { label: "EMA Pullback", color: "text-emerald-700", bg: "bg-emerald-50", border: "border-emerald-200" },
};

const EXIT_META: Record<string, { label: string; color: string; bg: string }> = {
  target_hit: { label: "Target Hit",  color: "text-emerald-700", bg: "bg-emerald-100" },
  stop_loss:  { label: "Stop Loss",   color: "text-red-600",     bg: "bg-red-100"     },
  timeout:    { label: "Timeout",     color: "text-amber-700",   bg: "bg-amber-100"   },
};

export function PerformanceClient() {
  const [data, setData]       = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState<"all" | "breakout" | "ema_pullback">("all");

  async function fetchData() {
    setLoading(true);
    try {
      const res = await fetch("/api/stocks/swing/performance");
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { fetchData(); }, []);

  const combined: StratStats | null = data?.stats.length
    ? {
        strategy:     "all",
        total_trades:  data.stats.reduce((s, x) => s + Number(x.total_trades), 0),
        closed_trades: data.stats.reduce((s, x) => s + Number(x.closed_trades), 0),
        open_trades:   data.stats.reduce((s, x) => s + Number(x.open_trades), 0),
        wins:          data.stats.reduce((s, x) => s + Number(x.wins), 0),
        losses:        data.stats.reduce((s, x) => s + Number(x.losses), 0),
        total_pnl:     data.stats.reduce((s, x) => s + Number(x.total_pnl), 0),
        avg_pnl:       data.stats.reduce((s, x) => s + Number(x.avg_pnl), 0) / (data.stats.length || 1),
        best_trade:    Math.max(...data.stats.map(x => Number(x.best_trade))),
        worst_trade:   Math.min(...data.stats.map(x => Number(x.worst_trade))),
        avg_pnl_pct:   data.stats.reduce((s, x) => s + Number(x.avg_pnl_pct), 0) / (data.stats.length || 1),
      }
    : null;

  const activeStats = tab === "all"
    ? combined
    : data?.stats.find(s => s.strategy === tab) ?? null;

  const filteredTrades = (data?.trades ?? []).filter(
    t => tab === "all" || t.strategy === tab
  );

  // Build cumulative P&L chart data
  const pnlChartData = (() => {
    const closed = [...filteredTrades]
      .filter(t => t.status === "closed" && t.exit_date)
      .sort((a, b) => a.exit_date!.localeCompare(b.exit_date!));
    let cumulative = 0;
    return closed.map(t => {
      cumulative += Number(t.pnl ?? 0);
      return {
        date: new Date(t.exit_date!).toLocaleDateString("en-IN", { day: "2-digit", month: "short" }),
        pnl: Number(t.pnl ?? 0),
        cumulative: Math.round(cumulative),
      };
    });
  })();

  // Win/loss bar data
  const winLossData = data?.stats.map(s => ({
    name: STRATEGY_META[s.strategy]?.label ?? s.strategy,
    Wins: Number(s.wins),
    Losses: Number(s.losses),
    Timeout: Number(s.closed_trades) - Number(s.wins) - Number(s.losses),
  })) ?? [];

  const winRate = activeStats && Number(activeStats.closed_trades) > 0
    ? Math.round((Number(activeStats.wins) / Number(activeStats.closed_trades)) * 100)
    : 0;

  return (
    <div className="min-h-full bg-background">
      {/* Header */}
      <div className="bg-white border-b border-border px-4 md:px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
              <BarChart3 size={20} className="text-amber-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-foreground">Strategy Performance</h1>
              <p className="text-xs text-muted">₹10,000 per trade · Simulated exit at next scanner run</p>
            </div>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 text-sm font-medium hover:bg-amber-100 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            Refresh
          </button>
        </div>

        {/* Strategy filter tabs */}
        <div className="flex gap-2 mt-3">
          {(["all", "breakout", "ema_pullback"] as const).map(s => (
            <button
              key={s}
              onClick={() => setTab(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                tab === s
                  ? s === "all"          ? "bg-slate-800 text-white"
                  : s === "breakout"     ? "bg-violet-600 text-white"
                  :                        "bg-emerald-600 text-white"
                  : "bg-slate-100 text-slate-500 hover:bg-slate-200"
              }`}
            >
              {s === "all" ? "All Strategies" : s === "breakout" ? "Breakout" : "EMA Pullback"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="w-8 h-8 border-2 border-amber-200 border-t-amber-600 rounded-full animate-spin" />
          <p className="text-sm text-muted">Loading performance data…</p>
        </div>
      ) : !data || data.trades.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="px-4 md:px-6 py-5 space-y-6">

          {/* ── KPI cards ─────────────────────────────────────── */}
          {activeStats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard
                icon={<IndianRupee size={18} />}
                label="Total P&L"
                value={`₹${Number(activeStats.total_pnl).toFixed(0)}`}
                sub={`${Number(activeStats.closed_trades)} closed trades`}
                positive={Number(activeStats.total_pnl) >= 0}
                color="blue"
              />
              <KpiCard
                icon={<Percent size={18} />}
                label="Win Rate"
                value={`${winRate}%`}
                sub={`${activeStats.wins}W / ${activeStats.losses}L`}
                positive={winRate >= 50}
                color="emerald"
              />
              <KpiCard
                icon={<Trophy size={18} />}
                label="Best Trade"
                value={`₹${Number(activeStats.best_trade).toFixed(0)}`}
                sub="Single trade gain"
                positive={true}
                color="amber"
              />
              <KpiCard
                icon={<Flame size={18} />}
                label="Avg P&L/Trade"
                value={`₹${Number(activeStats.avg_pnl).toFixed(0)}`}
                sub={`${Number(activeStats.avg_pnl_pct).toFixed(1)}% avg`}
                positive={Number(activeStats.avg_pnl) >= 0}
                color="violet"
              />
            </div>
          )}

          {/* Open positions alert */}
          {activeStats && Number(activeStats.open_trades) > 0 && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-blue-50 border border-blue-200">
              <Clock size={16} className="text-blue-600 shrink-0" />
              <p className="text-sm text-blue-700">
                <span className="font-semibold">{activeStats.open_trades} open position{Number(activeStats.open_trades) !== 1 ? "s" : ""}</span>
                {" "}— will be evaluated at next scanner run (6 PM IST)
              </p>
            </div>
          )}

          {/* ── Charts ────────────────────────────────────────── */}
          {pnlChartData.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Cumulative P&L */}
              <div className="bg-white rounded-2xl shadow-card p-4">
                <h3 className="text-sm font-semibold text-foreground mb-4">Cumulative P&L</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={pnlChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94A3B8" }} />
                    <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} tickFormatter={v => `₹${v}`} />
                    <Tooltip
                      formatter={(v: number | undefined) => [`₹${v ?? 0}`, "Cumulative P&L"]}
                      contentStyle={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 12 }}
                    />
                    <Line
                      type="monotone" dataKey="cumulative" stroke="#2563EB"
                      strokeWidth={2.5} dot={{ r: 3, fill: "#2563EB" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Per-trade P&L bars */}
              <div className="bg-white rounded-2xl shadow-card p-4">
                <h3 className="text-sm font-semibold text-foreground mb-4">Per-Trade P&L</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={pnlChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#94A3B8" }} />
                    <YAxis tick={{ fontSize: 10, fill: "#94A3B8" }} tickFormatter={v => `₹${v}`} />
                    <Tooltip
                      formatter={(v: number | undefined) => [`₹${v ?? 0}`, "P&L"]}
                      contentStyle={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 12 }}
                    />
                    <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                      {pnlChartData.map((entry, i) => (
                        <Cell key={i} fill={entry.pnl >= 0 ? "#10B981" : "#EF4444"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Win/Loss by strategy */}
              {tab === "all" && winLossData.length > 0 && (
                <div className="bg-white rounded-2xl shadow-card p-4 lg:col-span-2">
                  <h3 className="text-sm font-semibold text-foreground mb-4">Outcomes by Strategy</h3>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={winLossData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                      <XAxis type="number" tick={{ fontSize: 10, fill: "#94A3B8" }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#64748B" }} width={90} />
                      <Tooltip contentStyle={{ background: "#fff", border: "1px solid #E2E8F0", borderRadius: 8, fontSize: 12 }} />
                      <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
                      <Bar dataKey="Wins"    fill="#10B981" radius={[0, 4, 4, 0]} stackId="a" />
                      <Bar dataKey="Losses"  fill="#EF4444" radius={[0, 0, 0, 0]} stackId="a" />
                      <Bar dataKey="Timeout" fill="#F59E0B" radius={[0, 4, 4, 0]} stackId="a" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {/* ── Trade history table ───────────────────────────── */}
          <div className="bg-white rounded-2xl shadow-card overflow-hidden">
            <div className="px-4 py-3 border-b border-border flex items-center justify-between">
              <h3 className="text-sm font-semibold text-foreground">Trade History</h3>
              <span className="text-xs text-muted">{filteredTrades.length} trades</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-slate-50 text-xs text-muted uppercase tracking-wide">
                    <th className="text-left px-4 py-2.5">Date</th>
                    <th className="text-left px-4 py-2.5">Symbol</th>
                    <th className="text-left px-4 py-2.5 hidden sm:table-cell">Strategy</th>
                    <th className="text-right px-4 py-2.5">Entry</th>
                    <th className="text-right px-4 py-2.5 hidden md:table-cell">Target</th>
                    <th className="text-right px-4 py-2.5 hidden md:table-cell">SL</th>
                    <th className="text-left px-4 py-2.5">Exit</th>
                    <th className="text-right px-4 py-2.5">P&L</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {filteredTrades.map(t => {
                    const meta = STRATEGY_META[t.strategy];
                    const exit = t.exit_reason ? EXIT_META[t.exit_reason] : null;
                    const pnlPos = (t.pnl ?? 0) >= 0;
                    return (
                      <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 text-xs text-muted whitespace-nowrap">
                          {new Date(t.signal_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                        </td>
                        <td className="px-4 py-3 font-semibold text-foreground">{t.symbol}</td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${meta?.bg ?? "bg-slate-100"} ${meta?.color ?? "text-slate-600"}`}>
                            {meta?.label ?? t.strategy}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-xs">₹{t.entry_price}</td>
                        <td className="px-4 py-3 text-right text-xs text-emerald-600 hidden md:table-cell">₹{t.target_price}</td>
                        <td className="px-4 py-3 text-right text-xs text-red-500 hidden md:table-cell">₹{t.stop_loss_price}</td>
                        <td className="px-4 py-3">
                          {t.status === "open" ? (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">Open</span>
                          ) : exit ? (
                            <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${exit.bg} ${exit.color}`}>{exit.label}</span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {t.pnl != null ? (
                            <div className={`flex items-center justify-end gap-1 font-semibold text-xs ${pnlPos ? "text-emerald-600" : "text-red-500"}`}>
                              {pnlPos ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                              ₹{Math.abs(Number(t.pnl)).toFixed(0)}
                            </div>
                          ) : (
                            <span className="text-xs text-muted">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Exit logic explanation */}
          <div className="bg-slate-50 rounded-xl p-4 border border-border">
            <h4 className="text-xs font-semibold text-foreground mb-2 flex items-center gap-1.5">
              <ShieldAlert size={13} className="text-amber-500" /> How exits are simulated
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-muted">
              <div className="flex items-start gap-2">
                <Target size={12} className="text-emerald-500 mt-0.5 shrink-0" />
                <span><strong className="text-foreground">Target Hit</strong> — next day high &ge; target price → exit at target</span>
              </div>
              <div className="flex items-start gap-2">
                <ShieldAlert size={12} className="text-red-500 mt-0.5 shrink-0" />
                <span><strong className="text-foreground">Stop Loss</strong> — next day low &le; stop loss price → exit at stop loss</span>
              </div>
              <div className="flex items-start gap-2">
                <Clock size={12} className="text-amber-500 mt-0.5 shrink-0" />
                <span><strong className="text-foreground">Timeout</strong> — 7 days elapsed without target/SL hit → exit at close</span>
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

function KpiCard({
  icon, label, value, sub, positive, color,
}: {
  icon: React.ReactNode; label: string; value: string;
  sub: string; positive: boolean; color: string;
}) {
  const bg = color === "blue" ? "bg-blue-50" : color === "emerald" ? "bg-emerald-50" : color === "amber" ? "bg-amber-50" : "bg-violet-50";
  const ic = color === "blue" ? "text-blue-600" : color === "emerald" ? "text-emerald-600" : color === "amber" ? "text-amber-600" : "text-violet-600";
  return (
    <div className="bg-white rounded-2xl shadow-card p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium text-muted">{label}</span>
        <div className={`w-8 h-8 rounded-lg ${bg} flex items-center justify-center ${ic}`}>{icon}</div>
      </div>
      <p className={`text-xl font-bold ${positive ? "text-foreground" : "text-red-500"}`}>{value}</p>
      <p className="text-[11px] text-muted mt-0.5">{sub}</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center px-4">
      <div className="w-16 h-16 rounded-2xl bg-amber-50 flex items-center justify-center mb-4">
        <BarChart3 size={28} className="text-amber-300" />
      </div>
      <h3 className="text-base font-semibold text-foreground mb-1">No performance data yet</h3>
      <p className="text-sm text-muted max-w-sm">
        Performance tracking starts automatically once the scanner runs and signals are saved. Check back after the first evening scan.
      </p>
    </div>
  );
}
