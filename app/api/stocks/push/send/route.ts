import { NextRequest, NextResponse } from "next/server";
import webpush from "web-push";
import { connectToDatabase } from "@/lib/mongodb";
import { PushSubscription } from "@/lib/models/push-subscription";
import { NotificationLog } from "@/lib/models/notification-log";
import { NSE_HOLIDAYS } from "@/lib/nse-holidays";
import { sql } from "@/lib/sql";

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

function getTodayIST(): string {
  // Returns YYYY-MM-DD in Asia/Kolkata timezone
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
}

function getDayOfWeekIST(): number {
  // 0 = Sunday, 6 = Saturday
  return new Date(
    new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" })
  ).getDay();
}

async function handler(request: NextRequest) {
  // Verify cron secret (Vercel sends Authorization: Bearer <CRON_SECRET>)
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Skip weekends (in IST)
  const dow = getDayOfWeekIST();
  if (dow === 0 || dow === 6) {
    return NextResponse.json({ skipped: "weekend" });
  }

  // Skip NSE market holidays
  const todayIST = getTodayIST();
  if (NSE_HOLIDAYS.has(todayIST)) {
    return NextResponse.json({ skipped: "holiday", date: todayIST });
  }

  const event = request.nextUrl.searchParams.get("event"); // "open" | "close"

  // Fetch latest open signals for both events
  const signalRows = await sql`
    SELECT ticker FROM sim.stock_suggestions
    WHERE status = 'OPEN'
    ORDER BY signal_date DESC
    LIMIT 3
  `;
  const count = signalRows.length;
  const topTickers = signalRows.map((r) => r.ticker as string);

  let title: string;
  let body: string;

  if (event === "open") {
    title = "Market Open · 9:15 AM";
    if (count === 0) {
      body = "NSE is now open. No active signals today.";
    } else {
      const tickerStr = topTickers.slice(0, 2).join(", ") + (count > 2 ? ` +${count - 2} more` : "");
      body = `${count} active signal${count !== 1 ? "s" : ""}: ${tickerStr}. Tap to review.`;
    }
  } else {
    title = "Market Closing · 3:00 PM";
    if (count === 0) {
      body = "NSE closes in 30 min. No open signals.";
    } else {
      const tickerStr = topTickers.slice(0, 2).join(", ") + (count > 2 ? ` +${count - 2} more` : "");
      body = `${count} open signal${count !== 1 ? "s" : ""}: ${tickerStr}. 30 min left.`;
    }
  }

  const payload = JSON.stringify({ title, body, url: "/stocks" });

  await connectToDatabase();
  const subscriptions = await PushSubscription.find({});

  if (subscriptions.length === 0) {
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

  // Clean up expired subscriptions (HTTP 410 Gone)
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
  const failed = results.length - sent;

  await NotificationLog.create({
    title,
    body,
    event: event === "open" ? "open" : "close",
    tickers: topTickers,
    sent,
    sentAt: new Date(),
  });

  return NextResponse.json({ sent, failed, deleted: toDelete.length });
}

export { handler as GET, handler as POST };
