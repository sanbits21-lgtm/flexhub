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
export default function Widget({ title, action = null, className = '', bodyClassName = '', children }) {
  const [slot, setSlot] = useState(null);
  const tile = useContext(TileContext);
  return (
    <section className={`bg-white dark:bg-gray-800 dark:border dark:border-gray-700 rounded-2xl shadow flex flex-col min-h-0 h-72 lg:h-auto lg:flex-1 ${className}`}>
      <header className="flex items-center justify-between gap-2 px-4 pt-3 pb-2 shrink-0">
        <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{title}</h3>
        <div className="flex items-center gap-2">
          {action}
          <div ref={setSlot} />
          {tile && (
            <button
              type="button"
              aria-label={`Drag to move ${typeof title === 'string' ? title : 'tile'}`}
              title="Drag to move"
              onMouseDown={tile.arm}
              onMouseUp={tile.disarm}
              className="hidden lg:block cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
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
