import { NextRequest, NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { LoanPayment } from "@/lib/models/loan-payment";
import { LoanCreditor } from "@/lib/models/loan-creditor";

async function checkAuth() {
  const session = await auth.api.getSession({ headers: await headers() });
  const section = (session?.user as Record<string, unknown>)?.section;
  if (!session || (section !== "admin" && section !== "viewer")) return null;
  return session;
}

export async function GET(req: NextRequest) {
  const session = await checkAuth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const isViewer = (session.user as Record<string, unknown>).section === "viewer";

  await connectToDatabase();

  const { searchParams } = new URL(req.url);
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const method = searchParams.get("method");
  const limit = parseInt(searchParams.get("limit") ?? "50");
  const page = parseInt(searchParams.get("page") ?? "1");

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const filter: Record<string, any> = {};

  if (isViewer) {
    // Lock viewer to payments for their own creditor only
    const myCreditor = await LoanCreditor.findOne({ userId: session.user.id });
    if (!myCreditor)
      return NextResponse.json({ payments: [], total: 0, page, limit });
    filter.creditorId = myCreditor._id;
  } else {
    const creditorId = searchParams.get("creditorId");
    if (creditorId) filter.creditorId = creditorId;
  }
  if (method) filter.method = method;
  if (startDate || endDate) {
    filter.date = {};
    if (startDate) filter.date.$gte = new Date(startDate);
    if (endDate) filter.date.$lte = new Date(endDate);
  }

  const [payments, total] = await Promise.all([
    LoanPayment.find(filter)
      .sort({ date: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .populate("creditorId", "name color type"),
    LoanPayment.countDocuments(filter),
  ]);

  return NextResponse.json({ payments, total, page, limit });
}

export async function POST(req: NextRequest) {
  const session = await checkAuth();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if ((session.user as Record<string, unknown>).section === "viewer")
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  await connectToDatabase();

  const body = await req.json();

  // Validate creditor exists
  const creditor = await LoanCreditor.findById(body.creditorId);
  if (!creditor)
    return NextResponse.json({ error: "Creditor not found" }, { status: 404 });

  const payment = await LoanPayment.create({
    ...body,
    date: new Date(body.date),
  });

  const populated = await payment.populate("creditorId", "name color type");
  return NextResponse.json(populated, { status: 201 });
}
