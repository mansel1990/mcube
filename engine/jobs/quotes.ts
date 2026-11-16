import { KiteTicker } from "kiteconnect";
import { todayIst } from "@/lib/mlive/calendar";
import { ensurePositionGtt } from "../book";
import { mq, q } from "../db";
import { MliveKite } from "../kite";
import { loadSettings } from "../load";

function istMinutes(): number {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Kolkata", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
  return Number(parts.find((part) => part.type === "hour")?.value ?? 0) * 60 + Number(parts.find((part) => part.type === "minute")?.value ?? 0);
}

async function onFill(order: { order_id?: string; status?: string; transaction_type?: string }): Promise<void> {
  if (order.status !== "COMPLETE" || order.transaction_type !== "BUY" || !order.order_id) return;
  const rows = await q<{ id: string; symbol: string; qty: number; avg_price: string; trend_stop: string | null; strategy: string | null }>(
    `SELECT p.id::text AS id, p.symbol, p.qty, p.avg_price::text AS avg_price, p.trend_stop::text AS trend_stop, p.strategy
       FROM mlive.mlive_orders o
       JOIN mlive.mlive_positions p ON p.symbol = o.symbol AND p.closed_at IS NULL
      WHERE o.kite_order_id = $1
      LIMIT 1`,
    [order.order_id]
  );
  const row = rows[0];
  if (!row || !quoteRunId) return;
  const settings = await loadSettings();
  const kite = new MliveKite(settings.dryRun);
  await ensurePositionGtt(Number(row.id), {
    symbol: row.symbol,
    filledQty: row.qty,
    avgPrice: Number(row.avg_price),
    stop: row.trend_stop == null ? null : Number(row.trend_stop),
    strategy: row.strategy === "ema" ? "ema" : row.strategy === "rs" ? "rs" : null,
    settings,
    kite,
    runId: quoteRunId,
  });
}

let quoteRunId = 0;

export async function quotes(): Promise<void> {
  if (istMinutes() > 15 * 60 + 30) {
    console.log("quotes: market is closed");
    return;
  }
  const apiKey = process.env.KITE_API_KEY;
  if (!apiKey) throw new Error("KITE_API_KEY is not set");
  const kite = new MliveKite(false);
  const token = await kite.accessToken();
  const positions = await q<{ symbol: string }>(`SELECT symbol FROM mlive.mlive_positions WHERE closed_at IS NULL`);
  const symbols = positions.map((row) => row.symbol);
  let tokens: number[] = [];
  try {
    if (symbols.length) {
      const rows = await mq<{ token: string }>(`SELECT token::text AS token FROM instruments WHERE symbol = ANY($1::text[])`, [symbols]);
      tokens = rows.map((row) => Number(row.token));
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
  }
  if (tokens.length === 0) {
    console.log("quotes: no instrument tokens yet, so the feed is not opened and no new entries should be sent");
    return;
  }
  try {
    const created = await q<{ id: string }>(`INSERT INTO mlive.mlive_runs (kind, status) VALUES ('quotes', 'running') RETURNING id`);
    quoteRunId = Number(created[0]?.id ?? 0);
  } catch {
    quoteRunId = 0;
  }
  const ticker = new KiteTicker({ api_key: apiKey, access_token: token });
  const symbolByToken = new Map<number, string>();
  const listed = await mq<{ token: string; symbol: string }>(`SELECT token::text AS token, symbol FROM instruments WHERE token = ANY($1::bigint[])`, [tokens]);
  for (const row of listed) symbolByToken.set(Number(row.token), row.symbol);
  ticker.on("connect", () => {
    ticker.subscribe(tokens);
    ticker.setMode(ticker.modeFull, tokens);
  });
  ticker.on("ticks", (ticks) => {
    for (const tick of ticks) {
      const symbol = symbolByToken.get(tick.instrument_token);
      const price = tick.last_price;
      if (!symbol || price == null) continue;
      void q(
        `INSERT INTO mlive.mlive_quotes (symbol, price, as_of) VALUES ($1, $2, now())
         ON CONFLICT (symbol) DO UPDATE SET price = EXCLUDED.price, as_of = now()`,
        [symbol, price]
      );
    }
  });
  ticker.on("order_update", (order: { order_id?: string; status?: string; transaction_type?: string }) => {
    void onFill(order);
  });
  ticker.connect();
  await new Promise<void>((resolve) => {
    const close = setInterval(() => {
      if (istMinutes() > 15 * 60 + 30) {
        ticker.disconnect();
        clearInterval(close);
        console.log(`quotes: closed after the session ${todayIst()}`);
        resolve();
      }
    }, 30_000);
  });
}
