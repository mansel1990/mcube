export type NiftyReason = "no-url" | "unreachable" | "no-data";

export const NIFTY_REASON_NOTE: Record<NiftyReason, string> = {
  "no-url": "Nifty data not connected",
  unreachable: "Nifty data unavailable right now",
  "no-data": "Nifty close not saved yet",
};
