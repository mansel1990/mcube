import type { Metadata } from "next";
import { Inter, Space_Grotesk } from "next/font/google";
import { requireMliveUser } from "@/lib/mlive/auth";
import { isTradingDay, todayIst } from "@/lib/mlive/calendar";
import { kiteSessionStatus } from "@/lib/mlive/kite-session";
import { intradayRetired } from "@/lib/mlive/capabilities";
import { settingsMap } from "@/lib/mlive/read";
import { sql } from "@/lib/sql";
import { getStocksSessionUsername } from "@/lib/stocks/admin";
import { MliveFrame } from "@/components/mlive/frame";
import "./mlive.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-mlive" });
const display = Space_Grotesk({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-mlive-display" });

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Mansel Live",
  description: "Live trading for one account. The site proposes. The server places orders.",
};

export default async function MliveLayout({ children }: { children: React.ReactNode }) {
  const session = await requireMliveUser();
  const name = getStocksSessionUsername(session.user as Record<string, unknown>) || "Sanjay";
  const [settings, kite, stateRows, holidayRows] = await Promise.all([
    settingsMap(),
    kiteSessionStatus(),
    sql`SELECT status, mode FROM mlive.mlive_state WHERE id = 1`,
    sql`SELECT trade_date::text AS trade_date FROM mlive.mlive_holidays`,
  ]);
  const holidays = new Set(holidayRows.map((row) => String(row.trade_date).slice(0, 10)));
  const kiteAt = kite.connected && kite.connectedAt
    ? new Date(kite.connectedAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Kolkata" })
    : null;
  return (
    <div className={`${inter.variable} ${display.variable}`}>
      <MliveFrame
        name={name}
        dryRun={settings.dry_run !== false}
        kiteConnected={kite.connected}
        kiteAt={kiteAt}
        status={String(stateRows[0]?.status ?? "active")}
        mode={String(stateRows[0]?.mode ?? "approve")}
        marketOpen={isTradingDay(todayIst(), holidays)}
        intradayRetired={intradayRetired(settings.intraday_retired)}
      >{children}</MliveFrame>
    </div>
  );
}
