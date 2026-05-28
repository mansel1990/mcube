import { NextResponse } from "next/server";
import { requireStocksSession } from "@/lib/stocks/require-stocks-session";
import { connectToDatabase } from "@/lib/mongodb";
import { StocksUserSettings } from "@/lib/models/stocks-user-settings";

export async function GET() {
  const session = await requireStocksSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectToDatabase();
  const settings = await StocksUserSettings.findOneAndUpdate(
    { userId: session.user.id },
    {},
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return NextResponse.json({
    defaultTradeAmount: settings.defaultTradeAmount,
  });
}

export async function PATCH(request: Request) {
  const session = await requireStocksSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { defaultTradeAmount } = body as { defaultTradeAmount?: number };

  if (defaultTradeAmount == null || defaultTradeAmount < 100) {
    return NextResponse.json({ error: "Minimum trade amount is ₹100" }, { status: 400 });
  }

  await connectToDatabase();
  const settings = await StocksUserSettings.findOneAndUpdate(
    { userId: session.user.id },
    { defaultTradeAmount: Math.round(defaultTradeAmount) },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return NextResponse.json({ defaultTradeAmount: settings.defaultTradeAmount });
}
