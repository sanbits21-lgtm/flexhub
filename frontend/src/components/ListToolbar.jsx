import { useState } from 'react';

export const fieldClass = 'w-full border rounded-xl px-3 py-2 dark:bg-gray-900 dark:border-gray-700 dark:text-gray-100';
export const primaryBtn = 'bg-gray-900 text-white rounded-xl px-4 py-2 dark:bg-accent dark:text-accent-ink dark:font-semibold dark:hover:bg-accent-hover disabled:opacity-50';
export const toolBtn = 'border rounded-xl px-3 py-2 text-sm dark:border-gray-700 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800';

/**
 * The header every list screen shares: title with a live count, the add button, a search box and,
 * when the screen has any, a Filters button with removable chips. It keeps the table close to the
 * top of a phone screen, which an always-open form or filter card does not.
 *
 * `chips` is [{ key, text, clear }]. `filters` is the panel content; omit it for no Filters button.
 * `children` sit beside the add button (secondary actions).
 */
export default function ListToolbar({ title, count, addLabel, onAdd, search, onSearch, searchPlaceholder = 'Search', filters, chips = [], onClearAll, children }) {
  const [open, setOpen] = useState(false);
  const hasChips = chips.length > 0;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl sm:text-2xl font-semibold text-gray-900 dark:text-gray-100 min-w-0 truncate">
          {title}{count !== null && count !== undefined && <span className="text-gray-500 dark:text-gray-400 font-normal"> ({count})</span>}
        </h1>
        <div className="flex items-center gap-2 shrink-0">
          {children}
          {onAdd && <button type="button" onClick={onAdd} className={`${primaryBtn} text-sm sm:text-base`}>+ {addLabel}</button>}
        </div>
      </div>

      {(onSearch || filters) && (
        <div className="flex gap-2">
          {onSearch && (
            <input type="search" aria-label={searchPlaceholder} placeholder={searchPlaceholder} value={search} onChange={(e) => onSearch(e.target.value)} className={`${fieldClass} flex-1 min-w-0`} />
          )}
          {filters && (
            <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={`${toolBtn} flex items-center gap-2 shrink-0 ${open ? 'border-accent' : ''}`}>
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M3 5h18M6 12h12M10 19h4" /></svg>
              Filters
              {hasChips && <span className="rounded-full bg-accent text-accent-ink text-xs font-semibold px-1.5 min-w-5 text-center">{chips.length}</span>}
            </button>
          )}
        </div>
      )}

      {open && filters && (
        <div className="bg-white dark:bg-gray-800 dark:border dark:border-gray-700 p-4 rounded-2xl shadow">{filters}</div>
      )}

      {(hasChips || search) && (
        <div className="flex flex-wrap items-center gap-2">
          {chips.map((c) => (
            <button key={c.key} type="button" onClick={c.clear} aria-label={`Remove filter: ${c.text}`} className="flex items-center gap-1.5 rounded-full border border-gray-300 dark:border-gray-600 px-3 py-1 text-xs text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800">
              {c.text}<span aria-hidden="true" className="text-gray-400">×</span>
            </button>
          ))}
          <button type="button" onClick={onClearAll} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">Clear all</button>
        </div>
      )}
    </div>
  );
}

/** Case-insensitive match of `query` against any of the given text fields. */
export const matches = (query, ...fields) => {
  const q = query.trim().toLowerCase();
  return !q || fields.some((f) => String(f ?? '').toLowerCase().includes(q));
};
