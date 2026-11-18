import { NextRequest, NextResponse } from "next/server";
import { MliveKite } from "@/engine/kite";
import { registerOpeningHolding, type Pocket } from "@/engine/longterm/register";
import { requireMliveSession } from "@/lib/mlive/auth";

export async function POST(request: NextRequest) {
  const session = await requireMliveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as {
    pocket?: string;
    symbol?: string;
    units?: number;
    averagePrice?: number;
    acquiredOn?: string;
  } | null;
  const pocket: Pocket = body?.pocket === "radar" ? "radar" : "core";
  const symbol = String(body?.symbol ?? "").trim().toUpperCase();
  const units = Number(body?.units);
  const averagePrice = Number(body?.averagePrice);
  const acquiredOn = String(body?.acquiredOn ?? "");
  if (!symbol) return NextResponse.json({ error: "Choose an ETF." }, { status: 400 });
  try {
    const holdings = await new MliveKite(false).holdings();
    const row = holdings.find((item) => item.tradingsymbol.toUpperCase() === symbol);
    const kiteUnits = row ? row.quantity : 0;
    const result = await registerOpeningHolding({ pocket, symbol, units, averagePrice, acquiredOn, kiteUnits });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ ok: true, moneyAdded: result.moneyAdded, cash: 0 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("mlive_longgame")) {
      return NextResponse.json({ error: "Long Game tables are not there yet." }, { status: 503 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
