export type TradeSide = "buy" | "sell";

export type TradeFill = {
  symbol: string;
  date: string;
  side: TradeSide;
  quantity: number;
  price: number;
};

export type OpenLot = {
  date: string;
  units: number;
  price: number;
};

export type TradebookMatch =
  | { ok: true; lots: OpenLot[]; units: number; average: number; moneyAdded: number }
  | { ok: false; reconstructed: number; kite: number; difference: number };

const HEADER_ALIASES: Record<string, "symbol" | "date" | "side" | "quantity" | "price"> = {
  symbol: "symbol",
  tradingsymbol: "symbol",
  instrument: "symbol",
  "trade date": "date",
  tradedate: "date",
  date: "date",
  "order execution time": "date",
  "trade type": "side",
  tradetype: "side",
  side: "side",
  "buy/sell": "side",
  quantity: "quantity",
  qty: "quantity",
  price: "price",
  "trade price": "price",
};

function cell(value: string): string {
  return value.trim().replace(/^"|"$/g, "").trim();
}

function splitRow(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (const char of line) {
    if (char === '"') {
      quoted = !quoted;
      current += char;
      continue;
    }
    if (char === "," && !quoted) {
      cells.push(cell(current));
      current = "";
      continue;
    }
    current += char;
  }
  cells.push(cell(current));
  return cells;
}

function headerKey(value: string): "symbol" | "date" | "side" | "quantity" | "price" | null {
  return HEADER_ALIASES[value.trim().toLowerCase().replace(/\s+/g, " ")] ?? null;
}

export function parseTradeDate(value: string): string | null {
  const text = value.trim();
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = text.match(/^(\d{2})[-/](\d{2})[-/](\d{4})/);
  if (dmy) return `${dmy[3]}-${dmy[2]}-${dmy[1]}`;
  return null;
}

function numberCell(value: string): number | null {
  const parsed = Number(value.replace(/[,₹\s]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function sideCell(value: string): TradeSide | null {
  const text = value.trim().toLowerCase();
  if (text === "buy" || text === "b") return "buy";
  if (text === "sell" || text === "s") return "sell";
  return null;
}

export function parseTradebookCsv(csv: string, symbol: string): TradeFill[] {
  const lines = csv.split(/\r?\n/).map((line) => line.trim()).filter((line) => line.length > 0);
  if (lines.length === 0) return [];
  const headers = splitRow(lines[0]).map(headerKey);
  const columns = {
    symbol: headers.indexOf("symbol"),
    date: headers.indexOf("date"),
    side: headers.indexOf("side"),
    quantity: headers.indexOf("quantity"),
    price: headers.indexOf("price"),
  };
  if (Object.values(columns).some((index) => index < 0)) return [];
  const wanted = symbol.trim().toUpperCase();
  const fills: TradeFill[] = [];
  for (const line of lines.slice(1)) {
    const row = splitRow(line);
    const rowSymbol = (row[columns.symbol] ?? "").toUpperCase();
    if (rowSymbol !== wanted) continue;
    const date = parseTradeDate(row[columns.date] ?? "");
    const side = sideCell(row[columns.side] ?? "");
    const quantity = numberCell(row[columns.quantity] ?? "");
    const price = numberCell(row[columns.price] ?? "");
    if (!date || !side || quantity == null || price == null || !(quantity > 0) || !(price > 0)) continue;
    fills.push({ symbol: wanted, date, side, quantity, price });
  }
  return fills;
}

function roundUnits(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/** Oldest remaining buy units are sold first. A partial sell can split a buy. */
export function reconstructFifo(fills: readonly TradeFill[]): OpenLot[] {
  const ordered = [...fills].sort((a, b) => a.date.localeCompare(b.date));
  const lots: OpenLot[] = [];
  for (const fill of ordered) {
    if (fill.side === "buy") {
      lots.push({ date: fill.date, units: fill.quantity, price: fill.price });
      continue;
    }
    let left = fill.quantity;
    for (const lot of lots) {
      if (left <= 0) break;
      if (!(lot.units > 0)) continue;
      const take = Math.min(lot.units, left);
      lot.units = roundUnits(lot.units - take);
      left = roundUnits(left - take);
    }
  }
  return lots.filter((lot) => lot.units > 0);
}

export function lotUnits(lots: readonly OpenLot[]): number {
  return roundUnits(lots.reduce((sum, lot) => sum + lot.units, 0));
}

export function lotMoney(lots: readonly OpenLot[]): number {
  return Math.round(lots.reduce((sum, lot) => sum + lot.units * lot.price, 0) * 100) / 100;
}

export function matchKiteUnits(lots: readonly OpenLot[], kiteUnits: number): TradebookMatch {
  const units = lotUnits(lots);
  const difference = roundUnits(units - kiteUnits);
  if (Math.abs(difference) > 0.0001) {
    return { ok: false, reconstructed: units, kite: kiteUnits, difference };
  }
  const moneyAdded = lotMoney(lots);
  return {
    ok: true,
    lots: lots.map((lot) => ({ ...lot })),
    units,
    average: units > 0 ? Math.round((moneyAdded / units) * 10000) / 10000 : 0,
    moneyAdded,
  };
}

export async function tradebookChecksum(csv: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(csv));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}
