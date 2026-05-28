"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Briefcase, RefreshCw, AlertCircle } from "lucide-react";
import type { SignalSource } from "@/lib/stocks/types";
import { CloseTradeSheet } from "./close-trade-sheet";
import { StrategyBadge } from "../strategy-badge";

interface KiteHolding {
  tradingsymbol: string;
  exchange: string;
  quantity: number;
  average_price: number;
  last_price: number;
  pnl: number;
  day_change: number;
  day_change_percentage: number;
}

interface KitePosition {
  tradingsymbol: string;
  exchange: string;
  quantity: number;
  average_price: number;
  last_price: number;
  pnl: number;
  m2m: number;
  unrealised: number;
  realised: number;
  product: string;
}

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
  livePrice?: number;
}

type Tab = "holdings" | "positions" | "logged";

function fmt(n: number, decimals = 0) {
  return n.toLocaleString("en-IN", { maximumFractionDigits: decimals, minimumFractionDigits: decimals });
}

function pnlClass(n: number) {
  return n >= 0 ? "text-emerald-600" : "text-red-600";
}

export function PortfolioPage() {
  const params = useSearchParams();
  const router = useRouter();
  const tab = (["holdings", "positions", "logged"] as Tab[]).includes(params.get("tab") as Tab)
    ? (params.get("tab") as Tab)
    : "holdings";

  const [holdings, setHoldings] = useState<KiteHolding[]>([]);
  const [positions, setPositions] = useState<KitePosition[]>([]);
  const [trades, setTrades] = useState<UserTrade[]>([]);
  const [kiteError, setKiteError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [closeTarget, setCloseTarget] = useState<UserTrade | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState("");
  const [editSl, setEditSl] = useState("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setKiteError(null);
    try {
      const [holdRes, posRes, tradesRes] = await Promise.all([
        fetch("/api/kite/holdings"),
        fetch("/api/kite/positions"),
        fetch("/api/stocks/trades"),
      ]);

      if (holdRes.ok) {
        setHoldings(await holdRes.json());
      } else if (holdRes.status === 401) {
        const d = await holdRes.json();
        setKiteError(d.error || "Connect Kite in Settings");
        setHoldings([]);
      }

      if (posRes.ok) {
        const data = await posRes.json();
        const net = (data.net ?? []) as KitePosition[];
        setPositions(net.filter((p) => p.quantity !== 0));
      }

      if (tradesRes.ok) setTrades(await tradesRes.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  function setTab(t: Tab) {
    const next = new URLSearchParams(params.toString());
    if (t === "holdings") next.delete("tab");
    else next.set("tab", t);
    router.replace(`/stocks/portfolio?${next.toString()}`, { scroll: false });
  }

  async function saveTargetSl(tradeId: string) {
    await fetch(`/api/stocks/trades/${tradeId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        target: editTarget ? Number(editTarget) : null,
        stopLoss: editSl ? Number(editSl) : null,
      }),
    });
    setEditingId(null);
    fetchData();
  }

  const openTrades = trades.filter((t) => t.status === "open");
  const closedTrades = trades.filter((t) => t.status === "closed");
  const holdingsPnl = holdings.reduce((s, h) => s + (h.pnl ?? 0), 0);
  const positionsPnl = positions.reduce((s, p) => s + (p.pnl ?? 0), 0);

  return (
    <div className="min-h-full bg-[#F8FAFC]">
      <div className="bg-white border-b border-slate-200 px-4 md:px-6 py-4">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center">
              <Briefcase size={20} className="text-emerald-600" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-slate-900">Portfolio</h1>
              <p className="text-xs text-slate-500">Kite sync + signal trade log</p>
            </div>
          </div>
          <button onClick={fetchData} disabled={loading} className="p-2 rounded-lg text-slate-500 hover:bg-slate-100">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
        </div>

        {kiteError && tab !== "logged" && (
          <div className="mt-3 flex items-center gap-2 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            <AlertCircle size={14} />
            <span>{kiteError} — </span>
            <Link href="/stocks/settings" className="font-semibold underline">Settings</Link>
          </div>
        )}

        <div className="flex gap-2 mt-4 overflow-x-auto">
          {([
            ["holdings", `Holdings (${holdings.length})`],
            ["positions", `Positions (${positions.length})`],
            ["logged", `Logged (${trades.length})`],
          ] as const).map(([t, label]) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap ${
                tab === t ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-500"
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "holdings" && holdings.length > 0 && (
          <p className={`text-xs font-semibold mt-3 ${pnlClass(holdingsPnl)}`}>
            Total P&L: {holdingsPnl >= 0 ? "+" : ""}₹{fmt(Math.abs(holdingsPnl))}
          </p>
        )}
        {tab === "positions" && positions.length > 0 && (
          <p className={`text-xs font-semibold mt-3 ${pnlClass(positionsPnl)}`}>
            Day P&L: {positionsPnl >= 0 ? "+" : ""}₹{fmt(Math.abs(positionsPnl))}
          </p>
        )}
      </div>

      <div className="px-4 md:px-6 py-5">
        {loading && (
          <div className="flex justify-center py-16">
            <div className="w-8 h-8 border-2 border-emerald-200 border-t-emerald-600 rounded-full animate-spin" />
          </div>
        )}

        {!loading && tab === "holdings" && holdings.length === 0 && !kiteError && (
          <EmptyState message="No holdings in your Kite account." />
        )}

        {!loading && tab === "holdings" && holdings.map((h) => {
          const pnlPct = h.average_price ? ((h.last_price - h.average_price) / h.average_price) * 100 : 0;
          return (
            <div key={`${h.exchange}-${h.tradingsymbol}`} className="bg-white rounded-xl border border-slate-200 p-4 mb-3">
              <div className="flex justify-between gap-2">
                <div>
                  <p className="font-bold text-slate-900">{h.tradingsymbol}</p>
                  <p className="text-xs text-slate-500">{h.quantity} × avg ₹{fmt(h.average_price, 2)} · LTP ₹{fmt(h.last_price, 2)}</p>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-bold ${pnlClass(h.pnl)}`}>{h.pnl >= 0 ? "+" : ""}₹{fmt(Math.abs(h.pnl))}</p>
                  <p className="text-[10px] text-slate-500">{pnlPct.toFixed(2)}%</p>
                </div>
              </div>
              <p className="text-[10px] text-slate-400 mt-1">Day {h.day_change_percentage?.toFixed(2) ?? 0}%</p>
            </div>
          );
        })}

        {!loading && tab === "positions" && positions.length === 0 && !kiteError && (
          <EmptyState message="No open intraday positions." />
        )}

        {!loading && tab === "positions" && positions.map((p) => (
          <div key={`${p.exchange}-${p.tradingsymbol}-${p.product}`} className="bg-white rounded-xl border border-slate-200 p-4 mb-3">
            <div className="flex justify-between gap-2">
              <div>
                <p className="font-bold text-slate-900">{p.tradingsymbol}</p>
                <p className="text-xs text-slate-500">{p.product} · {p.quantity} qty · LTP ₹{fmt(p.last_price, 2)}</p>
              </div>
              <div className="text-right">
                <p className={`text-sm font-bold ${pnlClass(p.pnl)}`}>{p.pnl >= 0 ? "+" : ""}₹{fmt(Math.abs(p.pnl))}</p>
                <p className="text-[10px] text-slate-500">M2M ₹{fmt(p.m2m ?? 0)}</p>
              </div>
            </div>
          </div>
        ))}

        {!loading && tab === "logged" && trades.length === 0 && (
          <EmptyState message="No logged trades yet." href="/stocks" linkLabel="Browse signals" />
        )}

        {!loading && tab === "logged" && openTrades.length > 0 && (
          <>
            <p className="text-[10px] uppercase font-semibold text-slate-500 mb-2">Open</p>
            {openTrades.map((t) => (
              <LoggedTradeCard
                key={t._id}
                trade={t}
                editing={editingId === t._id}
                editTarget={editTarget}
                editSl={editSl}
                onEdit={() => {
                  setEditingId(t._id);
                  setEditTarget(t.target?.toString() ?? "");
                  setEditSl(t.stopLoss?.toString() ?? "");
                }}
                onSave={() => saveTargetSl(t._id)}
                onCancelEdit={() => setEditingId(null)}
                setEditTarget={setEditTarget}
                setEditSl={setEditSl}
                onClose={() => setCloseTarget(t)}
              />
            ))}
          </>
        )}

        {!loading && tab === "logged" && closedTrades.length > 0 && (
          <>
            <p className="text-[10px] uppercase font-semibold text-slate-500 mb-2 mt-4">Closed</p>
            {closedTrades.map((t) => {
              const pnl = t.realizedPnl ?? 0;
              return (
                <div key={t._id} className="bg-white rounded-xl border border-slate-200 p-4 mb-3 flex justify-between">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900">{t.ticker}</span>
                      <StrategyBadge source={t.source as SignalSource} />
                    </div>
                    <p className="text-xs text-slate-500 mt-1">₹{t.entryPrice} → ₹{t.exitPrice} · {t.exitDate}</p>
                  </div>
                  <p className={`text-sm font-bold ${pnlClass(pnl)}`}>{pnl >= 0 ? "+" : ""}₹{fmt(Math.abs(pnl))}</p>
                </div>
              );
            })}
          </>
        )}
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

function EmptyState({ message, href, linkLabel }: { message: string; href?: string; linkLabel?: string }) {
  return (
    <div className="text-center py-16">
      <Briefcase size={40} className="mx-auto text-emerald-200 mb-4" />
      <p className="text-sm text-slate-500 mb-4">{message}</p>
      {href && linkLabel && (
        <Link href={href} className="text-sm font-medium text-emerald-600 hover:underline">{linkLabel} →</Link>
      )}
    </div>
  );
}

function LoggedTradeCard({
  trade: t,
  editing,
  editTarget,
  editSl,
  onEdit,
  onSave,
  onCancelEdit,
  setEditTarget,
  setEditSl,
  onClose,
}: {
  trade: UserTrade;
  editing: boolean;
  editTarget: string;
  editSl: string;
  onEdit: () => void;
  onSave: () => void;
  onCancelEdit: () => void;
  setEditTarget: (v: string) => void;
  setEditSl: (v: string) => void;
  onClose: () => void;
}) {
  const pnl = t.unrealizedPnl ?? 0;
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 mb-3">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-slate-900">{t.ticker}</span>
            <StrategyBadge source={t.source as SignalSource} />
          </div>
          <p className="text-xs text-slate-500 mt-0.5">{t.quantity} × ₹{t.entryPrice} · {t.entryDate}</p>
          {(t.target != null || t.stopLoss != null) && !editing && (
            <p className="text-[10px] text-slate-400 mt-1">
              Target ₹{t.target ?? "—"} · SL ₹{t.stopLoss ?? "—"}
            </p>
          )}
        </div>
        <div className="text-right">
          <p className={`text-sm font-bold ${pnlClass(pnl)}`}>{pnl >= 0 ? "+" : ""}₹{Math.abs(pnl).toFixed(0)}</p>
        </div>
      </div>
      {editing ? (
        <div className="flex flex-wrap gap-2 items-end mt-2">
          <input
            placeholder="Target ₹"
            value={editTarget}
            onChange={(e) => setEditTarget(e.target.value)}
            className="w-24 px-2 py-1 text-xs border rounded-lg"
          />
          <input
            placeholder="SL ₹"
            value={editSl}
            onChange={(e) => setEditSl(e.target.value)}
            className="w-24 px-2 py-1 text-xs border rounded-lg"
          />
          <button onClick={onSave} className="text-xs font-medium text-emerald-600">Save</button>
          <button onClick={onCancelEdit} className="text-xs text-slate-500">Cancel</button>
        </div>
      ) : (
        <div className="flex gap-3">
          <button onClick={onEdit} className="text-xs font-medium text-slate-600 hover:underline">Set target / SL</button>
          <button onClick={onClose} className="text-xs font-medium text-slate-600 hover:underline">Close trade</button>
        </div>
      )}
    </div>
  );
}
