import { readFileSync } from "node:fs";
import { neon } from "@neondatabase/serverless";
import { config } from "dotenv";

config({ path: ".env.local" });

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}

function statements(text) {
  const out = [];
  let current = "";
  let i = 0;
  let dollar = false;
  while (i < text.length) {
    if (!dollar && text.startsWith("--", i)) {
      const end = text.indexOf("\n", i);
      i = end === -1 ? text.length : end + 1;
      continue;
    }
    if (!dollar && text[i] === "'") {
      current += text[i++];
      while (i < text.length) {
        current += text[i];
        if (text[i] === "'" && text[i + 1] === "'") {
          current += text[++i];
          i++;
          continue;
        }
        if (text[i] === "'") {
          i++;
          break;
        }
        i++;
      }
      continue;
    }
    if (text.startsWith("$$", i)) {
      dollar = !dollar;
      current += "$$";
      i += 2;
      continue;
    }
    if (!dollar && text[i] === ";") {
      const statement = current.trim();
      if (statement) out.push(statement);
      current = "";
      i++;
      continue;
    }
    current += text[i++];
  }
  const tail = current.trim();
  if (tail) out.push(tail);
  return out;
}

const sql = neon(process.env.DATABASE_URL);
const file = readFileSync(new URL(process.argv[2] || "./001_init.sql", import.meta.url), "utf8");
const list = statements(file);
console.log(`running ${list.length} statements`);

for (let index = 0; index < list.length; index++) {
  try {
    await sql.query(list[index]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`statement ${index + 1} failed: ${message.split("\n")[0]}`);
    console.error(list[index].slice(0, 180).replace(/\s+/g, " "));
    process.exit(1);
  }
}

if (!process.argv[2]) {
  const rows = await sql`SELECT
    (SELECT COUNT(*)::int FROM mlive.mlive_instruments) AS instruments,
    (SELECT COUNT(*)::int FROM mlive.mlive_settings) AS settings,
    (SELECT COALESCE(SUM(amount), 0) FROM mlive.mlive_fund_ledger) AS fund`;
  console.log(rows[0]);
} else {
  console.log("applied", process.argv[2]);
}
