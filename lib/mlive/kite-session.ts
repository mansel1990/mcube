import { KiteConnect } from "kiteconnect";
import { sql } from "@/lib/sql";
import { todayIst } from "./calendar";
import { encryptToken, decryptToken } from "./crypto";
import { kiteAvailableCash } from "./rules";

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
export async function readKiteFunds(): Promise<{ connected: boolean; cash: number | null }> {
  const apiKey = process.env.KITE_API_KEY;
  const tokenKey = process.env.MLIVE_TOKEN_KEY;
  if (!apiKey || !tokenKey) return { connected: false, cash: null };
  const rows = await sql`
    SELECT access_token_enc, token_date::text AS token_date
      FROM mlive.mlive_kite_sessions
     ORDER BY connected_at DESC LIMIT 1`;
  const row = rows[0];
  if (!row || String(row.token_date).slice(0, 10) !== todayIst()) return { connected: false, cash: null };
  try {
    const kite = new KiteConnect({ api_key: apiKey });
    kite.setAccessToken(decryptToken(String(row.access_token_enc), tokenKey));
    const margins = await kite.getMargins("equity");
    return { connected: true, cash: kiteAvailableCash(margins) };
  } catch {
    return { connected: true, cash: null };
  }
}
