import { useEffect, useRef, useState } from 'react';

const storageKey = (tableId) => `flexhub:columns:${tableId}`;

// localStorage can be missing or throw (private windows, blocked site data). Column
// choice is a convenience, so a failure just means the defaults show.
// null = the user has not chosen yet, so the columns' own defaults apply.
const readHidden = (tableId) => {
  try {
    const raw = localStorage.getItem(storageKey(tableId));
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};
const writeHidden = (tableId, hidden) => {
  try {
    if (hidden === null) localStorage.removeItem(storageKey(tableId));
    else localStorage.setItem(storageKey(tableId), JSON.stringify(hidden));
  } catch { /* see above */ }
};

// Action columns (no label, or the conventional key `actions`) are never hideable —
// hiding Edit/Renew would strand the row.
const isConfigurable = (col) => !!col.label && !col.required && col.key !== 'actions';

// Returns the columns to render plus the state the picker needs. Keyed by column `key`,
// so a stored choice survives columns being added or reordered; stale keys are ignored.
export function useColumnPrefs(tableId, columns) {
  const [stored, setStored] = useState(() => (tableId ? readHidden(tableId) : null));

  const configurable = columns.filter(isConfigurable);
  const hidden = stored ?? configurable.filter((c) => c.defaultHidden).map((c) => c.key);
  const hiddenNow = new Set(hidden.filter((k) => configurable.some((c) => c.key === k)));
  // Never let the table end up with nothing to show.
  const visible = columns.filter((c) => !isConfigurable(c) || !hiddenNow.has(c.key));
  const shownConfigurable = configurable.filter((c) => !hiddenNow.has(c.key)).length;

  const update = (next) => { setStored(next); if (tableId) writeHidden(tableId, next); };
  const toggle = (key) => {
    if (hiddenNow.has(key)) update([...hiddenNow].filter((k) => k !== key));
    else if (shownConfigurable > 1) update([...hiddenNow, key]);
  };
  const reset = () => update(null);

  return { visible, configurable, hiddenNow, toggle, reset, lastOne: shownConfigurable <= 1 };
}

export default function ColumnPicker({ prefs }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  if (prefs.configurable.length < 2) return null;

  return (
    <div ref={box} className="relative no-print">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label="Choose columns"
        aria-expanded={open}
        title="Choose columns"
        className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 px-1.5 py-1 rounded border border-gray-200 dark:border-gray-600"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 4v16M15 4v16M4 8h16M4 16h16" />
        </svg>
        Columns
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-30 w-48 max-h-64 overflow-auto rounded-md border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 dark:border dark:border-gray-700 shadow-lg p-2 text-sm">
          {prefs.configurable.map((c) => {
            const checked = !prefs.hiddenNow.has(c.key);
            return (
              <label key={c.key} className="flex items-center gap-2 px-1 py-1 text-gray-700 dark:text-gray-200">
                <input type="checkbox" checked={checked} disabled={checked && prefs.lastOne} onChange={() => prefs.toggle(c.key)} />
                {c.label}
              </label>
            );
          })}
          <button type="button" onClick={prefs.reset} className="mt-1 w-full text-left px-1 py-1 text-xs text-blue-600 dark:text-blue-400 hover:underline">
            Reset to default
          </button>
        </div>
      )}
    </div>
  );
}
