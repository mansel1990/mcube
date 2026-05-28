import { headers } from "next/headers";
import { auth } from "@/lib/auth";

export async function requireStocksSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || (session.user as Record<string, unknown>).section !== "stocks") {
    return null;
  }
  return session;
}
