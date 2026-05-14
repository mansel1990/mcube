import { sql } from "@/lib/sql";
import { StocksDashboard } from "@/components/stocks/stocks-dashboard";

export default async function StocksChartPage() {
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
