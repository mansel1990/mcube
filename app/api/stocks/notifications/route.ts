import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { NotificationLog } from "@/lib/models/notification-log";
import { NotificationRead } from "@/lib/models/notification-read";
import { requireStocksSession } from "@/lib/stocks/require-stocks-session";
import mongoose from "mongoose";

const LIMIT = 20;

export async function GET() {
  const session = await requireStocksSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectToDatabase();

  const logs = await NotificationLog.find({})
    .sort({ sentAt: -1 })
    .limit(LIMIT)
    .lean();

  const logIds = logs.map((l) => l._id);
  const reads = await NotificationRead.find({
    userId: session.user.id,
    notificationId: { $in: logIds },
  }).lean();

  const readSet = new Set(reads.map((r) => String(r.notificationId)));

  const notifications = logs.map((l) => ({
    _id: String(l._id),
    title: l.title,
    body: l.body,
    event: l.event,
    tickers: l.tickers,
    sent: l.sent,
    sentAt: l.sentAt,
    url: l.url ?? "/stocks",
    tag: l.tag ?? null,
    read: readSet.has(String(l._id)),
  }));

  const unreadCount = notifications.filter((n) => !n.read).length;

  return NextResponse.json({ notifications, unreadCount });
}

export async function POST(request: Request) {
  const session = await requireStocksSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { notificationId, tag } = body as { notificationId?: string; tag?: string };

  await connectToDatabase();

  if (notificationId && mongoose.Types.ObjectId.isValid(notificationId)) {
    await NotificationRead.findOneAndUpdate(
      { userId: session.user.id, notificationId },
      { readAt: new Date() },
      { upsert: true }
    );
    return NextResponse.json({ ok: true });
  }

  if (tag) {
    const log = await NotificationLog.findOne({ tag }).sort({ sentAt: -1 });
    if (log) {
      await NotificationRead.findOneAndUpdate(
        { userId: session.user.id, notificationId: log._id },
        { readAt: new Date() },
        { upsert: true }
      );
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "notificationId or tag required" }, { status: 400 });
}
