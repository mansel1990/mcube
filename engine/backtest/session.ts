/** Clock on a candle timestamp that is already in IST, `YYYY-MM-DD HH:MM` or with a T. */
export function barClock(t: string): string {
  const match = /(\d{2}):(\d{2})/.exec(t);
  if (!match) return "00:00";
  return `${match[1]}:${match[2]}`;
}

export function barDay(t: string): string {
  return t.slice(0, 10);
}

/** Regular session used for every year: 09:15 inclusive, 15:15 exclusive. */
export function inCashSession(t: string): boolean {
  const clock = barClock(t);
  return clock >= "09:15" && clock < "15:15";
}

export function shiftDays(iso: string, days: number): string {
  const [year, month, day] = iso.slice(0, 10).split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}
