import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { sql } from "@/lib/sql";
import { sortSignalsNewestFirst } from "@/lib/stocks/signal-helpers";
import type { UnifiedSignal } from "@/lib/stocks/types";

type Row = {
  trade_id: number;
  ticker: string;
  strategy: string;
  signal_date: string;
  proba: string | null;
  signal_close: string | null;
  buy_range_low: string | null;
  buy_range_high: string | null;
  target_pct: string | null;
  stop_pct: string | null;
};

const num = (v: string | null) => (v == null ? null : parseFloat(v));
const round2 = (v: number) => Math.round(v * 100) / 100;

/**
 * Tonight's ML picks — OPEN_PENDING_FILL rows from daily_suggestor.trades.
 * Conviction ranking (PRD §2.3): per strategy, the 2 highest-proba picks of a
 * scan date are Divine (`Strong`), the rest Rare (`Moderate`).
 */
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || (session.user as Record<string, unknown>).section !== "stocks") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const rows = (await sql`
      SELECT trade_id, ticker, strategy, signal_date::text AS signal_date,
             proba, signal_close, buy_range_low, buy_range_high, target_pct, stop_pct
      FROM daily_suggestor.trades
      WHERE status = 'OPEN_PENDING_FILL'
      ORDER BY signal_date DESC, proba DESC NULLS LAST
    `) as Row[];

    const rankKey = (r: Row) => `${r.strategy}|${r.signal_date.slice(0, 10)}`;
    const seen: Record<string, number> = {};

    const signals: UnifiedSignal[] = rows.map((r) => {
      const k = rankKey(r);
      seen[k] = (seen[k] ?? 0) + 1;
      const close = num(r.signal_close);
      const targetPct = num(r.target_pct);
      const stopPct = num(r.stop_pct);
      return {
        id: `ml-${r.trade_id}`,
        source: r.strategy as UnifiedSignal["source"],
        ticker: r.ticker,
        status: "open",
        signalDate: r.signal_date.slice(0, 10),
        entryDate: null,
        entryPrice: null,
        entryMin: num(r.buy_range_low),
        entryMax: num(r.buy_range_high),
        target: close != null && targetPct != null ? round2(close * (1 + targetPct)) : null,
        stopLoss: close != null && stopPct != null ? round2(close * (1 - stopPct)) : null,
        cmp: close,
        rsi: null,
        volumeRatio: null,
        signalStrength: seen[k] <= 2 ? "Strong" : "Moderate",
        exitDate: null,
        exitPrice: null,
        realizedPnlPct: null,
        exitReason: null,
        holdDays: 0,
        peers: null,
        entryZ: null,
        peerSlopePct: null,
        proba: num(r.proba),
      };
    });

    return NextResponse.json({ ok: true, data: sortSignalsNewestFirst(signals) });
  } catch {
    // Schema unreachable — degrade gracefully
    return NextResponse.json({ ok: true, data: [] });
  }
}
