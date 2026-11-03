import { useMemo, useState } from 'react';
import Widget, { TileContext } from '../../components/Widget';
import DataTable from '../../components/DataTable';
import RenewMembershipModal from '../../components/RenewMembershipModal';

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

// One grid cell. It is only `draggable` while its grip is held, so text selection and
// scrolling inside the tile keep working.
function TileCell({ span, over, onDragStart, onDragOver, onDrop, onDragEnd, children }) {
  const [armed, setArmed] = useState(false);
  const ctx = useMemo(() => ({ arm: () => setArmed(true), disarm: () => setArmed(false) }), []);
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

// The frame is what makes "no scrolling down" work: on lg+ it is exactly one viewport
// tall, the KPI strip keeps its natural height, and the widget grid takes whatever is
// left (each Widget then scrolls its own body). Below lg everything stacks and the page
// scrolls like any other.
//
// Tiles are draggable: the grid has fixed SLOTS (each with its own span), and dragging a
// tile onto another swaps which tile sits in which slot. Swapping rather than reflowing
// is deliberate — tiles have different widths, and letting them flow could push the grid
// onto a third row and bring back the page scroll.
export function DashboardFrame({ title, actions = null, kpis = null, rows = 2, layoutId, tiles }) {
  const gridRows = rows === 1 ? 'lg:grid-rows-[minmax(0,1fr)]' : 'lg:grid-rows-[minmax(0,1fr)_minmax(0,1fr)]';
  const defaults = tiles.map((t) => t.id);
  const [order, setOrder] = useState(() => readOrder(layoutId, defaults));
  const [dragId, setDragId] = useState(null);
  const [overId, setOverId] = useState(null);

  const byId = Object.fromEntries(tiles.map((t) => [t.id, t]));
  // Resilient to the tile set changing between renders (e.g. a role's tiles differ).
  const current = order.length === tiles.length && defaults.every((id) => order.includes(id)) ? order : defaults;
  const isDefault = current.every((id, i) => id === defaults[i]);

  const swap = (a, b) => {
    if (!a || !b || a === b) return;
    const next = [...current];
    const i = next.indexOf(a);
    const j = next.indexOf(b);
    [next[i], next[j]] = [next[j], next[i]];
    setOrder(next);
    writeOrder(layoutId, next, defaults);
  };
  const reset = () => { setOrder(defaults); writeOrder(layoutId, defaults, defaults); };

  return (
    <div className="p-4 flex flex-col gap-4 lg:h-screen lg:overflow-hidden">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between shrink-0">
        <h1 className="text-xl font-semibold text-gray-900 dark:text-gray-100">{title}</h1>
        <div className="flex items-center gap-3">
          {actions}
          {!isDefault && (
            <button type="button" onClick={reset} className="hidden lg:block text-xs text-blue-600 dark:text-blue-400 hover:underline">Reset layout</button>
          )}
        </div>
      </div>
      {kpis && <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-flow-col lg:auto-cols-fr gap-3 shrink-0">{kpis}</div>}
      <div className={`grid grid-cols-1 lg:grid-cols-12 gap-4 lg:flex-1 lg:min-h-0 ${gridRows}`}>
        {defaults.map((slotId, i) => {
          const tileId = current[i];
          return (
            <TileCell
              key={slotId}
              span={byId[slotId].span}
              over={overId === tileId && dragId && dragId !== tileId}
              onDragStart={() => setDragId(tileId)}
              onDragOver={(e) => { if (dragId) { e.preventDefault(); setOverId(tileId); } }}
              onDrop={(e) => { e.preventDefault(); swap(dragId, tileId); setDragId(null); setOverId(null); }}
              onDragEnd={() => { setDragId(null); setOverId(null); }}
            >
              {byId[tileId].node}
            </TileCell>
          );
        })}
      </div>
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
