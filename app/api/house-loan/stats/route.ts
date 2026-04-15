import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { LoanCreditor } from "@/lib/models/loan-creditor";
import { LoanPayment } from "@/lib/models/loan-payment";
import { LoanSettings } from "@/lib/models/loan-settings";

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

  const [creditors, allPayments, settings] = await Promise.all([
    LoanCreditor.find().sort({ createdAt: 1 }),
    LoanPayment.find().sort({ date: 1 }),
    LoanSettings.findOne(),
  ]);

  const monthlyBudget = settings?.monthlyBudget ?? 350000;

  // Per-creditor totals
  const paidByCreditor = new Map<string, number>();
  for (const p of allPayments) {
    const key = String(p.creditorId);
    paidByCreditor.set(key, (paidByCreditor.get(key) ?? 0) + p.amount);
  }

  const creditorSummary = creditors.map((c) => {
    const totalPaid = paidByCreditor.get(String(c._id)) ?? 0;
    return {
      _id: String(c._id),
      name: c.name,
      type: c.type,
      originalAmount: c.originalAmount,
      interestRate: c.interestRate,
      totalPaid,
      remaining: Math.max(0, c.originalAmount - totalPaid),
      color: c.color,
      isActive: c.isActive,
    };
  });

  const totalBorrowed = creditors.reduce((s, c) => s + c.originalAmount, 0);
  const totalPaid = allPayments.reduce((s, p) => s + p.amount, 0);
  const totalRemaining = Math.max(0, totalBorrowed - totalPaid);
  const progressPercent =
    totalBorrowed > 0 ? Math.round((totalPaid / totalBorrowed) * 100) : 0;

  // Projection
  const projectionMonths =
    totalRemaining > 0 && monthlyBudget > 0
      ? Math.ceil(totalRemaining / monthlyBudget)
      : 0;
  const clearByDate = new Date();
  clearByDate.setMonth(clearByDate.getMonth() + projectionMonths);

  // Monthly breakdown — last 24 months
  const now = new Date();
  const monthlyBreakdown: {
    month: string;
    total: number;
    byCreditor: Record<string, number>;
  }[] = [];

  for (let i = 23; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
    const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 1);

    const monthPayments = allPayments.filter((p) => {
      const pd = new Date(p.date);
      return pd >= monthStart && pd < monthEnd;
    });

    if (monthPayments.length === 0 && i > 12) continue; // skip empty months beyond last year

    const byCreditor: Record<string, number> = {};
    let total = 0;
    for (const p of monthPayments) {
      const key = String(p.creditorId);
      byCreditor[key] = (byCreditor[key] ?? 0) + p.amount;
      total += p.amount;
    }

    monthlyBreakdown.push({ month: monthKey, total, byCreditor });
  }

  return NextResponse.json({
    totalBorrowed,
    totalPaid,
    totalRemaining,
    progressPercent,
    monthlyBudget,
    projection: {
      months: projectionMonths,
      clearByDate: clearByDate.toISOString(),
    },
    creditorSummary,
    monthlyBreakdown,
  });
}
