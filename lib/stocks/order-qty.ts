/** Floor budget ÷ LTP to whole shares, respecting lot size (default 1 for NSE CNC). */
export function calculateOrderQty(
  budgetInr: number,
  ltp: number,
  lotSize = 1
): { qty: number; estimatedInr: number } | null {
  if (ltp <= 0 || budgetInr < ltp) return null;
  const raw = Math.floor(budgetInr / ltp);
  const qty = Math.floor(raw / lotSize) * lotSize;
  if (qty < 1) return null;
  return { qty, estimatedInr: qty * ltp };
}
