import { NextResponse } from "next/server";
import { requireMliveSession } from "@/lib/mlive/auth";
import { ledgerPayload } from "@/lib/mlive/read";

export async function GET() {
  const session = await requireMliveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const ledger = await ledgerPayload();
  const lines = ["date,text,value", ...ledger.rows.map((row) => `${row.date},"${row.text.replace(/"/g, '""')}",${row.value ?? ""}`)];
  return new NextResponse(lines.join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": "attachment; filename=mlive-ledger.csv",
    },
  });
}
