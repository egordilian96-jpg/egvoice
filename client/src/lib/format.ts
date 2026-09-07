export function formatTime(iso: string | Date): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (sameDay) return `сегодня, ${time}`;
  const yest = new Date(now.getTime() - 86400_000);
  if (d.toDateString() === yest.toDateString()) return `вчера, ${time}`;
  return `${d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'short' })}, ${time}`;
}

export function isOnline(lastSeenAt: string | Date | null | undefined): boolean {
  if (!lastSeenAt) return false;
  const d = typeof lastSeenAt === 'string' ? new Date(lastSeenAt) : lastSeenAt;
  return Date.now() - d.getTime() < 5 * 60_000;
}

export function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? '?').toUpperCase() + (parts[1]?.[0] ?? '').toUpperCase();
}
