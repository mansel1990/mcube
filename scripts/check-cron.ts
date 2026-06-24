import { config } from "dotenv";
import { resolve } from "path";
import { neon } from "@neondatabase/serverless";

config({ path: resolve(process.cwd(), ".env.local") });

const sql = neon(process.env.DATABASE_URL!);

async function main() {
  try {
    const runs = await sql`
      SELECT *
      FROM daily_suggestor.daily_runs
      ORDER BY run_date DESC
      LIMIT 10
    `;
    console.log("daily_runs:", JSON.stringify(runs, null, 2));
  } catch (e) {
    console.log("daily_runs error:", (e as Error).message);
  }

  try {
    const recent = await sql`
      SELECT signal_date::text, strategy, ticker, status, exit_reason
      FROM daily_suggestor.trades
      ORDER BY signal_date DESC, trade_id DESC
      LIMIT 15
    `;
    console.log("recent trades:", JSON.stringify(recent, null, 2));
  } catch (e) {
    console.log("recent trades error:", (e as Error).message);
  }

  try {
    const latestSignals = await sql`
      SELECT signal_date::text AS d, COUNT(*)::int AS cnt
      FROM daily_suggestor.trades
      WHERE status = 'OPEN_PENDING_FILL'
      GROUP BY signal_date
      ORDER BY signal_date DESC
      LIMIT 10
    `;
    console.log("open pending by date:", JSON.stringify(latestSignals, null, 2));
  } catch (e) {
    console.log("signals error:", (e as Error).message);
  }

  try {
    const mr = await sql`SELECT MAX(date)::text AS latest FROM swing.mean_reversion_signals`;
    console.log("mr latest:", JSON.stringify(mr));
  } catch (e) {
    console.log("mr error:", (e as Error).message);
  }
}

main();
