import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { LoanCreditor } from "@/lib/models/loan-creditor";
import { LoanPayment } from "@/lib/models/loan-payment";

const COLOR_PALETTE = [
  "#3b82f6", "#ef4444", "#f59e0b", "#10b981",
  "#8b5cf6", "#ec4899", "#06b6d4", "#f97316",
];

async function checkAuth() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || (session.user as Record<string, unknown>).section !== "admin")
    return null;
  return session;
}

export async function GET() {
  if (!(await checkAuth()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectToDatabase();

  const creditors = await LoanCreditor.find().sort({ createdAt: 1 });

  // Aggregate totalPaid per creditor
  const paymentTotals = await LoanPayment.aggregate([
    { $group: { _id: "$creditorId", totalPaid: { $sum: "$amount" } } },
  ]);

  const totalsMap = new Map(
    paymentTotals.map((p) => [String(p._id), p.totalPaid])
  );

  const result = creditors.map((c) => {
    const totalPaid = totalsMap.get(String(c._id)) ?? 0;
    return {
      ...c.toObject(),
      totalPaid,
      remaining: Math.max(0, c.originalAmount - totalPaid),
    };
  });

  return NextResponse.json(result);
}

export async function POST(req: NextRequest) {
  if (!(await checkAuth()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectToDatabase();

  const body = await req.json();

  // Auto-assign color if not provided
  if (!body.color) {
    const count = await LoanCreditor.countDocuments();
    body.color = COLOR_PALETTE[count % COLOR_PALETTE.length];
  }

  const creditor = await LoanCreditor.create(body);
  return NextResponse.json({ ...creditor.toObject(), totalPaid: 0, remaining: creditor.originalAmount }, { status: 201 });
}
