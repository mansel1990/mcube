import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";

export default async function StocksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });

  // No session or wrong section → back to login
  if (!session || (session.user as Record<string, unknown>).section !== "stocks") {
    redirect("/auth/stocks-login");
  }

  return <>{children}</>;
}
