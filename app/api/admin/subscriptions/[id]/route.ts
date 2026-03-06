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

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await checkAdminAuth()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await connectToDatabase();
  const body = await req.json();
  const sub = await AdminSubscription.findByIdAndUpdate(id, body, { new: true });
  if (!sub) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json(sub);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await checkAdminAuth()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  await connectToDatabase();
  await AdminSubscription.findByIdAndDelete(id);
  return NextResponse.json({ ok: true });
}
