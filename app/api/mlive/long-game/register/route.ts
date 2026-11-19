import { NextRequest, NextResponse } from "next/server";
import { MliveKite } from "@/engine/kite";
import { attributedUnits, registerCoreOpening } from "@/engine/longterm/register";
import { remainingUnassigned } from "@/engine/longterm/pockets";
import { requireMliveSession } from "@/lib/mlive/auth";
import { todayIst } from "@/lib/mlive/calendar";
import { isLongGameEtf } from "@/lib/mlive/long-game-symbols";
import { matchKiteUnits, parseTradebookCsv, reconstructFifo, tradebookChecksum } from "@/lib/mlive/tradebook";
import { sql } from "@/lib/sql";

async function eligibleSymbols(): Promise<{ secondary: string; attributed: string[] }> {
  const settings = await sql`SELECT value FROM mlive.mlive_settings WHERE key = 'longterm_secondary'` as { value: unknown }[];
  const held = await sql`SELECT symbol FROM mlive.mlive_longgame_holdings WHERE units <> 0` as { symbol: string }[];
  const secondary = typeof settings[0]?.value === "string" ? settings[0].value.replace(/"/g, "") : "mid";
  return { secondary, attributed: held.map((row) => String(row.symbol)) };
}

export async function GET() {
  const session = await requireMliveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const holdings = await new MliveKite(false).holdings();
    const eligible = await eligibleSymbols();
    const rows = [];
    for (const item of holdings) {
      const symbol = item.tradingsymbol.toUpperCase();
      if (!isLongGameEtf(symbol, eligible.secondary, eligible.attributed)) continue;
      const attributed = await attributedUnits(symbol);
      const units = remainingUnassigned(item.quantity, attributed);
      if (!(units > 0)) continue;
      rows.push({
        symbol,
        units,
        averagePrice: item.averagePrice ?? 0,
        value: units * (item.lastPrice || item.averagePrice || 0),
      });
    }
    return NextResponse.json({ holdings: rows });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Kite holdings could not be read.";
    return NextResponse.json({ error: message, holdings: [] }, { status: 200 });
  }
}

export async function POST(request: NextRequest) {
  const session = await requireMliveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as {
    symbol?: string;
    month?: string | null;
    tradebookCsv?: string | null;
    confirmTradebook?: boolean;
  } | null;
  if (body && "pocket" in body && (body as { pocket?: string }).pocket === "radar") {
    return NextResponse.json({ error: "Registration targets Core." }, { status: 400 });
  }
  const symbol = String(body?.symbol ?? "").trim().toUpperCase();
  const eligible = await eligibleSymbols();
  if (!isLongGameEtf(symbol, eligible.secondary, eligible.attributed)) return NextResponse.json({ error: "Choose a Long Game ETF." }, { status: 400 });
  try {
    const holdings = await new MliveKite(false).holdings();
    const row = holdings.find((item) => item.tradingsymbol.toUpperCase() === symbol);
    const kiteUnits = row ? row.quantity : 0;
    const kiteAverage = row?.averagePrice ?? 0;
    const attributed = await attributedUnits(symbol);
    const remaining = remainingUnassigned(kiteUnits, attributed);
    const csv = typeof body?.tradebookCsv === "string" ? body.tradebookCsv : "";
    if (csv.trim()) {
      const lots = reconstructFifo(parseTradebookCsv(csv, symbol));
      const match = matchKiteUnits(lots, remaining);
      const checksum = await tradebookChecksum(csv);
      if (!match.ok) {
        return NextResponse.json({
          ok: false,
          match: false,
          reconstructed: match.reconstructed,
          kite: match.kite,
          difference: match.difference,
          checksum,
        }, { status: 400 });
      }
      if (body?.confirmTradebook !== true) {
        return NextResponse.json({
          ok: true,
          preview: true,
          lots: match.lots,
          units: match.units,
          average: match.average,
          kiteAverage,
          moneyAdded: match.moneyAdded,
          checksum,
        });
      }
      const saved = await registerCoreOpening({
        symbol,
        units: match.units,
        kiteUnits,
        kiteAverage,
        registeredOn: todayIst(),
        lots: match.lots,
        checksum,
      });
      if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 400 });
      return NextResponse.json({ ok: true, moneyAdded: saved.moneyAdded, average: saved.average, cash: 0 });
    }
    const saved = await registerCoreOpening({
      symbol,
      units: remaining,
      kiteUnits,
      kiteAverage,
      registeredOn: todayIst(),
      month: body?.month ?? null,
    });
    if (!saved.ok) return NextResponse.json({ error: saved.error }, { status: 400 });
    return NextResponse.json({ ok: true, moneyAdded: saved.moneyAdded, average: saved.average, cash: 0 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("mlive_longgame")) {
      return NextResponse.json({ error: "Long Game tables are not there yet." }, { status: 503 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
