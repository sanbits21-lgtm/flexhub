import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertTriangle, Bell, CalendarClock, Menu, Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { dashboardAPI } from '../services/api';
import UserMenu from './UserMenu';
import Logo from './Logo';
import BrandMark from './BrandMark';
import { useBrand } from '../context/BrandContext';

const STAFF_WITH_MEMBERS = ['tenant-admin', 'branch-manager'];

// Things worth a glance, from the numbers the dashboard already keeps: memberships that have lapsed or are
// about to. Each opens the members list already filtered to them.
function useAlerts(enabled) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    if (!enabled) return undefined;
    let cancelled = false;
    const load = () => dashboardAPI.summary().then((res) => {
      if (cancelled) return;
      const d = res.data || {};
      setItems([
        { id: 'expired', count: d.expiredCount || 0, text: (n) => `${n} membership${n === 1 ? ' has' : 's have'} expired`, to: '/members?status=expired', icon: AlertTriangle, tone: 'text-red-500' },
        { id: 'expiring', count: d.expiringSoonCount || 0, text: (n) => `${n} membership${n === 1 ? ' expires' : 's expire'} within 7 days`, to: '/members?expiring=7', icon: CalendarClock, tone: 'text-amber-500' },
      ].filter((i) => i.count > 0));
    }).catch(() => {});
    load();
    const timer = setInterval(load, 5 * 60 * 1000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [enabled]);
  return items;
}

function Bell_({ items }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);
  const total = items.length;
  return (
    <div ref={box} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-label={total ? `${total} notification${total === 1 ? '' : 's'}` : 'Notifications'} aria-haspopup="menu" aria-expanded={open} className="relative rounded-full p-2 text-gray-500 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-white/10">
        <Bell className="h-6 w-6" aria-hidden="true" />
        {total > 0 && <span className="absolute right-0.5 top-0.5 flex h-4.5 min-w-[1.1rem] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{total}</span>}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-2xl dark:border-white/10 dark:bg-gray-800">
          <p className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-gray-100">Notifications</p>
          <div className="h-px bg-gray-200 dark:bg-white/10" />
          {total === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-gray-500 dark:text-gray-400">You're all caught up.</p>
          ) : items.map((i) => (
            <Link key={i.id} to={i.to} role="menuitem" onClick={() => setOpen(false)} className="flex items-center gap-3 px-4 py-3 text-sm text-gray-800 hover:bg-gray-50 dark:text-gray-100 dark:hover:bg-white/5">
              <i.icon className={`h-5 w-5 shrink-0 ${i.tone}`} aria-hidden="true" />
              {i.text(i.count)}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// The strip across the top of every signed-in page: the menu button on a phone, search, notifications and
// the account menu. Search takes you to the members list for what you typed (Ctrl+K from anywhere).
export default function TopBar({ onMenu }) {
  const { user } = useAuth();
  const { brand } = useBrand();
  const navigate = useNavigate();
  const input = useRef(null);
  const [query, setQuery] = useState('');
  const canSearch = STAFF_WITH_MEMBERS.includes(user?.role);
  const items = useAlerts(canSearch);

  useEffect(() => {
    if (!canSearch) return undefined;
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); input.current?.focus(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [canSearch]);

  const submit = (e) => {
    e.preventDefault();
    const q = query.trim();
    navigate(q ? `/members?search=${encodeURIComponent(q)}` : '/members');
    input.current?.blur();
  };

  return (
    <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-gray-200 bg-gray-50/85 px-4 py-3 pt-safe backdrop-blur dark:border-white/5 dark:bg-gray-900/85 md:px-6">
      <button type="button" onClick={onMenu} aria-label="Open menu" className="-ml-1 rounded-xl p-2 text-gray-600 hover:bg-gray-200 dark:text-gray-300 dark:hover:bg-white/10 md:hidden"><Menu className="h-6 w-6" /></button>
      <span className="min-w-0 md:hidden">
        {brand?.logoUrl ? <span className="flex items-center gap-2 font-bold"><BrandMark brand={brand} size={26} /><span className="truncate">{brand.name}</span></span> : <Logo size={30} />}
      </span>

      {canSearch ? (
        <form onSubmit={submit} role="search" className="relative ml-auto hidden w-full max-w-md md:ml-0 md:block md:flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" aria-hidden="true" />
          <input
            ref={input}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            type="search"
            placeholder="Search members…"
            aria-label="Search members"
            className="w-full rounded-full border border-gray-300 bg-white py-2.5 pl-12 pr-20 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-accent focus:ring-2 focus:ring-accent/40 dark:border-gray-700 dark:bg-gray-800/70 dark:text-gray-100"
          />
          <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-lg border border-gray-300 bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-300 lg:block">Ctrl + K</kbd>
        </form>
      ) : <div className="hidden flex-1 md:block" />}

      <div className="ml-auto flex items-center gap-1 md:ml-0">
        {canSearch && <Bell_ items={items} />}
        <div className="md:hidden"><UserMenu variant="avatar" /></div>
      </div>
    </header>
  );
}
