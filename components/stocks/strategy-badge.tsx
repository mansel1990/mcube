import type { SignalSource } from "@/lib/stocks/types";
import { HERO_META } from "@/lib/stocks/heroes";

export function StrategyBadge({ source }: { source: SignalSource }) {
  const hero = HERO_META[source];
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full border bg-black/30"
      style={{ borderColor: `${hero.accent}55`, color: hero.accent }}
    >
      <span
        className="w-1.5 h-1.5 rounded-full shrink-0"
        style={{ backgroundColor: hero.accent }}
        aria-hidden
      />
      {hero.name}
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
      className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
        isProfit
          ? "bg-[rgba(176,210,50,0.12)] text-[#bcdb3e] border-[#4a5621]"
          : "bg-[rgba(212,69,49,0.12)] text-[#f06352] border-[#5e2a1f]"
      }`}
    >
      {isProfit ? "▲" : "▼"} {formatted}
    </span>
  );
}
