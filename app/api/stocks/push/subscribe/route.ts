import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { PushSubscription } from "@/lib/models/push-subscription";

export async function POST(req: NextRequest) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || (session.user as Record<string, unknown>).section !== "stocks") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { endpoint, keys } = body as { endpoint: string; keys: { p256dh: string; auth: string } };

  if (!endpoint || !keys?.p256dh || !keys?.auth) {
    return NextResponse.json({ error: "Invalid subscription" }, { status: 400 });
  }

  await connectToDatabase();
  await PushSubscription.findOneAndUpdate(
    { endpoint },
    { userId: session.user.id, endpoint, keys },
    { upsert: true, new: true }
  );

  return NextResponse.json({ ok: true });
}
