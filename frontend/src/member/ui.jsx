import { Link } from 'react-router-dom';

// Small building blocks for the member app, in the same dark, rounded look as the rest of the site.
const TONE = {
  neutral: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
  accent: 'bg-accent/15 text-gray-900 dark:text-accent',
  success: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-400',
  warn: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400',
  danger: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-400',
  info: 'bg-blue-100 text-blue-800 dark:bg-blue-500/15 dark:text-blue-300',
};
const TEXT_TONE = { success: 'text-green-700 dark:text-green-400', danger: 'text-red-600 dark:text-red-400', accent: 'text-gray-900 dark:text-accent', warn: 'text-amber-700 dark:text-amber-400' };

export const inputCls = 'w-full border rounded-xl px-3 py-2.5 text-base dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100';

export function Screen({ title, subtitle, right = null, children }) {
  return (
    <div className="px-4 pt-6 pb-6 space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-3xl font-extrabold tracking-tight text-gray-900 dark:text-gray-100 truncate">{title}</h1>
          {subtitle && <p className="text-sm text-gray-500 dark:text-gray-400">{subtitle}</p>}
        </div>
        {right}
      </header>
      {children}
    </div>
  );
}

export function Card({ children, className = '', ...rest }) {
  return <div className={`bg-white dark:bg-gray-800 dark:border dark:border-gray-700 rounded-2xl shadow-sm p-4 ${className}`} {...rest}>{children}</div>;
}

