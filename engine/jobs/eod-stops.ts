import { nextTradingDay, todayIst } from "@/lib/mlive/calendar";
import { nextTrendStop } from "@/lib/mlive/rules";
import { audit } from "../audit";
import { exitFor, openPositions, syncGttToStop } from "../book";
import { q } from "../db";
import { holidaySet, loadSettings } from "../load";
import { loadBars } from "../market";
import { runJob } from "../run";

export async function eodStops(): Promise<void> {
  await runJob("eod-stops", async (runId) => {
    const settings = await loadSettings();
    const today = todayIst();
    const session = nextTradingDay(today, await holidaySet());
    const positions = await openPositions(settings.dryRun);
    let sells = 0;
    for (const position of positions) {
      if (!position.strategy) continue;
      const bars = await loadBars(position.symbol, 280);
      const opened = position.openedAt.slice(0, 10);
      const found = bars.findIndex((bar) => (bar.date ?? "") >= opened);
      const entryIndex = found >= 0 ? found : Math.max(0, bars.length - 1);
      const update = nextTrendStop({
        strategy: position.strategy,
        bars,
        entryIndex,
        previousStop: position.trendStop,
        params: exitFor(position.strategy, settings),
      });
      if (!update) continue;
      await q(
        `UPDATE mlive.mlive_positions SET trend_stop = $2, high_52w_flag = $3 WHERE id = $1`,
        [position.id, update.stop, update.made52w]
      );
      await audit({
        actor: "engine",
        action: "stop.updated",
        symbol: position.symbol,
        before: { stop: position.trendStop },
        after: update,
        runId,
      });
      const lastClose = bars[bars.length - 1]?.close ?? position.avgPrice;
      await syncGttToStop({
        positionId: position.id,
        symbol: position.symbol,
        qty: position.qty,
        stop: update.stop,
        strategy: position.strategy,
        lastPrice: lastClose,
        settings,
        runId,
      });
      if (!update.closeBelow || position.frozen) continue;
      await q(
        `INSERT INTO mlive.mlive_decisions
           (run_id, trade_date, position_id, side, symbol, outcome, reason_code, reason_text, sizing, dry_run)
         VALUES ($1, $2::date, $3, 'SELL', $4, 'proposed', 'trend_stop', $5, $6::jsonb, $7)
         ON CONFLICT (trade_date, side, position_id) WHERE position_id IS NOT NULL
         DO UPDATE SET
           run_id = EXCLUDED.run_id,
           reason_text = EXCLUDED.reason_text,
           sizing = EXCLUDED.sizing,
           dry_run = EXCLUDED.dry_run
         WHERE mlive.mlive_decisions.outcome IN ('proposed', 'skipped')`,
        [
          runId,
          session,
          position.id,
          position.symbol,
          `Close is below the trend stop ₹${update.stop.toFixed(2)}`,
          JSON.stringify({ qty: position.qty, limit: Number((bars[bars.length - 1].close * 0.995).toFixed(2)), stop: update.stop }),
          settings.dryRun,
        ]
      );
      sells += 1;
    }
    return { positions: positions.length, sells };
  });
}
