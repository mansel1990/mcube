"use client";

import { useEffect, useState } from "react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Legend,
} from "recharts";
import { TrendingUp, TrendingDown, ArrowRight } from "lucide-react";
import Link from "next/link";
import { SummaryCard } from "@/components/admin/summary-card";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MonthStat {
  month: string;
  income: number;
  expenses: number;
  net: number;
}


interface ClientSummary {
  total: number;
  active: number;
}

interface ClientRaw {
  status: string;
  billingCycle: string;
  cycleAmount: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `₹${Math.abs(n).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}


// ─── Custom Tooltip ───────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const income = payload.find((p: { dataKey: string }) => p.dataKey === "income")?.value ?? 0;
  const expenses = payload.find((p: { dataKey: string }) => p.dataKey === "expenses")?.value ?? 0;
  const net = income - expenses;
  return (
    <div className="glass-panel border border-white/10 rounded-xl px-4 py-3 text-xs space-y-1.5 shadow-xl">
      <div className="font-semibold text-foreground/60 mb-2">{label}</div>
      <div className="flex items-center justify-between gap-6">
        <span className="text-foreground/50">Income</span>
        <span className="text-accent font-semibold">{fmt(income)}</span>
      </div>
      <div className="flex items-center justify-between gap-6">
        <span className="text-foreground/50">Expenses</span>
        <span className="text-rose-400 font-semibold">{fmt(expenses)}</span>
      </div>
      <div className="border-t border-white/10 pt-1.5 flex items-center justify-between gap-6">
        <span className="text-foreground/50">Net</span>
        <span className={`font-bold ${net >= 0 ? "text-accent" : "text-rose-400"}`}>
          {net < 0 ? "−" : "+"}{fmt(net)}
        </span>
      </div>
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const [stats, setStats] = useState<MonthStat[]>([]);
  const [clients, setClients] = useState<ClientSummary>({ total: 0, active: 0 });
  const [mrr, setMrr] = useState(0);
  const [subCost, setSubCost] = useState(0);
  const [activeSubs, setActiveSubs] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/stats").then((r) => r.json()),
      fetch("/api/admin/clients").then((r) => r.json()),
      fetch("/api/admin/subscriptions").then((r) => r.json()),
    ]).then(([st, cls, subs]) => {
      setStats(st);
      const active = cls.filter((c: ClientRaw) => c.status === "active").length;
      setClients({ total: cls.length, active });
      const clientMrr = cls
        .filter((c: ClientRaw) => c.status === "active")
        .reduce((s: number, c: ClientRaw) => {
          if (c.billingCycle === "monthly") return s + c.cycleAmount;
          if (c.billingCycle === "yearly") return s + c.cycleAmount / 12;
          return s;
        }, 0);
      setMrr(clientMrr);
      const activeSub = subs.filter((s: { status: string }) => s.status === "active");
      const cost = activeSub.reduce(
        (s: number, sub: { billingCycle: string; amount: number }) =>
          s + (sub.billingCycle === "monthly" ? sub.amount : sub.amount / 12),
        0
      );
      setSubCost(cost);
      setActiveSubs(activeSub.length);
      setLoading(false);
    });
  }, []);

  // Current month summary from stats
  const currentMonth = stats[stats.length - 1];
  const prevMonth = stats[stats.length - 2];
  const expensesThisMonth = currentMonth?.expenses ?? 0;
  const lastMonthNet = prevMonth?.net ?? 0;
  const chartData = stats.map((s, i) => ({
    ...s,
    isCurrent: i === stats.length - 1,
    net: i === stats.length - 1 ? null : s.net,
  }));

  const overallTrend = stats.length > 1
    ? stats.slice(-3).reduce((s, m) => s + m.net, 0) / 3
    : 0;

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
          <p className="text-sm text-foreground/40 mt-0.5">
            {overallTrend >= 0
              ? "Trending profitable — keep it up"
              : "Currently running at a loss — building towards profit"}
          </p>
        </div>
        {overallTrend >= 0
          ? <TrendingUp size={22} className="text-accent opacity-60" />
          : <TrendingDown size={22} className="text-rose-400 opacity-60" />}
      </div>

      {/* ── Summary cards ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <SummaryCard
          label="Monthly Revenue"
          value={fmt(mrr)}
          sub={`${clients.active} active client${clients.active !== 1 ? "s" : ""}`}
          color="cyan"
        />
        <SummaryCard
          label="Expenses This Month"
          value={fmt(expensesThisMonth)}
          sub={`incl. ₹${subCost.toFixed(2)} subs`}
          color="rose"
        />
        <SummaryCard
          label="Last Month Net"
          value={`${lastMonthNet < 0 ? "−" : "+"}${fmt(lastMonthNet)}`}
          positive={lastMonthNet >= 0}
          color="blue"
        />
        <SummaryCard
          label="Active Subscriptions"
          value={String(activeSubs)}
          sub={`₹${subCost.toFixed(2)}/mo`}
          color="champagne"
        />
      </div>

      {/* ── Chart ───────────────────────────────────────────────────────────── */}
      <div className="glass-panel rounded-xl border border-white/5 p-5">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-sm font-semibold text-foreground">Income vs Expenses</h2>
            <p className="text-xs text-foreground/40 mt-0.5">Last 6 months · current month partial</p>
          </div>
          <div className="flex items-center gap-4 text-xs text-foreground/40">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-accent/70 inline-block" /> Income
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-sm bg-rose-400/70 inline-block" /> Expenses
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-1 rounded-full bg-primary inline-block" /> Net
            </span>
          </div>
        </div>

        {loading ? (
          <div className="h-64 flex items-center justify-center text-foreground/20 text-sm">
            Loading chart…
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={260}>
            <ComposedChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
              <CartesianGrid
                strokeDasharray="3 3"
                stroke="rgba(255,255,255,0.05)"
                vertical={false}
              />
              <XAxis
                dataKey="month"
                tick={{ fill: "rgba(248,250,252,0.35)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: "rgba(248,250,252,0.35)", fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `₹${v}`}
                width={60}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "rgba(255,255,255,0.03)" }} />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.1)" strokeDasharray="4 4" />
              <Bar dataKey="income" maxBarSize={40}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                shape={(props: any) => {
                  const { x, y, width, height, isCurrent } = props;
                  return <rect x={x} y={y} width={width} height={Math.max(0, height)} fill="#06B6D4" fillOpacity={isCurrent ? 0.25 : 0.75} rx={4} />;
                }}
              />
              <Bar dataKey="expenses" maxBarSize={40}
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                shape={(props: any) => {
                  const { x, y, width, height, isCurrent } = props;
                  return <rect x={x} y={y} width={width} height={Math.max(0, height)} fill="#fb7185" fillOpacity={isCurrent ? 0.25 : 0.75} rx={4} />;
                }}
              />
              <Line
                dataKey="net"
                type="monotone"
                stroke="#2563EB"
                strokeWidth={2}
                dot={{ fill: "#2563EB", r: 3, strokeWidth: 0 }}
                activeDot={{ r: 5, fill: "#2563EB" }}
                connectNulls={false}
              />
              <Legend
                wrapperStyle={{ display: "none" }}
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Quick Links ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Finances card */}
        <Link
          href="/admin/finances"
          className="glass-panel rounded-xl border border-white/5 hover:border-champagne/20 p-5 group transition-colors"
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">Finances</h3>
            <ArrowRight size={15} className="text-foreground/30 group-hover:text-champagne transition-colors" />
          </div>
          <div className="flex items-end gap-4">
            <div>
              <div className="text-2xl font-bold text-champagne">{activeSubs}</div>
              <div className="text-xs text-foreground/40">active subscriptions</div>
            </div>
            <div className="pb-0.5">
              <div className="text-lg font-semibold text-rose-400">₹{subCost.toFixed(2)}</div>
              <div className="text-xs text-foreground/40">per month</div>
            </div>
          </div>
          <p className="text-xs text-foreground/30 mt-3">
            Manage subscriptions and one-time expenses →
          </p>
        </Link>

        {/* Clients card */}
        <Link
          href="/admin/clients"
          className="glass-panel rounded-xl border border-white/5 hover:border-accent/20 p-5 group transition-colors"
        >
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-foreground">Clients</h3>
            <ArrowRight size={15} className="text-foreground/30 group-hover:text-accent transition-colors" />
          </div>
          <div className="flex items-end gap-4">
            <div>
              <div className="text-2xl font-bold text-accent">{clients.active}</div>
              <div className="text-xs text-foreground/40">active clients</div>
            </div>
            {clients.total > clients.active && (
              <div className="pb-0.5">
                <div className="text-lg font-semibold text-foreground/40">{clients.total}</div>
                <div className="text-xs text-foreground/40">total</div>
              </div>
            )}
            {mrr > 0 && (
              <div className="pb-0.5">
                <div className="text-lg font-semibold text-accent/70">{fmt(mrr)}</div>
                <div className="text-xs text-foreground/40">MRR</div>
              </div>
            )}
          </div>
          <p className="text-xs text-foreground/30 mt-3">
            View client profiles and record payments →
          </p>
        </Link>
      </div>

    </div>
  );
}
