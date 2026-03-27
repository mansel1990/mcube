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

  // 2026 — approximate; update once NSE publishes official calendar
  "2026-01-26", // Republic Day
  "2026-03-20", // Holi (approximate)
  "2026-04-03", // Good Friday (approximate)
  "2026-04-14", // Dr. Babasaheb Ambedkar Jayanti
  "2026-05-01", // Maharashtra Day
  "2026-08-15", // Independence Day
  "2026-10-02", // Gandhi Jayanti
  "2026-11-24", // Guru Nanak Jayanti (approximate)
  "2026-12-25", // Christmas
]);
