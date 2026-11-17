import { sql } from "@/lib/sql";
import YahooFinance from "yahoo-finance2";
import {
  accountDrawdown,
  equitySeries,
  homeAccount,
  settleTrades,
  strategyFromBooks,
  type ChargeRow,
  type TradeBook,
} from "./charts";
import { kiteSessionStatus, kiteTokenDay, readKiteFunds } from "./kite-session";
import { addDays, isTradingDay, istMinutes, nextTradingDay, previousTradingDay, sessionsBack, todayIst } from "./calendar";
import { breakerReading, isCountedBuy, newBuyLimit } from "./limits";
import { includeIntradayCapital, intradayIsPlanned } from "./pnl";
import { passedIntradayStrategies, type SamplePass } from "./research-ready";
import { closedDayMove, sessionMove, todayReading, type TodayReading } from "./today-pnl";
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
  kiteCheckedAt,
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

const yahoo = new YahooFinance();

export async function liveMarks(symbols: string[]): Promise<Map<string, number>> {
  const marks = new Map<string, number>();
  const unique = [...new Set(symbols.map((symbol) => symbol.trim()).filter(Boolean))];
  if (!unique.length) return marks;
  await Promise.all(unique.map(async (symbol) => {
    const quote = await Promise.race([
      yahoo.quote(`${symbol}.NS`, { fields: ["regularMarketPrice"] }).then((row) => row).catch(() => null),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 2500)),
    ]);
    const price = quote && typeof quote.regularMarketPrice === "number" ? quote.regularMarketPrice : null;
    if (price != null && price > 0) marks.set(symbol, price);
  }));
  return marks;
}

