import { istMinutes, nextTradingDay, todayIst } from "@/lib/mlive/calendar";
import {
  entryBelowEma,
  initialStop,
  limitPrice,
  normaliseScores,
  rawSignalScore,
  stripNs,
  type Strategy,
} from "@/lib/mlive/rules";
import { raiseAlert } from "../alerts";
import { num, q } from "../db";
import { holidaySet, loadSettings } from "../load";
import { loadBars } from "../market";
import { runJob } from "../run";

type SignalRow = {
  symbol: string;
  cmp: unknown;
  volume_ratio: unknown;
  rsi: unknown;
  signal_strength: string | null;
};

export async function importIdeas(): Promise<void> {
  await runJob("import-ideas", async (runId) => {
    const today = todayIst();
    const settings = await loadSettings();
    const holidays = await holidaySet();
    const validFor = nextTradingDay(today, holidays);
    const batches: Array<{ strategy: Strategy; table: string }> = [
      { strategy: "rs", table: "swing.rs_signals" },
      { strategy: "ema", table: "swing.ema_signals" },
    ];
    const staged: Array<{ strategy: Strategy; symbol: string; score: number; close: number; stop: number | null; raw: SignalRow }> = [];
    for (const batch of batches) {
      if (!settings.strategies.includes(batch.strategy)) continue;
      const rows = await q<SignalRow>(
        `SELECT symbol, cmp, volume_ratio, rsi, signal_strength FROM ${batch.table} WHERE date = $1::date`,
        [today]
      );
      for (const row of rows) {
        const symbol = stripNs(String(row.symbol));
        const close = num(row.cmp);
        const bars = await loadBars(symbol);
        const params = batch.strategy === "rs" ? settings.exitRs : settings.exitEma;
        const stop = close > 0 ? initialStop(batch.strategy, bars, close, params) : null;
        staged.push({
          strategy: batch.strategy,
          symbol,
          score: rawSignalScore({
            signal_strength: row.signal_strength,
            rsi: row.rsi == null ? null : num(row.rsi),
            volume_ratio: row.volume_ratio == null ? null : num(row.volume_ratio),
          }),
          close,
          stop,
          raw: row,
        });
      }
    }
    if (staged.length === 0 && istMinutes() >= 18 * 60 + 40) {
      await raiseAlert({
        level: "problem",
        code: "bad_data",
        message: "No RS or EMA scanner rows for today",
        runId,
      });
    }
    const ranked = normaliseScores(staged.map((row) => ({ symbol: row.symbol, strategy: row.strategy, score: row.score })));
    let saved = 0;
    for (const row of staged) {
      const norm = ranked.find((item) => item.symbol === row.symbol && item.strategy === row.strategy)?.norm ?? 0;
      const entry = row.close > 0 ? limitPrice(row.close, settings.limitOffset) : 0;
      const stop = row.strategy === "ema" && row.stop != null && entryBelowEma(entry, row.stop) ? row.stop : row.stop;
      await q(
        `INSERT INTO mlive.mlive_ideas
           (scan_date, valid_for, symbol, strategy, score, signal_close, initial_stop, sector, raw)
         VALUES (
           $1::date, $2::date, $3, $4, $5, $6, $7,
           (SELECT sector FROM mlive.mlive_instruments WHERE symbol = $3),
           $8::jsonb
         )
         ON CONFLICT (scan_date, symbol, strategy) DO UPDATE SET
           valid_for = EXCLUDED.valid_for,
           score = EXCLUDED.score,
           signal_close = EXCLUDED.signal_close,
           initial_stop = EXCLUDED.initial_stop,
           sector = EXCLUDED.sector,
           raw = EXCLUDED.raw`,
        [today, validFor, row.symbol, row.strategy, norm, row.close, stop, JSON.stringify({ ...row.raw, entryBelowStop: row.strategy === "ema" && row.stop != null && entryBelowEma(entry, row.stop) })]
      );
      saved += 1;
    }
    return { saved, validFor };
  });
}
