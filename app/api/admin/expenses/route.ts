import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { AdminExpense } from "@/lib/models/admin-expense";

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
  const month = searchParams.get("month");
  const year = searchParams.get("year");

  const query: Record<string, unknown> = {};
  if (month && year) {
    const start = new Date(parseInt(year), parseInt(month) - 1, 1);
    const end = new Date(parseInt(year), parseInt(month), 1);
    query.date = { $gte: start, $lt: end };
  }

  const expenses = await AdminExpense.find(query).sort({ date: -1 });
  return NextResponse.json(expenses);
}

export async function POST(req: NextRequest) {
  if (!(await checkAdminAuth()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectToDatabase();
  const body = await req.json();
  const expense = await AdminExpense.create(body);
  return NextResponse.json(expense, { status: 201 });
}
