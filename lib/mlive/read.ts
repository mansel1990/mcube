import { sql } from "@/lib/sql";
import { addDays, nextTradingDay, todayIst } from "./calendar";
import { EXIT_EMA, EXIT_RS } from "./rules";

async function includeDryRows(): Promise<boolean> {
  const settings = await settingsMap();
  return settings.dry_run !== false;
}

function num(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function day(value: unknown): string | null {
  if (!value) return null;
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function json<T>(value: unknown, fallback: T): T {
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return (value as T) ?? fallback;
}

export async function settingsMap(): Promise<Record<string, unknown>> {
  const rows = await sql`SELECT key, value FROM mlive.mlive_settings`;
  const out: Record<string, unknown> = {};
  for (const row of rows) out[String(row.key)] = row.value;
  return out;
}

export async function homePayload(displayName: string) {
  const today = todayIst();
  const holidayRows = await sql`SELECT trade_date::text AS trade_date FROM mlive.mlive_holidays`;
  const nextSession = nextTradingDay(today, new Set(holidayRows.map((row) => String(row.trade_date).slice(0, 10))));
  const includeDry = await includeDryRows();
  const [stateRows, fundRows, positions, decisions, upcoming, ideas, equity, kiteRows, alerts, runs, instruments] = await Promise.all([
    sql`SELECT status, mode, peak_value, peak_date, last_eod_date, updated_at FROM mlive.mlive_state WHERE id = 1`,
    sql`SELECT COALESCE(SUM(amount), 0) AS total, MIN(ts) AS started FROM mlive.mlive_fund_ledger WHERE (${includeDry}::boolean OR dry_run = false)`,
    sql`SELECT id, symbol, strategy, qty, avg_price, trend_stop, high_52w_flag, frozen, opened_at FROM mlive.mlive_positions WHERE closed_at IS NULL AND (${includeDry}::boolean OR dry_run = false) ORDER BY opened_at`,
    sql`SELECT id, trade_date, side, symbol, outcome, reason_text, sizing FROM mlive.mlive_decisions WHERE trade_date = ${today}::date AND (${includeDry}::boolean OR dry_run = false) ORDER BY rank NULLS LAST, id`,
    sql`SELECT id, trade_date, side, symbol, outcome, reason_text, sizing FROM mlive.mlive_decisions WHERE trade_date = ${nextSession}::date AND outcome = 'proposed' AND (${includeDry}::boolean OR dry_run = false) ORDER BY id`,
    sql`SELECT symbol, strategy, score, signal_close, initial_stop FROM mlive.mlive_ideas WHERE valid_for = ${today}::date ORDER BY score DESC`,
    sql`SELECT trade_date, system_value FROM mlive.mlive_equity_daily ORDER BY trade_date`,
    sql`SELECT token_date, connected_at, kite_user_id FROM mlive.mlive_kite_sessions ORDER BY connected_at DESC LIMIT 1`,
    sql`SELECT COUNT(*)::int AS n FROM mlive.mlive_alerts WHERE seen_at IS NULL AND level = 'needs_you'`,
    sql`SELECT kind, status, finished_at FROM mlive.mlive_runs ORDER BY id DESC LIMIT 1`,
    sql`SELECT symbol, is_etf FROM mlive.mlive_instruments`,
  ]);
  const state = stateRows[0];
  const fund = num(fundRows[0]?.total);
  const invested = positions.reduce((sum, row) => sum + num(row.qty) * num(row.avg_price), 0);
  const pending = decisions
    .filter((row) => row.side === "BUY" && (row.outcome === "sent" || row.outcome === "approved"))
    .reduce((sum, row) => sum + num(json<{ qty?: number }>(row.sizing, {}).qty) * num(json<{ limit?: number }>(row.sizing, {}).limit), 0);
  const cash = fund - invested - pending;
  const lastEquity = equity.length ? num(equity[equity.length - 1].system_value) : fund;
  const account = positions.length ? cash + invested : lastEquity;
  const started = day(fundRows[0]?.started) ?? day(state?.peak_date);
  const settings = await settingsMap();
  const maxBuys = num(settings.max_buys_per_day ?? 4);
  const maxSells = num(settings.max_sells_per_day ?? 4);
  const orderRows = await sql`
    SELECT o.side FROM mlive.mlive_orders o
    JOIN mlive.mlive_decisions d ON d.id = o.decision_id
    WHERE d.trade_date = ${today}::date
      AND (${includeDry}::boolean OR d.dry_run = false)
      AND (${includeDry}::boolean OR o.dry_run = false)`;
  const buys = orderRows.filter((row) => row.side === "BUY").length;
  const sells = orderRows.filter((row) => row.side === "SELL").length;
  const kite = kiteRows[0];
  const connected = day(kite?.token_date) === today;
  const peak = num(state?.peak_value ?? fund);
  const drawdown = peak > 0 ? Math.max(0, (1 - account / peak) * 100) : 0;
  const [highRows, gttRows, checkRows] = await Promise.all([
    positions.length
      ? sql`SELECT UPPER(ticker) AS symbol, MAX(high) AS high
              FROM stocks.daily_ohlcv
             WHERE date >= CURRENT_DATE - INTERVAL '370 days'
               AND UPPER(ticker) = ANY(${positions.map((row) => String(row.symbol))}::text[])
             GROUP BY 1`
      : Promise.resolve([]),
    sql`SELECT position_id, status FROM mlive.mlive_gtts WHERE status IN ('active', 'DRY') AND (${includeDry}::boolean OR dry_run = false)`,
    sql`SELECT finished_at FROM mlive.mlive_runs WHERE kind = 'preflight' AND status = 'ok' ORDER BY id DESC LIMIT 1`,
  ]);
  const highBySymbol = new Map(highRows.map((row) => [String(row.symbol), num(row.high)]));
  const gttIds = new Set(gttRows.map((row) => num(row.position_id)));
  const needsYou = [...decisions.filter((row) => row.outcome === "proposed"), ...upcoming];
  const passed = decisions.filter((row) => row.outcome === "proposed" || row.outcome === "approved" || row.outcome === "sent").length;
  const activity = await sql`
    SELECT d.trade_date, d.side, d.symbol, d.outcome, d.reason_text, o.filled_qty, o.avg_price, o.qty, o.limit_price
      FROM mlive.mlive_decisions d
      LEFT JOIN mlive.mlive_orders o ON o.decision_id = d.id
     WHERE (${includeDry}::boolean OR d.dry_run = false)
     ORDER BY d.id DESC LIMIT 8`;
  return {
    today,
    displayName,
    state: {
      status: String(state?.status ?? "active"),
      mode: String(state?.mode ?? "approve"),
      dryRun: settings.dry_run !== false,
      drawdown,
      breakerPct: num(settings.breaker_pct ?? 0.25) * 100,
    },
    kite: {
      connected,
      at: kite?.connected_at ? new Date(String(kite.connected_at)).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" }) : null,
      clientId: kite?.kite_user_id ? String(kite.kite_user_id) : null,
      checkedAt: checkRows[0]?.finished_at
        ? new Date(String(checkRows[0].finished_at)).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })
        : null,
      matches: !positions.some((row) => row.frozen === true),
    },
    engine: runs[0] ? { kind: String(runs[0].kind), status: String(runs[0].status), at: runs[0].finished_at } : null,
    fund,
    cash,
    invested,
    account,
    started,
    change: account - fund,
    trades: { buys, sells, maxBuys, maxSells, waiting: needsYou.length },
    fundUsed: fund > 0 ? Math.round((invested / fund) * 100) : 0,
    needsYou: needsYou.map((row) => ({
      id: num(row.id),
      side: String(row.side),
      symbol: String(row.symbol),
      text: String(row.reason_text ?? ""),
      sizing: json<{ qty?: number; limit?: number }>(row.sizing, {}),
    })),
    holdings: positions.map((row) => ({
      id: num(row.id),
      symbol: String(row.symbol),
      strategy: String(row.strategy ?? "rs"),
      qty: num(row.qty),
      avg: num(row.avg_price),
      stop: num(row.trend_stop),
      high: highBySymbol.get(String(row.symbol)) ?? 0,
      gtt: gttIds.has(num(row.id)),
      sellProposed: needsYou.some((item) => item.side === "SELL" && item.symbol === row.symbol),
      since: day(row.opened_at),
      frozen: row.frozen === true,
      flagged: row.high_52w_flag === true,
    })),
    ideas: {
      total: ideas.length,
      passed,
      picked: needsYou.filter((row) => row.side === "BUY").length,
      rows: ideas.map((row) => {
        const decision = decisions.find((item) => item.symbol === row.symbol);
        return {
          symbol: String(row.symbol),
          strategy: String(row.strategy),
          result: decision ? String(decision.outcome) : "logged",
          reason: decision ? String(decision.reason_text ?? "") : "",
        };
      }),
    },
    activity: activity.map((row) => ({
      date: day(row.trade_date),
      side: String(row.side),
      symbol: String(row.symbol),
      outcome: String(row.outcome),
      detail: String(row.reason_text ?? ""),
      qty: num(row.filled_qty || row.qty),
      price: num(row.avg_price || row.limit_price),
    })),
    spark: equity.map((row) => ({ date: day(row.trade_date), value: num(row.system_value) })),
    unseen: num(alerts[0]?.n),
    instrumentCount: instruments.length,
  };
}

