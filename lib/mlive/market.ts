import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let cached: NeonQueryFunction<false, false> | null = null;

export function marketSql(): NeonQueryFunction<false, false> | null {
  const url = process.env.MARKET_DATABASE_URL_UNPOOLED || process.env.MARKET_DATABASE_URL;
  if (!url) return null;
  if (!cached) cached = neon(url);
  return cached;
}
