const RELAY_SECRET_HEADER = "X-Relay-Secret";

export interface RelayOrderRequest {
  accessToken: string;
  symbol: string;
  exchange?: string;
  transactionType: "BUY" | "SELL";
  orderType?: "MARKET" | "LIMIT";
  quantity: number;
  product?: "CNC" | "MIS" | "NRML";
}

export interface RelayOrderResponse {
  orderId: string;
}

export interface RelayCancelRequest {
  accessToken: string;
  orderId: string;
  variety?: string;
}

export interface RelayGttOcoRequest {
  accessToken: string;
  symbol: string;
  exchange?: string;
  quantity: number;
  lastPrice: number;
  stopLoss: number;
  target: number;
}

export interface RelayGttResponse {
  triggerId: string;
}

function relayBaseUrl(): string {
  const url = process.env.KITE_RELAY_URL?.replace(/\/$/, "");
  if (!url) throw new Error("KITE_RELAY_URL is not configured");
  return url;
}

function relaySecret(): string {
  const secret = process.env.KITE_RELAY_SECRET;
  if (!secret) throw new Error("KITE_RELAY_SECRET is not configured");
  return secret;
}

async function relayFetch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${relayBaseUrl()}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [RELAY_SECRET_HEADER]: relaySecret(),
    },
    body: JSON.stringify(body),
  });

  const data = (await res.json().catch(() => ({}))) as { error?: string; orderId?: string };
  if (!res.ok) {
    throw new Error(data.error ?? `Relay error (${res.status})`);
  }
  return data as T;
}

export async function placeOrderViaRelay(req: RelayOrderRequest): Promise<RelayOrderResponse> {
  return relayFetch<RelayOrderResponse>("/order", {
    accessToken: req.accessToken,
    symbol: req.symbol,
    exchange: req.exchange ?? "NSE",
    transactionType: req.transactionType,
    orderType: req.orderType ?? "MARKET",
    quantity: req.quantity,
    product: req.product ?? "CNC",
  });
}

export async function cancelOrderViaRelay(req: RelayCancelRequest): Promise<void> {
  await relayFetch<{ ok: boolean }>("/cancel", {
    accessToken: req.accessToken,
    orderId: req.orderId,
    variety: req.variety ?? "regular",
  });
}

export async function placeGttOcoViaRelay(req: RelayGttOcoRequest): Promise<RelayGttResponse> {
  return relayFetch<RelayGttResponse>("/gtt", {
    accessToken: req.accessToken,
    symbol: req.symbol,
    exchange: req.exchange ?? "NSE",
    quantity: req.quantity,
    lastPrice: req.lastPrice,
    stopLoss: req.stopLoss,
    target: req.target,
  });
}
