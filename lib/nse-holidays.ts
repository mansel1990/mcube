// NSE equity market trading holidays (YYYY-MM-DD in IST).
// Verify against https://www.nseindia.com/resources/exchange-communication-holidays
// before each calendar year and update accordingly.

export const NSE_HOLIDAYS = new Set<string>([
  // 2025
  "2025-02-19", // Chhatrapati Shivaji Maharaj Jayanti
  "2025-03-14", // Holi
  "2025-03-31", // Id-Ul-Fitr (Ramadan Eid)
  "2025-04-14", // Dr. Babasaheb Ambedkar Jayanti
  "2025-04-18", // Good Friday
  "2025-05-01", // Maharashtra Day
  "2025-08-15", // Independence Day
  "2025-08-27", // Ganesh Chaturthi
  "2025-10-02", // Gandhi Jayanti / Dussehra
  "2025-10-20", // Diwali (Laxmi Puja)
  "2025-11-05", // Guru Nanak Jayanti
  "2025-12-25", // Christmas

  // 2026 — NSE/CMTR/71775 plus 15 Jan 2026 (NSE/CMTR/72260). 2027 is not published yet.
  "2026-01-15",
  "2026-01-26",
  "2026-03-03",
  "2026-03-26",
  "2026-03-31",
  "2026-04-03",
  "2026-04-14",
  "2026-05-01",
  "2026-05-28",
  "2026-06-26",
  "2026-09-14",
  "2026-10-02",
  "2026-10-20",
  "2026-11-10",
  "2026-11-24",
  "2026-12-25",
]);
