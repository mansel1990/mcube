import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { fetchAllSignalsBySource } from "@/lib/stocks/signal-helpers";
import type { SignalSource } from "@/lib/stocks/types";

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || (session.user as Record<string, unknown>).section !== "stocks") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const bySource = await fetchAllSignalsBySource();
    const payload: Record<SignalSource, { ok: boolean; data?: unknown[]; error?: string }> = {} as Record<
      SignalSource,
      { ok: boolean; data?: unknown[]; error?: string }
    >;

    for (const [key, data] of Object.entries(bySource) as [SignalSource, unknown[]][]) {
      payload[key] = { ok: true, data };
    }

    return NextResponse.json(payload);
  } catch (err) {
    console.error("signals/all error:", err);
    return NextResponse.json({ error: "Failed to fetch signals" }, { status: 500 });
  }
}
