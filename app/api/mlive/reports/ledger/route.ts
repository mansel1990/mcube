import { NextResponse } from "next/server";
import { requireMliveSession } from "@/lib/mlive/auth";
import { ledgerPayload } from "@/lib/mlive/read";

export async function GET() {
  const session = await requireMliveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(await ledgerPayload());
}
