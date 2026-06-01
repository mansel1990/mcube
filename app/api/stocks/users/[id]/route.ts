import { NextRequest, NextResponse } from "next/server";
import { getStocksSessionUsername, isStocksAdmin } from "@/lib/stocks/admin";
import { requireStocksSession } from "@/lib/stocks/require-stocks-session";
import { countStocksUsers, deleteStocksUser, getStocksUserById } from "@/lib/stocks/users";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireStocksSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const actorUsername = getStocksSessionUsername(session.user as Record<string, unknown>);
  if (!isStocksAdmin(actorUsername)) {
    return NextResponse.json({ error: "Only the admin can remove users" }, { status: 403 });
  }

  const { id } = await params;

  if (id === session.user.id) {
    return NextResponse.json({ error: "Cannot delete your own account" }, { status: 400 });
  }

  const target = await getStocksUserById(id);
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });

  if (isStocksAdmin(target.username)) {
    return NextResponse.json({ error: "Cannot delete the admin account" }, { status: 403 });
  }

  const total = await countStocksUsers();
  if (total <= 1) {
    return NextResponse.json({ error: "Must keep at least one stocks user" }, { status: 400 });
  }

  const deleted = await deleteStocksUser(id);
  if (!deleted) return NextResponse.json({ error: "User not found" }, { status: 404 });

  return NextResponse.json({ ok: true });
}
