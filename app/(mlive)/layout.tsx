import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { requireMliveUser } from "@/lib/mlive/auth";
import { settingsMap } from "@/lib/mlive/read";
import { getStocksSessionUsername } from "@/lib/stocks/admin";
import { MliveFrame } from "@/components/mlive/frame";
import "./mlive.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-mlive" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mlive-mono" });

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mansel Live",
  description: "Live trading for one account. The site proposes. The server places orders.",
};

export default async function MliveLayout({ children }: { children: React.ReactNode }) {
  const session = await requireMliveUser();
  const name = getStocksSessionUsername(session.user as Record<string, unknown>) || "Sanjay";
  const settings = await settingsMap();
  return (
    <div className={`${inter.variable} ${mono.variable}`}>
      <MliveFrame name={name} dryRun={settings.dry_run !== false}>{children}</MliveFrame>
    </div>
  );
}
