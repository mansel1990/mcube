import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { requireMliveUser } from "@/lib/mlive/auth";
import { kiteSessionStatus } from "@/lib/mlive/kite-session";
import { settingsMap } from "@/lib/mlive/read";
import { getStocksSessionUsername } from "@/lib/stocks/admin";
import { MliveFrame } from "@/components/mlive/frame";
import "./mlive.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-mlive" });

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mansel Live",
  description: "Live trading for one account. The site proposes. The server places orders.",
};

export default async function MliveLayout({ children }: { children: React.ReactNode }) {
  const session = await requireMliveUser();
  const name = getStocksSessionUsername(session.user as Record<string, unknown>) || "Sanjay";
  const [settings, kite] = await Promise.all([settingsMap(), kiteSessionStatus()]);
  return (
    <div className={inter.variable}>
      <MliveFrame name={name} dryRun={settings.dry_run !== false} kiteConnected={kite.connected}>{children}</MliveFrame>
    </div>
  );
}
