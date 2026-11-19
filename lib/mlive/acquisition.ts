export type TaxAssumption = "month_start" | "registration_plus_12_months" | "tradebook";

export type AcquisitionRecord = {
  acquisitionDate: string | null;
  acquiredOn: string;
  registeredOn: string;
  taxDateAssumption: TaxAssumption;
  estimated: boolean;
};

const MONTH = /^(\d{4})-(\d{2})$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** A known month is stored as the first day and marked estimated. A blank month does not invent a purchase date. */
export function acquisitionRecord(month: string | null | undefined, registeredOn: string): AcquisitionRecord {
  if (!DAY.test(registeredOn)) throw new Error("Registration date must be YYYY-MM-DD.");
  const selected = month?.trim() ?? "";
  const match = selected.match(MONTH);
  if (match) {
    const date = `${match[1]}-${match[2]}-01`;
    return {
      acquisitionDate: date,
      acquiredOn: date,
      registeredOn,
      taxDateAssumption: "month_start",
      estimated: true,
    };
  }
  return {
    acquisitionDate: null,
    acquiredOn: registeredOn,
    registeredOn,
    taxDateAssumption: "registration_plus_12_months",
    estimated: false,
  };
}

export function assumedLongTermDate(registeredOn: string): string {
  const [year, month, date] = registeredOn.split("-").map(Number);
  return new Date(Date.UTC(year + 1, month - 1, date)).toISOString().slice(0, 10);
}
