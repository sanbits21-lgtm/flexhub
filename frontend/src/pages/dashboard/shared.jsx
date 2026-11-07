import { useMemo, useState } from 'react';
import Widget, { TileContext } from '../../components/Widget';
import DataTable from '../../components/DataTable';
import RenewMembershipModal from '../../components/RenewMembershipModal';
import WidgetLibrary from '../../components/WidgetLibrary';

const DAY = 24 * 60 * 60 * 1000;
const daysUntil = (dateStr) => Math.ceil((new Date(dateStr) - new Date()) / DAY);
const expiresInLabel = (dateStr) => {
  const d = daysUntil(dateStr);
  return d <= 0 ? 'today' : `${d} day${d === 1 ? '' : 's'}`;
};
const expiredAgoLabel = (dateStr) => {
  const d = Math.abs(daysUntil(dateStr));
  return `${d} day${d === 1 ? '' : 's'} ago`;
};

export const formatDateTime = (d) => (d ? new Date(d).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '—');
export const formatDate = (d) => (d ? new Date(d).toLocaleDateString() : '—');

// Optional widgets (equipment, attendance) can be switched off per tenant, which makes
// their endpoints 403. A dashboard tile going empty is better than the whole dashboard
// failing to load.
export const orEmpty = (promise, fallback) => promise.catch(() => ({ data: fallback }));


const layoutKey = (layoutId) => `flexhub:layout:${layoutId}`;
const readOrder = (layoutId, defaults) => {
  try {
    const saved = JSON.parse(localStorage.getItem(layoutKey(layoutId)));
    // Only trust a saved order that is exactly a permutation of today's tiles; a tile
    // added or removed since it was saved means the safe thing is the default layout.
    if (Array.isArray(saved) && saved.length === defaults.length && defaults.every((id) => saved.includes(id))) return saved;
  } catch { /* storage unavailable or corrupt: fall through */ }
  return defaults;
};
const writeOrder = (layoutId, order, defaults) => {
  try {
    if (order.every((id, i) => id === defaults[i])) localStorage.removeItem(layoutKey(layoutId));
    else localStorage.setItem(layoutKey(layoutId), JSON.stringify(order));
  } catch { /* convenience only */ }
};

// The widgets a user removed from this dashboard, by id. Ids that no longer exist are simply
// ignored when used, so a changed dashboard never breaks on an old saved list.
const hiddenKey = (layoutId) => `flexhub:hidden:${layoutId}`;
const readHidden = (layoutId) => {
  try {
    const saved = JSON.parse(localStorage.getItem(hiddenKey(layoutId)));
    return Array.isArray(saved) ? saved.filter((id) => typeof id === 'string') : [];
  } catch { return []; }
};
const writeHidden = (layoutId, ids) => {
  try {
    if (ids.length) localStorage.setItem(hiddenKey(layoutId), JSON.stringify(ids));
    else localStorage.removeItem(hiddenKey(layoutId));
  } catch { /* convenience only */ }
};

// Written out in full so Tailwind sees every class it might need.
const COL_SPAN = { 1: 'lg:col-span-1', 2: 'lg:col-span-2', 3: 'lg:col-span-3', 4: 'lg:col-span-4', 5: 'lg:col-span-5', 6: 'lg:col-span-6', 7: 'lg:col-span-7', 8: 'lg:col-span-8', 9: 'lg:col-span-9', 10: 'lg:col-span-10', 11: 'lg:col-span-11', 12: 'lg:col-span-12' };
const colsOf = (span) => Number(/col-span-(\d+)/.exec(span || '')?.[1]) || 4;

// With widgets removed the fixed slots would leave holes, so the rest are packed into rows of
// 12 columns (each tile's own width as a starting point) and every row is stretched to fill it.
const packRows = (tiles) => {
  const rows = [];
  let row = [];
  let used = 0;
  tiles.forEach((t) => {
    const cols = colsOf(t.span);
    if (used + cols > 12 && row.length) { rows.push(row); row = []; used = 0; }
    row.push({ id: t.id, cols });
    used += cols;
  });
  if (row.length) rows.push(row);
  return rows.map((r) => {
    const sum = r.reduce((n, t) => n + t.cols, 0);
    let left = 12;
    return r.map((t, i) => {
      const cols = i === r.length - 1 ? Math.max(1, left) : Math.max(1, Math.round((t.cols * 12) / sum));
      left -= cols;
      return { ...t, cols };
    });
  });
};

// One grid cell. It is only `draggable` while its grip is held, so text selection and
// scrolling inside the tile keep working.
function TileCell({ span, over, onRemove, onDragStart, onDragOver, onDrop, onDragEnd, children }) {
  const [armed, setArmed] = useState(false);
  const ctx = useMemo(() => ({ arm: () => setArmed(true), disarm: () => setArmed(false), remove: onRemove }), [onRemove]);
  return (
    <div
      draggable={armed}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', ''); onDragStart(); }}
      onDragEnd={() => { setArmed(false); onDragEnd(); }}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`min-h-0 flex flex-col ${span} ${over ? 'ring-2 ring-blue-400 rounded-lg' : ''}`}
    >
      <TileContext.Provider value={ctx}>{children}</TileContext.Provider>
    </div>
  );
}

