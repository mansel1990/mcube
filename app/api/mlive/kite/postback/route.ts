import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { sql } from "@/lib/sql";

export async function POST(request: Request) {
  const secret = process.env.KITE_API_SECRET;
  if (!secret) return NextResponse.json({ error: "Kite is not configured" }, { status: 500 });
  const body = (await request.json()) as { order_id?: string; order_timestamp?: string; checksum?: string; status?: string; tradingsymbol?: string };
  const expected = createHash("sha256").update(`${body.order_id ?? ""}${body.order_timestamp ?? ""}${secret}`).digest("hex");
  if (!body.checksum || expected !== body.checksum) return NextResponse.json({ error: "Bad checksum" }, { status: 400 });
  await sql`
    INSERT INTO mlive.mlive_audit_log (actor, action, symbol, reason)
    VALUES ('kite', 'postback.fill', ${body.tradingsymbol ?? null}, ${`${body.order_id ?? ""} ${body.status ?? ""}`})`;
  return NextResponse.json({ ok: true });
}
