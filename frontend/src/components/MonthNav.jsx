import { ChevronLeft, ChevronRight } from 'lucide-react';

/** "‹ November 2026 ›". `value` is the first day of the month; the next arrow stops at the current month. */
export default function MonthNav({ value, onChange }) {
  const now = new Date();
  const atNow = value.getFullYear() === now.getFullYear() && value.getMonth() === now.getMonth();
  const step = (n) => onChange(new Date(value.getFullYear(), value.getMonth() + n, 1));
  return (
    <div className="inline-flex items-center gap-1 rounded-xl border border-gray-200 px-1 py-1 dark:border-gray-700">
      <button type="button" onClick={() => step(-1)} aria-label="Previous month" className="rounded-lg p-1.5 text-gray-600 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10"><ChevronLeft className="h-4 w-4" /></button>
      <span className="min-w-[8.5rem] text-center text-sm font-semibold text-gray-900 dark:text-gray-100">{value.toLocaleString('en-IN', { month: 'long', year: 'numeric' })}</span>
      <button type="button" onClick={() => step(1)} disabled={atNow} aria-label="Next month" className="rounded-lg p-1.5 text-gray-600 hover:bg-gray-100 disabled:opacity-30 dark:text-gray-300 dark:hover:bg-white/10"><ChevronRight className="h-4 w-4" /></button>
    </div>
  );
}

export const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
export const dayString = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const startOfMonth = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1);
export const endOfMonth = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0);
