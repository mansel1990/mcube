import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { Cinzel } from "next/font/google";
import { auth } from "@/lib/auth";
import { DotaShell } from "@/components/stocks/dota-shell";
import { PushReadListener } from "@/components/stocks/push-read-listener";
import { KiteStatusBanner } from "@/components/stocks/kite-status-banner";

const cinzel = Cinzel({
  variable: "--font-cinzel",
  subsets: ["latin"],
  weight: ["500", "700", "900"],
});

export default async function StocksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth.api.getSession({ headers: await headers() });

  if (!session || (session.user as Record<string, unknown>).section !== "stocks") {
    redirect("/auth/stocks-login");
  }

  const user = session.user as Record<string, unknown>;
  const username = (user.username as string) || (user.name as string) || "stocks";

  return (
    <div className={`theme-dota ${cinzel.variable}`}>
      <DotaShell username={username}>
        <PushReadListener />
        <KiteStatusBanner />
        {children}
      </DotaShell>
    </div>
  );
}
