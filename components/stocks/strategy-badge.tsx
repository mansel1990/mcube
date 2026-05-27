import type { SignalSource } from "@/lib/stocks/types";
import { SOURCE_META } from "@/lib/stocks/types";

export function StrategyBadge({ source }: { source: SignalSource }) {
  const meta = SOURCE_META[source];
  return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border border-slate-200 bg-slate-50 text-slate-700">
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${meta.stripe}`} aria-hidden />
      {meta.short}
    </span>
  );
}

export function PnlBadge({ value, unit = "pct" }: { value: number; unit?: "pct" | "inr" }) {
  const isProfit = value >= 0;
  const formatted =
    unit === "inr"
      ? `${isProfit ? "+" : ""}₹${Math.abs(value).toFixed(0)}`
      : `${isProfit ? "+" : ""}${value.toFixed(2)}%`;
  return (
    <span
      className={`text-xs font-bold px-2 py-0.5 rounded-full ${
        isProfit ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-700"
      }`}
    >
      {isProfit ? "▲" : "▼"} {formatted}
    </span>
  );
}
