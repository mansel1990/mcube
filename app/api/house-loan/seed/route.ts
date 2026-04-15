import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { LoanCreditor } from "@/lib/models/loan-creditor";

async function checkAuth() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || (session.user as Record<string, unknown>).section !== "admin")
    return null;
  return session;
}

const SEED_CREDITORS = [
  {
    name: "Mom",
    type: "family",
    originalAmount: 7000000,
    interestRate: 0,
    notes: "Flexible repayment, as and when possible",
    color: "#3b82f6",
    isActive: true,
  },
  {
    name: "Anantha",
    type: "family",
    originalAmount: 1000000,
    interestRate: 0,
    notes: "Needs full repayment in 8-10 months",
    color: "#ef4444",
    isActive: true,
  },
  {
    name: "Bank Loan",
    type: "bank",
    originalAmount: 3000000,
    interestRate: 8.5,
    notes: "5-year tenure, EMI ~₹61,550/month",
    color: "#f59e0b",
    isActive: true,
  },
  {
    name: "Credit Card",
    type: "personal",
    originalAmount: 100000,
    interestRate: 0,
    notes: "Clear immediately",
    color: "#10b981",
    isActive: true,
  },
];

export async function POST() {
  if (!(await checkAuth()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectToDatabase();

  const existing = await LoanCreditor.countDocuments();
  if (existing > 0) {
    return NextResponse.json(
      { error: "Creditors already exist. Clear them first." },
      { status: 409 }
    );
  }

  const creditors = await LoanCreditor.insertMany(SEED_CREDITORS);
  return NextResponse.json({ created: creditors.length });
}