export const Section = ({ title }) => <h2 className="pt-2 text-xs font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{title}</h2>;
export const Muted = ({ children, className = '', ...rest }) => <p className={`text-sm text-gray-500 dark:text-gray-400 ${className}`} {...rest}>{children}</p>;
export const Pill = ({ tone = 'neutral', children }) => <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE[tone]}`}>{children}</span>;

export function Banner({ tone = 'info', children }) {
  return <div role="status" className={`rounded-xl px-3 py-2 text-sm ${TONE[tone]}`}>{children}</div>;
}

export function ErrorText({ children }) {
  return children ? <p role="alert" className="text-sm text-red-600 dark:text-red-400">{children}</p> : null;
}

/** A load failure with a way to retry, and a note when a saved copy is on screen instead. */
export function LoadState({ error, stale, onRetry }) {
  return (
    <>
      {stale && <Banner tone="warn">You are offline. Showing what was saved on this phone.</Banner>}
      {error && (
        <div role="alert" className="rounded-xl bg-red-100 dark:bg-red-500/15 text-red-800 dark:text-red-400 px-3 py-2 text-sm flex items-center justify-between gap-3">
          <span>{error}</span>
          <button type="button" onClick={onRetry} className="font-semibold underline shrink-0">Try again</button>
        </div>
      )}
    </>
  );
}

export function Btn({ kind = 'primary', busy = false, small = false, className = '', children, ...rest }) {
  const kinds = {
    primary: 'bg-gray-900 text-white dark:bg-accent dark:text-accent-ink dark:font-semibold',
    secondary: 'border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-gray-100',
    ghost: 'text-blue-600 dark:text-blue-400',
    danger: 'border border-red-300 dark:border-red-500/50 text-red-600 dark:text-red-400',
  };
  return (
    <button type="button" disabled={busy || rest.disabled} className={`rounded-xl font-semibold disabled:opacity-50 ${small ? 'px-3 py-1.5 text-sm' : 'px-4 py-2.5 text-base'} ${kinds[kind]} ${className}`} {...rest}>
      {busy ? 'Please wait...' : children}
    </button>
  );
}

export function Field({ label, hint, ...rest }) {
  return (
    <label className="block">
      <span className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</span>
      {rest.multiline ? <textarea rows={3} {...{ ...rest, multiline: undefined }} className={inputCls} /> : <input {...rest} className={inputCls} />}
      {hint && <span className="block text-xs text-gray-400 dark:text-gray-500 mt-1">{hint}</span>}
    </label>
  );
}

/** One-of-a-few choice as tappable chips. Tapping the chosen one again leaves it unset. */
export function Choice({ label, value, options, onChange }) {
  return (
    <div>
      <span className="block text-xs text-gray-500 dark:text-gray-400 mb-1">{label}</span>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-2">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            onClick={() => onChange(value === o.value ? null : o.value)}
            className={`rounded-full border px-3 py-1.5 text-sm ${value === o.value ? 'border-accent bg-accent/15 font-semibold text-gray-900 dark:text-accent' : 'border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-300'}`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

export function Stat({ label, value, tone, hint }) {
  return (
    <div className="bg-white dark:bg-gray-800 dark:border dark:border-gray-700 rounded-2xl shadow-sm px-4 py-3 min-w-0">
      <div className="text-xs text-gray-500 dark:text-gray-400 truncate">{label}</div>
      <div className={`text-2xl font-extrabold tracking-tight truncate ${TEXT_TONE[tone] || 'text-gray-900 dark:text-gray-100'}`}>{value}</div>
      {hint && <div className="text-xs text-gray-400 dark:text-gray-500 truncate">{hint}</div>}
    </div>
  );
}

export function Hero({ label, value, caption }) {
  return (
    <div className="rounded-3xl p-5 bg-accent text-accent-ink">
      <div className="text-xs font-bold uppercase tracking-wider opacity-70">{label}</div>
      <div className="text-5xl font-extrabold tracking-tight mt-1">{value}</div>
      {caption && <div className="text-sm font-medium opacity-80 mt-1">{caption}</div>}
    </div>
  );
}

export function Row({ title, subtitle, right = null, to, onClick, last = false, icon = null }) {
  const body = (
    <>
      {icon && <span className="w-9 h-9 rounded-xl bg-accent/15 text-gray-900 dark:text-accent flex items-center justify-center shrink-0">{icon}</span>}
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-base font-semibold text-gray-900 dark:text-gray-100 truncate">{title}</span>
        {subtitle && <span className="block text-sm text-gray-500 dark:text-gray-400">{subtitle}</span>}
      </span>
      {right}
      {(to || onClick) && !right && <svg className="w-4 h-4 text-gray-400 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 5l7 7-7 7" /></svg>}
    </>
  );
  const cls = `flex items-center gap-3 py-3 w-full ${last ? '' : 'border-b border-gray-100 dark:border-gray-700'}`;
  if (to) return <Link to={to} className={cls}>{body}</Link>;
  if (onClick) return <button type="button" onClick={onClick} className={cls}>{body}</button>;
  return <div className={cls}>{body}</div>;
}

export function EmptyState({ title, text }) {
  return (
    <div className="text-center py-6">
      <p className="font-semibold text-gray-900 dark:text-gray-100">{title}</p>
      {text && <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{text}</p>}
    </div>
  );
}

export function Loading({ label = 'Loading...' }) {
  return <div className="px-4 py-16 text-center text-sm text-gray-500 dark:text-gray-400" role="status">{label}</div>;
}

export function Initials({ name = '', size = 48 }) {
  const letters = name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';
  return (
    <span aria-hidden="true" className="inline-flex items-center justify-center rounded-full bg-accent text-accent-ink font-bold shrink-0" style={{ width: size, height: size, fontSize: size * 0.38 }}>{letters}</span>
  );
}

export const Icon = ({ d, className = 'w-5 h-5' }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d={d} /></svg>
);

// 24x24 stroke icons, the same set for the tab bar and the home quick actions.
export const ICONS = {
  home: 'M3 11l9-8 9 8v10a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1V11z',
  calendar: 'M7 3v3M17 3v3M4 8h16M5 5h14a1 1 0 011 1v14a1 1 0 01-1 1H5a1 1 0 01-1-1V6a1 1 0 011-1z',
  barbell: 'M6.5 6.5v11M17.5 6.5v11M3 9v6M21 9v6M6.5 12h11',
  nutrition: 'M12 7c-2-2-6-1-6 4 0 4 2 9 4 9 1 0 1-.5 2-.5s1 .5 2 .5c2 0 4-5 4-9 0-5-4-6-6-4zM12 7c0-2 1-3 3-4',
  gym: 'M4 21V7l8-4 8 4v14M9 21v-6h6v6',
  person: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2v6h-4M14 18h2v2h-2z',
  receipt: 'M6 3h12v18l-3-2-3 2-3-2-3 2V3zM9 8h6M9 12h6',
  chart: 'M4 4v16h16M8 16v-5M12 16V8M16 16v-8',
};
