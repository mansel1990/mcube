const listeners = new Set<() => void>();

export function subscribeAlertCount(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notifyAlertsChanged(): void {
  listeners.forEach((listener) => listener());
}
