import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { connectToDatabase } from "@/lib/mongodb";
import { PushSubscription } from "@/lib/models/push-subscription";
import { NotificationLog } from "@/lib/models/notification-log";
import { getTodayIST, getKiteSession, isKiteTokenValid } from "@/lib/kite/session";
import { NSE_HOLIDAYS } from "@/lib/nse-holidays";

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

function getDayOfWeekIST(): number {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
  ).getDay();
}

async function userNeedsKiteReconnect(userId: string): Promise<boolean> {
  const session = await getKiteSession(userId);
  if (!session) return true;
  return !isKiteTokenValid(session.token_date);
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dow = getDayOfWeekIST();
  if (dow === 0 || dow === 6) {
    return NextResponse.json({ skipped: "weekend" });
  }

  const todayIST = getTodayIST();
  if (NSE_HOLIDAYS.has(todayIST)) {
    return NextResponse.json({ skipped: "holiday", date: todayIST });
  }

  await connectToDatabase();

  const allSubs = await PushSubscription.find({});
  const userIds = [...new Set(allSubs.map((s) => s.userId).filter(Boolean))] as string[];

  const needsReconnect = (
    await Promise.all(userIds.map(async (id) => ((await userNeedsKiteReconnect(id)) ? id : null)))
  ).filter(Boolean) as string[];

  if (needsReconnect.length === 0) {
    return NextResponse.json({ sent: 0, skipped: "all connected" });
  }

  const subscriptions = allSubs.filter((s) => s.userId && needsReconnect.includes(s.userId));
  if (subscriptions.length === 0) {
    return NextResponse.json({ sent: 0, needsReconnect: needsReconnect.length });
  }

  const pushMsg = {
    title: "Reconnect Kite · Market opens soon",
    body: "Your Kite session expired. Tap to reconnect before market opens.",
    url: "/stocks/settings",
    tag: "kite-reconnect",
  };

  const log = await NotificationLog.create({
    title: pushMsg.title,
    body: pushMsg.body,
    event: "kite",
    tickers: [],
    sent: 0,
    sentAt: new Date(),
    url: pushMsg.url,
    tag: pushMsg.tag,
  });

  const payload = JSON.stringify({
    ...pushMsg,
    notificationId: String(log._id),
  });

  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload)
    )
  );

  const sent = results.filter((r) => r.status === "fulfilled").length;
  await NotificationLog.updateOne({ _id: log._id }, { sent });

  return NextResponse.json({ sent, needsReconnect: needsReconnect.length });
}
