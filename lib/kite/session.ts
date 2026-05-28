import { sql } from "@/lib/sql";

let migrated = false;

export async function ensureKiteSchema() {
  if (migrated) return;
  await sql`
    CREATE TABLE IF NOT EXISTS kite_sessions (
      user_id       TEXT PRIMARY KEY,
      access_token  TEXT NOT NULL,
      token_date    DATE NOT NULL,
      connected_at  TIMESTAMPTZ DEFAULT now()
    )
  `;
  migrated = true;
}

export function getTodayIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

/** Normalize DB DATE / ISO / Date to YYYY-MM-DD (IST for Date objects). */
export function normalizeTokenDate(value: string | Date | unknown): string {
  if (value instanceof Date) {
    return value.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  }
  const s = String(value);
  const match = s.match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : s;
}

export function isKiteTokenValid(tokenDate: string | Date | unknown): boolean {
  return normalizeTokenDate(tokenDate) >= getTodayIST();
}

export interface KiteSessionRow {
  user_id: string;
  access_token: string;
  token_date: string;
  connected_at: string;
}

export async function getKiteSession(userId: string): Promise<KiteSessionRow | null> {
  await ensureKiteSchema();
  const rows = await sql`
    SELECT user_id, access_token, token_date, connected_at
    FROM kite_sessions WHERE user_id = ${userId}
  `;
  const row = rows[0] as KiteSessionRow | undefined;
  if (!row) return null;
  return { ...row, token_date: normalizeTokenDate(row.token_date) };
}

export async function saveKiteSession(userId: string, accessToken: string, tokenDate: string) {
  await ensureKiteSchema();
  await sql`
    INSERT INTO kite_sessions (user_id, access_token, token_date, connected_at)
    VALUES (${userId}, ${accessToken}, ${tokenDate}, now())
    ON CONFLICT (user_id) DO UPDATE SET
      access_token = EXCLUDED.access_token,
      token_date = EXCLUDED.token_date,
      connected_at = now()
  `;
}

export async function deleteKiteSession(userId: string) {
  await ensureKiteSchema();
  await sql`DELETE FROM kite_sessions WHERE user_id = ${userId}`;
}

export async function getAllKiteSessionUserIds(): Promise<string[]> {
  await ensureKiteSchema();
  const rows = await sql`SELECT user_id FROM kite_sessions`;
  return rows.map((r) => (r as { user_id: string }).user_id);
}
