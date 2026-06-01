/**
 * Minimal Kite order relay for DigitalOcean (static IP whitelist).
 * Vercel → POST /order|/cancel|/gtt → this service → Kite API.
 */
import "dotenv/config";
import { createServer } from "node:http";
import { buildOcoSellGttFormFields, roundToTick } from "./gtt-payload.mjs";

const PORT = Number(process.env.PORT ?? 3100);
const RELAY_SECRET = process.env.KITE_RELAY_SECRET;
const API_KEY = process.env.KITE_API_KEY;
const KITE_BASE = "https://api.kite.trade";
const RELAY_VERSION = 2;

if (!RELAY_SECRET || !API_KEY) {
  console.error("Missing KITE_RELAY_SECRET or KITE_API_KEY");
  process.exit(1);
}

function auth(req) {
  return req.headers["x-relay-secret"] === RELAY_SECRET;
}

function pathname(req) {
  try {
    return new URL(req.url ?? "/", "http://localhost").pathname.replace(/\/$/, "") || "/";
  } catch {
    return req.url?.split("?")[0]?.replace(/\/$/, "") || "/";
  }
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

  const path = pathname(req);

  try {
    if (req.method === "GET" && path === "/health") {
      return send(200, { ok: true, version: RELAY_VERSION, gtt: true });
    }

    if (!auth(req)) {
      return send(401, { error: "Unauthorized" });
    }

    if (req.method === "POST" && path === "/order") {
      const body = await readJson(req);
      const {
        accessToken,
        symbol,
        exchange = "NSE",
        transactionType,
        quantity,
        product = "CNC",
        orderType = "MARKET",
        price,
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
      } else if (orderType === "LIMIT") {
        const limit = roundToTick(Number(price));
        if (!Number.isFinite(limit) || limit <= 0) {
          return send(400, { error: "price required for LIMIT order" });
        }
        orderParams.price = String(limit);
      }

      const data = await kiteRequest("POST", "/orders/regular", accessToken, orderParams);
      const orderId = data.data?.order_id;
      if (!orderId) throw new Error("No order_id in Kite response");
      return send(200, { orderId: String(orderId) });
    }

    if (req.method === "POST" && path === "/gtt") {
      const body = await readJson(req);
      const {
        accessToken,
        symbol,
        exchange = "NSE",
        quantity,
        lastPrice,
        stopLoss,
        target,
      } = body;

      if (
        !accessToken ||
        !symbol ||
        !quantity ||
        lastPrice == null ||
        stopLoss == null ||
        target == null
      ) {
        return send(400, { error: "Missing required GTT fields" });
      }

      const tradingsymbol = String(symbol).toUpperCase();
      const qty = Math.floor(Number(quantity));

      let gttFields;
      try {
        gttFields = buildOcoSellGttFormFields({
          exchange,
          tradingsymbol,
          quantity: qty,
          lastPrice,
          stopLoss,
          target,
        });
      } catch (err) {
        return send(400, { error: err instanceof Error ? err.message : "Invalid GTT params" });
      }

      const data = await kiteRequest("POST", "/gtt/triggers", accessToken, gttFields);

      const triggerId = data.data?.trigger_id;
      if (!triggerId) throw new Error("No trigger_id in Kite GTT response");
      return send(200, { triggerId: String(triggerId) });
    }

    if (req.method === "POST" && path === "/cancel") {
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
  console.log(`Kite relay v${RELAY_VERSION} listening on :${PORT}`);
});
