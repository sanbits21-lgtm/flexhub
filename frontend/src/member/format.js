// Indian digit grouping (12,34,567) whatever the device's locale.
export function rupees(n) {
  const v = Math.round(Number(n) || 0);
  const s = String(Math.abs(v));
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  const grouped = rest ? `${rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',')},${last3}` : last3;
  return `${v < 0 ? '-' : ''}₹${grouped}`;
}

export const fmtDate = (d) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '-');

const DAY = 86400000;
export const daysUntil = (d) => (d ? Math.ceil((new Date(d).getTime() - Date.now()) / DAY) : null);

export const cap = (s) => (String(s).toLowerCase() === 'upi' ? 'UPI' : String(s).replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase()));

const pad = (n) => String(n).padStart(2, '0');
export const dayKey = (iso) => { const d = new Date(iso); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
export const fmtTime = (iso) => new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
export const fmtRange = (start, end) => `${fmtTime(start)} - ${fmtTime(end)}`;

export function dayLabel(key) {
  const [y, m, d] = key.split('-').map(Number);
  const day = new Date(y, m - 1, d);
  const t = new Date();
  const diff = Math.round((day.getTime() - new Date(t.getFullYear(), t.getMonth(), t.getDate()).getTime()) / DAY);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return day.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'short' });
}

/** Local calendar day of a yyyy-mm-dd string, for a date input's value. */
export const inputDate = (iso) => (iso ? String(iso).slice(0, 10) : '');
