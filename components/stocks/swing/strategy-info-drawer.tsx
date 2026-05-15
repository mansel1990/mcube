"use client";

import { X } from "lucide-react";
import { useEffect } from "react";

export type StrategyKey = "breakout" | "ema" | "vcp" | "rs" | "mr" | "fib";

interface Filter {
  label: string;
  desc: string;
}

interface StrategyInfo {
  title: string;
  tagline: string;
  accentClass: string;   // Tailwind text color
  bgClass: string;       // Tailwind bg for icon strip
  market: string;        // best market regime
  riskProfile: string;   // "Low / Med / High"
  holdDays: string;      // typical hold
  targetPct: string;     // typical target %
  filters: Filter[];
  exitLogic: string;
  tip: string;
}

const STRATEGY_INFO: Record<StrategyKey, StrategyInfo> = {
  breakout: {
    title: "Consolidation Breakout",
    tagline: "Stocks coiling below resistance, ready to explode on volume.",
    accentClass: "text-violet-700",
    bgClass: "bg-violet-50",
    market: "Trending / Bull",
    riskProfile: "Medium",
    holdDays: "3 – 7 days",
    targetPct: "+5%",
    filters: [
      { label: "Tight consolidation < 5%", desc: "High–low range over 10 days must be narrow — supply and demand are balanced, waiting for a catalyst." },
      { label: "Volume > 1.5× average", desc: "Volume must spike today. Big money is stepping in. Low-volume breakouts fail 80% of the time." },
      { label: "RSI 50 – 68", desc: "Momentum is healthy but not overbought. RSI < 50 means the trend isn't established. RSI > 68 means it's already extended." },
      { label: "Price within 2% of 10-day high", desc: "Entry must be close to the resistance level. Chasing after a big gap-up reduces your R:R." },
    ],
    exitLogic: "Enter at / just above the breakout level. Stop loss 2.5% below entry. Target +5%.",
    tip: "Best entries are within the first 30 minutes after market open on breakout day, when volume is confirming.",
  },
  ema: {
    title: "EMA Pullback",
    tagline: "Buy the dip in an uptrend — institutions add at the 20 EMA.",
    accentClass: "text-emerald-700",
    bgClass: "bg-emerald-50",
    market: "Trending / Bull",
    riskProfile: "Low – Medium",
    holdDays: "3 – 7 days",
    targetPct: "+4%",
    filters: [
      { label: "20 EMA > 50 EMA", desc: "The stock must be in an uptrend. When the fast EMA is above the slow EMA, the trend is intact." },
      { label: "Price touched 20 EMA (last 3 days)", desc: "The pullback must have reached the 20 EMA recently — that's the support we're buying." },
      { label: "Today's close above 20 EMA", desc: "The stock must bounce off the EMA, not continue falling through it. The bounce is the signal." },
      { label: "Price within 15% of 50 EMA", desc: "Not overextended. If price has run far above the slow EMA, the pullback we're buying isn't really a pullback — it's still extended." },
      { label: "RSI 40 – 62", desc: "RSI pulled back (not overbought) but trend isn't broken (not oversold). Sweet spot for mean reversion in an uptrend." },
    ],
    exitLogic: "Enter at today's close. Stop is the tighter of (2% below 20 EMA) or (3% below entry) — guarantees R:R ≥ 1:1.33. Target +4% from entry.",
    tip: "Strong signals are bounces where the 20 EMA is rising AND today's volume is at least 1.2× the 20-day average — institutions stepping back in.",
  },
  vcp: {
    title: "Volatility Contraction Pattern (VCP)",
    tagline: "Mark Minervini's setup — tightening contractions before a explosive move.",
    accentClass: "text-purple-700",
    bgClass: "bg-purple-50",
    market: "Any — but strongest in early bull runs",
    riskProfile: "Low (tight stop)",
    holdDays: "5 – 20 days",
    targetPct: "+8%",
    filters: [
      { label: "Stage 2 uptrend", desc: "Price > 50 EMA > 150 EMA > 200 EMA. This means the stock is in a proper institutional uptrend — not just a bounce." },
      { label: "Up >25% from 52-week low", desc: "The stock has already established momentum. We're not trying to catch a falling knife." },
      { label: "2–4 progressive contractions", desc: "Each pullback must be smaller than the previous: e.g. 20% → 12% → 5%. This shows sellers are exhausted, supply is drying up." },
      { label: "Volume dry-up in final contraction", desc: "Volume in the last tight contraction must be significantly below average. This confirms no more selling pressure." },
      { label: "Near the pivot point", desc: "Today's price must be within 2% of the last swing high. That's the entry point — right before the breakout." },
    ],
    exitLogic: "Enter at the pivot. Stop at the lowest low of the final contraction. Target +8%.",
    tip: "VCPs are rare — 0 to 3 per day is normal. Quality over quantity. Each one is a high-conviction setup.",
  },
  rs: {
    title: "Relative Strength Resilience",
    tagline: "Stocks that refuse to fall when the market is weak — tomorrow's leaders.",
    accentClass: "text-rose-700",
    bgClass: "bg-rose-50",
    market: "Weak / Correcting market (Nifty below 20 EMA)",
    riskProfile: "Medium",
    holdDays: "5 – 15 days",
    targetPct: "+6%",
    filters: [
      { label: "Nifty is weak", desc: "This scan only runs when Nifty 50 is below its 20 EMA AND has fallen >2% over 10 days. If the market is strong, this scanner produces zero signals — intentionally." },
      { label: "Stock outperforms Nifty by ≥5pp", desc: "Over the last 10 days, the stock's return must beat Nifty by at least 5 percentage points. This identifies true relative strength." },
      { label: "Mansfield RS rising", desc: "The stock/Nifty ratio's 20-day EMA is rising — the outperformance is accelerating, not fading." },
      { label: "Stock above own 50 EMA", desc: "Even while the market corrects, the stock's own trend must be intact." },
      { label: "Higher lows pattern", desc: "The stock's 10-day low is higher than 20 days ago. It's making higher lows even as the market makes lower lows." },
    ],
    exitLogic: "Enter at today's close. Stop 3% below the 20 EMA. Target +6%.",
    tip: "RS Resilience signals are the most reliable leading indicators of the next bull leg. These stocks typically lead when the market recovers.",
  },
  mr: {
    title: "Mean Reversion (Extreme Oversold)",
    tagline: "RSI < 30 bounce at major support — snap back to the 20 EMA.",
    accentClass: "text-teal-700",
    bgClass: "bg-teal-50",
    market: "Any — best in ranging / correcting markets",
    riskProfile: "High (short-duration trade)",
    holdDays: "2 – 5 days",
    targetPct: "+4 – 7%",
    filters: [
      { label: "RSI < 30 (extreme oversold)", desc: "The stock has been sold into extreme territory. Historically, RSI < 30 produces a bounce within 3 sessions most of the time." },
      { label: "At major support", desc: "The low must be within 3% of the 200 EMA or the 60-day swing low. Support acts as a floor — buyers defend these levels." },
      { label: "Bullish reversal candle", desc: "Today must be a green candle that closes above yesterday's close, and yesterday must have been red (piercing or engulfing pattern). This confirms demand stepped in." },
      { label: "Volume confirmation", desc: "Volume on reversal day must be at least average. A reversal on zero volume is a trap. Real buyers show up in the data." },
      { label: "Long-term trend not broken", desc: "Price must be within 8% of the 200 EMA — not in a true bear market collapse where bounces get sold." },
    ],
    exitLogic: "Enter at today's close. Tight stop at today's low × 0.98. Target = 20 EMA (the mean reversion magnet).",
    tip: "This is a short-duration trade. The 20 EMA acts as a magnet but also as resistance. Take profits near it, don't hold for more.",
  },
  fib: {
    title: "Fib Pullback (Discount Zone)",
    tagline: "Uptrends that retrace past the 50% Fib of the last swing leg — buy the discount.",
    accentClass: "text-cyan-700",
    bgClass: "bg-cyan-50",
    market: "Trending / Bull",
    riskProfile: "Medium",
    holdDays: "3 – 10 days",
    targetPct: "+6 – 9% (1:3 R:R)",
    filters: [
      { label: "Close > 50 EMA", desc: "The stock must be in an uptrend on the daily timeframe. Pullbacks against the prevailing trend get bought; pullbacks in downtrends keep falling." },
      { label: "Valid swing leg detected", desc: "We look back ~30 bars for a clear swing low → swing high impulse (≥5 bars apart, leg ≥3%). The Fib is drawn on the most recent valid leg only." },
      { label: "Today below 50% Fib (discount zone)", desc: "Price has retraced past the midpoint of the last swing leg. This is Pat's 'discount' — institutions defend this zone in real uptrends." },
      { label: "≥3 red candles AND one big body", desc: "Of the last 5 bars (excluding today), at least 3 must be red AND at least one must have a body ≥1.5× the 20-bar average. Small-only red runs don't qualify — we want real sellers exhausting themselves." },
      { label: "Today is green confirmation", desc: "Today's bar must close green AND above yesterday's close. We wait for demand to step back in — never catch the falling knife." },
      { label: "RSI 30 – 60", desc: "Deep Fib retraces legitimately push RSI lower than a normal MA pullback. The 30–60 window catches the discount without being capitulation." },
      { label: "Not overextended (close ≤ 50 EMA × 1.15)", desc: "Cap on distance from the trend line — same as EMA Pullback. If price ran far above the 50 EMA before this dip, we're still in extension territory." },
    ],
    exitLogic: "Enter at today's close (+0.5% gap buffer). Stop at the tighter of (1% below swing low) or (3% below entry). Target = entry + 3× risk (1:3 R:R per Pat).",
    tip: "Strong signals are deep retraces (≥78% Fib — Pat's custom level) WITH today's volume ≥1.2× the 20-day average. Deep + volume = the highest-conviction discount entries.",
  },
};

