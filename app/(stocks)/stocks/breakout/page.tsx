import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { BreakoutClient } from "./breakout-client";

export default async function BreakoutPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || (session.user as Record<string, unknown>).section !== "stocks") {
    redirect("/auth/stocks-login");
  }
  return <BreakoutClient />;
}
