import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { LoanCreditor } from "@/lib/models/loan-creditor";
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

  const creditor = await LoanCreditor.findByIdAndUpdate(id, body, { new: true });
  if (!creditor)
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(creditor);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await checkAuth()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectToDatabase();
  const { id } = await params;

  const paymentCount = await LoanPayment.countDocuments({ creditorId: id });
  if (paymentCount > 0) {
    return NextResponse.json(
      { error: "Cannot delete — this creditor has payments logged against them." },
      { status: 409 }
    );
  }

  await LoanCreditor.findByIdAndDelete(id);
  return NextResponse.json({ success: true });
}
