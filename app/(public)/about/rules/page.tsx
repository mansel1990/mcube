import type { Metadata } from "next";
import { RulesArticle } from "@/components/about/articles";
import { rulesModelFrom, type RulesModel } from "@/lib/about/rules-model";
import { sql } from "@/lib/sql";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Rules",
  robots: "noindex, nofollow",
};

export default async function RulesPage() {
  let model: RulesModel;
  try {
    model = rulesModelFrom(await rulesSource());
  } catch {
    model = rulesModelFrom({ lastUpdated: "unavailable", settings: { strategies_enabled: [] } });
  }
  return <RulesArticle model={model} />;
}

async function rulesSource(): Promise<{ lastUpdated: string; settings: Record<string, unknown> }> {
  const [rows, history] = await Promise.all([
    sql`SELECT key, value, updated_at FROM mlive.mlive_settings`,
    sql`SELECT MAX(changed_at) AS changed_at FROM mlive.mlive_settings_history`,
  ]);
  const settings: Record<string, unknown> = {};
  let latest = "";
  for (const row of rows) {
    settings[String(row.key)] = row.value;
    const stamp = stampOf(row.updated_at);
    if (stamp > latest) latest = stamp;
  }
  const changed = stampOf(history[0]?.changed_at);
  if (changed > latest) latest = changed;
  return { lastUpdated: latest || "not recorded", settings };
}

function stampOf(value: unknown): string {
  if (value == null) return "";
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.valueOf())) return "";
  return date.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}
