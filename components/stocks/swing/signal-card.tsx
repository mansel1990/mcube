"use client";

export interface SwingSignal {
  id: number;
  date: string;
  symbol: string;
  company_name: string;
  cmp: number;
  breakout_level: number;
  entry_min: number;
  entry_max: number;
  target: number;
  stop_loss: number;
  volume_ratio: number;
  rsi: number;
  signal_strength: string;
}

type AccentColor = "blue" | "violet" | "emerald" | "purple" | "rose" | "teal" | "cyan";

interface SignalCardProps {
  signal: SwingSignal;
  accentColor: AccentColor;
  levelLabel: string;  // "Breakout Level" or "20 EMA Support"
}

export function SignalCard({ signal, accentColor, levelLabel }: SignalCardProps) {
  const isStrong = signal.signal_strength === "Strong";
  const riskReward = ((signal.target - signal.entry_min) / (signal.entry_min - signal.stop_loss)).toFixed(1);

  const accent: Record<AccentColor, { badge: string; bar: string; ring: string }> = {
    blue:    { badge: "bg-blue-100 text-blue-700",       bar: "bg-blue-500",    ring: "ring-blue-200"    },
    violet:  { badge: "bg-violet-100 text-violet-700",   bar: "bg-violet-500",  ring: "ring-violet-200"  },
    emerald: { badge: "bg-emerald-100 text-emerald-700", bar: "bg-emerald-500", ring: "ring-emerald-200" },
    purple:  { badge: "bg-purple-100 text-purple-700",   bar: "bg-purple-500",  ring: "ring-purple-200"  },
    rose:    { badge: "bg-rose-100 text-rose-700",       bar: "bg-rose-500",    ring: "ring-rose-200"    },
    teal:    { badge: "bg-teal-100 text-teal-700",       bar: "bg-teal-500",    ring: "ring-teal-200"    },
    cyan:    { badge: "bg-cyan-100 text-cyan-700",       bar: "bg-cyan-500",    ring: "ring-cyan-200"    },
  };
  const accentClasses = accent[accentColor];

  return (
    <div className={`bg-white rounded-2xl shadow-card hover:shadow-card-hover transition-all duration-200 ring-1 ${isStrong ? accentClasses.ring : "ring-slate-100"} overflow-hidden`}>
      {/* Header */}
      <div className="px-4 pt-4 pb-3 flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold text-foreground tracking-tight">{signal.symbol}</span>
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${isStrong ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>
              {signal.signal_strength.toUpperCase()}
            </span>
          </div>
          <p className="text-xs text-muted mt-0.5">CMP: <span className="font-semibold text-foreground">₹{signal.cmp}</span></p>
        </div>
        <div className="text-right">
          <p className="text-xs text-muted">{levelLabel}</p>
          <p className={`text-sm font-bold ${accentClasses.badge.split(" ")[1]}`}>₹{signal.breakout_level}</p>
        </div>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-3 gap-px bg-slate-100 border-y border-slate-100">
        <Stat label="Entry" value={`₹${signal.entry_min}`} sub={`–${signal.entry_max}`} color="text-foreground" />
        <Stat label="Target" value={`₹${signal.target}`} sub={`+${(((signal.target - signal.entry_min) / signal.entry_min) * 100).toFixed(1)}%`} color="text-emerald-600" />
        <Stat label="Stop Loss" value={`₹${signal.stop_loss}`} sub={`-${(((signal.entry_min - signal.stop_loss) / signal.entry_min) * 100).toFixed(1)}%`} color="text-red-500" />
      </div>

      {/* Footer */}
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Pill label="Vol" value={`${signal.volume_ratio}x`} color={accentColor} />
          <Pill label="RSI" value={`${signal.rsi}`} color="slate" />
        </div>
        <div className="text-right">
          <p className="text-[10px] text-muted">R:R</p>
          <p className="text-sm font-bold text-foreground">1:{riskReward}</p>
        </div>
      </div>

      {/* Volume strength bar */}
      <div className="px-4 pb-3">
        <div className="flex items-center justify-between mb-1">
          <span className="text-[9px] text-muted uppercase tracking-wider font-semibold">Volume strength</span>
          <span className="text-[9px] text-muted">{signal.volume_ratio}× avg</span>
        </div>
        <div className="h-1.5 bg-slate-100 rounded-full">
          <div
            className={`h-full ${accentClasses.bar} rounded-full transition-all`}
            style={{ width: `${Math.min((signal.volume_ratio / 4) * 100, 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, color }: { label: string; value: string; sub: string; color: string }) {
  return (
    <div className="bg-white px-3 py-2.5 text-center">
      <p className="text-[10px] text-muted uppercase tracking-wide">{label}</p>
      <p className={`text-sm font-bold ${color}`}>{value}</p>
      <p className="text-[10px] text-muted">{sub}</p>
    </div>
  );
}

function Pill({ label, value, color }: { label: string; value: string; color: string }) {
  const cls =
    color === "blue"    ? "bg-blue-50 text-blue-700"       :
    color === "violet"  ? "bg-violet-50 text-violet-700"   :
    color === "emerald" ? "bg-emerald-50 text-emerald-700" :
    color === "purple"  ? "bg-purple-50 text-purple-700"   :
    color === "rose"    ? "bg-rose-50 text-rose-700"       :
    color === "teal"    ? "bg-teal-50 text-teal-700"       :
    color === "cyan"    ? "bg-cyan-50 text-cyan-700"       :
    "bg-slate-100 text-slate-600";
  return (
    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cls}`}>
      {label} {value}
    </span>
  );
}