export async function chartsPayload(range: string) {
  const includeDry = await includeDryRows();
  const rows = await sql`
    SELECT trade_date, system_value, peak, drawdown_pct
      FROM mlive.mlive_equity_daily ORDER BY trade_date`;
  const all = rows.map((row) => ({
    date: day(row.trade_date) ?? "",
    value: num(row.system_value),
    peak: num(row.peak),
    drawdown: num(row.drawdown_pct),
  }));
  const series = range === "1m" ? all.slice(-22) : all;
  const byStrategy = await sql`
    SELECT strategy, COALESCE(SUM(realised_pnl), 0) AS pnl
      FROM mlive.mlive_positions WHERE (${includeDry}::boolean OR dry_run = false) GROUP BY strategy`;
  return {
    series,
    strategies: byStrategy.map((row) => ({ strategy: String(row.strategy ?? "rs"), pnl: num(row.pnl) })),
    breakerPct: 25,
  };
}

export async function ledgerPayload() {
  const includeDry = await includeDryRows();
  const rows = await sql`
    SELECT r.trade_date, r.text, r.decision_summary, e.system_value
      FROM mlive.mlive_daily_reports r
      LEFT JOIN mlive.mlive_equity_daily e ON e.trade_date = r.trade_date
     ORDER BY r.trade_date DESC LIMIT 60`;
  const closed = await sql`
    SELECT COUNT(*)::int AS n,
           COALESCE(SUM(CASE WHEN realised_pnl > 0 THEN 1 ELSE 0 END), 0)::int AS wins,
           COALESCE(SUM(realised_pnl), 0) AS pnl,
           COALESCE(SUM(charges), 0) AS charges
      FROM mlive.mlive_positions WHERE closed_at IS NOT NULL AND (${includeDry}::boolean OR dry_run = false)`;
  const summary = closed[0];
  const n = num(summary?.n);
  const wins = num(summary?.wins);
  return {
    tiles: {
      closed: n,
      winRate: n ? Math.round((wins / n) * 100) : 0,
      realised: num(summary?.pnl),
      charges: num(summary?.charges),
    },
    rows: rows.map((row) => ({
      date: day(row.trade_date),
      text: String(row.text ?? "No action"),
      summary: row.decision_summary,
      value: row.system_value == null ? null : num(row.system_value),
    })),
  };
}

