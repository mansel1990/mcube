import { NextResponse } from "next/server";
import mongoose from "mongoose";
import webpush from "web-push";
import { connectToDatabase } from "@/lib/mongodb";
import { PushSubscription } from "@/lib/models/push-subscription";
import { STOCKS_ADMIN_USERNAME } from "@/lib/stocks/admin";
import { pushUserIds } from "@/lib/mlive/rules";

async function mliveUserIds(): Promise<string[]> {
  if (process.env.MLIVE_USER_ID) return [process.env.MLIVE_USER_ID];
  await connectToDatabase();
  const db = mongoose.connection.db;
  if (!db) {
    console.warn("mlive push: Mongo is not connected, so no PushSubscription user id was found");
    return [];
  }
  const users = await db.collection("user").find({
    section: "stocks",
    username: { $regex: new RegExp(`^${STOCKS_ADMIN_USERNAME}$`, "i") },
  }).project({ id: 1, _id: 1 }).toArray();
  const ids = [...new Set(users.flatMap((user) => pushUserIds(user)))];
  if (ids.length === 0) {
    console.warn("mlive push: no Sanjay user id matched PushSubscription.userId");
  }
  return ids;
}

export async function POST(request: Request) {
  const secret = process.env.MLIVE_PUSH_SECRET || process.env.CRON_SECRET;
  if (!secret || request.headers.get("x-mlive-secret") !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const body = (await request.json()) as { message?: string; level?: string; code?: string; alert_id?: number };
  if (!body.message) return NextResponse.json({ error: "message required" }, { status: 400 });
  if (!process.env.VAPID_SUBJECT || !process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    return NextResponse.json({ sent: 0, skipped: "vapid" });
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
  await connectToDatabase();
  const userIds = await mliveUserIds();
  if (userIds.length === 0) return NextResponse.json({ sent: 0, skipped: "no mlive user" });
  const subscriptions = await PushSubscription.find({ userId: { $in: userIds } });
  const payload = JSON.stringify({
    title: body.level === "problem" ? "Mansel Live problem" : body.level === "needs_you" ? "Mansel Live needs you" : "Mansel Live",
    body: body.message,
    url: "/live-trade-mansel",
    tag: body.code || "mlive",
  });
  const results = await Promise.allSettled(
    subscriptions.map((sub) => webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, payload))
  );
  return NextResponse.json({ sent: results.filter((row) => row.status === "fulfilled").length, alert_id: body.alert_id ?? null });
}
