import { redirect } from "next/navigation";
import { getStocksSessionUsername, isStocksAdmin } from "@/lib/stocks/admin";
import { requireStocksSession } from "@/lib/stocks/require-stocks-session";

/**
 * Mansel Live is one account. The stocks admin username is `sanjay`.
 * Set MLIVE_USER_ID to that user's Mongo id to pin the check to the id as well.
 */
export async function requireMliveSession() {
  const session = await requireStocksSession();
  if (!session) return null;
  const user = session.user as Record<string, unknown>;
  if (!isStocksAdmin(getStocksSessionUsername(user))) return null;
  const pinned = process.env.MLIVE_USER_ID;
  if (pinned && session.user.id !== pinned) return null;
  return session;
}

export async function requireMliveUser() {
  const session = await requireStocksSession();
  if (!session) redirect("/auth/stocks-login");
  const allowed = await requireMliveSession();
  if (!allowed) redirect("/stocks");
  return allowed;
}
