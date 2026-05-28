/**
 * Minimal Kite order relay for DigitalOcean (static IP whitelist).
 * Vercel → POST /order|/cancel → this service → Kite API.
 */
import "dotenv/config";
import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 3100);
const RELAY_SECRET = process.env.KITE_RELAY_SECRET;
const API_KEY = process.env.KITE_API_KEY;
const KITE_BASE = "https://api.kite.trade";

if (!RELAY_SECRET || !API_KEY) {
  console.error("Missing KITE_RELAY_SECRET or KITE_API_KEY");
  process.exit(1);
}

function auth(req) {
  return req.headers["x-relay-secret"] === RELAY_SECRET;
}

async function readJson(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  return raw ? JSON.parse(raw) : {};
}

async function kiteRequest(method, path, accessToken, body) {
  const headers = {
    "X-Kite-Version": "3",
    Authorization: `token ${API_KEY}:${accessToken}`,
  };

  let fetchBody;
  if (body && method !== "GET" && method !== "DELETE") {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    fetchBody = new URLSearchParams(body).toString();
  }

  const res = await fetch(`${KITE_BASE}${path}`, { method, headers, body: fetchBody });
  const data = await res.json().catch(() => ({}));

  if (!res.ok || data.status === "error") {
    const msg = data.message ?? data.error_type ?? `Kite HTTP ${res.status}`;
    throw new Error(msg);
  }
  return data;
}

const server = createServer(async (req, res) => {
  const send = (status, payload) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(payload));
  };

  try {
    if (req.method === "GET" && req.url === "/health") {
      return send(200, { ok: true });
    }

    if (!auth(req)) {
      return send(401, { error: "Unauthorized" });
    }

    if (req.method === "POST" && req.url === "/order") {
      const body = await readJson(req);
      const {
        accessToken,
        symbol,
        exchange = "NSE",
        transactionType,
        quantity,
        product = "CNC",
        orderType = "MARKET",
      } = body;

      if (!accessToken || !symbol || !transactionType || !quantity) {
        return send(400, { error: "Missing required fields" });
      }

      const orderParams = {
        tradingsymbol: String(symbol).toUpperCase(),
        exchange,
        transaction_type: transactionType,
        quantity: String(Math.floor(Number(quantity))),
        product,
        order_type: orderType,
        validity: "DAY",
      };

      if (orderType === "MARKET") {
        orderParams.market_protection = "-1";
      }

      const data = await kiteRequest("POST", "/orders/regular", accessToken, orderParams);
      const orderId = data.data?.order_id;
      if (!orderId) throw new Error("No order_id in Kite response");
      return send(200, { orderId: String(orderId) });
    }

    if (req.method === "POST" && req.url === "/cancel") {
      const body = await readJson(req);
      const { accessToken, orderId, variety = "regular" } = body;

      if (!accessToken || !orderId) {
        return send(400, { error: "Missing accessToken or orderId" });
      }

      await kiteRequest("DELETE", `/orders/${variety}/${orderId}`, accessToken);
      return send(200, { ok: true });
    }

    send(404, { error: "Not found" });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal error";
    console.error("[relay]", message);
    send(502, { error: message });
  }
});

server.listen(PORT, "0.0.0.0", () => {
  console.log(`Kite relay listening on :${PORT}`);
});
