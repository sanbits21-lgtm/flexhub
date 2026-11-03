// Plain local-time helpers (no date library; the whole app reasons in the device's time).

const pad = (n: number) => String(n).padStart(2, '0');

export const dateInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** 'YYYY-MM-DD' + 'HH:MM' (24h) -> Date, or null if either part is not a real date/time. */
export function parseLocal(dateStr: string, timeStr: string): Date | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr.trim());
  const t = /^(\d{1,2}):(\d{2})$/.exec(timeStr.trim());
  if (!d || !t) return null;
  const [y, mo, day, h, mi] = [Number(d[1]), Number(d[2]), Number(d[3]), Number(t[1]), Number(t[2])];
  const out = new Date(y, mo - 1, day, h, mi, 0, 0);
  // new Date() silently rolls 31 Feb to March; reject anything that did not round-trip.
  if (out.getFullYear() !== y || out.getMonth() !== mo - 1 || out.getDate() !== day || h > 23 || mi > 59) return null;
  return out;
}

export const addMinutes = (d: Date, minutes: number) => new Date(d.getTime() + minutes * 60000);

export const fmtTime = (iso: string | Date) =>
  new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

export const fmtRange = (start: string, end: string) => `${fmtTime(start)} - ${fmtTime(end)}`;

export const dayKey = (iso: string | Date) => dateInput(new Date(iso));

export function dayLabel(key: string): string {
  const d = parseLocal(key, '00:00');
  if (!d) return key;
  const today = new Date();
  const diff = Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
}
