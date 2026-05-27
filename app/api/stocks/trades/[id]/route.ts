import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { UserTrade } from "@/lib/models/user-trade";

async function requireStocksSession() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || (session.user as Record<string, unknown>).section !== "stocks") {
    return null;
  }
  return session;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireStocksSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await request.json();

  await connectToDatabase();
  const trade = await UserTrade.findOne({ _id: id, userId: session.user.id });
  if (!trade) return NextResponse.json({ error: "Not found" }, { status: 404 });

  if (body.exitPrice != null && body.exitDate) {
    trade.exitPrice = Number(body.exitPrice);
    trade.exitDate = body.exitDate;
    trade.status = "closed";
  }

  if (trade.status === "open") {
    if (body.quantity != null) trade.quantity = Number(body.quantity);
    if (body.entryPrice != null) trade.entryPrice = Number(body.entryPrice);
    if (body.notes !== undefined) trade.notes = body.notes;
  }

  await trade.save();
  return NextResponse.json(trade);
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireStocksSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await connectToDatabase();

  const result = await UserTrade.deleteOne({ _id: id, userId: session.user.id });
  if (result.deletedCount === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
