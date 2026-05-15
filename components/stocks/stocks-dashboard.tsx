"use client";

import { useState, useEffect, useTransition, useRef } from "react";
import dynamic from "next/dynamic";
import type { OhlcvRow, MAConfig } from "./ohlcv-chart";

const OhlcvChart = dynamic(
  () => import("./ohlcv-chart").then((m) => m.OhlcvChart),
  { ssr: false }
);

const RANGES = [
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
  { label: "6M", days: 180 },
  { label: "1Y", days: 365 },
  { label: "All", days: 3650 },
];

const MA_OPTIONS: { key: keyof MAConfig; label: string; color: string }[] = [
  { key: "ma20", label: "MA 20", color: "#f59e0b" },
  { key: "ma50", label: "MA 50", color: "#3b82f6" },
  { key: "ma200", label: "MA 200", color: "#a855f7" },
];

// ── Searchable ticker dropdown ───────────────────────────────────
function TickerSearch({
  tickers,
  value,
  onChange,
}: {
  tickers: string[];
  value: string;
  onChange: (t: string) => void;
}) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const filtered = query
    ? tickers.filter((t) => t.toLowerCase().includes(query.toLowerCase()))
    : tickers;

  // Close on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  function select(t: string) {
    setQuery(t);
    onChange(t);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search ticker…"
        className="bg-white border border-slate-200 text-slate-900 text-sm font-semibold rounded-lg px-3 py-2 w-44 focus:outline-none focus:ring-1 focus:ring-primary/50 placeholder:text-slate-400"
      />
      {open && filtered.length > 0 && (
        <ul className="absolute z-50 top-full mt-1 left-0 w-full max-h-56 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-xl divide-y divide-slate-100">
          {filtered.map((t) => (
            <li key={t}>
              <button
                onMouseDown={() => select(t)}
                className={`w-full text-left px-3 py-2 text-sm transition-colors hover:bg-slate-100 ${
                  t === value ? "text-primary font-semibold" : "text-slate-700"
                }`}
              >
                {t}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Main dashboard ───────────────────────────────────────────────
interface StocksDashboardProps {
  tickers: string[];
}

export function StocksDashboard({ tickers }: StocksDashboardProps) {
  const [ticker, setTicker] = useState(tickers[0] ?? "");
  const [range, setRange] = useState(365);
  const [maConfig, setMaConfig] = useState<MAConfig>({ ma20: true, ma50: true, ma200: false });
  const [data, setData] = useState<OhlcvRow[]>([]);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // Fetch all data for the ticker — range only zooms the chart, not the query
  useEffect(() => {
    if (!ticker) return;
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch(`/api/stocks/ohlcv?ticker=${encodeURIComponent(ticker)}`);
        if (!res.ok) throw new Error("Failed to load data");
        setData(await res.json());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Unknown error");
      }
    });
  }, [ticker]); // range intentionally excluded — it only affects chart zoom

  function toggleMA(key: keyof MAConfig) {
    setMaConfig((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  // Use the last data point within the visible range so stats match the chart
  const visibleData = range < 3650
    ? (() => {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - range);
        return data.filter((d) => new Date(d.date) >= cutoff);
      })()
    : data;

  const latest = visibleData[visibleData.length - 1];
  const prev = visibleData[visibleData.length - 2];
  const change = latest && prev ? Number(latest.close) - Number(prev.close) : null;
  const changePct = change != null && prev ? (change / Number(prev.close)) * 100 : null;
  const isUp = change != null && change >= 0;

  return (
    <div className="flex flex-col h-full gap-4 p-4 md:p-6">
      {/* ── Controls row ──────────────────────────────────────── */}
      <div className="flex flex-wrap items-center gap-3">
        <TickerSearch tickers={tickers} value={ticker} onChange={setTicker} />

        {/* Price info */}
        {latest && (
          <div className="flex items-baseline gap-2">
            <span className="text-xl font-bold text-slate-900">
              ₹{Number(latest.close).toFixed(2)}
            </span>
            {changePct != null && (
              <span className={`text-sm font-medium ${isUp ? "text-emerald-600" : "text-red-600"}`}>
                {isUp ? "+" : ""}{change?.toFixed(2)} ({isUp ? "+" : ""}{changePct.toFixed(2)}%)
              </span>
            )}
          </div>
        )}

        <div className="flex-1" />

        {/* MA toggles */}
        <div className="flex items-center gap-1">
          {MA_OPTIONS.map(({ key, label, color }) => (
            <button
              key={key}
              onClick={() => toggleMA(key)}
              style={maConfig[key] ? { borderColor: color, color } : undefined}
              className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                maConfig[key]
                  ? "bg-slate-100"
                  : "border-slate-200 text-slate-400 hover:text-slate-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Range tabs */}
        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1">
          {RANGES.map((r) => (
            <button
              key={r.label}
              onClick={() => setRange(r.days)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                range === r.days
                  ? "bg-primary text-white"
                  : "text-slate-500 hover:text-slate-900"
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Stats row ─────────────────────────────────────────── */}
      {latest && (
        <div className="grid grid-cols-4 sm:grid-cols-5 gap-2 text-center">
          {[
            { label: "Open", value: `₹${Number(latest.open).toFixed(2)}` },
            { label: "High", value: `₹${Number(latest.high).toFixed(2)}` },
            { label: "Low", value: `₹${Number(latest.low).toFixed(2)}` },
            { label: "Volume", value: Number(latest.volume).toLocaleString("en-IN") },
            ...(latest.rsi != null ? [{ label: "RSI", value: Number(latest.rsi).toFixed(1) }] : []),
          ].map((stat) => (
            <div key={stat.label} className="bg-white border border-slate-200 rounded-lg px-2 py-2">
              <p className="text-[10px] text-slate-400 uppercase tracking-wider mb-0.5">{stat.label}</p>
              <p className="text-sm font-semibold text-slate-900">{stat.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* ── Chart ─────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 relative rounded-xl overflow-hidden border border-slate-200 bg-slate-50">
        {isPending && (
          <div className="absolute inset-0 flex items-center justify-center z-10 bg-slate-50/60 backdrop-blur-sm">
            <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center text-red-600 text-sm">{error}</div>
        )}
        {!error && data.length > 0 && <OhlcvChart data={data} maConfig={maConfig} visibleDays={range} />}
        {!isPending && !error && data.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-sm">
            No data for this range
          </div>
        )}
      </div>
    </div>
  );
}
