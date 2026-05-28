import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/mongodb";
import { NotificationLog } from "@/lib/models/notification-log";
import { NotificationRead } from "@/lib/models/notification-read";
import { requireStocksSession } from "@/lib/stocks/require-stocks-session";

const LIMIT = 20;

export async function POST() {
  const session = await requireStocksSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectToDatabase();

  const logs = await NotificationLog.find({}).sort({ sentAt: -1 }).limit(LIMIT).select("_id");
  const now = new Date();

  await Promise.all(
    logs.map((log) =>
      NotificationRead.findOneAndUpdate(
        { userId: session.user.id, notificationId: log._id },
        { readAt: now },
        { upsert: true }
      )
    )
  );

  return NextResponse.json({ ok: true });
}
