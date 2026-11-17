/** A run may start only while 60 minutes remain: 16:00–16:55 and 20:00–07:00 IST. */
export function researchWindowOpen(minutes: number): boolean {
  if (minutes >= 16 * 60 && minutes <= 16 * 60 + 55) return true;
  if (minutes >= 20 * 60 || minutes <= 7 * 60) return true;
  return false;
}

/** A run already going must stop at 17:55 and at 08:00 IST. */
export function researchWindowEnded(minutes: number): boolean {
  const afternoon = minutes >= 16 * 60 && minutes < 17 * 60 + 55;
  const night = minutes >= 20 * 60 || minutes < 8 * 60;
  return !afternoon && !night;
}
