import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { LoanPayment } from "@/lib/models/loan-payment";

async function checkAuth() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || (session.user as Record<string, unknown>).section !== "admin")
    return null;
  return session;
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await checkAuth()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectToDatabase();
  const { id } = await params;
  const body = await req.json();

  if (body.date) body.date = new Date(body.date);

  const payment = await LoanPayment.findByIdAndUpdate(id, body, { new: true }).populate(
    "creditorId",
    "name color type"
  );
  if (!payment)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(payment);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await checkAuth()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectToDatabase();
  const { id } = await params;

  await LoanPayment.findByIdAndDelete(id);
  return NextResponse.json({ success: true });
}
