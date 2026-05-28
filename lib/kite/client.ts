import { KiteConnect } from "kiteconnect";
import { getKiteSession, isKiteTokenValid } from "./session";

export function createKiteClient(accessToken?: string) {
  const apiKey = process.env.KITE_API_KEY;
  if (!apiKey) throw new Error("KITE_API_KEY is not configured");

  const kite = new KiteConnect({ api_key: apiKey });
  if (accessToken) kite.setAccessToken(accessToken);
  return kite;
}

export async function getKiteClientForUser(userId: string) {
  const session = await getKiteSession(userId);
  if (!session || !isKiteTokenValid(session.token_date)) {
    return { kite: null, session, error: "not_connected" as const };
  }
  return {
    kite: createKiteClient(session.access_token),
    session,
    error: null,
  };
}

export function getKiteLoginUrl() {
  return createKiteClient().getLoginURL();
}
