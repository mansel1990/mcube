import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { requireStocksSession } from "@/lib/stocks/require-stocks-session";
import { listStocksUsers } from "@/lib/stocks/users";

export async function GET() {
  const session = await requireStocksSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const users = await listStocksUsers();
  return NextResponse.json(users);
}

export async function POST(request: NextRequest) {
  const session = await requireStocksSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await request.json();
  const { username, name, password } = body as {
    username?: string;
    name?: string;
    password?: string;
  };

  if (!username?.trim() || !name?.trim() || !password || password.length < 6) {
    return NextResponse.json(
      { error: "Username, name, and password (min 6 chars) are required" },
      { status: 400 }
    );
  }

  const email = `${username.trim().toLowerCase()}@mcube.studio`;

  try {
    await auth.api.signUpEmail({
      body: {
        username: username.trim(),
        email,
        password,
        name: name.trim(),
        section: "stocks",
      } as any, // eslint-disable-line @typescript-eslint/no-explicit-any -- custom section field
    });
    const users = await listStocksUsers();
    const created = users.find((u) => u.username === username.trim());
    return NextResponse.json(created ?? { ok: true }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to create user";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
