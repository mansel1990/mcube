export type SignalSource =
  | "manish"
  | "breakout"
  | "ema_pullback"
  | "vcp"
  | "rs_resilience"
  | "mean_reversion"
  | "fib_pullback"
  | "fear_reversion";

export interface UnifiedSignal {
  id: string;
  source: SignalSource;
  ticker: string;
  status: "open" | "closed";
  signalDate: string;
  entryDate: string | null;
  entryPrice: number | null;
  entryMin: number | null;
  entryMax: number | null;
  target: number | null;
  stopLoss: number | null;
  cmp: number | null;
  rsi: number | null;
  volumeRatio: number | null;
  signalStrength: string | null;
  exitDate: string | null;
  exitPrice: number | null;
  realizedPnlPct: number | null;
  exitReason: string | null;
  holdDays: number;
  peers: string[] | null;
  entryZ: number | null;
  peerSlopePct: number | null;
}

export const SOURCE_SHORT: Record<SignalSource, string> = {
  manish: "Manish",
  breakout: "Breakout",
  ema_pullback: "EMA",
  vcp: "VCP",
  rs_resilience: "RS",
  mean_reversion: "Mean Rev",
  fib_pullback: "Fib",
  fear_reversion: "Fear",
};

export const SOURCE_PRIORITY: SignalSource[] = [
  "manish",
  "breakout",
  "ema_pullback",
  "vcp",
  "rs_resilience",
  "mean_reversion",
  "fib_pullback",
  "fear_reversion",
];

export const SOURCE_META: Record<
  SignalSource,
  { label: string; short: string; color: string; bg: string; border: string; stripe: string; badge: string; activeBtn: string }
> = {
  manish: {
    label: "Manish Logic",
    short: "Manish",
    color: "text-blue-700",
    bg: "bg-blue-50",
    border: "border-blue-200",
    stripe: "bg-blue-500",
    badge: "border border-slate-200 bg-slate-50 text-slate-700",
    activeBtn: "bg-blue-600 text-white border-blue-600 shadow-md shadow-blue-200",
  },
  breakout: {
    label: "Breakout",
    short: "Breakout",
    color: "text-violet-700",
    bg: "bg-violet-50",
    border: "border-violet-200",
    stripe: "bg-violet-500",
    badge: "border border-slate-200 bg-slate-50 text-slate-700",
    activeBtn: "bg-violet-600 text-white border-violet-600 shadow-md shadow-violet-200",
  },
  ema_pullback: {
    label: "EMA Pullback",
    short: "EMA",
    color: "text-indigo-700",
    bg: "bg-indigo-50",
    border: "border-indigo-200",
    stripe: "bg-indigo-500",
    badge: "border border-slate-200 bg-slate-50 text-slate-700",
    activeBtn: "bg-indigo-600 text-white border-indigo-600 shadow-md shadow-indigo-200",
  },
  vcp: {
    label: "VCP",
    short: "VCP",
    color: "text-purple-700",
    bg: "bg-purple-50",
    border: "border-purple-200",
    stripe: "bg-purple-500",
    badge: "border border-slate-200 bg-slate-50 text-slate-700",
    activeBtn: "bg-purple-600 text-white border-purple-600 shadow-md shadow-purple-200",
  },
  rs_resilience: {
    label: "RS Resilience",
    short: "RS",
    color: "text-fuchsia-700",
    bg: "bg-fuchsia-50",
    border: "border-fuchsia-200",
    stripe: "bg-fuchsia-500",
    badge: "border border-slate-200 bg-slate-50 text-slate-700",
    activeBtn: "bg-fuchsia-600 text-white border-fuchsia-600 shadow-md shadow-fuchsia-200",
  },
  mean_reversion: {
    label: "Mean Reversion",
    short: "Mean Rev",
    color: "text-teal-700",
    bg: "bg-teal-50",
    border: "border-teal-200",
    stripe: "bg-teal-500",
    badge: "border border-slate-200 bg-slate-50 text-slate-700",
    activeBtn: "bg-teal-600 text-white border-teal-600 shadow-md shadow-teal-200",
  },
  fib_pullback: {
    label: "Fib Pullback",
    short: "Fib",
    color: "text-cyan-700",
    bg: "bg-cyan-50",
    border: "border-cyan-200",
    stripe: "bg-cyan-500",
    badge: "border border-slate-200 bg-slate-50 text-slate-700",
    activeBtn: "bg-cyan-600 text-white border-cyan-600 shadow-md shadow-cyan-200",
  },
  fear_reversion: {
    label: "Fear Reversion",
    short: "Fear",
    color: "text-orange-700",
    bg: "bg-orange-50",
    border: "border-orange-200",
    stripe: "bg-orange-500",
    badge: "border border-slate-200 bg-slate-50 text-slate-700",
    activeBtn: "bg-orange-600 text-white border-orange-600 shadow-md shadow-orange-200",
  },
};

export function sourceToStrategyKey(source: SignalSource): "breakout" | "ema" | "vcp" | "rs" | "mr" | "fr" | "fib" | null {
  const map: Record<SignalSource, "breakout" | "ema" | "vcp" | "rs" | "mr" | "fr" | "fib" | null> = {
    manish: null,
    breakout: "breakout",
    ema_pullback: "ema",
    vcp: "vcp",
    rs_resilience: "rs",
    mean_reversion: "mr",
    fib_pullback: "fib",
    fear_reversion: "fr",
  };
  return map[source];
}

export const SIM_CAPITAL = 10_000;
