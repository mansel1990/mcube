import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { connectToDatabase } from "@/lib/mongodb";
import { PushSubscription } from "@/lib/models/push-subscription";
import { NotificationLog } from "@/lib/models/notification-log";
import { NSE_HOLIDAYS } from "@/lib/nse-holidays";
import {
  fetchAllOpenSignals,
  filterFreshOpenSignals,
  getLastScanDate,
} from "@/lib/stocks/signal-helpers";
import { buildMorningPush, buildScanPush } from "@/lib/stocks/push-copy";

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

function getTodayIST(): string {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function getDayOfWeekIST(): number {
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
  ).getDay();
}

function isTradingDayStale(lastScanDate: string | null, todayIST: string): boolean {
  if (!lastScanDate) return false;
  if (lastScanDate >= todayIST) return false;
  const last = new Date(lastScanDate + "T12:00:00");
  const today = new Date(todayIST + "T12:00:00");
  const diffDays = Math.floor((today.getTime() - last.getTime()) / 86_400_000);
  return diffDays > 1;
}

async function handler(request: NextRequest) {
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

  const event = request.nextUrl.searchParams.get("event");

  const allOpen = await fetchAllOpenSignals();
  const fresh = filterFreshOpenSignals(allOpen);
  const lastScanDate = getLastScanDate(allOpen);

  let pushMsg;
  if (event === "morning") {
    pushMsg = buildMorningPush(fresh, lastScanDate, isTradingDayStale(lastScanDate, todayIST));
  } else if (event === "scan") {
    pushMsg = buildScanPush(fresh);
    if (!pushMsg) {
      await connectToDatabase();
      await NotificationLog.create({
        title: "Scanner done · 6:30 PM",
        body: "No new signals",
        event: "scan",
        tickers: [],
        sent: 0,
        sentAt: new Date(),
        meta: { totalCount: 0, bySource: {}, lastScanDate },
      });
      return NextResponse.json({ sent: 0, skipped: "zero signals" });
    }
  } else {
    return NextResponse.json({ error: "Invalid event" }, { status: 400 });
  }

  const payload = JSON.stringify(pushMsg);
  const topTickers = fresh.slice(0, 5).map((s) => s.ticker);

  await connectToDatabase();
  const subscriptions = await PushSubscription.find({});

  if (subscriptions.length === 0) {
    await NotificationLog.create({
      title: pushMsg.title,
      body: pushMsg.body,
      event: event === "morning" ? "morning" : "scan",
      tickers: topTickers,
      sent: 0,
      sentAt: new Date(),
      meta: { totalCount: pushMsg.totalCount, bySource: pushMsg.bySource, lastScanDate },
    });
    return NextResponse.json({ sent: 0, failed: 0 });
  }

  const results = await Promise.allSettled(
    subscriptions.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        payload
      )
    )
  );

  const toDelete: string[] = [];
  results.forEach((result, i) => {
    if (
      result.status === "rejected" &&
      (result.reason as { statusCode?: number })?.statusCode === 410
    ) {
      toDelete.push(subscriptions[i].endpoint);
    }
  });
  if (toDelete.length > 0) {
    await PushSubscription.deleteMany({ endpoint: { $in: toDelete } });
  }

  const sent = results.filter((r) => r.status === "fulfilled").length;

  await NotificationLog.create({
    title: pushMsg.title,
    body: pushMsg.body,
    event: event === "morning" ? "morning" : "scan",
    tickers: topTickers,
    sent,
    sentAt: new Date(),
    meta: { totalCount: pushMsg.totalCount, bySource: pushMsg.bySource, lastScanDate },
  });

  return NextResponse.json({ sent, failed: results.length - sent, deleted: toDelete.length });
}

export { handler as GET, handler as POST };