interface Props {
  strategy: StrategyKey;
  open: boolean;
  onClose: () => void;
}

export function StrategyInfoDrawer({ strategy, open, onClose }: Props) {
  const info = STRATEGY_INFO[strategy];

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose(); }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex justify-end">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/30 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Drawer */}
      <div className="relative w-full max-w-sm bg-white shadow-2xl flex flex-col h-full overflow-hidden animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className={`${info.bgClass} px-5 pt-5 pb-4 border-b border-slate-200/60`}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-400 mb-1">Strategy Guide</p>
              <h2 className={`text-base font-bold ${info.accentClass} leading-tight`}>{info.title}</h2>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">{info.tagline}</p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-slate-700 hover:bg-white/60 transition-colors shrink-0 mt-0.5"
            >
              <X size={16} />
            </button>
          </div>

          {/* Quick stats */}
          <div className="grid grid-cols-3 gap-2 mt-4">
            <QuickStat label="Market" value={info.market} />
            <QuickStat label="Hold" value={info.holdDays} />
            <QuickStat label="Target" value={info.targetPct} />
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Filters */}
          <section>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-3">All filters must pass</h3>
            <div className="space-y-3">
              {info.filters.map((f, i) => (
                <div key={i} className="flex gap-3">
                  <div className={`w-5 h-5 rounded-full ${info.bgClass} ${info.accentClass} text-[10px] font-bold flex items-center justify-center shrink-0 mt-0.5`}>
                    {i + 1}
                  </div>
                  <div>
                    <p className="text-xs font-semibold text-slate-900">{f.label}</p>
                    <p className="text-[11px] text-slate-500 mt-0.5 leading-relaxed">{f.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Exit logic */}
          <section>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Entry / Exit plan</h3>
            <div className="bg-slate-50 rounded-xl px-4 py-3 text-xs text-slate-600 leading-relaxed border border-slate-200/60">
              {info.exitLogic}
            </div>
          </section>

          {/* Pro tip */}
          <section>
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Pro tip</h3>
            <div className={`${info.bgClass} rounded-xl px-4 py-3 text-xs ${info.accentClass} leading-relaxed`}>
              {info.tip}
            </div>
          </section>

          {/* Risk profile */}
          <section className="pb-4">
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="font-semibold">Risk profile:</span>
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${info.bgClass} ${info.accentClass}`}>
                {info.riskProfile}
              </span>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function QuickStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white/60 rounded-lg px-2.5 py-2 text-center">
      <p className="text-[9px] text-slate-400 uppercase tracking-wide font-semibold">{label}</p>
      <p className="text-[10px] font-bold text-slate-700 mt-0.5 leading-tight">{value}</p>
    </div>
  );
}
