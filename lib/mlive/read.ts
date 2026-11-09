import { sql } from "@/lib/sql";
import { kiteSessionStatus, kiteTokenDay, readKiteFunds } from "./kite-session";
import { addDays, nextTradingDay, sessionsBack, todayIst } from "./calendar";
import {
  EXIT_EMA,
  EXIT_RS,
  actionsForEngineGroup,
  decisionSentence,
  engineGroup,
  ledgerDay,
  ledgerOutcome,
  orderLabel,
  orderSentence,
  showsHolding,
  engineSpendable,
  knownEngineActions,
  kiteCashMessage,
  type AuditView,
  type EngineGroupId,
} from "./rules";

async function includeDryRows(): Promise<boolean> {
  const settings = await settingsMap();
  return settings.dry_run !== false;
}

function num(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

function day(value: unknown): string | null {
  return kiteTokenDay(value);
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
  const [stateRows, fundRows, positions, decisions, upcoming, ideas, equity, kiteStatus, alerts, runs, instruments] = await Promise.all([
    sql`SELECT status, mode, peak_value, peak_date::text AS peak_date, last_eod_date::text AS last_eod_date, updated_at FROM mlive.mlive_state WHERE id = 1`,
    sql`SELECT COALESCE(SUM(amount), 0) AS total, MIN(ts) AS started FROM mlive.mlive_fund_ledger WHERE (${includeDry}::boolean OR dry_run = false)`,
    sql`SELECT id, symbol, strategy, qty, avg_price, trend_stop, high_52w_flag, frozen, opened_at FROM mlive.mlive_positions WHERE closed_at IS NULL AND qty > 0 AND (${includeDry}::boolean OR dry_run = false) ORDER BY opened_at`,
    sql`SELECT d.id, d.trade_date::text AS trade_date, d.side, d.symbol, d.outcome, d.reason_code, d.reason_text, d.sizing,
               o.status AS order_status, o.qty AS order_qty, o.filled_qty, o.avg_price AS fill_price, o.limit_price AS order_limit, o.kind AS order_kind
          FROM mlive.mlive_decisions d
          LEFT JOIN LATERAL (
            SELECT status, qty, filled_qty, avg_price, limit_price, kind
              FROM mlive.mlive_orders
             WHERE decision_id = d.id
             ORDER BY id DESC
             LIMIT 1
          ) o ON true
         WHERE d.trade_date = ${today}::date AND (${includeDry}::boolean OR d.dry_run = false)
         ORDER BY d.rank NULLS LAST, d.id`,
    sql`SELECT id, trade_date::text AS trade_date, side, symbol, outcome, reason_code, reason_text, sizing FROM mlive.mlive_decisions WHERE trade_date = ${nextSession}::date AND outcome = 'proposed' AND (${includeDry}::boolean OR dry_run = false) ORDER BY id`,
    sql`SELECT symbol, strategy, sector, score, signal_close, initial_stop FROM mlive.mlive_ideas WHERE valid_for = ${today}::date ORDER BY score DESC`,
    sql`SELECT trade_date::text AS trade_date, system_value FROM mlive.mlive_equity_daily ORDER BY trade_date`,
    kiteSessionStatus(today),
    sql`SELECT COUNT(*)::int AS n FROM mlive.mlive_alerts WHERE seen_at IS NULL AND level = 'needs_you'`,
    sql`SELECT kind, status, finished_at FROM mlive.mlive_runs ORDER BY id DESC LIMIT 1`,
    sql`SELECT symbol, is_etf FROM mlive.mlive_instruments`,
  ]);
  const state = stateRows[0];
  const fund = num(fundRows[0]?.total);
  const picture = await cashPicture();
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
  const connected = kiteStatus.connected;
  const peak = num(state?.peak_value ?? fund);
  const drawdown = peak > 0 ? Math.max(0, (1 - account / peak) * 100) : 0;
  const heldSymbols = positions.map((row) => String(row.symbol));
  const [highRows, gttRows, checkRows, stopReasonRows] = await Promise.all([
    positions.length
      ? sql`SELECT UPPER(ticker) AS symbol, MAX(high) AS high
              FROM stocks.daily_ohlcv
             WHERE date >= CURRENT_DATE - INTERVAL '370 days'
               AND UPPER(ticker) = ANY(${heldSymbols}::text[])
             GROUP BY 1`
      : Promise.resolve([]),
    sql`SELECT position_id, status FROM mlive.mlive_gtts WHERE status IN ('active', 'DRY') AND (${includeDry}::boolean OR dry_run = false)`,
    sql`SELECT finished_at FROM mlive.mlive_runs WHERE kind = 'preflight' AND status = 'ok' ORDER BY id DESC LIMIT 1`,
    positions.length
      ? sql`SELECT DISTINCT ON (UPPER(symbol)) UPPER(symbol) AS symbol, message
              FROM mlive.mlive_alerts
             WHERE code = 'gtt_failed'
               AND UPPER(symbol) = ANY(${heldSymbols}::text[])
             ORDER BY UPPER(symbol), id DESC`
      : Promise.resolve([]),
  ]);
  const highBySymbol = new Map(highRows.map((row) => [String(row.symbol), num(row.high)]));
  const gttIds = new Set(gttRows.map((row) => num(row.position_id)));
  const stopReasonBySymbol = new Map(
    stopReasonRows.map((row) => [String(row.symbol), String(row.message ?? "").trim()])
  );
  const needsYou = [...decisions.filter((row) => row.outcome === "proposed"), ...upcoming];
  const buyDecisions = decisions.filter((row) => row.side === "BUY");
  const passed = buyDecisions.filter((row) => row.outcome === "proposed" || row.outcome === "approved" || row.outcome === "sent").length;
  const since = sessionsBack(today, 10, new Set(holidayRows.map((row) => String(row.trade_date).slice(0, 10))));
  const activity = await sql`
    SELECT placed_at, side, symbol, status, kind, filled_qty, avg_price, qty, limit_price, dry_run
      FROM mlive.mlive_orders
     WHERE placed_at::date >= ${since}::date
       AND (${includeDry}::boolean OR dry_run = false)
       AND (kind = 'gtt_exit' OR status IN ('OPEN', 'COMPLETE', 'CANCELLED', 'REJECTED', 'DRY', 'TRIGGER PENDING', 'PUT ORDER REQ RECEIVED'))
     ORDER BY placed_at DESC NULLS LAST, id DESC
     LIMIT 30`;
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
      at: kiteStatus.connectedAt
        ? new Date(kiteStatus.connectedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })
        : null,
      clientId: kiteStatus.kiteUserId,
      checkedAt: checkRows[0]?.finished_at
        ? new Date(String(checkRows[0].finished_at)).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })
        : null,
      matches: !positions.some((row) => row.frozen === true),
    },
    engine: runs[0] ? { kind: String(runs[0].kind), status: String(runs[0].status), at: runs[0].finished_at } : null,
    fund,
    tradingLimit: picture.tradingLimit,
    kiteCash: picture.kiteFunds.cash,
    engineCanUse: picture.engineCanUse,
    cashNote: picture.note,
    cash,
    invested,
    account,
    started,
    change: account - fund,
    trades: { buys, sells, maxBuys, maxSells, waiting: needsYou.length },
    fundUsed: fund > 0 ? Math.round((invested / fund) * 100) : 0,
    needsYou: needsYou.map((row) => {
      const sizing = json<SizingBits>(row.sizing, {});
      return {
        id: num(row.id),
        side: String(row.side),
        symbol: String(row.symbol),
        text: sentenceFor(row, sizing, settings),
        raw: sizing.text ?? "",
        sizing,
      };
    }),
    holdings: positions.filter((row) => showsHolding(num(row.qty))).map((row) => ({
      id: num(row.id),
      symbol: String(row.symbol),
      strategy: String(row.strategy ?? "rs"),
      qty: num(row.qty),
      avg: num(row.avg_price),
      stop: num(row.trend_stop),
      high: highBySymbol.get(String(row.symbol)) ?? 0,
      gtt: gttIds.has(num(row.id)),
      stopReason: gttIds.has(num(row.id)) ? null : stopReasonBySymbol.get(String(row.symbol).toUpperCase()) || null,
      sellProposed: needsYou.some((item) => item.side === "SELL" && item.symbol === row.symbol),
      since: day(row.opened_at),
      frozen: row.frozen === true,
      flagged: row.high_52w_flag === true,
    })),
    ideas: {
      total: buyDecisions.length,
      passed,
      picked: buyDecisions.filter((row) => row.outcome === "sent").length,
      rows: ideas.map((row) => {
        const decision = decisions.find((item) => item.symbol === row.symbol && item.side === "BUY");
        const sizing = json<SizingBits>(decision?.sizing, {});
        return {
          symbol: String(row.symbol),
          strategy: String(row.strategy),
          result: decision ? String(decision.outcome) : "logged",
          reason: decision
            ? sentenceFor({ ...decision, sector: row.sector }, sizing, settings)
            : "Logged. The engine has not decided yet.",
          raw: sizing.text || (String(decision?.reason_text ?? "").includes("÷") ? String(decision?.reason_text) : ""),
        };
      }),
    },
    cashSkipped: buyDecisions.some((row) => row.outcome === "skipped" && ["no_funds", "too_small", "limit", "pacing_day", "pacing_strategy", "pacing_cash"].includes(String(row.reason_code))),
    kiteCashUnknown: connected && picture.kiteFunds.cash == null,
    activity: activity.map((row) => {
      const status = String(row.status ?? "");
      const ordered = num(row.qty);
      const filled = num(row.filled_qty);
      const average = num(row.avg_price);
      const limit = num(row.limit_price);
      const side = String(row.kind) === "gtt_exit" ? "SELL" : String(row.side);
      return {
        date: day(row.placed_at),
        side,
        symbol: String(row.symbol),
        outcome: orderLabel(status, ordered, filled),
        detail: orderSentence({
          side,
          status,
          ordered,
          filled,
          limit,
          average,
          reasonCode: String(row.kind) === "gtt_exit" ? "gtt_exit" : null,
        }),
        qty: filled > 0 ? filled : ordered,
        price: average > 0 ? average : limit,
      };
    }),
    spark: equity.map((row) => ({ date: day(row.trade_date), value: num(row.system_value) })),
    unseen: num(alerts[0]?.n),
    instrumentCount: instruments.length,
  };
}