// A key-number card with a small remove button (shown on hover or keyboard focus, and always
// on touch screens, where there is no hover).
function KpiCell({ title, onRemove, children }) {
  return (
    <div className="relative group">
      {children}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${title} from the dashboard`}
        title="Remove from dashboard (add it back from Widgets)"
        className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-700 opacity-0 group-hover:opacity-100 focus:opacity-100 [@media(hover:none)]:opacity-60"
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12" /></svg>
      </button>
    </div>
  );
}

// The frame is what makes "no scrolling down" work: on lg+ it is exactly one viewport
// tall, the KPI strip keeps its natural height, and the widget grid takes whatever is
// left (each Widget then scrolls its own body). Below lg everything stacks and the page
// scrolls like any other.
//
// Tiles are draggable: the grid has fixed SLOTS (each with its own span), and dragging a
// tile onto another swaps which tile sits in which slot. Swapping rather than reflowing
// is deliberate — tiles have different widths, and letting them flow could push the grid
// onto a third row and bring back the page scroll.
//
// Tiles and key numbers can also be removed. They wait in the Widgets library (a slide-in
// panel) until added back, and the choice is remembered per dashboard on this device.
// `tiles` is [{ id, title, span, node }] and `kpis` is [{ id, title, node }].
export function DashboardFrame({ title, actions = null, kpis = [], rows = 2, layoutId, tiles }) {
  const defaults = tiles.map((t) => t.id);
  const [order, setOrder] = useState(() => readOrder(layoutId, defaults));
  const [hidden, setHidden] = useState(() => readHidden(layoutId));
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null);

  const byId = Object.fromEntries(tiles.map((t) => [t.id, t]));
  // Resilient to the tile set changing between renders (e.g. a role's tiles differ).
  const current = order.length === tiles.length && defaults.every((id) => order.includes(id)) ? order : defaults;
  const isDefaultOrder = current.every((id, i) => id === defaults[i]);

  // A tile and a key number may share a name ("branches"), so key numbers are stored as kpi:<id>.
  const kpiKey = (k) => `kpi:${k.id}`;
  const hiddenTiles = tiles.filter((t) => hidden.includes(t.id));
  const hiddenKpis = kpis.filter((k) => hidden.includes(kpiKey(k)));
  const removed = [
    ...hiddenTiles.map((t) => ({ id: t.id, title: t.title, kind: 'tile' })),
    ...hiddenKpis.map((k) => ({ id: kpiKey(k), title: k.title, kind: 'kpi' })),
  ];
  const visibleKpis = kpis.filter((k) => !hidden.includes(kpiKey(k)));

  const hide = (id) => { const next = [...new Set([...hidden, id])]; setHidden(next); writeHidden(layoutId, next); };
  const show = (id) => { const next = hidden.filter((h) => h !== id); setHidden(next); writeHidden(layoutId, next); };
  const showAll = () => { setHidden([]); writeHidden(layoutId, []); };

  const swap = (a, b) => {
    if (!a || !b || a === b) return;
    const next = [...current];
    const i = next.indexOf(a);
    const j = next.indexOf(b);
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
    writeOrder(layoutId, next, defaults);
  };
  const reset = () => { setOrder(defaults); writeOrder(layoutId, defaults, defaults); showAll(); };

  const dragProps = (tileId) => ({
    over: overId === tileId && dragId && dragId !== tileId,
    onRemove: () => hide(tileId),
    onDragStart: () => setDragId(tileId),
    onDragOver: (e) => { if (dragId) { e.preventDefault(); setOverId(tileId); } },
    onDrop: (e) => { e.preventDefault(); swap(dragId, tileId); setDragId(null); setOverId(null); },
    onDragEnd: () => { setDragId(null); setOverId(null); },
  });

  // Nothing removed: the fixed-slot grid exactly as before. Something removed: pack the rest.
  const anyTileHidden = hiddenTiles.length > 0;
  const visibleIds = current.filter((id) => !hidden.includes(id));
  const packed = anyTileHidden ? packRows(visibleIds.map((id) => byId[id])) : null;
  const rowCount = anyTileHidden ? Math.max(1, packed.length) : rows;
  const gridRows = anyTileHidden
    ? 'lg:[grid-template-rows:repeat(var(--rows),minmax(0,1fr))]'
    : rows === 1 ? 'lg:grid-rows-[minmax(0,1fr)]' : 'lg:grid-rows-[minmax(0,1fr)_minmax(0,1fr)]';

  return (
    <div className="p-4 flex flex-col gap-4 lg:h-screen lg:overflow-hidden">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between shrink-0">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{title}</h1>
        <div className="flex items-center gap-3">
          {actions}
          {(!isDefaultOrder || removed.length > 0) && (
            <button type="button" onClick={reset} className="hidden lg:block text-xs text-blue-600 dark:text-blue-400 hover:underline">Reset layout</button>
          )}
          <button
            type="button"
            onClick={() => setLibraryOpen(true)}
            className="flex items-center gap-2 border rounded-xl px-3 py-1.5 text-sm dark:border-gray-700 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 5h6v6H4zM14 5h6v6h-6zM4 15h6v4H4zM14 15h6v4h-6z" /></svg>
            Widgets
            {removed.length > 0 && <span className="rounded-full bg-accent text-accent-ink text-xs font-semibold px-1.5 min-w-5 text-center">{removed.length}</span>}
          </button>
        </div>
      </div>
      {visibleKpis.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-flow-col lg:auto-cols-fr gap-3 shrink-0">
          {visibleKpis.map((k) => <KpiCell key={k.id} title={k.title} onRemove={() => hide(kpiKey(k))}>{k.node}</KpiCell>)}
        </div>
      )}
      {anyTileHidden && visibleIds.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center rounded-2xl border border-dashed border-gray-300 dark:border-gray-700 p-8">
          <p className="text-sm text-gray-500 dark:text-gray-400">All widgets are removed.</p>
          <button type="button" onClick={() => setLibraryOpen(true)} className="border rounded-xl px-3 py-1.5 text-sm dark:border-gray-700 dark:text-gray-100">Open Widgets</button>
        </div>
      ) : (
        <div style={{ '--rows': rowCount }} className={`grid grid-cols-1 lg:grid-cols-12 gap-4 lg:flex-1 lg:min-h-0 ${gridRows}`}>
          {anyTileHidden
            ? packed.flat().map((cell) => (
              <TileCell key={cell.id} span={COL_SPAN[cell.cols]} {...dragProps(cell.id)}>{byId[cell.id].node}</TileCell>
            ))
            : defaults.map((slotId, i) => {
              const tileId = current[i];
              return <TileCell key={slotId} span={byId[slotId].span} {...dragProps(tileId)}>{byId[tileId].node}</TileCell>;
            })}
        </div>
      )}
      <WidgetLibrary open={libraryOpen} onClose={() => setLibraryOpen(false)} removed={removed} onAdd={show} onAddAll={showAll} onReset={() => { reset(); setLibraryOpen(false); }} />
    </div>
  );
}

// The Expiring Soon / Expired pair is the same for tenant-admin and branch-manager apart
// from the optional Branch column. Both need the Renew modal, so this returns the two
// tile nodes plus one modal for the caller to render once.
export function useExpiryTiles({ expiring, expired, branchNameFor = null, onRenewed }) {
  const [renewing, setRenewing] = useState(null);
  const renewColumn = {
    key: 'renew',
    label: '',
    render: (r) => (
      <button onClick={() => setRenewing(r)} className="text-green-700 dark:text-green-400 hover:underline">Renew</button>
    ),
  };
  const base = [
    { key: 'name', label: 'Name' },
    { key: 'phone', label: 'Phone' },
    { key: 'memberCode', label: 'Code' },
    ...(branchNameFor ? [{ key: 'branch', label: 'Branch', render: (r) => branchNameFor(r.branchId) }] : []),
  ];
  return {
    expiringNode: (
      <Widget title={`Expiring soon (7 days) · ${expiring.length}`}>
        <DataTable tableId="dash.expiring" embedded rows={expiring} columns={[...base, { key: 'expiresIn', label: 'Expires in', render: (r) => expiresInLabel(r.membershipEnd) }, renewColumn]} />
      </Widget>
    ),
    expiredNode: (
      <Widget title={`Expired · ${expired.length}`}>
        <DataTable tableId="dash.expired" embedded rows={expired} columns={[...base, { key: 'expiredAgo', label: 'Expired', render: (r) => expiredAgoLabel(r.membershipEnd) }, renewColumn]} />
      </Widget>
    ),
    modal: (
      <RenewMembershipModal open={!!renewing} member={renewing} onClose={() => setRenewing(null)} onRenewed={() => { setRenewing(null); onRenewed(); }} />
    ),
  };
}

export const paymentColumns = [
  { key: 'invoiceNumber', label: 'Invoice' },
  { key: 'member', label: 'Member', render: (r) => r.memberId?.name || '—' },
  { key: 'amount', label: 'Amount', render: (r) => `₹${r.amount}` },
  { key: 'method', label: 'Method' },
  { key: 'status', label: 'Status' },
  { key: 'paidAt', label: 'Paid', render: (r) => formatDate(r.paidAt) },
];

export const checkinColumns = [
  { key: 'member', label: 'Member', render: (r) => r.memberId?.name || '—' },
  { key: 'checkInAt', label: 'In', render: (r) => formatDateTime(r.checkInAt) },
  { key: 'checkOutAt', label: 'Out', render: (r) => formatDateTime(r.checkOutAt) },
];
