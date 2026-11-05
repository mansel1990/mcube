export function inr(value: number, digits = 0): string {
  return "₹" + value.toLocaleString("en-IN", { maximumFractionDigits: digits, minimumFractionDigits: digits });
}

export function signed(value: number): string {
  const sign = value >= 0 ? "+" : "−";
  return sign + inr(Math.abs(value));
}

export function greeting(date = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", hourCycle: "h23" }).format(date)
  );
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function longDay(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" });
}
