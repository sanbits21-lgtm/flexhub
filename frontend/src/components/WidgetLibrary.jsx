import { useEffect, useRef } from 'react';

const primaryBtn = 'bg-gray-900 text-white rounded-lg px-3 py-1 text-sm dark:bg-accent dark:text-accent-ink dark:font-semibold dark:hover:bg-accent-hover';

function Group({ heading, items, onAdd }) {
  if (!items.length) return null;
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">{heading}</h3>
      <ul className="space-y-2">
        {items.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-3 rounded-xl border border-gray-200 dark:border-gray-700 px-3 py-2">
            <span className="text-sm text-gray-900 dark:text-gray-100 min-w-0 truncate">{item.title}</span>
            <button type="button" onClick={() => onAdd(item.id)} aria-label={`Add ${item.title} to the dashboard`} className={primaryBtn}>Add</button>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Slide-in panel listing the widgets the user removed from this dashboard, each with an Add
 * button. `removed` is [{ id, title, kind: 'tile' | 'kpi' }].
 */
export default function WidgetLibrary({ open, onClose, removed, onAdd, onAddAll, onReset }) {
  const closeRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    closeRef.current?.focus();
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;
  const tiles = removed.filter((r) => r.kind === 'tile');
  const kpis = removed.filter((r) => r.kind === 'kpi');

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Widget library"
        className="absolute inset-y-0 right-0 w-full max-w-sm bg-white dark:bg-gray-800 dark:border-l dark:border-gray-700 shadow-xl flex flex-col"
      >
        <header className="flex items-center justify-between px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <h2 className="font-semibold text-gray-900 dark:text-gray-100">Widgets</h2>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close" className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </header>
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {removed.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">Everything is on your dashboard. Use the × on a widget to remove it; it will wait here until you add it back.</p>
          ) : (
            <>
              <p className="text-sm text-gray-500 dark:text-gray-400">Widgets you removed. Add one to put it back on your dashboard.</p>
              <Group heading="Widgets" items={tiles} onAdd={onAdd} />
              <Group heading="Key numbers" items={kpis} onAdd={onAdd} />
            </>
          )}
        </div>
        {removed.length > 0 && (
          <footer className="flex items-center justify-between gap-2 px-4 py-3 border-t border-gray-200 dark:border-gray-700">
            <button type="button" onClick={onAddAll} className={primaryBtn}>Add all</button>
            <button type="button" onClick={onReset} className="text-xs text-blue-600 dark:text-blue-400 hover:underline">Reset layout</button>
          </footer>
        )}
        <p className="px-4 pb-3 text-xs text-gray-400 dark:text-gray-500">Saved on this device for this dashboard.</p>
      </aside>
    </div>
  );
}
