/** Application counts and analytics share one fixed day boundary: 00:00 UTC. */
const DAY_MS = 24 * 60 * 60 * 1000;

export function utcDayKey(date = new Date()): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

export function utcDayStart(date = new Date()): number {
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

export function utcDayOffset(date: Date, offset: number): Date {
  return new Date(utcDayStart(date) + offset * DAY_MS);
}

/** Refresh an open view at midnight, and catch up after sleep or a clock change.
 * No stored count is cleared: choosing the next UTC day preserves history. */
export function watchUtcDay(onChange: () => void, doc = document): () => void {
  let day = utcDayKey(),
    disposed = false,
    timer: ReturnType<typeof setTimeout>;
  const view = doc.defaultView;
  function check() {
    if (disposed) return;
    const now = new Date(),
      current = utcDayKey(now);
    clearTimeout(timer);
    timer = setTimeout(check, Math.max(1, utcDayStart(now) + DAY_MS - now.getTime()));
    if (current !== day) {
      day = current;
      onChange();
    }
  }
  doc.addEventListener('visibilitychange', check);
  view?.addEventListener('focus', check);
  check();
  return () => {
    disposed = true;
    clearTimeout(timer);
    doc.removeEventListener('visibilitychange', check);
    view?.removeEventListener('focus', check);
  };
}
