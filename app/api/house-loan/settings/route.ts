import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
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

  let settings = await LoanSettings.findOne();
  if (!settings) {
    settings = await LoanSettings.create({ monthlyBudget: 350000 });
  }

  return NextResponse.json(settings);
}

export async function PUT(req: NextRequest) {
  if (!(await checkAuth()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectToDatabase();

  const { monthlyBudget } = await req.json();

  const settings = await LoanSettings.findOneAndUpdate(
    {},
    { monthlyBudget },
    { new: true, upsert: true }
  );

  return NextResponse.json(settings);
}
