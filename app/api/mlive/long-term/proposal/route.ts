import { NextResponse } from "next/server";
import { requireMliveSession } from "@/lib/mlive/auth";
import { istMinutes, todayIst } from "@/lib/mlive/calendar";
import { userAudit } from "@/lib/mlive/write";
import { holidaySet } from "@/engine/load";
import { longtermTradeDate, ownerDecision } from "@/engine/longterm/proposal";
import {
  insertLongtermDecisions,
  loadPendingProposal,
  markProposal,
  proposalView,
  readProposalGate,
} from "@/engine/longterm/proposal-db";

export async function GET() {
  const session = await requireMliveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const proposal = await loadPendingProposal();
  return NextResponse.json({ proposal: proposal ? proposalView(proposal) : null });
}

export async function POST(request: Request) {
  const session = await requireMliveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => null)) as { id?: number; action?: string; note?: string } | null;
  const action = body?.action === "approve" ? "approve" : body?.action === "reject" ? "reject" : null;
  if (!action || !body?.id) return NextResponse.json({ error: "id and action are required" }, { status: 400 });
  const gate = await readProposalGate();
  const proposal = await loadPendingProposal();
  if (!proposal || proposal.id !== Number(body.id)) {
    return NextResponse.json({ error: "That proposal is not waiting" }, { status: 409 });
  }
  const holidays = await holidaySet();
  const result = ownerDecision({
    allowed: gate.allowed,
    proposal,
    action,
    note: typeof body.note === "string" ? body.note.slice(0, 500) : "",
    tradeDate: longtermTradeDate(todayIst(), istMinutes(), holidays),
  });
  if (result.status === "ignored") {
    return NextResponse.json({ error: "Long Game approval is off until it qualifies and is enabled." }, { status: 409 });
  }
  if (result.status === "approved") await insertLongtermDecisions(result.decisions);
  await markProposal(proposal.id, result.status, result.note, "user");
  await userAudit({
    userId: session.user.id,
    action: `longterm.${result.status}`,
    reason: result.note || null,
    after: { id: proposal.id, decisions: result.decisions.length },
  });
  return NextResponse.json({ ok: true, decisions: result.decisions.length });
}
