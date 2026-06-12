"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Briefcase,
  RefreshCw,
  AlertCircle,
  LayoutDashboard,
  BookOpen,
  Building2,
  Zap,
} from "lucide-react";
import type { SignalSource } from "@/lib/stocks/types";
import {
  PORTFOLIO_TRACKING_START_LABEL,
  computePortfolioSummary,
  filterTradesForTracking,
  fmtInr,
  formatDisplayDate,
  type TradeForAnalytics,
} from "@/lib/stocks/portfolio-analytics";
import { CloseTradeSheet } from "./close-trade-sheet";
import { PortfolioOverview } from "./portfolio-overview";
import { PnlBadge, StrategyBadge } from "../strategy-badge";

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
  realizedPnlPct?: number;
  livePrice?: number;
}

type Tab = "overview" | "trades" | "holdings" | "positions";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "overview", label: "Overview", icon: <LayoutDashboard size={14} /> },
  { id: "trades", label: "Logged Trades", icon: <BookOpen size={14} /> },
  { id: "holdings", label: "Inventory", icon: <Building2 size={14} /> },
  { id: "positions", label: "Positions", icon: <Zap size={14} /> },
];

function normalizeTab(raw: string | null): Tab {
  if (raw === "logged") return "trades";
  if (raw === "trades" || raw === "holdings" || raw === "positions" || raw === "overview") {
    return raw;
  }
  return "overview";
}

function fmt(n: number, decimals = 0) {
  return fmtInr(n, decimals);
}

function pnlClass(n: number) {
  return n >= 0 ? "text-[#bcdb3e]" : "text-[#f06352]";
}

