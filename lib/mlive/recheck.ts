/** Use an open re-check instead of inserting a second row. */
export function recheckRequestPlan(openId: number | null, nextId: number): { id: number; inserted: boolean } {
  if (openId != null) return { id: openId, inserted: false };
  return { id: nextId, inserted: true };
}

/** Poll result. `rechecked` is the approvals run's count of revived ideas. */
export function recheckPoll(doneAt: string | null, rechecked: number | null): {
  done: boolean;
  doneAt: string | null;
  rechecked: number;
} {
  if (!doneAt) return { done: false, doneAt: null, rechecked: 0 };
  return { done: true, doneAt, rechecked: rechecked ?? 0 };
}
