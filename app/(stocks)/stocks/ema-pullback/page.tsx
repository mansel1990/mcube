import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { EmaPullbackClient } from "./ema-pullback-client";

export default async function EmaPullbackPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || (session.user as Record<string, unknown>).section !== "stocks") {
    redirect("/auth/stocks-login");
  }
  return <EmaPullbackClient />;
}
