import fs from "fs";
import os from "os";
import path from "path";

const csvPath = path.join(os.tmpdir(), "nifty500.csv");
const target = path.join("scripts", "sql", "mlive", "001_init.sql");
const csv = fs.readFileSync(csvPath, "utf8").trim().split(/\r?\n/).slice(1);
const etfs = [
  "NIFTYBEES", "BANKBEES", "JUNIORBEES", "GOLDBEES", "SILVERBEES", "LIQUIDBEES", "ITBEES",
  "SETFNIF50", "SETFNIFBK", "MON100", "MAFANG", "HDFCSML250", "CPSEETF", "INFRABEES",
  "PSUBNKBEES", "AUTOBEES", "PHARMABEES", "CONSUMBEES", "MID150BEES", "HDFCNIFTY",
  "ICICIB22", "MOMOMENTUM", "NETFIT", "LOWVOLIETF", "NIFTYIETF", "BANKIETF",
];
const q = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const rows = csv.filter(Boolean).map((line) => {
  const [name, industry, symbol, , isin] = line.split(",");
  return `(${[q(symbol), q(isin), q(name), q(industry), "false", "false"].join(",")})`;
});
const etfRows = etfs.map((symbol) => `(${q(symbol)},NULL,${q(symbol)},${q("ETF")},true,true)`);
const sql = `
-- Nifty 500 sectors from niftyindices.com ind_nifty500list.csv, fetched 5 Nov 2026.
-- ETFs are flagged and excluded. Names missing from this file stay out until the next refresh.
INSERT INTO mlive.mlive_instruments (symbol, isin, name, sector, is_etf, excluded) VALUES
${rows.concat(etfRows).join(",\n")}
ON CONFLICT (symbol) DO UPDATE SET
  isin = EXCLUDED.isin,
  name = EXCLUDED.name,
  sector = EXCLUDED.sector,
  is_etf = EXCLUDED.is_etf,
  excluded = EXCLUDED.excluded,
  updated_at = now();
`;
const current = fs.readFileSync(target, "utf8");
if (!current.includes("mlive_instruments (symbol, isin")) {
  fs.appendFileSync(target, sql);
}
console.log(`instruments ${rows.length} + etfs ${etfRows.length}`);
