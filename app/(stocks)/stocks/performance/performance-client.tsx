"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  BarChart3, TrendingUp, TrendingDown, Target, ShieldAlert,
  Clock, RefreshCw, IndianRupee, Swords, Trophy, Flame, Info,
  ChevronLeft, ChevronRight, Bot,
} from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, Cell, Legend,
} from "recharts";
import type { SignalSource } from "@/lib/stocks/types";
import { SOURCE_PRIORITY } from "@/lib/stocks/types";
import { HERO_META, ACTIVE_SOURCES, BENCH_SOURCES, exitReasonCopy } from "@/lib/stocks/heroes";
import { HeroChip } from "@/components/stocks/hero-portrait";

interface Trade {
  id: number | string;
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

function heroOf(strategy: string) {
  return (HERO_META as Partial<Record<string, (typeof HERO_META)[SignalSource]>>)[strategy];
}

const CHART_TOOLTIP_STYLE = {
  background: "#1b2230",
  border: "1px solid #38415a",
  borderRadius: 8,
  fontSize: 12,
  color: "#c8ccd4",
} as const;

type CurrentPrices = Record<string, { price: number; change: number; changePct: number } | null>;

type TabKey = "all" | SignalSource;

const VALID_TABS = new Set<string>(["all", ...SOURCE_PRIORITY]);

const TRADES_PAGE_SIZE = 20;

export function PerformanceClient() {
  const searchParams = useSearchParams();
  const [data, setData]               = useState<PerformanceData | null>(null);
  const [loading, setLoading]         = useState(true);
  const [currentPrices, setCurrentPrices] = useState<CurrentPrices>({});
  const [tab, setTab] = useState<TabKey>("all");
  const [tradePage, setTradePage] = useState(1);

  useEffect(() => {
    const s = searchParams.get("strategy");
    if (s && VALID_TABS.has(s) && s !== "all") {
      setTab(s as TabKey);
    }
  }, [searchParams]);

  useEffect(() => {
    setTradePage(1);
  }, [tab]);

  async function fetchData() {
    setLoading(true);
    try {
      const res = await fetch("/api/stocks/swing/performance");
      if (res.ok) {
        const perf: PerformanceData = await res.json();
        setData(perf);
        const openSymbols = [...new Set(perf.trades.filter(t => t.status === "open").map(t => t.symbol))];
        if (openSymbols.length > 0) {
          const priceRes = await fetch(`/api/stocks/current-price?tickers=${openSymbols.join(",")}`);
          if (priceRes.ok) setCurrentPrices(await priceRes.json());
        }
      }
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

  const sortedTrades = [...filteredTrades].sort((a, b) =>
    String(b.signal_date).localeCompare(String(a.signal_date))
  );
  const tradeTotalPages = Math.max(1, Math.ceil(sortedTrades.length / TRADES_PAGE_SIZE));
  const safeTradePage = Math.min(tradePage, tradeTotalPages);
  const paginatedTrades = sortedTrades.slice(
    (safeTradePage - 1) * TRADES_PAGE_SIZE,
    safeTradePage * TRADES_PAGE_SIZE
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
    name: heroOf(s.strategy)?.name ?? s.strategy,
    Wins: Number(s.wins),
    Losses: Number(s.losses),
    Timeout: Number(s.closed_trades) - Number(s.wins) - Number(s.losses),
  })) ?? [];

  const winRate = activeStats && Number(activeStats.closed_trades) > 0
    ? Math.round((Number(activeStats.wins) / Number(activeStats.closed_trades)) * 100)
    : 0;

  // Visual-only ordering: active roster heroes first, bench after
  const orderedStats = data
    ? [...data.stats].sort((a, b) => {
        const ra = heroOf(a.strategy)?.roster === "active" ? 0 : 1;
        const rb = heroOf(b.strategy)?.roster === "active" ? 0 : 1;
        return ra - rb;
      })
    : [];

  return (
    <div className="min-h-full">
      {/* Header */}
      <div className="bg-[#11161f]/95 backdrop-blur-xl border-b border-[#2a3344] px-4 md:px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#2b1c08] to-[#120c04] border border-[#6b4c16] flex items-center justify-center shrink-0">
              <Bot size={18} className="text-[var(--dota-gold)]" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="cz text-base font-black leading-tight">Demo Mode</h1>
                <span
                  className="cz text-[8.5px] font-bold px-2 py-0.5 rounded border border-[#574212] bg-[rgba(255,216,77,0.06)] !text-[var(--dota-gold)]"
                  style={{ letterSpacing: "0.12em" }}
                >
                  Bot match · ₹10k paper auto-buys
                </span>
              </div>
              <p className="text-[11px] text-[var(--dota-dim)] truncate">
                Hypothetical outcomes · paper gold, not your real trades
              </p>
            </div>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#574212] bg-[rgba(255,216,77,0.06)] text-[var(--dota-gold)] text-xs font-semibold hover:bg-[rgba(255,216,77,0.12)] transition-colors disabled:opacity-50 shrink-0"
          >
            <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
            <span className="hidden sm:inline">Rescan</span>
          </button>
        </div>

        {/* Strategy filter tabs — active roster first, bench muted */}
        <div className="md:sticky md:top-14 md:z-10 md:bg-[#11161f] md:border-b md:border-[#2a3344] md:pb-2 flex flex-wrap items-center gap-2 mt-3">
          <button
            onClick={() => setTab("all")}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
              tab === "all"
                ? "border-[#574212] bg-[rgba(255,216,77,0.06)] text-[var(--dota-gold)]"
                : "border-[var(--dota-border)] bg-black/30 text-[var(--dota-text)] hover:bg-white/5"
            }`}
          >
            All
          </button>
          {ACTIVE_SOURCES.map(src => {
            const h = HERO_META[src];
            const active = tab === src;
            return (
              <button
                key={src}
                onClick={() => setTab(src as TabKey)}
                className={`inline-flex items-center gap-1.5 pl-1.5 pr-3 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                  active ? "" : "border-[var(--dota-border)] bg-black/30 text-[var(--dota-text)] hover:bg-white/5"
                }`}
                style={
                  active
                    ? { borderColor: h.accent, color: h.accent, backgroundColor: `${h.accent}1a` }
                    : undefined
                }
              >
                <span
                  className="w-5 h-5 rounded-full overflow-hidden border bg-black shrink-0"
                  style={{ borderColor: `${h.accent}66` }}
                >
                  {h.img && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={h.img} alt={h.dota ?? h.name} className="w-full h-full object-cover object-top scale-[1.6]" loading="lazy" />
                  )}
                </span>
                {h.name}
              </button>
            );
          })}
          <span className="cz text-[8px] font-bold !text-[var(--dota-dim)] ml-1" style={{ letterSpacing: "0.18em" }}>
            Bench
          </span>
          {BENCH_SOURCES.map(src => {
            const h = HERO_META[src];
            const active = tab === src;
            return (
              <button
                key={src}
                onClick={() => setTab(src as TabKey)}
                className={`inline-flex items-center gap-1.5 pl-1 pr-2.5 py-1 rounded-full text-[10.5px] font-semibold border transition-all ${
                  active ? "bg-white/10" : "bg-white/[0.02] grayscale-[0.5] opacity-75 hover:opacity-100 hover:grayscale-0"
                }`}
                style={{
                  borderColor: active ? h.accent : "#38415a",
                  color: active ? h.accent : "var(--dota-text)",
                }}
              >
                <span
                  className="w-[18px] h-[18px] rounded-full overflow-hidden border bg-black shrink-0"
                  style={{ borderColor: `${h.accent}66` }}
                >
                  {h.img && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={h.img} alt={h.dota ?? h.name} className="w-full h-full object-cover object-top scale-[1.6]" loading="lazy" />
                  )}
                </span>
                {h.name}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mx-4 md:mx-6 mt-3 px-3 py-2 rounded-lg border border-[#574212] bg-[rgba(255,216,77,0.05)] flex items-center gap-2 text-xs text-[var(--dota-gold)]">
        <Info size={14} className="shrink-0" />
        <span>This is the system-wide bot match. Your real gold lives in <Link href="/stocks/portfolio" className="font-semibold underline">Ranked</Link>.</span>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="w-8 h-8 border-2 border-[#574212] border-t-[var(--dota-gold)] rounded-full animate-spin" />
          <p className="cz text-[10px] !text-[var(--dota-dim)]">Loading the replay…</p>
        </div>
      ) : !data || data.trades.length === 0 ? (
        <EmptyState />
      ) : (
        <div className="px-4 md:px-6 py-5 space-y-6">

          {/* Per-strategy summary row */}
          {tab === "all" && data.stats.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {orderedStats.map((s) => {
                const h = heroOf(s.strategy);
                const bench = h?.roster !== "active";
                const pnl = Number(s.total_pnl);
                return (
                  <button
                    key={s.strategy}
                    onClick={() => setTab(s.strategy as TabKey)}
                    className={`shrink-0 px-3 py-2 rounded-xl text-left dota-panel transition-opacity ${
                      bench ? "grayscale-[0.4] opacity-70 hover:opacity-100" : "hover:opacity-90"
                    }`}
                    style={{ borderColor: `${h?.accent ?? "#38415a"}55` }}
                  >
                    <p className="text-[10px] font-semibold" style={{ color: h?.accent ?? "var(--dota-dim)" }}>
                      {h?.name ?? s.strategy}
                      {bench && <span className="text-[var(--dota-dim)]"> · BENCH</span>}
                    </p>
                    <p className="text-xs font-bold text-[var(--dota-text)] tabular-nums">
                      {Number(s.wins)}W·{Number(s.losses)}L·{Number(s.closed_trades)-Number(s.wins)-Number(s.losses)}TO
                    </p>
                    <p className={`text-xs font-semibold tabular-nums ${pnl >= 0 ? "text-[#bcdb3e]" : "text-[#f06352]"}`}>
                      {pnl >= 0 ? "+" : ""}₹{Math.abs(pnl).toFixed(0)}
                    </p>
                  </button>
                );
              })}
            </div>
          )}

          {/* ── Post-game scoreboard ──────────────────────────── */}
          {activeStats && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <KpiCard
                icon={<IndianRupee size={18} />}
                label="Net Worth"
                value={`₹${Number(activeStats.total_pnl).toFixed(0)}`}
                sub={`${Number(activeStats.closed_trades)} games finished`}
                tone={Number(activeStats.total_pnl) >= 0 ? "gold" : "bad"}
              />
              <KpiCard
                icon={<Swords size={18} />}
                label="Record"
                value={`${Number(activeStats.wins)}W–${Number(activeStats.losses)}L`}
                sub={`${winRate}% win rate · ${Number(activeStats.closed_trades) - Number(activeStats.wins) - Number(activeStats.losses)} timeouts`}
                tone={winRate >= 50 ? "good" : "bad"}
              />
              <KpiCard
                icon={<Trophy size={18} />}
                label="Roshan"
                value={`₹${Number(activeStats.best_trade).toFixed(0)}`}
                sub="Biggest single take"
                tone="neutral"
              />
              <KpiCard
                icon={<Flame size={18} />}
                label="Avg Gold / Game"
                value={`₹${Number(activeStats.avg_pnl).toFixed(0)}`}
                sub={`${Number(activeStats.avg_pnl_pct).toFixed(1)}% avg`}
                tone={Number(activeStats.avg_pnl) >= 0 ? "neutral" : "bad"}
              />
            </div>
          )}

          {/* Open positions alert */}
          {activeStats && Number(activeStats.open_trades) > 0 && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-[#34509a] bg-[rgba(76,126,255,0.07)]">
              <Clock size={16} className="text-[#8fa8e8] shrink-0" />
              <p className="text-sm text-[#8fa8e8]">
                <span className="font-semibold">{activeStats.open_trades} hero{Number(activeStats.open_trades) !== 1 ? "es" : ""} still on the map</span>
                {" "}— evaluated at next scanner run (6 PM IST)
              </p>
            </div>
          )}

          {/* ── Charts ────────────────────────────────────────── */}
          {pnlChartData.length > 0 && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Cumulative P&L */}
              <div className="dota-panel rounded-xl p-4">
                <h3 className="cz text-[11px] font-bold mb-4">Gold Advantage</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={pnlChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#38415a" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#7A8294" }} />
                    <YAxis tick={{ fontSize: 10, fill: "#7A8294" }} tickFormatter={v => `₹${v}`} />
                    <Tooltip
                      formatter={(v: number | undefined) => [`₹${v ?? 0}`, "Cumulative P&L"]}
                      contentStyle={CHART_TOOLTIP_STYLE}
                      labelStyle={{ color: "#7a8294" }}
                      itemStyle={{ color: "#c8ccd4" }}
                    />
                    <Line
                      type="monotone" dataKey="cumulative" stroke="#bcdb3e"
                      strokeWidth={2.5} dot={{ r: 3, fill: "#bcdb3e" }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Per-trade P&L bars */}
              <div className="dota-panel rounded-xl p-4">
                <h3 className="cz text-[11px] font-bold mb-4">Gold per Game</h3>
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart data={pnlChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#38415a" />
                    <XAxis dataKey="date" tick={{ fontSize: 10, fill: "#7A8294" }} />
                    <YAxis tick={{ fontSize: 10, fill: "#7A8294" }} tickFormatter={v => `₹${v}`} />
                    <Tooltip
                      formatter={(v: number | undefined) => [`₹${v ?? 0}`, "P&L"]}
                      contentStyle={CHART_TOOLTIP_STYLE}
                      labelStyle={{ color: "#7a8294" }}
                      itemStyle={{ color: "#c8ccd4" }}
                    />
                    <Bar dataKey="pnl" radius={[4, 4, 0, 0]}>
                      {pnlChartData.map((entry, i) => (
                        <Cell key={i} fill={entry.pnl >= 0 ? "#bcdb3e" : "#f06352"} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Win/Loss by strategy */}
              {tab === "all" && winLossData.length > 0 && (
                <div className="dota-panel rounded-xl p-4 lg:col-span-2">
                  <h3 className="cz text-[11px] font-bold mb-4">Outcomes by Hero</h3>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={winLossData} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="#38415a" />
                      <XAxis type="number" tick={{ fontSize: 10, fill: "#7A8294" }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#C8CCD4" }} width={90} />
                      <Tooltip
                        contentStyle={CHART_TOOLTIP_STYLE}
                        labelStyle={{ color: "#7a8294" }}
                        itemStyle={{ color: "#c8ccd4" }}
                      />
                      <Legend iconSize={10} wrapperStyle={{ fontSize: 11, color: "#7a8294" }} />
                      <Bar dataKey="Wins"    fill="#bcdb3e" radius={[0, 4, 4, 0]} stackId="a" />
                      <Bar dataKey="Losses"  fill="#f06352" radius={[0, 0, 0, 0]} stackId="a" />
                      <Bar dataKey="Timeout" fill="#F4D03F" radius={[0, 4, 4, 0]} stackId="a" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          )}

          {/* ── Match history table ───────────────────────────── */}
          <div className="dota-panel rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-[#2a3344] flex items-center justify-between">
              <h3 className="cz text-[11px] font-bold">Match History</h3>
              <span className="text-xs text-[var(--dota-dim)]">
                {sortedTrades.length === 0
                  ? "0 games"
                  : `Showing ${(safeTradePage - 1) * TRADES_PAGE_SIZE + 1}–${Math.min(safeTradePage * TRADES_PAGE_SIZE, sortedTrades.length)} of ${sortedTrades.length}`}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#2a3344] bg-black/30 text-[10px] text-[#7A8294] uppercase tracking-wider">
                    <th className="text-left px-4 py-2.5 font-semibold">Date</th>
                    <th className="text-left px-4 py-2.5 font-semibold">Symbol</th>
                    <th className="text-left px-4 py-2.5 font-semibold hidden sm:table-cell">Hero</th>
                    <th className="text-right px-4 py-2.5 font-semibold">Entry</th>
                    <th className="text-right px-4 py-2.5 font-semibold hidden md:table-cell">Target</th>
                    <th className="text-right px-4 py-2.5 font-semibold hidden md:table-cell">SL</th>
                    <th className="text-right px-4 py-2.5 font-semibold hidden lg:table-cell">Current</th>
                    <th className="text-left px-4 py-2.5 font-semibold">Exit</th>
                    <th className="text-right px-4 py-2.5 font-semibold">P&L</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#2a3344]">
                  {paginatedTrades.map(t => {
                    const hero = heroOf(t.strategy);
                    const liveData = t.status === "open" ? (currentPrices[t.symbol] ?? null) : null;
                    const unrealizedPnl = liveData
                      ? (liveData.price - t.entry_price) * (t.investment / t.entry_price)
                      : null;
                    const displayPnl   = t.status === "open" ? unrealizedPnl : (t.pnl ?? null);
                    const pnlPos = (displayPnl ?? 0) >= 0;
                    const won = t.status === "closed" && (t.pnl ?? 0) >= 0;
                    return (
                      <tr key={t.id} className="hover:bg-white/[0.03] transition-colors">
                        <td className="px-4 py-3 text-xs text-[var(--dota-dim)] whitespace-nowrap">
                          {new Date(t.signal_date).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}
                        </td>
                        <td className="px-4 py-3 font-semibold text-[var(--dota-head)]">{t.symbol}</td>
                        <td className="px-4 py-3 hidden sm:table-cell">
                          {hero ? (
                            <HeroChip source={t.strategy as SignalSource} />
                          ) : (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-[var(--dota-border)] bg-black/30 text-[var(--dota-text)]">
                              {t.strategy}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right text-xs text-[var(--dota-text)]">₹{t.entry_price}</td>
                        <td className="px-4 py-3 text-right text-xs text-[#bcdb3e] hidden md:table-cell">₹{t.target_price}</td>
                        <td className="px-4 py-3 text-right text-xs text-[#f06352] hidden md:table-cell">₹{t.stop_loss_price}</td>
                        <td className="px-4 py-3 text-right hidden lg:table-cell">
                          {liveData ? (
                            <div className="flex flex-col items-end gap-0.5">
                              <span className="text-xs font-medium text-[var(--dota-text)]">₹{liveData.price.toFixed(2)}</span>
                              <span className={`text-[10px] font-semibold ${liveData.changePct >= 0 ? "text-[#bcdb3e]" : "text-[#f06352]"}`}>
                                {liveData.changePct >= 0 ? "+" : ""}{liveData.changePct.toFixed(2)}%
                              </span>
                            </div>
                          ) : t.status === "open" ? (
                            <span className="text-xs text-[var(--dota-dim)]">—</span>
                          ) : (
                            <span className="text-xs text-[var(--dota-dim)]">{t.exit_price ? `₹${t.exit_price}` : "—"}</span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {t.status === "open" ? (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-[#34509a] bg-[rgba(76,126,255,0.1)] text-[#8fa8e8]">
                              On the map
                            </span>
                          ) : t.exit_reason ? (
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${
                                  won
                                    ? "bg-[rgba(176,210,50,0.12)] text-[#bcdb3e] border-[#4a5621]"
                                    : "bg-[rgba(212,69,49,0.12)] text-[#f06352] border-[#5e2a1f]"
                                }`}
                              >
                                {won ? "W" : "L"}
                              </span>
                              <span className="text-[11px] text-[var(--dota-text)] italic whitespace-nowrap">
                                {exitReasonCopy(t.exit_reason)}
                              </span>
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-right">
                          {displayPnl != null ? (
                            <div className="flex flex-col items-end gap-0.5">
                              <div className={`flex items-center gap-1 font-semibold text-xs ${pnlPos ? "text-[#bcdb3e]" : "text-[#f06352]"}`}>
                                {pnlPos ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                                ₹{Math.abs(displayPnl).toFixed(0)}
                              </div>
                              {t.status === "open" && (
                                <span className="text-[10px] text-[var(--dota-dim)]">Unrealized</span>
                              )}
                            </div>
                          ) : (
                            <span className="text-xs text-[var(--dota-dim)]">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {tradeTotalPages > 1 && (
              <div className="px-4 py-3 border-t border-[#2a3344] flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setTradePage((p) => Math.max(1, p - 1))}
                  disabled={safeTradePage === 1}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--dota-border)] bg-black/30 text-xs font-semibold text-[var(--dota-text)] hover:bg-white/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  <ChevronLeft size={14} />
                  Prev
                </button>
                <span className="text-xs font-medium text-[var(--dota-dim)]">
                  Page <span className="font-bold text-[var(--dota-gold)]">{safeTradePage}</span> of {tradeTotalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setTradePage((p) => Math.min(tradeTotalPages, p + 1))}
                  disabled={safeTradePage === tradeTotalPages}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[#574212] bg-[rgba(255,216,77,0.06)] text-xs font-semibold text-[var(--dota-gold)] hover:bg-[rgba(255,216,77,0.12)] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                  <ChevronRight size={14} />
                </button>
              </div>
            )}
          </div>

          {/* Exit logic explanation */}
          <div className="dota-panel rounded-xl p-4">
            <h4 className="cz text-[10px] font-bold mb-2 flex items-center gap-1.5">
              <ShieldAlert size={13} className="text-[var(--dota-gold)]" /> How the bot match simulates exits
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-[var(--dota-dim)]">
              <div className="flex items-start gap-2">
                <Target size={12} className="text-[#bcdb3e] mt-0.5 shrink-0" />
                <span><strong className="text-[var(--dota-head)]">Objective secured</strong> — next day high &ge; target price → exit at target</span>
              </div>
              <div className="flex items-start gap-2">
                <ShieldAlert size={12} className="text-[#f06352] mt-0.5 shrink-0" />
                <span><strong className="text-[var(--dota-head)]">You have been slain</strong> — next day low &le; stop loss price → exit at stop loss</span>
              </div>
              <div className="flex items-start gap-2">
                <Clock size={12} className="text-[var(--dota-gold)] mt-0.5 shrink-0" />
                <span><strong className="text-[var(--dota-head)]">The game has gone late</strong> — 7 days elapsed without target/SL hit → exit at close</span>
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}

function KpiCard({
  icon, label, value, sub, tone,
}: {
  icon: React.ReactNode; label: string; value: string;
  sub: string; tone: "gold" | "good" | "bad" | "neutral";
}) {
  const valueColor =
    tone === "gold" ? "text-[var(--dota-gold)]"
    : tone === "good" ? "text-[#bcdb3e]"
    : tone === "bad" ? "text-[#f06352]"
    : "text-[var(--dota-head)]";
  return (
    <div className="dota-panel rounded-xl p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="cz text-[9px] font-bold !text-[var(--dota-dim)]" style={{ letterSpacing: "0.14em" }}>{label}</span>
        <div className="w-8 h-8 rounded-lg dota-stat flex items-center justify-center text-[var(--dota-gold)]">{icon}</div>
      </div>
      <p className={`text-xl font-bold tabular-nums ${valueColor}`}>{value}</p>
      <p className="text-[11px] text-[var(--dota-dim)] mt-0.5">{sub}</p>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center py-24 text-center px-4">
      <div className="w-16 h-16 rounded-2xl dota-panel flex items-center justify-center mb-4">
        <BarChart3 size={28} className="text-[var(--dota-gold)] opacity-60" />
      </div>
      <h3 className="cz text-sm font-bold mb-1">No matches played yet</h3>
      <p className="text-sm text-[var(--dota-dim)] max-w-sm">
        The bot match starts automatically once the scanner runs and signals are saved. Return after the first evening scout.
      </p>
    </div>
  );
}
