interface SummaryCardProps {
  label: string;
  value: string;
  sub?: string;
  color: "cyan" | "rose" | "blue" | "champagne";
  positive?: boolean; // for net balance — overrides color to cyan/rose
}

const colorMap = {
  cyan: {
    border: "border-l-accent",
    text: "text-accent",
    glow: "shadow-[0_0_24px_rgba(6,182,212,0.12)]",
  },
  rose: {
    border: "border-l-rose-400",
    text: "text-rose-400",
    glow: "shadow-[0_0_24px_rgba(251,113,133,0.12)]",
  },
  blue: {
    border: "border-l-primary",
    text: "text-primary",
    glow: "shadow-[0_0_24px_rgba(37,99,235,0.12)]",
  },
  champagne: {
    border: "border-l-champagne",
    text: "text-champagne",
    glow: "shadow-[0_0_24px_rgba(242,227,198,0.12)]",
  },
};

export function SummaryCard({ label, value, sub, color, positive }: SummaryCardProps) {
  const resolved =
    positive === undefined
      ? colorMap[color]
      : positive
      ? colorMap.cyan
      : colorMap.rose;

  return (
    <div
      className={`glass-panel rounded-xl p-5 border-l-4 ${resolved.border} ${resolved.glow} flex flex-col gap-1`}
    >
      <span className="text-xs font-medium text-foreground/40 uppercase tracking-wider">
        {label}
      </span>
      <span className={`text-2xl font-bold ${resolved.text}`}>{value}</span>
      {sub && <span className="text-xs text-foreground/30">{sub}</span>}
    </div>
  );
}
