import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { connectToDatabase } from "@/lib/mongodb";
import { NotificationLog } from "@/lib/models/notification-log";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectToDatabase();
  const logs = await NotificationLog.find({})
    .sort({ sentAt: -1 })
    .limit(20)
    .lean();

  return NextResponse.json(logs);
}
