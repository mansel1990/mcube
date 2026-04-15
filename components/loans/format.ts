const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

export function formatINR(amount: number): string {
  return inrFormatter.format(amount);
}

/** Compact form: ₹70L, ₹1.25 Cr */
export function formatINRCompact(amount: number): string {
  if (amount >= 10_000_000) {
    return `₹${(amount / 10_000_000).toFixed(2).replace(/\.?0+$/, "")} Cr`;
  }
  if (amount >= 100_000) {
    return `₹${(amount / 100_000).toFixed(1).replace(/\.0$/, "")}L`;
  }
  if (amount >= 1_000) {
    return `₹${(amount / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  }
  return `₹${amount}`;
}

export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatMonthYear(monthKey: string): string {
  // monthKey: "2026-04"
  const [year, month] = monthKey.split("-");
  const d = new Date(Number(year), Number(month) - 1, 1);
  return d.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
}

export const METHOD_LABELS: Record<string, string> = {
  bank_transfer: "Bank Transfer",
  cash: "Cash",
  upi: "UPI",
  cheque: "Cheque",
  auto_emi: "Auto EMI",
  other: "Other",
};

export const TYPE_LABELS: Record<string, string> = {
  family: "Family",
  bank: "Bank",
  friends: "Friends",
  personal: "Personal",
};