export async function chartsPayload(range: string) {
  const includeDry = await includeDryRows();
  const rows = await sql`
    SELECT trade_date::text AS trade_date, system_value, peak, drawdown_pct
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
  const settings = await settingsMap();
  const rows = await sql`
    SELECT r.trade_date::text AS trade_date, r.text, r.decision_summary, e.system_value
      FROM mlive.mlive_daily_reports r
      LEFT JOIN mlive.mlive_equity_daily e ON e.trade_date = r.trade_date
     ORDER BY r.trade_date DESC LIMIT 60`;
  const closed = await sql`
    SELECT COUNT(*)::int AS n,
           COALESCE(SUM(CASE WHEN realised_pnl > 0 THEN 1 ELSE 0 END), 0)::int AS wins,
           COALESCE(SUM(realised_pnl), 0) AS pnl,
           COALESCE(SUM(charges), 0) AS charges
      FROM mlive.mlive_positions WHERE closed_at IS NOT NULL AND (${includeDry}::boolean OR dry_run = false)`;
  const decided = await sql`
    SELECT d.trade_date::text AS trade_date, d.side, d.symbol, d.outcome, d.reason_code, d.reason_text, d.sizing, i.sector,
           o.status AS order_status, o.qty AS order_qty, o.filled_qty, o.avg_price AS fill_price, o.limit_price AS order_limit, o.kind AS order_kind
      FROM mlive.mlive_decisions d
      LEFT JOIN mlive.mlive_ideas i ON i.id = d.idea_id
      LEFT JOIN LATERAL (
        SELECT status, qty, filled_qty, avg_price, limit_price, kind
          FROM mlive.mlive_orders
         WHERE decision_id = d.id
         ORDER BY id DESC
         LIMIT 1
      ) o ON true
     WHERE (${includeDry}::boolean OR d.dry_run = false)
     ORDER BY d.id`;
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
    rows: rows.map((row) => {
      const date = day(row.trade_date);
      const dayDecisions = decided.filter((item) => day(item.trade_date) === date);
      const stored = String(row.text ?? "").trim();
      const summary = ledgerDay(dayDecisions.map((item) => ({
        symbol: String(item.symbol ?? ""),
        outcome: ledgerOutcome(String(item.outcome ?? ""), {
          status: item.order_status == null ? null : String(item.order_status),
          ordered: num(item.order_qty),
          filled: num(item.filled_qty),
        }),
        side: item.side == null ? null : String(item.side),
        reasonCode: item.reason_code == null ? null : String(item.reason_code),
        sentence: sentenceFor(item, json<SizingBits>(item.sizing, {}), settings),
      })));
      const detail = dayDecisions.length || !stored || stored === "Morning draft" ? summary.detail : stored;
      return {
        date,
        label: summary.label,
        tone: summary.tone,
        text: detail,
        items: summary.items,
        value: row.system_value == null ? null : num(row.system_value),
      };
    }),
  };
}

export async function alertsPayload(page: number, openOnly = false) {
  const size = 30;
  const offset = page * size;
  const rows = openOnly
    ? await sql`
        SELECT id, ts, level, code, message, symbol, seen_at
          FROM mlive.mlive_alerts WHERE seen_at IS NULL ORDER BY id DESC`
    : await sql`
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

const AUDIT_PAGE = 25;
const AUDIT_VIEWS: readonly AuditView[] = ["all", "working", "bought", "sold", "engine", "you"];

export async function auditPayload(input: { page: number; view: string; group: string; symbol: string | null }) {
  const view = AUDIT_VIEWS.includes(input.view as AuditView) ? (input.view as AuditView) : "all";
  const group = (["all", "sizing", "runs", "skips", "stops", "holdings", "alerts", "problems", "recheck", "other"] as const).includes(input.group as EngineGroupId)
    ? (input.group as EngineGroupId)
    : "all";
  const page = Number.isFinite(input.page) && input.page > 0 ? Math.floor(input.page) : 0;
  const symbol = input.symbol?.trim() || null;
  const offset = page * AUDIT_PAGE;
  const where = auditWhere(view, view === "engine" ? group : "all");
  const params = [symbol, where.actions, !where.runsOnly, !where.onlyOther, knownEngineActions(), AUDIT_PAGE, offset];
  const rows = await sql.query(
    view === "engine"
      ? `SELECT max(id) AS id, max(ts) AS ts,
                (array_agg(actor ORDER BY id DESC))[1] AS actor,
                action, symbol, coalesce(reason, '') AS reason,
                (array_agg(after ORDER BY id DESC))[1] AS after,
                count(*)::int AS repeat
           FROM mlive.mlive_audit_log
          WHERE ${where.sql}
          GROUP BY (timezone('Asia/Kolkata', ts))::date, action, symbol, coalesce(reason, '')
          ORDER BY max(id) DESC
          LIMIT $6 OFFSET $7`
      : `SELECT id, ts, actor, action, symbol, coalesce(reason, '') AS reason, after, 1::int AS repeat
           FROM mlive.mlive_audit_log
          WHERE ${where.sql}
          ORDER BY id DESC
          LIMIT $6 OFFSET $7`,
    params
  );
  const totalRows = view === "engine"
    ? await engineGroupCounts(symbol)
    : await sql.query(
        `SELECT count(*)::int AS n FROM mlive.mlive_audit_log WHERE ${where.sql}`,
        [symbol, where.actions, !where.runsOnly, !where.onlyOther, knownEngineActions()]
      );
  const groups = view === "engine" ? (totalRows as { id: EngineGroupId; count: number }[]) : [];
  const total = view === "engine"
    ? groups.find((item) => item.id === group)?.count ?? 0
    : num((totalRows as { n?: unknown }[])[0]?.n);
  return {
    rows: (rows as Record<string, unknown>[]).map(auditRow),
    page,
    pageSize: AUDIT_PAGE,
    total,
    groups,
  };
}

function auditWhere(view: AuditView, group: EngineGroupId): { sql: string; actions: string[] | null; runsOnly: boolean; onlyOther: boolean } {
  const symbol = `($1::text IS NULL OR symbol = $1)`;
  const action = `(
    ($2::text[] IS NULL OR action = ANY($2))
    AND ($3::boolean OR (action LIKE 'run.%' AND action <> 'run.error'))
    AND ($4::boolean OR (action NOT LIKE 'run.%' AND action <> ALL($5::text[])))
  )`;
  const runsOnly = group === "runs";
  const onlyOther = group === "other";
  const actions = actionsForEngineGroup(group);
  if (view === "you") return { sql: `actor NOT IN ('engine', 'kite') AND ${symbol} AND ${action}`, actions, runsOnly, onlyOther };
  if (view === "working") {
    return { sql: `action IN ('order.sent', 'gtt.exit') AND ${symbol} AND ${action}`, actions, runsOnly, onlyOther };
  }
  if (view === "bought") {
    return {
      sql: `action = 'fill' AND upper(coalesce(after->>'side','')) <> 'SELL' AND ${symbol} AND ${action}`,
      actions,
      runsOnly,
      onlyOther,
    };
  }
  if (view === "sold") {
    return {
      sql: `((action = 'fill' AND upper(coalesce(after->>'side','')) = 'SELL') OR action = 'position.marked_sold') AND ${symbol} AND ${action}`,
      actions,
      runsOnly,
      onlyOther,
    };
  }
  if (view === "engine") {
    return {
      sql: `actor IN ('engine', 'kite') AND upper(coalesce(after->>'side','')) NOT IN ('BUY', 'SELL') AND action NOT IN ('order.sent', 'fill', 'gtt.exit', 'position.marked_sold') AND ${symbol} AND ${action}`,
      actions,
      runsOnly,
      onlyOther,
    };
  }
  return { sql: `${symbol} AND ${action}`, actions, runsOnly, onlyOther };
}

const ENGINE_GROUP_IDS: EngineGroupId[] = ["all", "sizing", "runs", "skips", "stops", "holdings", "alerts", "problems", "recheck", "other"];

async function engineGroupCounts(symbol: string | null): Promise<{ id: EngineGroupId; count: number }[]> {
  const rows = await sql.query(
    `SELECT action, count(*)::int AS n FROM (
       SELECT action
         FROM mlive.mlive_audit_log
        WHERE actor IN ('engine', 'kite')
          AND upper(coalesce(after->>'side','')) NOT IN ('BUY', 'SELL')
          AND action NOT IN ('order.sent', 'fill', 'gtt.exit', 'position.marked_sold')
          AND ($1::text IS NULL OR symbol = $1)
        GROUP BY (timezone('Asia/Kolkata', ts))::date, action, symbol, coalesce(reason, '')
     ) grouped
     GROUP BY action`,
    [symbol]
  );
  const counts = new Map<EngineGroupId, number>();
  for (const item of ENGINE_GROUP_IDS) counts.set(item, 0);
  let all = 0;
  for (const row of rows as { action?: unknown; n?: unknown }[]) {
    const id = engineGroup(String(row.action ?? ""));
    const n = num(row.n);
    counts.set(id, (counts.get(id) ?? 0) + n);
    all += n;
  }
  counts.set("all", all);
  return ENGINE_GROUP_IDS.map((id) => ({ id, count: counts.get(id) ?? 0 }));
}

function auditRow(row: Record<string, unknown>) {
  return {
    id: num(row.id),
    ts: String(row.ts),
    actor: String(row.actor),
    action: String(row.action),
    symbol: row.symbol ? String(row.symbol) : null,
    side: auditSide(row.after),
    reason: row.reason ? String(row.reason) : "",
    repeat: num(row.repeat) || 1,
  };
}

function auditSide(value: unknown): "BUY" | "SELL" | null {
  if (typeof value === "string") {
    try {
      return auditSide(JSON.parse(value));
    } catch {
      return null;
    }
  }
  if (!value || typeof value !== "object") return null;
  const side = (value as { side?: unknown }).side;
  if (side === "BUY" || side === "SELL") return side;
  if (typeof side === "string" && side.toUpperCase() === "BUY") return "BUY";
  if (typeof side === "string" && side.toUpperCase() === "SELL") return "SELL";
  return null;
}

type SizingBits = { qty?: number; limit?: number; stop?: number; notional?: number; text?: string };

function sentenceFor(row: Record<string, unknown>, sizing: SizingBits, settings: Record<string, unknown>): string {
  const qty = num(sizing.qty);
  const limit = num(sizing.limit);
  if (row.order_status != null) {
    return orderSentence({
      side: String(row.order_kind) === "gtt_exit" ? "SELL" : String(row.side ?? "BUY"),
      status: String(row.order_status),
      ordered: num(row.order_qty) || qty,
      filled: num(row.filled_qty),
      limit: num(row.order_limit) || limit,
      average: num(row.fill_price),
      reasonCode: String(row.order_kind) === "gtt_exit" ? "gtt_exit" : row.reason_code == null ? null : String(row.reason_code),
    });
  }
  return decisionSentence({
    outcome: String(row.outcome ?? ""),
    side: String(row.side ?? "BUY"),
    reasonCode: row.reason_code == null ? null : String(row.reason_code),
    qty,
    limit,
    stop: num(sizing.stop),
    notional: num(sizing.notional) || qty * limit,
    sector: row.sector == null ? null : String(row.sector),
    sectorCount: num(settings.max_per_sector ?? 2),
    minOrderInr: num(settings.min_order_inr ?? 8000),
    strategy: row.strategy === "ema" || row.strategy === "rs" ? row.strategy : null,
    limitCount: row.reason_code === "pacing_day"
      ? num(settings.max_new_buys_per_day ?? 2)
      : row.reason_code === "pacing_strategy"
        ? num(settings.max_buys_per_strategy_per_day ?? 2)
        : row.reason_code === "strategy_full"
          ? num(settings.max_open_per_strategy ?? 4)
          : null,
  });
}

export async function cashPicture() {
  const includeDry = await includeDryRows();
  const settings = await settingsMap();
  const [fundRows, positionRows, pendingRows, kiteFunds] = await Promise.all([
    sql`SELECT COALESCE(SUM(amount), 0) AS total FROM mlive.mlive_fund_ledger WHERE (${includeDry}::boolean OR dry_run = false)`,
    sql`SELECT COALESCE(SUM(qty * avg_price), 0) AS invested FROM mlive.mlive_positions WHERE closed_at IS NULL AND (${includeDry}::boolean OR dry_run = false)`,
    sql`SELECT COALESCE(SUM((qty - filled_qty) * limit_price), 0) AS pending FROM mlive.mlive_orders WHERE side = 'BUY' AND status NOT IN ('CANCELLED', 'REJECTED', 'COMPLETE') AND (${includeDry}::boolean OR dry_run = false)`,
    readKiteFunds(),
  ]);
  const tradingLimit = num(fundRows[0]?.total);
  const knownCash = kiteFunds.cash;
  const kite = knownCash ?? 0;
  const reserve = num(settings.cash_reserve_inr ?? 500);
  const unread = kiteFunds.connected && knownCash == null;
  return {
    kiteFunds,
    tradingLimit,
    engineCanUse: unread ? 0 : engineSpendable(tradingLimit, num(positionRows[0]?.invested), num(pendingRows[0]?.pending), kite, reserve),
    note: unread
      ? kiteFunds.error || "Kite is connected, but the cash could not be read."
      : kiteCashMessage({ dryRun: settings.dry_run !== false, system: tradingLimit, kite }),
  };
}

export function reviewDate(anchor: string, days: number): string {
  return addDays(anchor, days);
}

export const EXIT_COPY = {
  rs: EXIT_RS,
  ema: EXIT_EMA,
};
