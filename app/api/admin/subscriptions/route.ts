import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { AdminSubscription } from "@/lib/models/admin-subscription";

async function checkAdminAuth() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || (session.user as Record<string, unknown>).section !== "admin")
    return null;
  return session;
}

export async function GET() {
  if (!(await checkAdminAuth()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectToDatabase();
  const subs = await AdminSubscription.find().sort({ status: 1, createdAt: -1 });
  return NextResponse.json(subs);
}

export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectToDatabase();
  const body = await req.json();
  const sub = await AdminSubscription.create(body);
  return NextResponse.json(sub, { status: 201 });
}
