import { NextResponse } from "next/server";
import { requireMliveSession } from "@/lib/mlive/auth";
import { loadPendingProposal, proposalView } from "@/engine/longterm/proposal-db";
import { homePayload } from "@/lib/mlive/read";
import { getStocksSessionUsername } from "@/lib/stocks/admin";

export async function GET() {
  const session = await requireMliveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const name = getStocksSessionUsername(session.user as Record<string, unknown>) || "Sanjay";
  try {
    const payload = await homePayload(name);
    let longtermProposal = null;
    try {
      const pending = await loadPendingProposal();
      longtermProposal = pending ? proposalView(pending) : null;
    } catch {
      longtermProposal = null;
    }
    return NextResponse.json({ ...payload, longtermProposal });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not read Mansel Live";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
