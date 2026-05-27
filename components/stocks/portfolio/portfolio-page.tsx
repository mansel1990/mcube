"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Briefcase, RefreshCw } from "lucide-react";
import type { SignalSource } from "@/lib/stocks/types";
import { CloseTradeSheet } from "./close-trade-sheet";
import { StrategyBadge } from "../strategy-badge";

interface UserTrade {
  _id: string;
  source: SignalSource;
  signalRef: string;
  ticker: string;
  quantity: number;
  entryPrice: number;
  entryDate: string;
  target: number | null;
  stopLoss: number | null;
  exitPrice: number | null;
  exitDate: string | null;
  status: "open" | "closed";
  notes: string | null;
  invested?: number;
  unrealizedPnl?: number | null;
  unrealizedPnlPct?: number | null;
  realizedPnl?: number;
  realizedPnlPct?: number;
  livePrice?: number;
}

type Tab = "open" | "closed";

export function PortfolioPage() {
  const params = useSearchParams();
  const router = useRouter();
  const tab = (params.get("tab") as Tab) === "closed" ? "closed" : "open";

  const [trades, setTrades] = useState<UserTrade[]>([]);
  const [loading, setLoading] = useState(true);
  const [closeTarget, setCloseTarget] = useState<UserTrade | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const tradesRes = await fetch("/api/stocks/trades");
      if (tradesRes.ok) setTrades(await tradesRes.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (params.get("tab") === "today") {
      router.replace("/stocks");
    }
  }, [params, router]);

  const openTrades = trades.filter((t) => t.status === "open");
  const closedTrades = trades.filter((t) => t.status === "closed").sort((a, b) =>
    (b.exitDate ?? "").localeCompare(a.exitDate ?? "")
  );

  const totalInvested = openTrades.reduce((s, t) => s + (t.invested ?? t.quantity * t.entryPrice), 0);
  const totalUnrealized = openTrades.reduce((s, t) => s + (t.unrealizedPnl ?? 0), 0);
  const totalRealized = closedTrades.reduce((s, t) => s + (t.realizedPnl ?? 0), 0);

  function setTab(t: Tab) {
    const next = new URLSearchParams(params.toString());
    if (t === "open") next.delete("tab"); else next.set("tab", "closed");
    router.replace(`/stocks/portfolio?${next.toString()}`, { scroll: false });
  }

  return (
    <div className="min-h-full bg-[#F8FAFC]">
      <div className="bg-white border-b border-slate-200 px-4 md:px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
              <Briefcase size={20} className="text-emerald-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">My Portfolio</h1>
              <p className="text-xs text-slate-500">Trades you logged · Your real P&L only</p>
            </div>
          </div>
          <button onClick={fetchData} disabled={loading} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        {trades.length > 0 && (
          <div className="grid grid-cols-3 gap-2 mt-4">
            <Kpi label="Invested" value={`₹${totalInvested.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`} />
            <Kpi label="Unrealized" value={`${totalUnrealized >= 0 ? "+" : ""}₹${Math.abs(totalUnrealized).toFixed(0)}`} positive={totalUnrealized >= 0} />
            <Kpi label="Realized" value={`${totalRealized >= 0 ? "+" : ""}₹${Math.abs(totalRealized).toFixed(0)}`} positive={totalRealized >= 0} />
          </div>
        )}

        <div className="flex gap-2 mt-4">
          {(["open", "closed"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize ${
                tab === t ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-500"
              }`}
            >
              {t} {t === "open" ? `(${openTrades.length})` : `(${closedTrades.length})`}
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 md:px-6 py-5">
        {loading && (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
          </div>
        )}

        {!loading && trades.length === 0 && (
          <div className="text-center py-16">
            <Briefcase size={40} className="mx-auto text-emerald-200 mb-4" />
            <h3 className="font-semibold text-slate-900 mb-1">No trades logged yet</h3>
            <p className="text-sm text-slate-500 mb-4">
              Go to Signals, pick a recommendation, and tap &quot;Log buy&quot; when you take a real position.
            </p>
            <Link href="/stocks" className="text-sm font-medium text-emerald-600 hover:underline">Browse signals →</Link>
          </div>
        )}

        {!loading && tab === "open" && openTrades.length > 0 && (
          <div className="space-y-3">
            {openTrades.map((t) => {
              const pnl = t.unrealizedPnl ?? 0;
              return (
                <div key={t._id} className="bg-white rounded-xl border border-slate-200 p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-900">{t.ticker}</span>
                        <StrategyBadge source={t.source as SignalSource} />
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{t.quantity} × ₹{t.entryPrice} · {t.entryDate}</p>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-bold ${pnl >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                        {pnl >= 0 ? "+" : ""}₹{Math.abs(pnl).toFixed(0)}
                      </p>
                      {t.unrealizedPnlPct != null && (
                        <p className="text-[10px] text-slate-500">{t.unrealizedPnlPct.toFixed(2)}%</p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setCloseTarget(t)}
                    className="text-xs font-medium text-slate-600 hover:text-slate-900 underline"
                  >
                    Close trade
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {!loading && tab === "closed" && closedTrades.length > 0 && (
          <div className="space-y-3">
            {closedTrades.map((t) => {
              const pnl = t.realizedPnl ?? 0;
              return (
                <div key={t._id} className="bg-white rounded-xl border border-slate-200 p-4 flex justify-between">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900">{t.ticker}</span>
                      <StrategyBadge source={t.source as SignalSource} />
                    </div>
                    <p className="text-xs text-slate-500 mt-1">
                      ₹{t.entryPrice} → ₹{t.exitPrice} · {t.exitDate}
                    </p>
                  </div>
                  <p className={`text-sm font-bold ${pnl >= 0 ? "text-emerald-600" : "text-red-600"}`}>
                    {pnl >= 0 ? "+" : ""}₹{Math.abs(pnl).toFixed(0)}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {!loading && trades.length > 0 && tab === "open" && openTrades.length === 0 && (
          <p className="text-center text-sm text-slate-500 py-12">No open positions.</p>
        )}

        {!loading && trades.length > 0 && tab === "closed" && closedTrades.length === 0 && (
          <p className="text-center text-sm text-slate-500 py-12">No closed trades yet.</p>
        )}

        <p className="text-center text-xs text-slate-400 mt-8">
          Kite auto-sync · Coming in Phase 2
        </p>
      </div>

      {closeTarget && (
        <CloseTradeSheet
          tradeId={closeTarget._id}
          ticker={closeTarget.ticker}
          defaultPrice={closeTarget.livePrice ?? closeTarget.entryPrice}
          open={!!closeTarget}
          onClose={() => setCloseTarget(null)}
          onSuccess={fetchData}
        />
      )}
    </div>
  );
}

function Kpi({ label, value, positive }: { label: string; value: string; positive?: boolean }) {
  return (
    <div className="bg-slate-50 rounded-lg px-3 py-2 text-center">
      <p className="text-[10px] text-slate-500 uppercase">{label}</p>
      <p className={`text-sm font-bold ${positive === false ? "text-red-600" : positive ? "text-emerald-600" : "text-slate-900"}`}>{value}</p>
    </div>
  );
}
