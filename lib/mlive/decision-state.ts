export type DecisionMode = "auto" | "approve" | "paused";
export type DecisionSide = "BUY" | "SELL";
export type SendWindowState = "before" | "during" | "after";
export type DecisionTone = "loss" | "swing" | "profit" | "neutral";

export type DecisionStateInput = {
  mode: DecisionMode;
  side: DecisionSide;
  outcome: string;
  orderStatus?: string | null;
  ordered?: number;
  filled?: number;
  sendWindow: SendWindowState;
  reason?: string;
};

export type DecisionStateView = {
  label: string;
  tone: DecisionTone;
  explanation: string;
  allowApproval: boolean;
};

/** Sell orders are sent 09:15–09:35 IST. Buy orders are sent 09:40–10:00 IST. */
const SELL_START = 9 * 60 + 15;
const SELL_END = 9 * 60 + 35;
const BUY_START = 9 * 60 + 40;
const BUY_END = 10 * 60;

export function sendWindowState(side: DecisionSide, minutes: number): SendWindowState {
  const start = side === "SELL" ? SELL_START : BUY_START;
  const end = side === "SELL" ? SELL_END : BUY_END;
  if (minutes < start) return "before";
  if (minutes <= end) return "during";
  return "after";
}

function whole(value: number | undefined): number {
  return Math.max(0, Math.floor(value ?? 0));
}

export function decisionState(input: DecisionStateInput): DecisionStateView {
  const side: DecisionSide = input.side === "SELL" ? "SELL" : "BUY";
  const sell = side === "SELL";
  const ordered = whole(input.ordered);
  const filled = whole(input.filled);
  const outcome = input.outcome.toLowerCase();
  const status = (input.orderStatus ?? "").toUpperCase();
  const explanation = input.reason?.trim() ?? "";
  const tone: DecisionTone = sell ? "loss" : "swing";
  const partial = filled > 0 && ordered > filled;
  const verb = sell ? "sold" : "bought";
  const proposed = outcome === "proposed" || outcome === "approved";
  const orderOpen = status === "OPEN" || status === "TRIGGER PENDING" || status === "PUT ORDER REQ RECEIVED" || status === "DRY";
  const sent = orderOpen || status === "COMPLETE" || outcome === "sent" || outcome === "working" || outcome === "filled" || filled > 0;

  if (outcome === "skipped") {
    return { label: "Skipped", tone: "neutral", explanation, allowApproval: false };
  }
  if (outcome === "rejected" || status === "REJECTED") {
    if (partial) return { label: `${filled} of ${ordered} ${verb}`, tone, explanation, allowApproval: false };
    return { label: sell ? "Sell rejected" : "Buy rejected", tone: "loss", explanation, allowApproval: false };
  }
  if (outcome === "cancelled" || status === "CANCELLED") {
    if (partial) return { label: `${filled} of ${ordered} ${verb}`, tone, explanation, allowApproval: false };
    return { label: sell ? "Sell cancelled" : "Buy cancelled", tone: "neutral", explanation, allowApproval: false };
  }
  if (partial && sent) {
    return { label: `${filled} of ${ordered} ${verb}`, tone, explanation, allowApproval: false };
  }
  if (outcome === "filled" || status === "COMPLETE" || (ordered > 0 && filled >= ordered && sent)) {
    return { label: sell ? "Sold" : "Bought", tone: sell ? "loss" : "profit", explanation, allowApproval: false };
  }
  if (sent) {
    return { label: sell ? "Sell order open" : "Buy order open", tone, explanation, allowApproval: false };
  }
  if (input.mode === "auto" && proposed && input.sendWindow === "before") {
    return {
      label: sell ? "Selling at open · auto" : "Buying at open · auto",
      tone,
      explanation,
      allowApproval: false,
    };
  }
  if (input.mode === "auto" && proposed) {
    return {
      label: sell ? "Selling · auto" : "Buying · auto",
      tone,
      explanation,
      allowApproval: false,
    };
  }
  return {
    label: sell ? "Approve sell" : "Approve buy",
    tone,
    explanation,
    allowApproval: input.mode !== "auto" && proposed,
  };
}
