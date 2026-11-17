/** One today's P&L for the hero, the Swing card, and Audit's Net today. */

export type OpenLeg = {
  qty: number;
  /** Previous close when the position was held overnight, fill price when it was bought today. */
  baseline: number;
  live: number | null;
};

export type SessionMoveInput = {
  /** Price P&L of positions closed today, before charges. */
  realisedGross: number;
  /** Charges booked today. A positive number. */
  charges: number;
  open: OpenLeg[];
};

/** Realised today, plus the open book's move since its baseline, minus today's charges. */
export function sessionMove(input: SessionMoveInput): number {
  let open = 0;
  for (const leg of input.open) {
    const live = leg.live != null && Number.isFinite(leg.live) && leg.live > 0 ? leg.live : leg.baseline;
    open += (live - leg.baseline) * leg.qty;
  }
  return round2(input.realisedGross + open - input.charges);
}

export type TodayReading = {
  beforeOpen: boolean;
  label: "today" | "Yesterday";
  amount: number;
  pct: number | null;
  note: string | null;
};

/**
 * Before the open the figure is yesterday's, labelled Yesterday.
 * Once the market is open it is the session move, as a percent of the previous close.
 */
export function todayReading(input: {
  beforeOpen: boolean;
  session: number;
  yesterday: number | null;
  /** Account value the percent divides by: the close before yesterday, or the previous close. */
  base: number | null;
}): TodayReading {
  if (input.beforeOpen) {
    const amount = input.yesterday ?? 0;
    return {
      beforeOpen: true,
      label: "Yesterday",
      amount: round2(amount),
      pct: input.base ? (amount / input.base) * 100 : null,
      note: "Market not open yet",
    };
  }
  return {
    beforeOpen: false,
    label: "today",
    amount: round2(input.session),
    pct: input.base ? (input.session / input.base) * 100 : null,
    note: null,
  };
}

/** Close-to-close move. A deposit is not profit. */
export function closedDayMove(value: number | null, prev: number | null, deposit: number, withdrawal: number): number | null {
  if (value == null || prev == null) return null;
  return round2(value - prev - deposit + withdrawal);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
