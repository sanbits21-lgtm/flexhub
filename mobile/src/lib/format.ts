// Indian digit grouping (12,34,567) without depending on Intl support on the device.
export function rupees(n: number | null | undefined): string {
  const v = Math.round(Number(n) || 0);
  const neg = v < 0 ? '-' : '';
  const s = String(Math.abs(v));
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}` : last3;
  return `${neg}₹${grouped}`;
}

export const fmtDate = (d?: string | Date | null) =>
  (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '-');

export const fmtDateTime = (d?: string | Date | null) =>
  (d ? new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '-');

const DAY = 86400000;
export const daysUntil = (d?: string | Date | null) => (d ? Math.ceil((new Date(d).getTime() - Date.now()) / DAY) : null);

/** "in 3 days", "today", "5 days ago" for a membership end date. */
export function expiryText(d?: string | Date | null): string {
  const n = daysUntil(d);
  if (n === null) return 'No plan';
  if (n === 0) return 'today';
  if (n > 0) return `in ${n} day${n === 1 ? '' : 's'}`;
  return `${-n} day${n === -1 ? '' : 's'} ago`;
}

export const cap = (s: string) => (s.toLowerCase() === 'upi' ? 'UPI' : s.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()));
