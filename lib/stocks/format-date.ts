/** Normalize DB/API date values to YYYY-MM-DD (IST calendar day). */
export function normalizeDateStr(d: unknown): string {
  if (!d) return "";
  if (d instanceof Date && !isNaN(d.getTime())) {
    return d.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  }
  const s = String(d).trim();
  const iso = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    return parsed.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  }
  return "";
}

export function formatScanDateIST(dateStr: string): string {
  const normalized = normalizeDateStr(dateStr);
  if (!normalized) return "—";
  const d = new Date(normalized + "T12:00:00+05:30");
  if (isNaN(d.getTime())) return normalized;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}

export function isWithinDays(dateStr: string, days: number): boolean {
  const normalized = normalizeDateStr(dateStr);
  if (!normalized) return false;
  const d = new Date(normalized + "T12:00:00+05:30");
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  cutoff.setHours(0, 0, 0, 0);
  return d >= cutoff;
}

export function maxDateStr(dates: string[]): string | null {
  const valid = dates.map(normalizeDateStr).filter(Boolean);
  if (!valid.length) return null;
  return valid.reduce((max, d) => (d > max ? d : max), valid[0]);
}
