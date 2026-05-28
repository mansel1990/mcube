"use client";

import { useState } from "react";
import Link from "next/link";
import { Info } from "lucide-react";
import type { UnifiedSignal } from "@/lib/stocks/types";
import { SOURCE_META, sourceToStrategyKey } from "@/lib/stocks/types";
import { StrategyInfoDrawer, type StrategyKey } from "./strategy-info-drawer";
import { LogBuySheet } from "../log-buy-sheet";
import { StrategyBadge, PnlBadge } from "../strategy-badge";
import { KiteTradeActions } from "./kite-trade-actions";
import type { PlacedOrder } from "../kite-order-toast";

type CurrentPrice = { price: number; change: number; changePct: number } | null;

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d + "T12:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function fmtPrice(n: number | null) {
  if (n == null) return "—";
  return "₹" + n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

interface Props {
  signal: UnifiedSignal;
  currentPrice?: CurrentPrice;
  logged?: boolean;
  onLogged?: () => void;
  kiteConnected?: boolean;
  holdingQty?: number;
  defaultTradeAmount?: number;
  onOrderPlaced?: (order: PlacedOrder) => void;
}

export function UnifiedSignalCard({
  signal,
  currentPrice,
  logged,
  onLogged,
  kiteConnected,
  holdingQty = 0,
  defaultTradeAmount = 10000,
  onOrderPlaced,
}: Props) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [logOpen, setLogOpen] = useState(false);
  const meta = SOURCE_META[signal.source];
  const strategyKey = sourceToStrategyKey(signal.source);

  if (signal.status === "closed") {
    const pnl = signal.realizedPnlPct;
    return (
      <div className="rounded-xl overflow-hidden bg-white border border-slate-200 flex">
        <div className={`w-[3px] shrink-0 ${meta.stripe}`} />
        <div className="flex-1 p-3">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div>
              <span className="text-lg font-bold text-slate-900">{signal.ticker}</span>
              <p className="text-[11px] text-slate-400">{fmtDate(signal.signalDate)}</p>
            </div>
            <div className="flex items-center gap-1.5">
              <StrategyBadge source={signal.source} />
              {pnl != null && <PnlBadge value={pnl} unit="pct" />}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-px bg-slate-100 rounded-lg overflow-hidden">
            <StatCell label="Entry" value={fmtPrice(signal.entryPrice)} sub={fmtDate(signal.entryDate)} />
            <StatCell label="Exit" value={fmtPrice(signal.exitPrice)} sub={fmtDate(signal.exitDate)} />
          </div>
          <div className="flex items-center justify-between mt-2 text-[10px] text-slate-400">
            {signal.holdDays > 0 && <span>{signal.holdDays}d held</span>}
            {signal.exitReason && <span>{signal.exitReason}</span>}
          </div>
        </div>
      </div>
    );
  }

  const live = currentPrice?.price ?? null;
  const entry = signal.entryPrice ?? (signal.entryMin != null && signal.entryMax != null
    ? (signal.entryMin + signal.entryMax) / 2
    : signal.entryMin);
  const unrealPct = live && entry ? ((live - entry) / entry) * 100 : null;
  const rr = signal.target && signal.entryMin && signal.stopLoss
    ? ((signal.target - signal.entryMin) / (signal.entryMin - signal.stopLoss)).toFixed(1)
    : null;
  const hasTargetRow = signal.target != null || signal.stopLoss != null;

  return (
    <>
      <div className="rounded-xl overflow-hidden bg-white border border-slate-200 hover:shadow-md transition-shadow flex">
        <div className={`w-[3px] shrink-0 ${meta.stripe}`} />
        <div className="flex-1 p-3">
          <div className="flex items-start justify-between gap-2 mb-2">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-lg font-bold text-slate-900">{signal.ticker}</span>
                {live != null && (
                  <span className="text-sm font-semibold text-slate-700">{fmtPrice(live)}</span>
                )}
              </div>
              <p className="text-[11px] text-slate-400">{fmtDate(signal.signalDate)}</p>
            </div>
            <div className="flex items-center gap-1">
              <StrategyBadge source={signal.source} />
              {strategyKey && (
                <button
                  onClick={() => setDrawerOpen(true)}
                  className="w-6 h-6 flex items-center justify-center rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                  aria-label="Strategy info"
                >
                  <Info size={13} />
                </button>
              )}
              {live != null && (
                <span className="flex items-center gap-1 text-[10px] font-semibold text-blue-600">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-blue-500" />
                  </span>
                  LIVE
                </span>
              )}
            </div>
          </div>

          {hasTargetRow ? (
            <div className="grid grid-cols-3 gap-px bg-slate-100 rounded-lg overflow-hidden mb-2">
              <StatCell
                label="Entry"
                value={signal.entryPrice != null ? fmtPrice(signal.entryPrice) : `${fmtPrice(signal.entryMin)}–${fmtPrice(signal.entryMax)}`}
              />
              <StatCell label="Target" value={fmtPrice(signal.target)} />
              <StatCell label="Stop Loss" value={fmtPrice(signal.stopLoss)} />
            </div>
          ) : null}

          <div className="grid grid-cols-3 gap-px bg-slate-100 rounded-lg overflow-hidden mb-2">
            <StatCell label={live != null ? "Current" : "At signal"} value={fmtPrice(live ?? signal.cmp)} />
            <StatCell
              label="Unreal. P&L"
              value={unrealPct != null ? `${unrealPct >= 0 ? "+" : ""}${unrealPct.toFixed(2)}%` : "—"}
              valueClass={unrealPct != null ? (unrealPct >= 0 ? "text-emerald-600" : "text-red-600") : undefined}
            />
            <StatCell label="R:R" value={rr ? `1:${rr}` : "—"} />
          </div>

          {(signal.volumeRatio != null || signal.rsi != null) && (
            <div className="flex items-center gap-2 mb-2">
              {signal.volumeRatio != null && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                  Vol {signal.volumeRatio}x
                </span>
              )}
              {signal.rsi != null && (
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                  RSI {signal.rsi}
                </span>
              )}
            </div>
          )}

          {(signal.entryZ != null || signal.peerSlopePct != null) && (
            <div className="flex gap-3 text-[10px] text-slate-500 mb-2">
              {signal.entryZ != null && <span>Z: {signal.entryZ.toFixed(2)}</span>}
              {signal.peerSlopePct != null && (
                <span>Peer slope: {signal.peerSlopePct >= 0 ? "+" : ""}{signal.peerSlopePct.toFixed(1)}%</span>
              )}
            </div>
          )}

          <div className="pt-2 border-t border-slate-100 space-y-2">
            {kiteConnected && onOrderPlaced && (
              <KiteTradeActions
                ticker={signal.ticker}
                ltp={live}
                holdingQty={holdingQty}
                defaultTradeAmount={defaultTradeAmount}
                signalRef={signal.id}
                strategy={signal.source}
                targetPrice={signal.target}
                stopLoss={signal.stopLoss}
                onOrderPlaced={onOrderPlaced}
              />
            )}
            {logged ? (
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-emerald-700">✓ In portfolio</span>
                <Link href="/stocks/portfolio" className="text-xs text-emerald-600 hover:underline">View →</Link>
              </div>
            ) : kiteConnected ? (
              <button
                onClick={() => setLogOpen(true)}
                className="w-full py-1.5 text-xs font-medium text-slate-500 hover:text-slate-700"
              >
                Log buy manually
              </button>
            ) : (
              <button
                onClick={() => setLogOpen(true)}
                className="w-full py-2 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 transition-colors"
              >
                Log buy
              </button>
            )}
          </div>
        </div>
      </div>

      {strategyKey && (
        <StrategyInfoDrawer strategy={strategyKey as StrategyKey} open={drawerOpen} onClose={() => setDrawerOpen(false)} />
      )}

      <LogBuySheet
        signal={signal}
        open={logOpen}
        onClose={() => setLogOpen(false)}
        onSuccess={() => onLogged?.()}
      />
    </>
  );
}

function StatCell({
  label,
  value,
  sub,
  valueClass,
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
}) {
  return (
    <div className="bg-white px-2 py-2 text-center">
      <p className="text-[10px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className={`text-sm font-semibold text-slate-900 ${valueClass ?? ""}`}>{value}</p>
      {sub && <p className="text-[10px] text-slate-400">{sub}</p>}
    </div>
  );
}
