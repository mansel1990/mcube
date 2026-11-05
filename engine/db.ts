import fs from "fs";
import { config } from "dotenv";
import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let loaded = false;

export function loadEnv(): void {
  if (loaded) return;
  loaded = true;
  for (const file of ["/etc/mcube/mlive.env", ".env.local"]) {
    if (fs.existsSync(file)) config({ path: file });
  }
}

type Sql = NeonQueryFunction<false, false>;
let cached: Sql | null = null;

export function db(): Sql {
  loadEnv();
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  if (!cached) cached = neon(url);
  return cached;
}

export async function q<T extends Record<string, unknown> = Record<string, unknown>>(
  text: string,
  params: unknown[] = []
): Promise<T[]> {
  const rows = await db().query(text, params);
  return rows as T[];
}

export function num(value: unknown): number {
  if (typeof value === "number") return Number.isFinite(value) ? value : 0;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

export function asDate(value: unknown): string | null {
  if (value == null) return null;
  if (value instanceof Date) return value.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" });
  const match = String(value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

export function jsonValue(value: unknown): unknown {
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}
