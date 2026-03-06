import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { AdminClientNote } from "@/lib/models/admin-client-note";

async function checkAdminAuth() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || (session.user as Record<string, unknown>).section !== "admin")
    return null;
  return session;
}

export async function GET(req: NextRequest) {
  if (!(await checkAdminAuth()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectToDatabase();
  const { searchParams } = new URL(req.url);
  const clientId = searchParams.get("clientId");
  const query = clientId ? { clientId } : {};
  const notes = await AdminClientNote.find(query).sort({ createdAt: -1 });
  return NextResponse.json(notes);
}

export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectToDatabase();
  const body = await req.json();
  const note = await AdminClientNote.create(body);
  return NextResponse.json(note, { status: 201 });
}
