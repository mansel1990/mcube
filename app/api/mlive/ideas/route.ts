import { NextRequest, NextResponse } from "next/server";
import { requireMliveSession } from "@/lib/mlive/auth";
import { ideasBadge, loadIdeas } from "@/lib/mlive/ideas-load";

export async function GET(request: NextRequest) {
  const session = await requireMliveSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const params = request.nextUrl.searchParams;
  try {
    if (params.get("badge") === "1") return NextResponse.json(await ideasBadge());
    return NextResponse.json(await loadIdeas({
      view: params.get("view"),
      strategy: params.get("strategy"),
      from: params.get("from"),
      to: params.get("to"),
      range: params.get("range"),
    }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not read ideas";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
