import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { NotificationLog } from "@/lib/models/notification-log";
import { NotificationRead } from "@/lib/models/notification-read";
import { requireStocksSession } from "@/lib/stocks/require-stocks-session";
import mongoose from "mongoose";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireStocksSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  await connectToDatabase();

  const log = await NotificationLog.findById(id);
  if (!log) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await NotificationRead.findOneAndUpdate(
    { userId: session.user.id, notificationId: log._id },
    { readAt: new Date() },
    { upsert: true }
  );

  return NextResponse.json({ ok: true });
}
