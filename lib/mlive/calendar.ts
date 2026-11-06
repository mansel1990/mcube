/** Calendar dates are `YYYY-MM-DD`. Weekday math uses UTC so the date does not shift. */

export function weekdayUtc(iso: string): number {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function isWeekend(iso: string): boolean {
  const day = weekdayUtc(iso);
  return day === 0 || day === 6;
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function isTradingDay(iso: string, holidays: ReadonlySet<string>): boolean {
  return !isWeekend(iso) && !holidays.has(iso);
}

export function nextTradingDay(iso: string, holidays: ReadonlySet<string>): string {
  let cursor = addDays(iso, 1);
  while (!isTradingDay(cursor, holidays)) cursor = addDays(cursor, 1);
  return cursor;
}

export function previousTradingDay(iso: string, holidays: ReadonlySet<string>): string {
  let cursor = addDays(iso, -1);
  while (!isTradingDay(cursor, holidays)) cursor = addDays(cursor, -1);
  return cursor;
}

/** First session of a window of `sessions` trading days ending on `day`. */
export function sessionsBack(day: string, sessions: number, holidays: ReadonlySet<string>): string {
  let cursor = isTradingDay(day, holidays) ? day : previousTradingDay(day, holidays);
  for (let i = 1; i < Math.max(1, sessions); i++) cursor = previousTradingDay(cursor, holidays);
  return cursor;
}

export function todayIst(now = new Date()): string {
  return now.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

export function istMinutes(now = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}
