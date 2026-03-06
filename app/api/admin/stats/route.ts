import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { connectToDatabase } from "@/lib/mongodb";
import { AdminSubscription } from "@/lib/models/admin-subscription";
import { AdminPayment } from "@/lib/models/admin-payment";
import { AdminExpense } from "@/lib/models/admin-expense";

async function checkAdminAuth() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session || (session.user as Record<string, unknown>).section !== "admin")
    return null;
  return session;
}

const MONTH_LABELS = [
  "Jan","Feb","Mar","Apr","May","Jun",
  "Jul","Aug","Sep","Oct","Nov","Dec",
];

export async function GET() {
  if (!(await checkAdminAuth()))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await connectToDatabase();

  // Fetch ALL subscriptions so we can check historical activity per month
  const allSubs = await AdminSubscription.find();

  // Build last 6 months
  const now = new Date();
  const buckets = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    return {
      label: `${MONTH_LABELS[d.getMonth()]} '${String(d.getFullYear()).slice(2)}`,
      year: d.getFullYear(),
      month: d.getMonth(), // 0-indexed
      start: new Date(d.getFullYear(), d.getMonth(), 1),
      end: new Date(d.getFullYear(), d.getMonth() + 1, 1),
    };
  });

  const sixMonthsAgo = buckets[0].start;

  const [payments, expenses] = await Promise.all([
    AdminPayment.find({ date: { $gte: sixMonthsAgo } }),
    AdminExpense.find({ date: { $gte: sixMonthsAgo } }),
  ]);

  // Pre-compute per-bucket income by spreading multi-month payments across
  // their covered months. Compare by UTC year+month integers to avoid
  // timezone issues when the client serializes local Date objects.
  const bucketIncome = buckets.map(({ year, month }) => {
    let total = 0;
    for (const p of payments) {
      const origin = p.periodStart ? new Date(p.periodStart) : new Date(p.date);
      const originYear = origin.getUTCFullYear();
      const originMonth = origin.getUTCMonth(); // 0-indexed
      const months = p.monthsCovered ?? 1;
      const perMonth = p.amount / months;
      for (let m = 0; m < months; m++) {
        const covYear = originYear + Math.floor((originMonth + m) / 12);
        const covMonth = (originMonth + m) % 12;
        if (covYear === year && covMonth === month) {
          total += perMonth;
        }
      }
    }
    return total;
  });

  const data = buckets.map(({ label, start, end }, i) => {
    const income = bucketIncome[i];

    const oneTime = expenses
      .filter((e) => new Date(e.date) >= start && new Date(e.date) < end)
      .reduce((s, e) => s + e.amount, 0);

    // Only count a subscription for this month if:
    // - it started before the end of this month
    // - AND it's not cancelled, OR it was cancelled on/after the start of this month
    const monthlySubCost = allSubs
      .filter((sub) => {
        const started = new Date(sub.startDate) < end;
        if (!started) return false;
        if (sub.status === "cancelled" && sub.cancelledAt) {
          return new Date(sub.cancelledAt) >= start;
        }
        return sub.status === "active" || sub.status === "paused";
      })
      .reduce(
        (s, sub) => s + (sub.billingCycle === "monthly" ? sub.amount : sub.amount / 12),
        0
      );

    const totalExpenses = monthlySubCost + oneTime;
    const net = income - totalExpenses;

    return {
      month: label,
      income: Math.round(income * 100) / 100,
      expenses: Math.round(totalExpenses * 100) / 100,
      net: Math.round(net * 100) / 100,
    };
  });

  return NextResponse.json(data);
}
