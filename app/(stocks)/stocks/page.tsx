import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { sql } from "@/lib/sql";
import { StocksDashboard } from "@/components/stocks/stocks-dashboard";

export default async function StocksPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || (session.user as Record<string, unknown>).section !== "stocks") {
    redirect("/auth/stocks-login");
  }

  const rows = await sql`
    SELECT DISTINCT ticker FROM stocks.daily_ohlcv ORDER BY ticker ASC
  `;
  const tickers = rows.map((r) => r.ticker as string);

  return (
    <div className="h-[calc(100vh-3.5rem-4rem)] md:h-[calc(100vh-3.5rem)] overflow-hidden flex flex-col">
      <StocksDashboard tickers={tickers} />
    </div>
  );
}
