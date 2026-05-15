"use client";

export interface StockSuggestion {
  id: number;
  signal_date: string;
  ticker: string;
  peers: string | null;
  entry_z: string | null;
  peer_slope_pct: string | null;
  entry_date: string | null;
  entry_price: string | null;
  status: string;
  exit_date: string | null;
  exit_price: string | null;
  pnl_pct: string | null;
  hold_days: number;
  exit_reason: string | null;
  amount_invested: string;
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function fmtPrice(p: string | null) {
  if (!p) return "—";
  return "₹" + parseFloat(p).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function fmtPct(p: string | null) {
  if (!p) return null;
  const n = parseFloat(p);
  const sign = n >= 0 ? "+" : "";
  return sign + n.toFixed(2) + "%";
}

interface Props {
  suggestion: StockSuggestion;
  currentPrice?: { price: number; change: number; changePct: number };
}

export function SuggestionCard({ suggestion: s, currentPrice }: Props) {
  const isOpen = s.status === "OPEN";
  const pnl = s.pnl_pct ? parseFloat(s.pnl_pct) : null;
  const isProfit = pnl !== null && pnl >= 0;

  const peers = s.peers
    ? s.peers.split(",").map((p) => p.trim()).filter(Boolean)
    : [];

  if (isOpen) {
    return (
      <div className="rounded-xl overflow-hidden border border-blue-200 bg-gradient-to-br from-blue-50 via-white to-white flex flex-col">
        {/* Accent bar */}
        <div className="h-0.5 bg-gradient-to-r from-blue-500 via-violet-500 to-blue-500/30" />

        <div className="p-4 flex flex-col gap-3">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="text-xl font-bold text-slate-900 tracking-tight">{s.ticker}</span>
              <p className="text-[11px] text-slate-400 mt-0.5">{fmtDate(s.signal_date)}</p>
            </div>
            <div className="flex items-center gap-1.5 bg-blue-50 border border-blue-200 rounded-full px-2.5 py-1">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-400" />
              </span>
              <span className="text-[11px] font-semibold text-blue-600 tracking-wide">LIVE</span>
            </div>
          </div>

          {/* Entry + Current Price + Unrealized P&L */}
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-lg bg-slate-50 px-3 py-2.5">
              <p className="text-[9px] text-slate-400 uppercase tracking-widest mb-0.5">Entry</p>
              <p className="text-sm font-bold text-slate-900">{fmtPrice(s.entry_price)}</p>
              <p className="text-[10px] text-slate-400 mt-0.5">{fmtDate(s.entry_date)}</p>
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2.5">
              <p className="text-[9px] text-slate-400 uppercase tracking-widest mb-0.5">Current</p>
              <p className="text-sm font-bold text-slate-900">
                {currentPrice ? fmtPrice(String(currentPrice.price)) : "—"}
              </p>
              {currentPrice && (
                <p className={`text-[10px] mt-0.5 ${currentPrice.changePct >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                  {currentPrice.changePct >= 0 ? "+" : ""}{currentPrice.changePct.toFixed(2)}%
                </p>
              )}
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2.5">
              <p className="text-[9px] text-slate-400 uppercase tracking-widest mb-0.5">Unreal. P&L</p>
              {currentPrice && s.entry_price ? (() => {
                const entry = parseFloat(s.entry_price);
                const pnlPct = ((currentPrice.price - entry) / entry) * 100;
                const isPos = pnlPct >= 0;
                return (
                  <>
                    <p className={`text-sm font-bold ${isPos ? "text-emerald-600" : "text-red-600"}`}>
                      {isPos ? "+" : ""}{pnlPct.toFixed(2)}%
                    </p>
                    <p className={`text-[10px] mt-0.5 ${isPos ? "text-emerald-500" : "text-red-500"}`}>
                      {isPos ? "▲" : "▼"} ₹{Math.abs(currentPrice.price - entry).toLocaleString("en-IN", { maximumFractionDigits: 2 })}
                    </p>
                  </>
                );
              })() : <p className="text-sm font-bold text-slate-400">—</p>}
            </div>
          </div>

          {/* Peers */}
          {peers.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {peers.map((p) => (
                <span
                  key={p}
                  className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-500"
                >
                  {p}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Closed card
  const pnlClass = isProfit ? "text-emerald-700" : "text-red-600";
  const accentFrom = isProfit ? "from-emerald-500" : "from-red-500";
  const bgFrom = isProfit ? "from-emerald-50" : "from-red-50";
  const borderColor = isProfit ? "border-emerald-200" : "border-red-200";

  return (
    <div className={`rounded-xl overflow-hidden border ${borderColor} bg-gradient-to-br ${bgFrom} via-white to-white flex flex-col`}>
      {/* Accent bar */}
      <div className={`h-0.5 bg-gradient-to-r ${accentFrom} to-transparent`} />

      <div className="p-4 flex flex-col gap-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div>
            <span className="text-xl font-bold text-slate-900 tracking-tight">{s.ticker}</span>
            <p className="text-[11px] text-slate-400 mt-0.5">{fmtDate(s.signal_date)}</p>
          </div>
          <span
            className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${
              isProfit
                ? "bg-emerald-100 text-emerald-700 border border-emerald-200"
                : "bg-red-100 text-red-700 border border-red-200"
            }`}
          >
            {isProfit ? "▲" : "▼"} {fmtPct(s.pnl_pct)}
          </span>
        </div>

        {/* Entry → Exit */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-lg bg-slate-50 px-3 py-2.5">
            <p className="text-[9px] text-slate-400 uppercase tracking-widest mb-0.5">Entry</p>
            <p className="text-sm font-semibold text-slate-900">{fmtPrice(s.entry_price)}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">{fmtDate(s.entry_date)}</p>
          </div>
          <div className="rounded-lg bg-slate-50 px-3 py-2.5">
            <p className="text-[9px] text-slate-400 uppercase tracking-widest mb-0.5">Exit</p>
            <p className={`text-sm font-semibold ${pnlClass}`}>{fmtPrice(s.exit_price)}</p>
            <p className="text-[10px] text-slate-400 mt-0.5">{fmtDate(s.exit_date)}</p>
          </div>
        </div>

        {/* Hold days + exit reason */}
        <div className="flex items-center justify-between text-[10px] text-slate-400">
          {s.hold_days > 0 && (
            <span>{s.hold_days} day{s.hold_days !== 1 ? "s" : ""} held</span>
          )}
          {s.exit_reason && (
            <span className="truncate ml-2">{s.exit_reason}</span>
          )}
        </div>
      </div>
    </div>
  );
}
