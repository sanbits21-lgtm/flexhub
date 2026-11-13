import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import Sparkline from './Sparkline';

// The accent colours a card can be tinted with. Lime is the brand; the others keep neighbouring cards apart.
export const TONES = {
  lime: { text: 'text-green-700 dark:text-accent', tint: 'bg-green-600/10 dark:bg-accent/15', line: '#C8F83A' },
  blue: { text: 'text-blue-600 dark:text-[#7AA2FF]', tint: 'bg-blue-500/10 dark:bg-[#7AA2FF]/15', line: '#7AA2FF' },
  violet: { text: 'text-violet-600 dark:text-[#A596FF]', tint: 'bg-violet-500/10 dark:bg-[#A596FF]/15', line: '#A596FF' },
  amber: { text: 'text-amber-600 dark:text-amber-400', tint: 'bg-amber-500/10 dark:bg-amber-400/15', line: '#FFB547' },
  red: { text: 'text-red-600 dark:text-red-400', tint: 'bg-red-500/10 dark:bg-red-400/15', line: '#FF6B7A' },
};

/** Percent change from the second-last to the last number of a series, or null when there is nothing to compare. */
export const trendOf = (series = []) => {
  const nums = series.filter((n) => Number.isFinite(n));
  if (nums.length < 2) return null;
  const [prev, last] = [nums[nums.length - 2], nums[nums.length - 1]];
  if (!prev) return last ? 100 : null;
  return Math.round(((last - prev) / prev) * 100);
};

// A key number. With an `icon` it is the full card (tinted icon, change since last period, a sparkline of the
// recent months); without one it stays the plain label-and-number it always was.
export default function StatCard({ label, value, compact = false, icon: Icon, tone = 'lime', trend, series, hint }) {
  const t = TONES[tone] || TONES.lime;
  const change = trend === undefined ? trendOf(series) : trend;
  const full = !!Icon;
  return (
    <div className={`relative overflow-hidden rounded-3xl border border-gray-200/80 bg-white shadow-sm dark:border-white/5 dark:bg-gray-800/80 ${full ? 'p-4' : compact ? 'px-4 py-3' : 'p-4'}`}>
      {full && (
        <div className="flex items-start justify-between">
          <span className={`flex h-10 w-10 items-center justify-center rounded-xl ${t.tint} ${t.text}`}><Icon className="h-5 w-5" aria-hidden="true" /></span>
          {change !== null && change !== undefined && (
            <span className={`flex items-center gap-0.5 text-sm font-semibold ${change >= 0 ? 'text-green-600 dark:text-accent' : 'text-red-500 dark:text-red-400'}`}>
              {change >= 0 ? <ArrowUpRight className="h-4 w-4" aria-hidden="true" /> : <ArrowDownRight className="h-4 w-4" aria-hidden="true" />}
              {Math.abs(change)}%
            </span>
          )}
        </div>
      )}
      <div className={`flex flex-wrap items-end justify-between gap-x-3 gap-y-1 ${full ? 'mt-3' : ''}`}>
        <div className="min-w-0">
          <div className={`font-extrabold tracking-tight text-gray-900 dark:text-white ${full ? 'text-2xl' : compact ? 'text-xl' : 'text-2xl'}`}>{value}</div>
          <div className="text-xs leading-tight text-gray-500 dark:text-gray-400 sm:text-sm">{label}</div>
          {hint && <div className="truncate text-xs text-gray-400 dark:text-gray-500">{hint}</div>}
        </div>
        {full && series && series.length > 1 && <Sparkline data={series} color={t.line} className="h-12 w-20 shrink-0 xl:w-24" />}
      </div>
    </div>
  );
}
