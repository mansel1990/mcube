import { KiteConnect } from "kiteconnect";
import { todayIst } from "./calendar";
import { encryptToken, decryptToken } from "./crypto";
import { kiteAvailableCash } from "./rules";

/** IST calendar day for a Postgres date, whether the driver returned a Date or text. */
export function kiteTokenDay(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return value.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  }
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

export type KiteSessionView = {
  connected: boolean;
  tokenDate: string | null;
  connectedAt: string | null;
  kiteUserId: string | null;
};

/** One reading of today's Kite login. Home and Settings both use this. */
export function kiteSessionView(
  row: { token_date?: unknown; connected_at?: unknown; kite_user_id?: unknown } | null | undefined,
  today = todayIst()
): KiteSessionView {
  const tokenDate = kiteTokenDay(row?.token_date);
  return {
    connected: tokenDate === today,
    tokenDate,
    connectedAt: row?.connected_at == null || row.connected_at === "" ? null : String(row.connected_at),
    kiteUserId: row?.kite_user_id == null || row.kite_user_id === "" ? null : String(row.kite_user_id),
  };
}

export async function kiteSessionStatus(today = todayIst()): Promise<KiteSessionView> {
  const { sql } = await import("@/lib/sql");
  const rows = await sql`
    SELECT token_date::text AS token_date, connected_at, kite_user_id
      FROM mlive.mlive_kite_sessions
     ORDER BY connected_at DESC
     LIMIT 1`;
  return kiteSessionView(rows[0], today);
}

export function kiteLoginUrl(returnOrigin: string): string {
  const apiKey = process.env.KITE_API_KEY;
  if (!apiKey) throw new Error("KITE_API_KEY is not set");
  const login = new KiteConnect({ api_key: apiKey }).getLoginURL();
  const next = `${returnOrigin.replace(/\/$/, "")}/api/mlive/kite/callback`;
  const params = new URLSearchParams({ next });
  return `${login}&redirect_params=${encodeURIComponent(params.toString())}`;
}

export async function saveEncryptedSession(userId: string, requestToken: string): Promise<string> {
  const apiKey = process.env.KITE_API_KEY;
  const apiSecret = process.env.KITE_API_SECRET;
  const tokenKey = process.env.MLIVE_TOKEN_KEY;
  if (!apiKey || !apiSecret || !tokenKey) throw new Error("Kite or MLIVE_TOKEN_KEY is not configured");
  const kite = new KiteConnect({ api_key: apiKey });
  const session = await kite.generateSession(requestToken, apiSecret);
  const enc = encryptToken(session.access_token, tokenKey);
  const { sql } = await import("@/lib/sql");
  await sql`
    INSERT INTO mlive.mlive_kite_sessions (user_id, access_token_enc, token_date, connected_at, kite_user_id)
    VALUES (${userId}, ${enc}, ${todayIst()}, now(), ${session.user_id})
    ON CONFLICT (user_id) DO UPDATE SET
      access_token_enc = EXCLUDED.access_token_enc,
      token_date = EXCLUDED.token_date,
      connected_at = now(),
      kite_user_id = EXCLUDED.kite_user_id`;
  return session.user_id;
}

/** Today's Kite equity cash. `connected` is false when the morning login is missing. */
export async function readKiteFunds(): Promise<{ connected: boolean; cash: number | null; error: string | null }> {
  const apiKey = process.env.KITE_API_KEY;
  const tokenKey = process.env.MLIVE_TOKEN_KEY;
  if (!apiKey || !tokenKey) return { connected: false, cash: null, error: null };
  const { sql } = await import("@/lib/sql");
  const rows = await sql`
    SELECT access_token_enc, token_date::text AS token_date
      FROM mlive.mlive_kite_sessions
     ORDER BY connected_at DESC LIMIT 1`;
  const row = rows[0];
  if (!row || kiteTokenDay(row.token_date) !== todayIst()) return { connected: false, cash: null, error: null };
  try {
    const kite = new KiteConnect({ api_key: apiKey });
    kite.setAccessToken(decryptToken(String(row.access_token_enc), tokenKey));
    const margins = await kite.getMargins("equity");
    const cash = kiteAvailableCash(margins);
    if (cash == null) {
      const error = "Kite margins: cash missing in response";
      console.error(error);
      return { connected: true, cash: null, error };
    }
    return { connected: true, cash, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kite cash could not be read.";
    console.error(`Kite margins: ${message}`);
    return { connected: true, cash: null, error: message };
  }
}
