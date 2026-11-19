import { NextResponse } from "next/server";
import { enableLongtermCore } from "@/lib/mlive/core-activation-write";
import { requireMliveSession } from "@/lib/mlive/auth";

export async function POST() {
  const session = await requireMliveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const userId = String(session.user?.id ?? "owner");
  const result = await enableLongtermCore(userId);
  return NextResponse.json({ ok: true, strategiesEnabled: result.strategiesEnabled, longtermCoreEnabled: true, longtermRadarEnabled: false });
}
