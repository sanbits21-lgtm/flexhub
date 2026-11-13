import { createContext, useContext, useState } from 'react';

// The header's right-hand slot. A DataTable inside the widget portals its column picker
// here, so tables don't each have to thread an `action` prop up to their Widget.
export const WidgetSlotContext = createContext(null);

// Provided by DashboardFrame's grid cell: lets the widget draw a drag grip that arms the
// cell for dragging. Null outside a draggable dashboard, in which case there is no grip.
export const TileContext = createContext(null);

// A dashboard tile. On lg+ the grid hands it a fixed share of the viewport and the BODY
// scrolls, so a long list never pushes the page taller. Below lg the page stacks and
// scrolls normally, so each tile gets a fixed height instead (a table with 20 rows would
// otherwise swallow the phone screen).
export default function Widget({ title, icon: Icon = null, action = null, className = '', bodyClassName = '', children }) {
  const [slot, setSlot] = useState(null);
  const tile = useContext(TileContext);
  return (
    <section className={`group flex h-80 min-h-0 flex-col rounded-3xl border border-gray-200/80 bg-white shadow-sm dark:border-white/5 dark:bg-gray-800/80 ${className}`}>
      <header className="flex shrink-0 items-center justify-between gap-2 px-4 pb-2 pt-4">
        <h3 className="flex min-w-0 items-center gap-2 truncate text-base font-semibold text-gray-900 dark:text-gray-100">{Icon && <Icon className="h-5 w-5 shrink-0 text-green-700 dark:text-accent" aria-hidden="true" />}<span className="truncate">{title}</span></h3>
        <div className="flex items-center gap-2">
          {action}
          <div ref={setSlot} />
          {tile?.remove && (
            <button
              type="button"
              onClick={tile.remove}
              aria-label={`Remove ${typeof title === 'string' ? title : 'widget'} from the dashboard`}
              title="Remove from dashboard (add it back from Widgets)"
              className="text-gray-400 opacity-0 transition hover:text-gray-700 focus:opacity-100 group-hover:opacity-100 dark:hover:text-gray-200 [@media(hover:none)]:opacity-60"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
          {tile && (
            <button
              type="button"
              aria-label={`Drag to move ${typeof title === 'string' ? title : 'tile'}`}
              title="Drag to move"
              onMouseDown={tile.arm}
              onMouseUp={tile.disarm}
              className="hidden cursor-grab text-gray-400 opacity-0 transition hover:text-gray-700 focus:opacity-100 group-hover:opacity-100 active:cursor-grabbing dark:hover:text-gray-200 lg:block"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                <circle cx="7" cy="5" r="1.5" /><circle cx="13" cy="5" r="1.5" />
                <circle cx="7" cy="10" r="1.5" /><circle cx="13" cy="10" r="1.5" />
                <circle cx="7" cy="15" r="1.5" /><circle cx="13" cy="15" r="1.5" />
              </svg>
            </button>
          )}
        </div>
      </header>
      <div className={`flex-1 min-h-0 overflow-auto ${bodyClassName}`}>
        <WidgetSlotContext.Provider value={slot}>{children}</WidgetSlotContext.Provider>
      </div>
    </section>
  );
}