export function PortfolioPage() {
  const params = useSearchParams();
  const router = useRouter();
  const tab = normalizeTab(params.get("tab"));

  const [holdings, setHoldings] = useState<KiteHolding[]>([]);
  const [positions, setPositions] = useState<KitePosition[]>([]);
  const [trades, setTrades] = useState<UserTrade[]>([]);
  const [kiteClosedTrades, setKiteClosedTrades] = useState<TradeForAnalytics[]>([]);
  const [kiteRealizedPnl, setKiteRealizedPnl] = useState<number | null>(null);
  const [kiteError, setKiteError] = useState<string | null>(null);
  const [kiteConnected, setKiteConnected] = useState(false);
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
        setKiteConnected(true);
        const pnlRes = await fetch("/api/kite/portfolio-summary");
        if (pnlRes.ok) {
          const pnlData = await pnlRes.json();
          setKiteClosedTrades(pnlData.trades ?? []);
          setKiteRealizedPnl(pnlData.summary?.realizedPnl ?? 0);
        } else {
          setKiteClosedTrades([]);
          setKiteRealizedPnl(null);
        }
      } else if (holdRes.status === 401) {
        const d = await holdRes.json();
        setKiteError(d.error || "Connect Kite in Settings");
        setHoldings([]);
        setKiteConnected(false);
        setKiteClosedTrades([]);
        setKiteRealizedPnl(null);
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

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function setTabAndUrl(t: Tab) {
    const next = new URLSearchParams(params.toString());
    if (t === "overview") next.delete("tab");
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

  const trackedTrades = useMemo(() => filterTradesForTracking(trades), [trades]);
  const summary = useMemo(() => computePortfolioSummary(trackedTrades), [trackedTrades]);
  const realizedPnl = kiteConnected && kiteRealizedPnl != null ? kiteRealizedPnl : summary.realizedPnl;

  const openTrades = trades.filter((t) => t.status === "open");
  const closedTrades = trades.filter((t) => t.status === "closed");
  const holdingsPnl = holdings.reduce((s, h) => s + (h.pnl ?? 0), 0);
  const positionsPnl = positions.reduce((s, p) => s + (p.pnl ?? 0), 0);

  const tabCounts: Record<Tab, number | null> = {
    overview: null,
    trades: trades.length,
    holdings: holdings.length,
    positions: positions.length,
  };

  return (
    <div className="min-h-full">
      {/* Header */}
      <div className="bg-[#11161f]/95 backdrop-blur-xl border-b border-[#2a3344]">
        <div className="px-4 md:px-6 py-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#2b1c08] to-[#120c04] border border-[#6b4c16] flex items-center justify-center shrink-0">
                <Briefcase size={20} className="text-[var(--dota-gold)]" />
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="cz text-xl font-black leading-tight">Ranked</h1>
                  <span
                    className="badge-aegis cz text-[9px] font-black px-2 py-0.5 rounded"
                    style={{ letterSpacing: "0.14em" }}
                  >
                    Real Gold
                  </span>
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-[var(--dota-border)] bg-black/30 text-[var(--dota-dim)]">
                    Since {PORTFOLIO_TRACKING_START_LABEL}
                  </span>
                </div>
                <p className="text-xs text-[var(--dota-dim)]">
                  Real money — not Demo Mode · Buy via Kite · P&L from holdings + closed Kite trades
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={fetchData}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-[#574212] bg-[rgba(255,216,77,0.06)] text-[var(--dota-gold)] text-xs font-semibold hover:bg-[rgba(255,216,77,0.12)] transition-colors disabled:opacity-50"
            >
              <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
              Refresh
            </button>
          </div>

          {!loading && tab === "overview" && (holdings.length > 0 || trackedTrades.length > 0) && (
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/30 border border-[var(--dota-border)] text-[11px] font-medium text-[var(--dota-dim)]">
                Unrealized{" "}
                <span className={`font-bold tabular-nums ${pnlClass(kiteConnected ? holdingsPnl : summary.unrealizedPnl)}`}>
                  {(kiteConnected ? holdingsPnl : summary.unrealizedPnl) >= 0 ? "+" : "−"}₹
                  {fmt(Math.abs(kiteConnected ? holdingsPnl : summary.unrealizedPnl))}
                </span>
              </span>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/30 border border-[var(--dota-border)] text-[11px] font-medium text-[var(--dota-dim)]">
                Realized{" "}
                <span className={`font-bold tabular-nums ${pnlClass(realizedPnl)}`}>
                  {realizedPnl >= 0 ? "+" : "−"}₹{fmt(Math.abs(realizedPnl))}
                </span>
              </span>
            </div>
          )}

          {kiteError && (tab === "holdings" || tab === "positions") && (
            <div className="mt-3 flex items-center gap-2 text-xs text-[var(--dota-gold)] bg-[rgba(255,216,77,0.05)] border border-[#574212] rounded-xl px-3 py-2.5">
              <AlertCircle size={14} className="shrink-0" />
              <span>{kiteError} — </span>
              <Link href="/stocks/settings" className="font-semibold underline">
                Connect in Settings
              </Link>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="px-4 md:px-6 flex gap-1 overflow-x-auto pb-0 border-t border-[#2a3344] pt-2">
          {TABS.map(({ id, label, icon }) => {
            const count = tabCounts[id];
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTabAndUrl(id)}
                className={`flex items-center gap-1.5 px-4 py-2.5 rounded-t-xl text-xs font-semibold whitespace-nowrap border-b-2 transition-colors ${
                  active
                    ? "border-[var(--dota-gold)] text-[var(--dota-gold)] bg-[rgba(255,216,77,0.06)]"
                    : "border-transparent text-[var(--dota-dim)] hover:text-[var(--dota-text)] hover:bg-white/[0.03]"
                }`}
              >
                {icon}
                {label}
                {count != null && count > 0 && (
                  <span
                    className={`ml-0.5 px-1.5 py-0.5 rounded-md text-[10px] ${
                      active
                        ? "bg-[rgba(255,216,77,0.15)] text-[var(--dota-gold)]"
                        : "bg-white/[0.06] text-[var(--dota-dim)]"
                    }`}
                  >
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="px-4 md:px-6 py-5">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-9 h-9 border-2 border-[#574212] border-t-[var(--dota-gold)] rounded-full animate-spin" />
            <p className="cz text-[10px] !text-[var(--dota-dim)]">Counting the gold…</p>
          </div>
        ) : (
          <>
            {tab === "overview" && (
              <PortfolioOverview
                trades={trades}
                kiteClosedTrades={kiteClosedTrades}
                holdings={holdings}
                kiteConnected={kiteConnected}
              />
            )}

            {tab === "holdings" && (
              <>
                {holdings.length > 0 && (
                  <div className="mb-4 flex items-center justify-between px-4 py-3 rounded-xl dota-panel">
                    <span className="cz text-[10px] font-bold !text-[var(--dota-dim)]">Inventory P&L</span>
                    <span className={`text-sm font-bold tabular-nums ${pnlClass(holdingsPnl)}`}>
                      {holdingsPnl >= 0 ? "+" : "−"}₹{fmt(Math.abs(holdingsPnl))}
                    </span>
                  </div>
                )}
                {holdings.length === 0 && !kiteError && (
                  <EmptyState message="No holdings in your Kite account." />
                )}
                <div className="space-y-3">
                  {holdings.map((h) => {
                    const pnlPct = h.average_price
                      ? ((h.last_price - h.average_price) / h.average_price) * 100
                      : 0;
                    const invested = h.quantity * h.average_price;
                    return (
                      <div
                        key={`${h.exchange}-${h.tradingsymbol}`}
                        className="dota-panel rounded-xl p-4 hover:border-[#4a5468] transition-colors anim-rise"
                      >
                        <div className="flex justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-bold text-[var(--dota-head)]">{h.tradingsymbol}</p>
                            <p className="text-xs text-[var(--dota-dim)] mt-0.5">
                              {h.quantity} qty · avg ₹{fmt(h.average_price, 2)}
                            </p>
                            <p className="text-[10px] text-[var(--dota-dim)] mt-1">
                              Invested <span className="font-semibold text-[var(--dota-gold)]">₹{fmt(invested)}</span>{" "}
                              · LTP ₹{fmt(h.last_price, 2)}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <PnlBadge value={h.pnl} unit="inr" />
                            <p className={`text-[10px] font-semibold mt-1 ${pnlClass(pnlPct)}`}>
                              {pnlPct >= 0 ? "+" : ""}
                              {pnlPct.toFixed(2)}%
                            </p>
                            <p className="text-[10px] text-[var(--dota-dim)] mt-0.5">
                              Day {h.day_change_percentage?.toFixed(2) ?? 0}%
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            )}

            {tab === "positions" && (
              <>
                {positions.length > 0 && (
                  <div className="mb-4 flex items-center justify-between px-4 py-3 rounded-xl dota-panel">
                    <span className="cz text-[10px] font-bold !text-[var(--dota-dim)]">Intraday P&L</span>
                    <span className={`text-sm font-bold tabular-nums ${pnlClass(positionsPnl)}`}>
                      {positionsPnl >= 0 ? "+" : "−"}₹{fmt(Math.abs(positionsPnl))}
                    </span>
                  </div>
                )}
                {positions.length === 0 && !kiteError && (
                  <EmptyState message="No open intraday positions." />
                )}
                <div className="space-y-3">
                  {positions.map((p) => (
                    <div
                      key={`${p.exchange}-${p.tradingsymbol}-${p.product}`}
                      className="dota-panel rounded-xl p-4 anim-rise"
                    >
                      <div className="flex justify-between gap-3">
                        <div>
                          <p className="font-bold text-[var(--dota-head)]">{p.tradingsymbol}</p>
                          <p className="text-xs text-[var(--dota-dim)] mt-0.5">
                            {p.product} · {p.quantity} qty · LTP ₹{fmt(p.last_price, 2)}
                          </p>
                        </div>
                        <div className="text-right">
                          <PnlBadge value={p.pnl} unit="inr" />
                          <p className="text-[10px] text-[var(--dota-dim)] mt-1">M2M ₹{fmt(p.m2m ?? 0)}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            {tab === "trades" && (
              <>
                {trades.length === 0 && (
                  <EmptyState
                    message="Optional manual log — most trades come from buying on signals via Kite. Use this only if you want a separate paper trail."
                    href="/stocks"
                    linkLabel="Go to signals"
                  />
                )}

                {openTrades.length > 0 && (
                  <section className="mb-6">
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="cz text-[11px] font-bold !text-[var(--dota-radiant-bright)]">
                        Open · {openTrades.length}
                      </h2>
                      <p className={`text-xs font-semibold tabular-nums ${pnlClass(summary.unrealizedPnl)}`}>
                        Unrealized {summary.unrealizedPnl >= 0 ? "+" : "−"}₹
                        {fmt(Math.abs(summary.unrealizedPnl))}
                      </p>
                    </div>
                    <div className="space-y-3">
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
                    </div>
                  </section>
                )}

                {closedTrades.length > 0 && (
                  <section>
                    <div className="flex items-center justify-between mb-3">
                      <h2 className="cz text-[11px] font-bold !text-[var(--dota-dim)]">
                        Closed · {closedTrades.length}
                      </h2>
                      <p className={`text-xs font-semibold tabular-nums ${pnlClass(summary.realizedPnl)}`}>
                        Realized {summary.realizedPnl >= 0 ? "+" : "−"}₹
                        {fmt(Math.abs(summary.realizedPnl))}
                      </p>
                    </div>
                    <div className="space-y-3">
                      {[...closedTrades]
                        .sort((a, b) => (b.exitDate ?? "").localeCompare(a.exitDate ?? ""))
                        .map((t) => (
                          <ClosedTradeCard key={t._id} trade={t} />
                        ))}
                    </div>
                  </section>
                )}
              </>
            )}
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

function EmptyState({
  message,
  href,
  linkLabel,
}: {
  message: string;
  href?: string;
  linkLabel?: string;
}) {
  return (
    <div className="text-center py-16 dota-panel rounded-xl">
      <Briefcase size={40} className="mx-auto text-[#6b4c16] mb-4" />
      <p className="text-sm text-[var(--dota-dim)] mb-4 max-w-xs mx-auto">{message}</p>
      {href && linkLabel && (
        <Link href={href} className="text-sm font-semibold text-[var(--dota-gold)] hover:underline">
          {linkLabel} →
        </Link>
      )}
    </div>
  );
}

function ClosedTradeCard({ trade: t }: { trade: UserTrade }) {
  const pnl = t.realizedPnl ?? 0;
  const pnlPct = t.realizedPnlPct ?? 0;
  const holdDays =
    t.exitDate && t.entryDate
      ? Math.max(
          1,
          Math.round(
            (new Date(t.exitDate).getTime() - new Date(t.entryDate).getTime()) / 86_400_000
          )
        )
      : null;

  return (
    <div className="dota-panel rounded-xl p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-[var(--dota-head)]">{t.ticker}</span>
            <StrategyBadge source={t.source as SignalSource} />
          </div>
          <p className="text-xs text-[var(--dota-dim)] mt-1">
            {t.quantity} × ₹{fmt(t.entryPrice, 2)} → ₹{fmt(t.exitPrice ?? 0, 2)}
          </p>
          <p className="text-[10px] text-[var(--dota-dim)] mt-1">
            {formatDisplayDate(t.entryDate)} → {t.exitDate ? formatDisplayDate(t.exitDate) : "—"}
            {holdDays != null && ` · ${holdDays}d hold`}
          </p>
        </div>
        <div className="text-right shrink-0">
          <PnlBadge value={pnl} unit="inr" />
          <p className={`text-[10px] font-semibold mt-1 ${pnlClass(pnlPct)}`}>
            {pnlPct >= 0 ? "+" : ""}
            {pnlPct.toFixed(2)}%
          </p>
        </div>
      </div>
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
  const pnlPct = t.unrealizedPnlPct ?? 0;
  const invested = t.invested ?? t.quantity * t.entryPrice;

  return (
    <div className="dota-panel rounded-xl p-4 border-l-4 border-l-[#bcdb3e]">
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-bold text-[var(--dota-head)]">{t.ticker}</span>
            <StrategyBadge source={t.source as SignalSource} />
            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full border border-[#4a5621] bg-[rgba(176,210,50,0.12)] text-[#bcdb3e]">
              Open
            </span>
          </div>
          <p className="text-xs text-[var(--dota-dim)] mt-1">
            {t.quantity} × ₹{fmt(t.entryPrice, 2)} · {formatDisplayDate(t.entryDate)}
          </p>
          <p className="text-[10px] text-[var(--dota-dim)] mt-0.5">
            Invested <span className="font-semibold text-[var(--dota-gold)]">₹{fmt(invested)}</span>
            {t.livePrice != null && ` · LTP ₹${fmt(t.livePrice, 2)}`}
          </p>
          {(t.target != null || t.stopLoss != null) && !editing && (
            <p className="text-[10px] text-[var(--dota-dim)] mt-1">
              Target ₹{t.target ?? "—"} · SL ₹{t.stopLoss ?? "—"}
            </p>
          )}
        </div>
        <div className="text-right shrink-0">
          {t.unrealizedPnl != null ? (
            <>
              <PnlBadge value={pnl} unit="inr" />
              <p className={`text-[10px] font-semibold mt-1 ${pnlClass(pnlPct)}`}>
                {pnlPct >= 0 ? "+" : ""}
                {pnlPct.toFixed(2)}%
              </p>
            </>
          ) : (
            <span className="text-xs text-[var(--dota-dim)]">Price unavailable</span>
          )}
        </div>
      </div>
      {editing ? (
        <div className="flex flex-wrap gap-2 items-end mt-3 pt-3 border-t border-[#2a3344]">
          <input
            placeholder="Target ₹"
            value={editTarget}
            onChange={(e) => setEditTarget(e.target.value)}
            className="w-28 px-3 py-2 text-xs rounded-lg border border-[var(--dota-border)] bg-black/30 text-[var(--dota-head)] placeholder:text-[var(--dota-dim)] focus:outline-none focus:ring-2 focus:ring-[rgba(255,216,77,0.2)] [color-scheme:dark]"
          />
          <input
            placeholder="SL ₹"
            value={editSl}
            onChange={(e) => setEditSl(e.target.value)}
            className="w-28 px-3 py-2 text-xs rounded-lg border border-[var(--dota-border)] bg-black/30 text-[var(--dota-head)] placeholder:text-[var(--dota-dim)] focus:outline-none focus:ring-2 focus:ring-[rgba(255,216,77,0.2)] [color-scheme:dark]"
          />
          <button
            type="button"
            onClick={onSave}
            className="btn-pick px-3 py-2 text-xs font-semibold rounded-lg"
          >
            Save
          </button>
          <button
            type="button"
            onClick={onCancelEdit}
            className="px-3 py-2 text-xs text-[var(--dota-dim)] hover:text-[var(--dota-text)]"
          >
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex gap-2 mt-3 pt-3 border-t border-[#2a3344]">
          <button
            type="button"
            onClick={onEdit}
            className="px-3 py-1.5 text-xs font-semibold text-[var(--dota-text)] border border-[var(--dota-border)] bg-white/[0.04] rounded-lg hover:bg-white/[0.08]"
          >
            Target / SL
          </button>
          <button
            type="button"
            onClick={onClose}
            className="btn-gg px-3 py-1.5 text-xs font-semibold rounded-lg"
          >
            Close trade
          </button>
        </div>
      )}
    </div>
  );
}
