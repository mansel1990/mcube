/** One line under a step in "How the day ran", once that step has run. */
export function dayStepResult(input: {
  id: string;
  ran: boolean;
  bought: number;
  skipped: number;
  stops: number;
  kiteAt: string | null;
  remind: "push" | "ready" | "off" | null;
  matched: number | null;
  /** Holdings in that check. When this is above `matched`, one or more did not match. */
  checked?: number | null;
  cash: number | null;
  noBuys: string | null;
}): string {
  if (input.id === "wait") return "Buys held";
  if (input.id === "login") return input.kiteAt ? `Kite connected ${input.kiteAt}` : input.ran ? "Still waiting" : "";
  if (!input.ran) return "";
  if (input.id === "remind") {
    if (input.remind === "push") return "Push sent";
    if (input.remind === "ready") return "Already logged in";
    return "";
  }
  if (input.id === "preflight") {
    if (input.matched == null) return "";
    const cash = input.cash == null ? "" : ` · cash ₹${Math.round(input.cash).toLocaleString("en-IN")}`;
    const holdings = input.checked != null && input.checked > input.matched
      ? `${input.matched} of ${input.checked} holdings match Kite`
      : `${input.matched} holdings match Kite`;
    return `${holdings}${cash}`;
  }
  if (input.id === "buys") {
    if (input.bought === 0 && input.noBuys) return input.noBuys.replace(/\.$/, "");
    return `${input.bought} bought, ${input.skipped} skipped`;
  }
  if (input.id === "stops") return input.stops ? `${input.stops} stop${input.stops === 1 ? "" : "s"} raised` : "No stop changes";
  if (input.id === "sells") return "Sells checked";
  if (input.id === "eod") return "Account written";
  if (input.id === "scan") return "Scan finished";
  if (input.id === "report") return "Report written";
  return "";
}
