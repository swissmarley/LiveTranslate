/** "Today 14:05", "Yesterday 09:12", "12 Sep 18:30". */
export function formatWhen(timestamp: number, now: number = Date.now()): string {
  const date = new Date(timestamp);
  const time = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const dayMs = 24 * 60 * 60 * 1000;
  if (timestamp >= startOfToday.getTime()) return `Today ${time}`;
  if (timestamp >= startOfToday.getTime() - dayMs) return `Yesterday ${time}`;
  const day = date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
  return `${day} ${time}`;
}