export async function alertsPayload(page: number) {
  const size = 30;
  const offset = page * size;
  const rows = await sql`
    SELECT id, ts, level, code, message, symbol, seen_at
      FROM mlive.mlive_alerts ORDER BY id DESC LIMIT ${size} OFFSET ${offset}`;
  return rows.map((row) => ({
    id: num(row.id),
    ts: String(row.ts),
    level: String(row.level),
    code: String(row.code),
    message: String(row.message),
    symbol: row.symbol ? String(row.symbol) : null,
    seen: row.seen_at != null,
  }));
}

export async function auditPayload(page: number, actor: string | null) {
  const size = 40;
  const offset = page * size;
  const rows = actor
    ? await sql`
        SELECT id, ts, actor, action, symbol, reason
          FROM mlive.mlive_audit_log WHERE actor = ${actor}
         ORDER BY id DESC LIMIT ${size} OFFSET ${offset}`
    : await sql`
        SELECT id, ts, actor, action, symbol, reason
          FROM mlive.mlive_audit_log ORDER BY id DESC LIMIT ${size} OFFSET ${offset}`;
  return rows.map((row) => ({
    id: num(row.id),
    ts: String(row.ts),
    actor: String(row.actor),
    action: String(row.action),
    symbol: row.symbol ? String(row.symbol) : null,
    reason: row.reason ? String(row.reason) : "",
  }));
}

export function reviewDate(anchor: string, days: number): string {
  return addDays(anchor, days);
}

export const EXIT_COPY = {
  rs: EXIT_RS,
  ema: EXIT_EMA,
};
