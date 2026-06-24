"use client";

import { useState } from "react";
import Link from "next/link";
import { Info } from "lucide-react";
import type { UnifiedSignal } from "@/lib/stocks/types";
import { sourceToStrategyKey } from "@/lib/stocks/types";
import { HERO_META, tierOf, exitReasonCopy } from "@/lib/stocks/heroes";
import { StrategyInfoDrawer, type StrategyKey } from "./strategy-info-drawer";
import { LogBuySheet } from "../log-buy-sheet";
import { StrategyBadge, PnlBadge } from "../strategy-badge";
import { HeroPortrait, HeroBanner } from "../hero-portrait";
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
  const hero = HERO_META[signal.source];
  const strategyKey = sourceToStrategyKey(signal.source);

  // ── Closed card (match result) ──────────────────────────────
  if (signal.status === "closed") {
    const pnl = signal.realizedPnlPct;
    return (
      <div className="rounded-xl overflow-hidden dota-panel flex">
        <div className="w-[3px] shrink-0" style={{ backgroundColor: hero.accent }} />
        <div className="flex-1 p-3">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <HeroPortrait source={signal.source} size="md" grey />
              <div className="min-w-0">
                <span className="text-lg font-bold text-[var(--dota-head)]">{signal.ticker}</span>
                <p className="text-[11px] text-[var(--dota-dim)]">
                  {signal.exitDate ? `Closed · ${fmtDate(signal.exitDate)}` : fmtDate(signal.signalDate)}
                </p>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <StrategyBadge source={signal.source} />
              {pnl != null && <PnlBadge value={pnl} unit="pct" />}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            <StatCell label="Entry" value={fmtPrice(signal.entryPrice)} sub={fmtDate(signal.entryDate)} />
            <StatCell label="Exit" value={fmtPrice(signal.exitPrice)} sub={fmtDate(signal.exitDate)} />
          </div>
          <div className="flex items-center justify-between mt-2 text-[10px] text-[var(--dota-dim)]">
            {signal.holdDays > 0 && <span>held {signal.holdDays} days</span>}
            {signal.exitReason && <span className="italic">{exitReasonCopy(signal.exitReason)}</span>}
          </div>
        </div>
      </div>
    );
  }

  // ── Open card (hero pick) ───────────────────────────────────
  const live = currentPrice?.price ?? null;
  const entry =
    signal.entryPrice ??
    (signal.entryMin != null && signal.entryMax != null
      ? (signal.entryMin + signal.entryMax) / 2
      : signal.entryMin);
  const unrealPct = live && entry ? ((live - entry) / entry) * 100 : null;
  const rr =
    signal.target && signal.entryMin && signal.stopLoss
      ? ((signal.target - signal.entryMin) / (signal.entryMin - signal.stopLoss)).toFixed(1)
      : null;
  const hasTargetRow = signal.target != null || signal.stopLoss != null;

  const tier = tierOf(signal.signalStrength);
  // One-position cap: already holding this name → greyed, no re-buy (PRD §4.1)
  const alreadyHeld = !logged && holdingQty > 0;

  if (alreadyHeld) {
    return (
      <div className="rounded-xl overflow-hidden dota-panel flex opacity-60 grayscale-[0.4]">
        <div className="w-[3px] shrink-0" style={{ backgroundColor: hero.accent }} />
        <div className="flex-1 p-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2.5 min-w-0">
              <HeroPortrait source={signal.source} size="md" grey />
              <div className="min-w-0">
                <span className="text-lg font-bold text-[var(--dota-head)]">{signal.ticker}</span>
                <p className="text-[11px] text-[var(--dota-dim)]">
                  {fmtDate(signal.signalDate)} · signal still strong
                </p>
              </div>
            </div>
            <span className="text-[9.5px] font-bold tracking-[0.12em] uppercase px-2 py-1 rounded border border-[var(--dota-border)] bg-white/5 text-[var(--dota-dim)] shrink-0">
              Already on the map
            </span>
          </div>
          <p className="text-[10.5px] text-[var(--dota-dim)] mt-2.5">
            You hold {holdingQty} — one position per hero, no re-buy.
          </p>
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        className={`dota-card rounded-xl overflow-hidden dota-panel anim-rise ${
          tier === "divine" ? "glow-divine" : "glow-rare"
        }`}
      >
        {/* Accent crest */}
        <div
          className="h-[3px]"
          style={{
            background:
              tier === "divine"
                ? `linear-gradient(90deg, #f5ad14, ${hero.accent} 60%, transparent)`
                : `linear-gradient(90deg, ${hero.accent}, transparent)`,
          }}
        />

        {/* Hero banner header */}
        <div className="relative h-[68px] overflow-hidden border-b border-[#2a3344]">
          <HeroBanner source={signal.source} />
          <div className="relative z-10 h-full flex flex-col justify-center px-3">
            <div className="flex items-center gap-2">
              <span
                className="text-xl font-black text-[var(--dota-head)] leading-none"
                style={{ textShadow: "0 1px 6px rgba(0,0,0,0.8)" }}
              >
                {signal.ticker}
              </span>
              {live != null && (
                <span
                  className="text-sm font-semibold text-[var(--dota-text)]"
                  style={{ textShadow: "0 1px 4px rgba(0,0,0,0.8)" }}
                >
                  {fmtPrice(live)}
                </span>
              )}
              {live != null && (
                <span className="flex items-center gap-1 text-[9px] font-semibold text-[#9fd49f]">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#6fdc6f] opacity-75" />
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-[#6fdc6f]" />
                  </span>
                  LIVE
                </span>
              )}
            </div>
            <p
              className="cz text-[9.5px] font-bold truncate mt-1.5"
              style={{ color: hero.accent, letterSpacing: "0.16em", textShadow: "0 1px 4px rgba(0,0,0,0.9)" }}
            >
              {hero.name}
              {hero.dota && (
                <span className="text-[var(--dota-text)] opacity-80"> · {hero.dota}</span>
              )}
            </p>
          </div>
          <div className="absolute top-2 right-2 z-10 flex items-center gap-1">
            {strategyKey && (
              <button
                onClick={() => setDrawerOpen(true)}
                className="w-6 h-6 flex items-center justify-center rounded-md text-[var(--dota-text)] bg-black/40 hover:text-[var(--dota-head)] hover:bg-black/60 border border-white/10"
                aria-label="Hero lore & rules"
              >
                <Info size={12} />
              </button>
            )}
            <TierBadge tier={tier} />
          </div>
          <span
            className="absolute bottom-1.5 right-2.5 z-10 text-[9px] font-semibold text-[var(--dota-text)] opacity-95"
            style={{ textShadow: "0 1px 3px rgba(0,0,0,0.9)" }}
          >
            Suggested · {fmtDate(signal.signalDate)}
          </span>
        </div>

        <div className="p-3">
          {hasTargetRow ? (
            <div className="grid grid-cols-3 gap-1.5 mb-2">
              <StatCell
                label="Entry Zone"
                tone="entry"
                value={
                  signal.entryPrice != null
                    ? fmtPrice(signal.entryPrice)
                    : `${fmtPrice(signal.entryMin)}–${fmtPrice(signal.entryMax)}`
                }
              />
              <StatCell label="Target" tone="target" value={fmtPrice(signal.target)} />
              <StatCell label="🗼 Tower SL" tone="tower" value={fmtPrice(signal.stopLoss)} />
            </div>
          ) : null}

          <div className="grid grid-cols-3 gap-1.5 mb-2">
            <StatCell label={live != null ? "Current" : "At signal"} value={fmtPrice(live ?? signal.cmp)} />
            <StatCell
              label="Gold · P&L"
              tone={unrealPct == null ? "neutral" : unrealPct >= 0 ? "good" : "bad"}
              value={unrealPct != null ? `${unrealPct >= 0 ? "+" : ""}${unrealPct.toFixed(2)}%` : "—"}
              sub={unrealPct != null ? "since signal" : undefined}
            />
            <StatCell label="R:R" value={rr ? `1:${rr}` : "—"} />
          </div>

          {(signal.volumeRatio != null || signal.rsi != null || signal.proba != null) && (
            <div className="flex items-center gap-1.5 flex-wrap mb-2">
              {signal.volumeRatio != null && (
                <Rune glyph="⚡" label={`Haste ×${signal.volumeRatio}`} color="#ecd060" />
              )}
              {signal.rsi != null && (
                <Rune
                  glyph={signal.rsi >= 65 ? "🔥" : signal.rsi <= 35 ? "❄" : "✦"}
                  label={`RSI ${signal.rsi}`}
                  color={signal.rsi >= 65 ? "#f08060" : signal.rsi <= 35 ? "#7fb8e8" : "#8e98ad"}
                />
              )}
              {signal.proba != null && (
                <Rune glyph="⚜" label={`Conviction ${Math.round(signal.proba * 100)}%`} color="#ffd84d" />
              )}
            </div>
          )}

          {(signal.entryZ != null || signal.peerSlopePct != null) && (
            <div className="flex gap-3 text-[10px] text-[var(--dota-dim)] mb-2">
              {signal.entryZ != null && <span>Z: {signal.entryZ.toFixed(2)}</span>}
              {signal.peerSlopePct != null && (
                <span>
                  Peer slope: {signal.peerSlopePct >= 0 ? "+" : ""}
                  {signal.peerSlopePct.toFixed(1)}%
                </span>
              )}
            </div>
          )}

          {hasTargetRow && (
            <p className="text-[10px] text-[var(--dota-dim)] mb-2 leading-snug">
              Exit: nightly scan — target hit, stop loss, or max hold. Retreat banner when it&apos;s time to sell.
            </p>
          )}

          <div className="pt-2 border-t border-[#2a3344] space-y-2">
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
                <span className="text-xs font-semibold text-[#bcdb3e]">✓ On the map</span>
                <Link href="/stocks/portfolio" className="text-xs text-[#bcdb3e] hover:underline">
                  Ranked →
                </Link>
              </div>
            ) : kiteConnected ? (
              <button
                onClick={() => setLogOpen(true)}
                className="w-full py-1.5 text-xs font-medium text-[var(--dota-dim)] hover:text-[var(--dota-gold)]"
              >
                Scout — log buy manually
              </button>
            ) : (
              <button
                onClick={() => setLogOpen(true)}
                className="cz w-full py-2 rounded-lg btn-gold text-[11px] font-bold transition-colors"
              >
                ⚔ Scout · Log Buy
              </button>
            )}
          </div>
        </div>
      </div>

      {strategyKey && (
        <StrategyInfoDrawer
          strategy={strategyKey as StrategyKey}
          open={drawerOpen}
          onClose={() => setDrawerOpen(false)}
        />
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

function TierBadge({ tier }: { tier: "divine" | "rare" }) {
  if (tier === "divine") {
    return (
      <span className="cz text-[8.5px] font-black tracking-[0.18em] px-2 py-0.5 rounded border border-[#8f6408] bg-[rgba(245,173,20,0.1)] !text-[#ffcf66]">
        Divine
      </span>
    );
  }
  return (
    <span className="cz text-[8.5px] font-black tracking-[0.18em] px-2 py-0.5 rounded border border-[#34509a] bg-[rgba(76,126,255,0.1)] !text-[#9ab4ff]">
      Rare
    </span>
  );
}

/** Buff rune — Dota aura-style chip for signal modifiers (Vol / RSI / model conviction) */
function Rune({ glyph, label, color }: { glyph: string; label: string; color: string }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 text-[10px] font-semibold pl-1 pr-2 py-0.5 rounded-full border bg-black/30"
      style={{ borderColor: `${color}4d`, color }}
    >
      <span
        className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] border bg-black/50"
        style={{ borderColor: `${color}66`, boxShadow: `0 0 6px ${color}40` }}
        aria-hidden
      >
        {glyph}
      </span>
      {label}
    </span>
  );
}

type StatTone = "neutral" | "entry" | "target" | "tower" | "good" | "bad";

const TONE_STYLES: Record<StatTone, { box?: React.CSSProperties; label: string; value?: string }> = {
  neutral: { label: "text-[var(--dota-dim)]" },
  entry: {
    box: { borderColor: "#574212", background: "rgba(255,216,77,0.06)" },
    label: "text-[#d9b96a]",
  },
  target: {
    box: { borderColor: "#46571f", background: "rgba(176,210,50,0.08)" },
    label: "text-[#9cc868]",
    value: "text-[#cfe87a]",
  },
  tower: {
    box: { borderColor: "#5e2a1f", background: "rgba(212,69,49,0.08)" },
    label: "text-[#e89080]",
    value: "text-[#ffb4a6]",
  },
  good: {
    box: { borderColor: "#46571f", background: "rgba(176,210,50,0.08)" },
    label: "text-[#9cc868]",
    value: "text-[#bcdb3e]",
  },
  bad: {
    box: { borderColor: "#5e2a1f", background: "rgba(212,69,49,0.08)" },
    label: "text-[#e89080]",
    value: "text-[#f06352]",
  },
};

function StatCell({
  label,
  value,
  sub,
  tone = "neutral",
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: StatTone;
}) {
  const t = TONE_STYLES[tone];
  return (
    <div className="dota-stat rounded-md px-2 py-1.5 text-center" style={t.box}>
      <p className={`text-[9px] uppercase tracking-[0.12em] ${t.label}`}>{label}</p>
      <p className={`text-[13px] font-semibold ${t.value ?? "text-[var(--dota-head)]"}`}>{value}</p>
      {sub && <p className="text-[10px] text-[var(--dota-dim)]">{sub}</p>}
    </div>
  );
}
