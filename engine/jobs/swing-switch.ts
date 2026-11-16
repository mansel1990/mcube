import { q } from "../db";

const NEXT = ["trend_breakout", "rsi2", "momentum", "ema_v2"];

/** After ten live trades of a passed swing strategy, stop opening new RS and EMA positions. */
export async function swingSwitch(): Promise<void> {
  const passed = await q<{ strategy: string }>(
    `SELECT strategy FROM mlive.mlive_research
      WHERE book = 'swing' AND passed = true
      GROUP BY strategy
     HAVING count(DISTINCT sample) = 2`
  );
  if (passed.length < 2) {
    console.log("swing-switch: fewer than two swing strategies have passed");
    return;
  }
  const names = passed.map((row) => row.strategy).filter((name) => NEXT.includes(name));
  const rows = await q<{ n: string }>(
    `SELECT count(*)::text AS n FROM mlive.mlive_positions
      WHERE book = 'swing' AND strategy = ANY($1::text[]) AND closed_at IS NOT NULL AND dry_run = false`,
    [names]
  );
  const closed = Number(rows[0]?.n ?? 0);
  if (closed < 10) {
    await q(`INSERT INTO mlive.mlive_settings (key, value) VALUES ('swing_half_size', 'true') ON CONFLICT (key) DO UPDATE SET value = 'true', updated_at = now()`);
    console.log(`swing-switch: ${closed} closed trades, still at half size`);
    return;
  }
  await q(
    `INSERT INTO mlive.mlive_settings (key, value) VALUES ('strategies_enabled', $1::jsonb)
     ON CONFLICT (key) DO UPDATE SET value = $1::jsonb, updated_at = now()`,
    [JSON.stringify(names)]
  );
  await q(`INSERT INTO mlive.mlive_settings (key, value) VALUES ('swing_half_size', 'false') ON CONFLICT (key) DO UPDATE SET value = 'false', updated_at = now()`);
  console.log(`swing-switch: RS and EMA retired for new buys after ${closed} trades`);
}