function instant(value: unknown): number | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.getTime();
  const parsed = Date.parse(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function tradeBooks(rows: Record<string, unknown>[]): TradeBook[] {
  return rows.flatMap((row) => {
    const openedAt = instant(row.opened_at);
    if (openedAt == null) return [];
    return [{
      strategy: String(row.strategy ?? "rs"),
      realised: num(row.realised_pnl),
      closed: row.closed_at != null,
      symbol: String(row.symbol ?? ""),
      dryRun: row.dry_run === true,
      openedAt,
      closedAt: row.closed_at == null ? null : instant(row.closed_at),
    }];
  });
}

function chargeBooks(rows: Record<string, unknown>[]): ChargeRow[] {
  return rows.flatMap((row) => {
    const ts = instant(row.ts);
    if (ts == null) return [];
    return [{
      symbol: String(row.symbol ?? ""),
      dryRun: row.dry_run === true,
      amount: num(row.amount),
      ts,
    }];
  });
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

export type SwingToday = TodayReading & {
  account: number;
  drawdown: number;
};

/** Today's swing P&L, the account, and the breaker. Home and Audit both call this. */
export async function loadSwingToday(now = new Date()): Promise<SwingToday> {
  const today = todayIst(now);
  const includeDry = await includeDryRows();
  const holidayRows = await sql`SELECT trade_date::text AS trade_date FROM mlive.mlive_holidays`;
  const holidays = new Set(holidayRows.map((row) => String(row.trade_date).slice(0, 10)));
  const prevDay = previousTradingDay(today, holidays);
  const beforeOpen = isTradingDay(today, holidays) && istMinutes(now) < 9 * 60 + 15;
  const [positions, ledgerRealised, positionRealised, charges, equity, flows, stateRows, fundRows] = await Promise.all([
    sql`SELECT symbol, qty, avg_price, opened_at
          FROM mlive.mlive_positions
         WHERE closed_at IS NULL AND qty > 0
           AND coalesce(book, 'swing') <> 'intraday'
           AND (${includeDry}::boolean OR dry_run = false)`,
    sql`SELECT COALESCE(SUM(l.amount), 0) AS net, COUNT(*)::int AS n
          FROM mlive.mlive_fund_ledger l
          LEFT JOIN mlive.mlive_orders o ON o.id = l.ref_order_id
         WHERE l.kind = 'realised_pnl'
           AND (timezone('Asia/Kolkata', l.ts))::date = ${today}::date
           AND (${includeDry}::boolean OR l.dry_run = false)
           AND (o.id IS NULL OR coalesce(o.book, 'swing') <> 'intraday')`,
    sql`SELECT COALESCE(SUM(realised_pnl), 0) AS net
          FROM mlive.mlive_positions
         WHERE coalesce(book, 'swing') <> 'intraday'
           AND closed_at IS NOT NULL
           AND (timezone('Asia/Kolkata', closed_at))::date = ${today}::date
           AND (${includeDry}::boolean OR dry_run = false)`,
    sql`SELECT o.side, COALESCE(SUM(-l.amount), 0) AS charges
          FROM mlive.mlive_fund_ledger l
          JOIN mlive.mlive_orders o ON o.id = l.ref_order_id
         WHERE l.kind = 'charges'
           AND (timezone('Asia/Kolkata', l.ts))::date = ${today}::date
           AND (${includeDry}::boolean OR l.dry_run = false)
           AND coalesce(o.book, 'swing') <> 'intraday'
         GROUP BY o.side`,
    sql`SELECT trade_date::text AS trade_date, system_value FROM mlive.mlive_equity_daily ORDER BY trade_date`,
    sql`SELECT (timezone('Asia/Kolkata', ts))::date::text AS d, kind, COALESCE(SUM(amount), 0) AS amount
          FROM mlive.mlive_fund_ledger
         WHERE kind IN ('deposit', 'withdrawal')
           AND (${includeDry}::boolean OR dry_run = false)
         GROUP BY 1, 2`,
    sql`SELECT peak_value FROM mlive.mlive_state WHERE id = 1`,
    sql`SELECT COALESCE(SUM(amount), 0) AS total FROM mlive.mlive_fund_ledger WHERE (${includeDry}::boolean OR dry_run = false)`,
  ]);
  const symbols = positions.map((row) => String(row.symbol));
  const [marks, prevRows] = await Promise.all([
    liveMarks(symbols),
    symbols.length
      ? sql`SELECT UPPER(ticker) AS symbol, close
              FROM stocks.daily_ohlcv
             WHERE date = ${prevDay}::date
               AND UPPER(ticker) = ANY(${symbols}::text[])`
      : Promise.resolve([]),
  ]);
  const prevClose = new Map(prevRows.map((row) => [String(row.symbol), num(row.close)]));
  const open = positions.map((row) => {
    const avg = num(row.avg_price);
    const previous = prevClose.get(String(row.symbol).toUpperCase()) ?? 0;
    const boughtToday = day(row.opened_at) === today;
    return {
      qty: num(row.qty),
      baseline: boughtToday || !(previous > 0) ? avg : previous,
      live: marks.get(String(row.symbol)) ?? null,
    };
  });
  const sellCharges = num(charges.find((row) => String(row.side) === "SELL")?.charges);
  const buyCharges = num(charges.find((row) => String(row.side) === "BUY")?.charges);
  const realisedNet = num(ledgerRealised[0]?.n) > 0 ? num(ledgerRealised[0]?.net) : num(positionRealised[0]?.net);
  const points = equity.flatMap((row) => {
    const date = day(row.trade_date);
    return date ? [{ date, value: num(row.system_value) }] : [];
  });
  const last = [...points].reverse().find((row) => row.date < today) ?? null;
  const before = last ? [...points].reverse().find((row) => row.date < last.date) ?? null : null;
  const flow = (date: string | undefined, kind: string) => num(flows.find((row) => day(row.d) === date && row.kind === kind)?.amount);
  const yesterday = closedDayMove(last?.value ?? null, before?.value ?? null, flow(last?.date, "deposit"), flow(last?.date, "withdrawal"));
  const reading = todayReading({
    beforeOpen,
    session: sessionMove({ realisedGross: realisedNet + sellCharges, charges: buyCharges + sellCharges, open }),
    yesterday,
    base: beforeOpen ? before?.value ?? null : last?.value ?? null,
  });
  const fund = num(fundRows[0]?.total);
  const account = homeAccount({
    fund,
    positions: positions.map((row) => ({
      qty: num(row.qty),
      avgPrice: num(row.avg_price),
      live: marks.get(String(row.symbol)) ?? null,
    })),
  });
  const peak = num(stateRows[0]?.peak_value ?? fund);
  return { ...reading, account, drawdown: breakerReading(account, peak) };
}

export async function swingBuysOn(day: string): Promise<number> {
  const includeDry = await includeDryRows();
  const rows = await sql`
    SELECT o.status
      FROM mlive.mlive_orders o
      JOIN mlive.mlive_decisions d ON d.id = o.decision_id
     WHERE d.trade_date = ${day}::date
       AND o.side = 'BUY'
       AND coalesce(o.book, 'swing') <> 'intraday'
       AND (${includeDry}::boolean OR d.dry_run = false)
       AND (${includeDry}::boolean OR o.dry_run = false)`;
  return rows.filter((row) => isCountedBuy(String(row.status ?? ""))).length;
}

async function intradayResearchPasses(): Promise<SamplePass[]> {
  try {
    const rows = await sql`
      SELECT DISTINCT ON (r.strategy, u.sample)
             r.strategy, u.sample, r.passed
        FROM mlive.mlive_research_results r
        JOIN mlive.mlive_research_runs u ON u.id = r.run_id
       WHERE u.book = 'intraday'
         AND u.status = 'ok'
         AND r.is_default = true
       ORDER BY r.strategy, u.sample, u.id DESC`;
    return rows.map((row) => ({
      strategy: String(row.strategy),
      sample: String(row.sample),
      passed: row.passed === true,
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("mlive_research_results") || message.includes("mlive_research_runs")) return [];
    throw error;
  }
}

async function intradayBookState(includeDry: boolean): Promise<{ planned: boolean; capitalCounts: boolean }> {
  const [trades, deposits] = await Promise.all([
    sql`SELECT count(*)::int AS n FROM mlive.mlive_positions WHERE book = 'intraday' AND (${includeDry}::boolean OR dry_run = false)`,
    sql`SELECT count(*)::int AS n FROM mlive.mlive_fund_ledger
         WHERE kind = 'deposit' AND coalesce(note, '') ILIKE '%intraday%'
           AND (${includeDry}::boolean OR dry_run = false)`,
  ]);
  const state = { trades: num(trades[0]?.n), deposited: num(deposits[0]?.n) > 0 };
  return { planned: intradayIsPlanned(state), capitalCounts: includeIntradayCapital(state) };
}

export async function homePayload(displayName: string) {
  const today = todayIst();
  const holidayRows = await sql`SELECT trade_date::text AS trade_date FROM mlive.mlive_holidays`;
  const nextSession = nextTradingDay(today, new Set(holidayRows.map((row) => String(row.trade_date).slice(0, 10))));
  const includeDry = await includeDryRows();
  const [stateRows, fundRows, positions, decisions, upcoming, ideas, equity, kiteStatus, alerts, runs, instruments] = await Promise.all([
    sql`SELECT status, mode, halt_reason, peak_value, peak_date::text AS peak_date, last_eod_date::text AS last_eod_date, updated_at FROM mlive.mlive_state WHERE id = 1`,
    sql`SELECT COALESCE(SUM(amount), 0) AS total, MIN(ts) AS started FROM mlive.mlive_fund_ledger WHERE (${includeDry}::boolean OR dry_run = false)`,
    sql`SELECT id, symbol, strategy, qty, avg_price, trend_stop, high_52w_flag, frozen, opened_at, book FROM mlive.mlive_positions WHERE closed_at IS NULL AND qty > 0 AND (${includeDry}::boolean OR dry_run = false) ORDER BY opened_at`,
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
    sql`SELECT symbol, strategy, sector, score, signal_close, initial_stop FROM mlive.mlive_ideas WHERE valid_for = ${today}::date AND book = 'swing' ORDER BY score DESC`,
    sql`SELECT trade_date::text AS trade_date, system_value FROM mlive.mlive_equity_daily ORDER BY trade_date`,
    kiteSessionStatus(today),
    sql`SELECT COUNT(*)::int AS n FROM mlive.mlive_alerts WHERE seen_at IS NULL AND level = 'needs_you'`,
    sql`SELECT kind, status, finished_at FROM mlive.mlive_runs ORDER BY id DESC LIMIT 1`,
    sql`SELECT symbol, is_etf FROM mlive.mlive_instruments`,
  ]);
  const state = stateRows[0];
  const resumeRows = await sql`
    SELECT reason FROM mlive.mlive_audit_log
     WHERE action = 'state.auto_resume'
       AND (ts AT TIME ZONE 'Asia/Kolkata')::date = ${today}::date
     ORDER BY id DESC
     LIMIT 1`;
  const resumedAt = String(resumeRows[0]?.reason ?? "").match(/at (\d{2}:\d{2})/)?.[1] ?? null;
  const fund = num(fundRows[0]?.total);
  const swingPositions = positions.filter((row) => String(row.book ?? "swing") !== "intraday");
  const picture = await cashPicture();
  const invested = swingPositions.reduce((sum, row) => sum + num(row.qty) * num(row.avg_price), 0);
  const pending = decisions
    .filter((row) => row.side === "BUY" && (row.outcome === "sent" || row.outcome === "approved"))
    .reduce((sum, row) => sum + num(json<{ qty?: number }>(row.sizing, {}).qty) * num(json<{ limit?: number }>(row.sizing, {}).limit), 0);
  const cash = fund - invested - pending;
  const todayMove = await loadSwingToday();
  const account = todayMove.account;
  const started = day(fundRows[0]?.started) ?? day(state?.peak_date);
  const settings = await settingsMap();
  const maxBuys = newBuyLimit(settings.max_new_buys_per_day, 2);
  const maxSells = num(settings.max_sells_per_day ?? 4);
  const orderRows = await sql`
    SELECT o.side, o.book, o.status FROM mlive.mlive_orders o
    JOIN mlive.mlive_decisions d ON d.id = o.decision_id
    WHERE d.trade_date = ${today}::date
      AND (${includeDry}::boolean OR d.dry_run = false)
      AND (${includeDry}::boolean OR o.dry_run = false)`;
  const buys = orderRows.filter((row) => row.side === "BUY" && String(row.book ?? "swing") !== "intraday" && isCountedBuy(String(row.status ?? ""))).length;
  const sells = orderRows.filter((row) => row.side === "SELL").length;
  const connected = kiteStatus.connected;
  const peak = num(state?.peak_value ?? fund);
  const drawdown = todayMove.drawdown;
  const heldSymbols = swingPositions.map((row) => String(row.symbol));
  const [highRows, gttRows, sessionCheckRows, lateCheckRows, checkRows, stopReasonRows] = await Promise.all([
    swingPositions.length
      ? sql`SELECT UPPER(ticker) AS symbol, MAX(high) AS high
              FROM stocks.daily_ohlcv
             WHERE date >= CURRENT_DATE - INTERVAL '370 days'
               AND UPPER(ticker) = ANY(${heldSymbols}::text[])
             GROUP BY 1`
      : Promise.resolve([]),
    sql`SELECT position_id, status FROM mlive.mlive_gtts WHERE status IN ('active', 'DRY') AND (${includeDry}::boolean OR dry_run = false)`,
    sql`SELECT finished_at FROM mlive.mlive_runs
         WHERE kind = 'preflight' AND status = 'ok'
           AND (summary->>'session' = 'true' OR summary ? 'spendable')
         ORDER BY finished_at DESC NULLS LAST, id DESC
         LIMIT 1`,
    sql`SELECT ts FROM mlive.mlive_audit_log WHERE action = 'preflight.late' ORDER BY ts DESC, id DESC LIMIT 1`,
    sql`SELECT finished_at FROM mlive.mlive_runs WHERE kind = 'preflight' AND status = 'ok' ORDER BY id DESC LIMIT 1`,
    swingPositions.length
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
  const checked = kiteCheckedAt([
    sessionCheckRows[0]?.finished_at,
    lateCheckRows[0]?.ts,
    checkRows[0]?.finished_at,
  ]);
  const [dayOpen, dayPassed, dayPnl, intradayBook] = await Promise.all([
    sql`SELECT count(*)::int AS n FROM mlive.mlive_positions WHERE book = 'intraday' AND closed_at IS NULL AND (${includeDry}::boolean OR dry_run = false)`,
    intradayResearchPasses(),
    sql`SELECT
          COALESCE(SUM(realised_pnl), 0) AS realised,
          COALESCE(SUM(realised_pnl) FILTER (WHERE (closed_at AT TIME ZONE 'Asia/Kolkata')::date = ${today}::date), 0) AS today,
          COALESCE(SUM(realised_pnl) FILTER (WHERE to_char(closed_at AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM') = ${today.slice(0, 7)}), 0) AS month,
          COUNT(*) FILTER (WHERE (closed_at AT TIME ZONE 'Asia/Kolkata')::date = ${today}::date)::int AS trades
        FROM mlive.mlive_positions
       WHERE book = 'intraday' AND closed_at IS NOT NULL AND (${includeDry}::boolean OR dry_run = false)`,
    intradayBookState(includeDry),
  ]);
  const dayCapital = num(settings.intraday_capital_inr ?? 20000);
  const dayLossLimit = dayCapital * num(settings.intraday_day_loss_pct ?? 0.02);
  return {
    today,
    displayName,
    state: {
      status: String(state?.status ?? "active"),
      mode: String(state?.mode ?? "approve"),
      haltReason: state?.halt_reason == null || state.halt_reason === "" ? null : String(state.halt_reason),
      resumedAt,
      dryRun: settings.dry_run !== false,
      drawdown,
      breakerPct: num(settings.breaker_pct ?? 0.25) * 100,
      peak,
      maxOrderPct: num(settings.max_order_pct ?? 0.25) * 100,
    },
    kite: {
      connected,
      at: kiteStatus.connectedAt
        ? new Date(kiteStatus.connectedAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })
        : null,
      clientId: kiteStatus.kiteUserId,
      checkedAt: checked
        ? checked.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })
        : null,
      matches: !swingPositions.some((row) => row.frozen === true),
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
    todayMove,
    started,
    change: account - fund,
    trades: { buys, sells, maxBuys, maxSells, waiting: needsYou.length },
    books: {
      swing: { open: swingPositions.length, capital: fund },
      intraday: {
        open: num(dayOpen[0]?.n),
        capital: dayCapital,
        planned: intradayBook.planned,
        counts: intradayBook.capitalCounts,
        waiting: passedIntradayStrategies(dayPassed) < 1,
        maxTrades: num(settings.intraday_max_trades ?? 4),
        realised: num(dayPnl[0]?.realised),
        today: num(dayPnl[0]?.today),
        month: num(dayPnl[0]?.month),
        tradesToday: num(dayPnl[0]?.trades),
        dayLossUsed: Math.max(0, -num(dayPnl[0]?.today)),
        dayLossLimit,
      },
    },
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
    holdings: swingPositions.filter((row) => showsHolding(num(row.qty))).map((row) => ({
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

export async function chartsPayload(range: string, book: "all" | "swing" | "intraday" = "all") {
  const includeDry = await includeDryRows();
  const today = todayIst();
  const settings = await settingsMap();
  const [rows, depositRows, fundRows, positions, books, charges, stateRows] = await Promise.all([
    sql`SELECT trade_date::text AS trade_date, system_value, peak, drawdown_pct
          FROM mlive.mlive_equity_daily ORDER BY trade_date`,
    sql`SELECT ts, amount FROM mlive.mlive_fund_ledger
         WHERE kind = 'deposit' AND (${includeDry}::boolean OR dry_run = false)
         ORDER BY ts ASC, id ASC LIMIT 1`,
    sql`SELECT COALESCE(SUM(amount), 0) AS total FROM mlive.mlive_fund_ledger
         WHERE (${includeDry}::boolean OR dry_run = false)`,
    sql`SELECT symbol, qty, avg_price FROM mlive.mlive_positions
         WHERE closed_at IS NULL AND qty > 0 AND (${includeDry}::boolean OR dry_run = false)
           AND (${book} = 'all' OR book = ${book})`,
    sql`SELECT strategy, realised_pnl, opened_at, closed_at, symbol, dry_run
          FROM mlive.mlive_positions
         WHERE (${includeDry}::boolean OR dry_run = false)
           AND (${book} = 'all' OR book = ${book})`,
    sql`SELECT o.symbol, o.dry_run, l.amount, o.placed_at AS ts
          FROM mlive.mlive_fund_ledger l
          JOIN mlive.mlive_orders o ON o.id = l.ref_order_id
         WHERE l.kind = 'charges'
           AND (${includeDry}::boolean OR o.dry_run = false)
           AND (${book} = 'all' OR o.book = ${book})`,
    sql`SELECT peak_value FROM mlive.mlive_state WHERE id = 1`,
  ]);
  const swingFund = num(fundRows[0]?.total);
  const dayCapital = num(settings.intraday_capital_inr ?? 20000);
  const addDay = book === "all" && (await intradayBookState(includeDry)).capitalCounts;
  const fund = book === "intraday" ? dayCapital : addDay ? swingFund + dayCapital : swingFund;
  const marks = await liveMarks(positions.map((row) => String(row.symbol)));
  const account = homeAccount({
    fund,
    positions: positions.map((row) => ({
      qty: num(row.qty),
      avgPrice: num(row.avg_price),
      live: marks.get(String(row.symbol)) ?? null,
    })),
  });
  const peak = num(stateRows[0]?.peak_value ?? fund);
  const depositDate = day(depositRows[0]?.ts);
  const history = book === "intraday" ? [] : rows.map((row) => ({
    date: day(row.trade_date) ?? "",
    value: num(row.system_value) + (addDay ? dayCapital : 0),
    peak: num(row.peak) + (addDay ? dayCapital : 0),
    drawdown: num(row.drawdown_pct),
  }));
  const series = equitySeries({
    history,
    deposit: book === "intraday"
      ? { date: today, amount: dayCapital }
      : depositRows[0] && depositDate ? { date: depositDate, amount: num(depositRows[0].amount) + (addDay ? dayCapital : 0) } : null,
    live: { date: today, value: account, peak, drawdown: accountDrawdown(account, peak) },
    range: range === "1m" ? "1m" : "all",
  });
  return {
    series,
    strategies: strategyFromBooks(
      tradeBooks(books),
      chargeBooks(charges),
      book === "intraday" ? ["orb", "vwap"] : book === "swing" ? ["rs", "ema"] : ["rs", "ema", "orb", "vwap"]
    ),
    breakerPct: num(settings.breaker_pct ?? 0.25) * 100,
  };
}

export async function ledgerPayload(book: "all" | "swing" | "intraday" = "all") {
  const includeDry = await includeDryRows();
  const settings = await settingsMap();
  const rows = await sql`
    SELECT r.trade_date::text AS trade_date, r.text, r.decision_summary, e.system_value
      FROM mlive.mlive_daily_reports r
      LEFT JOIN mlive.mlive_equity_daily e ON e.trade_date = r.trade_date
     ORDER BY r.trade_date DESC LIMIT 60`;
  const positionRows = await sql`
    SELECT strategy, realised_pnl, charges, opened_at, closed_at, symbol, dry_run
      FROM mlive.mlive_positions
     WHERE (${includeDry}::boolean OR dry_run = false)
       AND (${book} = 'all' OR book = ${book})`;
  const chargeLedger = await sql`
    SELECT o.symbol, o.dry_run, l.amount, o.placed_at AS ts
      FROM mlive.mlive_fund_ledger l
      JOIN mlive.mlive_orders o ON o.id = l.ref_order_id
     WHERE l.kind = 'charges'
       AND (${includeDry}::boolean OR o.dry_run = false)
       AND (${book} = 'all' OR o.book = ${book})`;
  const closedTrades = settleTrades(tradeBooks(positionRows), chargeBooks(chargeLedger)).filter((trade) => trade.closed);
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
       AND (${book} = 'all' OR d.book = ${book})
     ORDER BY d.id`;
  const n = closedTrades.length;
  const wins = closedTrades.filter((trade) => trade.pnl > 0).length;
  const charges = positionRows.reduce((sum, row) => (row.closed_at == null ? sum : sum + num(row.charges)), 0);
  return {
    tiles: {
      closed: n,
      winRate: n ? Math.round((wins / n) * 100) : 0,
      realised: closedTrades.reduce((sum, trade) => sum + trade.pnl, 0),
      charges,
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
    }).filter((row) => book === "all" || row.items.length > 0),
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

export async function auditPayload(input: {
  page: number;
  view: string;
  group: string;
  symbol: string | null;
  q?: string | null;
  from?: string | null;
  to?: string | null;
  book?: string | null;
  who?: string | null;
  type?: string | null;
}) {
  const view = AUDIT_VIEWS.includes(input.view as AuditView) ? (input.view as AuditView) : "all";
  const group = (["all", "sizing", "runs", "skips", "stops", "holdings", "alerts", "problems", "recheck", "other"] as const).includes(input.group as EngineGroupId)
    ? (input.group as EngineGroupId)
    : "all";
  const page = Number.isFinite(input.page) && input.page > 0 ? Math.floor(input.page) : 0;
  const symbol = input.symbol?.trim() || null;
  const offset = page * AUDIT_PAGE;
  const where = auditWhere(view, view === "engine" ? group : "all");
  const q = input.q?.trim() || null;
  const from = input.from && /^\d{4}-\d{2}-\d{2}$/.test(input.from) ? input.from : null;
  const to = input.to && /^\d{4}-\d{2}-\d{2}$/.test(input.to) ? input.to : null;
  const book = input.book === "swing" || input.book === "intraday" ? input.book : "all";
  const who = input.who === "engine" || input.who === "you" ? input.who : "everyone";
  const type = ["bought", "sold", "skipped", "stops", "settings", "alerts", "all", "decisions", "orders", "you", "everything"].includes(input.type ?? "") ? input.type : null;
  const params = [symbol, where.actions, !where.runsOnly, !where.onlyOther, knownEngineActions(), AUDIT_PAGE, offset, q, from, to, book, who, type];
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
        `SELECT count(*)::int AS n FROM mlive.mlive_audit_log WHERE ${where.sql} AND $6::int >= 0 AND $7::int >= 0`,
        params
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

const AUDIT_NARROW = `
  AND ($8::text IS NULL OR symbol ILIKE '%' || $8 || '%' OR coalesce(reason, '') ILIKE '%' || $8 || '%')
  AND ($9::date IS NULL OR (timezone('Asia/Kolkata', ts))::date >= $9::date)
  AND ($10::date IS NULL OR (timezone('Asia/Kolkata', ts))::date <= $10::date)
  AND ($11::text = 'all' OR symbol IN (
    SELECT symbol FROM mlive.mlive_positions WHERE book = $11
    UNION SELECT symbol FROM mlive.mlive_orders WHERE book = $11
    UNION SELECT symbol FROM mlive.mlive_decisions WHERE book = $11
  ))
  AND ($12::text = 'everyone' OR ($12 = 'engine' AND actor IN ('engine', 'kite')) OR ($12 = 'you' AND actor NOT IN ('engine', 'kite')))
  AND ($13::text IS NULL OR $13 IN ('all', 'everything', 'alerts') OR action NOT LIKE 'run.%')
  AND (
    $13::text IS NULL OR $13 IN ('all', 'alerts', 'everything')
    OR ($13 = 'bought' AND action = 'fill' AND upper(coalesce(after->>'side','')) <> 'SELL')
    OR ($13 = 'sold' AND ((action = 'fill' AND upper(coalesce(after->>'side','')) = 'SELL') OR action = 'position.marked_sold'))
    OR ($13 = 'skipped' AND (action IN ('decision.skip', 'approval.skip') OR action LIKE '%.skipped'))
    OR ($13 = 'stops' AND (action IN ('stop.updated', 'gtt.exit', 'stop.set') OR action LIKE 'gtt.%' OR action LIKE 'stop.%'))
    OR ($13 = 'settings' AND (action IN ('setting.change', 'pause', 'resume', 'mode', 'state.change') OR action LIKE 'fund.%' OR action LIKE 'state.%'))
    OR ($13 = 'decisions' AND action IN ('fill', 'decision.skip', 'approval.skip', 'position.marked_sold', 'stop.updated', 'stop.set', 'gtt.exit', 'gtt.placed'))
    OR ($13 = 'orders' AND (action IN ('order.sent', 'fill') OR action LIKE 'order.%'))
    OR ($13 = 'you' AND actor NOT IN ('engine', 'kite', 'system'))
  )`;

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
  const finish = (sql: string) => ({ sql: `${sql}${AUDIT_NARROW}`, actions, runsOnly, onlyOther });
  if (view === "you") return finish(`actor NOT IN ('engine', 'kite') AND ${symbol} AND ${action}`);
  if (view === "working") return finish(`action IN ('order.sent', 'gtt.exit') AND ${symbol} AND ${action}`);
  if (view === "bought") return finish(`action = 'fill' AND upper(coalesce(after->>'side','')) <> 'SELL' AND ${symbol} AND ${action}`);
  if (view === "sold") return finish(`((action = 'fill' AND upper(coalesce(after->>'side','')) = 'SELL') OR action = 'position.marked_sold') AND ${symbol} AND ${action}`);
  if (view === "engine") {
    return finish(`actor IN ('engine', 'kite') AND upper(coalesce(after->>'side','')) NOT IN ('BUY', 'SELL') AND action NOT IN ('order.sent', 'fill', 'gtt.exit', 'position.marked_sold') AND ${symbol} AND ${action}`);
  }
  return finish(`${symbol} AND ${action}`);
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
