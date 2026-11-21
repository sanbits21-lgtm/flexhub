import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import {
  BarChart3, Building, Building2, CalendarCheck, CreditCard, Dumbbell, LayoutDashboard, Landmark, Package, Palette,
  QrCode, ScrollText, Settings, ShieldCheck, Star, Tags, UserCog, Users, Wallet, X, Sparkles, ChevronLeft, ChevronRight, Megaphone, Receipt, Banknote, Gem, BadgeCheck, ScanLine,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import BrandLogo from './BrandLogo';
import BrandMark from './BrandMark';
import { LogoMark } from './Logo';
import InstallButton from './InstallButton';
import UserMenu from './UserMenu';
import { useBrand } from '../context/BrandContext';
import { useTheme } from '../context/ThemeContext';
import { useFeature } from '../hooks/useFeature';

const NAV_BY_ROLE = {
  'super-admin': [
    { to: '/platform-admins', label: 'Platform Admins', icon: ShieldCheck },
    { to: '/tenants', label: 'Tenants', icon: Building },
    { to: '/packages', label: 'Packages', icon: Package },
    { to: '/billing-orders', label: 'Payments to confirm', icon: BadgeCheck },
    { to: '/audit-logs', label: 'Audit Log', icon: ScrollText },
    { to: '/platform-settings', label: 'Platform Settings', icon: Settings },
  ],
  'platform-admin': [
    { to: '/tenants', label: 'Tenants', icon: Building },
    { to: '/packages', label: 'Packages', icon: Package },
    { to: '/billing-orders', label: 'Payments to confirm', icon: BadgeCheck },
    { to: '/audit-logs', label: 'Audit Log', icon: ScrollText },
  ],
  'tenant-admin': [
    { to: '/branches', label: 'Branches', icon: Building2 },
    { to: '/members', label: 'Members', icon: Users },
    { to: '/member-app-qr', label: 'Member App QR', icon: QrCode },
    { to: '/scan', label: 'Scan pass', icon: ScanLine, feature: 'features:qrCheckIn' },
    { to: '/ratings', label: 'Ratings', icon: Star },
    { to: '/equipment', label: 'Equipment', icon: Dumbbell },
    { to: '/trainers', label: 'Trainers', icon: UserCog },
    { to: '/trainer-report', label: 'Trainer Collections & Salary', icon: Wallet },
    { to: '/membership-plans', label: 'Membership Plans', icon: Tags },
    { to: '/payments', label: 'Payments', icon: CreditCard },
    { to: '/expenses', label: 'Expenses', icon: Receipt, feature: 'pages:expenses' },
    { to: '/payroll', label: 'Payroll', icon: Banknote, feature: 'pages:expenses' },
    { to: '/announcements', label: 'Announcements', icon: Megaphone, feature: 'features:announcements' },
    { to: '/reports', label: 'Reports', icon: BarChart3 },
    { to: '/billing', label: 'Billing', icon: Gem },
    { to: '/payment-settings', label: 'Payment Settings', icon: Landmark },
    { to: '/branding', label: 'Branding & Address', icon: Palette },
  ],
  'branch-manager': [
    { to: '/members', label: 'Members', icon: Users },
    { to: '/member-app-qr', label: 'Member App QR', icon: QrCode },
    { to: '/scan', label: 'Scan pass', icon: ScanLine, feature: 'features:qrCheckIn' },
    { to: '/ratings', label: 'Ratings', icon: Star },
    { to: '/trainers', label: 'Trainers', icon: UserCog },
    { to: '/equipment', label: 'Equipment', icon: Dumbbell },
    { to: '/attendance', label: 'Attendance', icon: CalendarCheck },
    { to: '/payments', label: 'Payments', icon: CreditCard },
    { to: '/expenses', label: 'Expenses', icon: Receipt, feature: 'pages:expenses' },
    { to: '/announcements', label: 'Announcements', icon: Megaphone, feature: 'features:announcements' },
  ],
  trainer: [
    { to: '/my-members', label: 'My Members', icon: Users },
  ],
};

const COLLAPSED_KEY = 'fitzy:menu-collapsed';
const readCollapsed = () => { try { return localStorage.getItem(COLLAPSED_KEY) === '1'; } catch { return false; } };

// `slim` is the icon-only desktop menu; on a phone the menu is a drawer and always shows labels.
const linkClass = (slim) => ({ isActive }) => `flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-[15px] transition ${slim ? 'md:justify-center md:px-0' : ''} ${isActive ? 'bg-accent/15 font-semibold text-gray-900 ring-1 ring-inset ring-accent-strong/25 dark:bg-accent dark:text-accent-ink dark:ring-0 dark:shadow-[0_8px_24px_-12px_rgb(var(--accent)/0.8)]' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-white/5 dark:hover:text-white'}`;

export default function Sidebar({ isOpen = false, onClose = () => {} }) {
  const { user, subscription } = useAuth();
  const { brand } = useBrand();
  const { theme } = useTheme();
  const { features } = useAuth();
  const canBrand = useFeature('features:branding');
  // A page whose feature the gym does not have is left out of the menu (a link to a page that only says "not included" is noise).
  const links = (NAV_BY_ROLE[user?.role] || []).filter((l) => (l.to !== '/branding' || canBrand) && (!l.feature || !features || features[l.feature] !== false));
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const toggle = () => setCollapsed((c) => {
    try { localStorage.setItem(COLLAPSED_KEY, c ? '0' : '1'); } catch { /* convenience only */ }
    return !c;
  });
  const hideWhenSlim = collapsed ? 'md:hidden' : '';
  const onTrial = user?.role === 'tenant-admin' && subscription?.onTrial && !subscription.trialExpired;

  return (
    <>
      {isOpen && <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={onClose} />}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 shrink-0 flex-col border-r border-gray-200 bg-white text-gray-700 dark:border-white/5 dark:bg-gray-900 dark:text-gray-100
          transform transition-transform duration-200 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          md:sticky md:top-0 md:h-screen md:translate-x-0 ${collapsed ? 'md:w-[4.75rem]' : 'md:w-64'}`}
      >
        <button
          type="button"
          onClick={toggle}
          aria-label={collapsed ? 'Expand menu' : 'Collapse menu'}
          aria-expanded={!collapsed}
          title={collapsed ? 'Expand menu' : 'Collapse menu'}
          className="absolute -right-3 top-7 z-50 hidden h-6 w-6 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-sm hover:bg-gray-100 hover:text-gray-900 dark:border-white/10 dark:bg-gray-800 dark:text-gray-300 dark:shadow dark:hover:bg-gray-700 dark:hover:text-white md:flex"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
        <div className={`flex items-center justify-between px-5 pb-4 pt-5 ${collapsed ? 'md:justify-center md:px-0' : ''}`}>
          <span className={`min-w-0 ${hideWhenSlim}`}><BrandLogo size={40} tagline onDark={theme === 'dark'} /></span>
          {collapsed && <span className="hidden md:block">{brand?.customBrand ? <BrandMark brand={brand} size={36} /> : <LogoMark size={40} />}</span>}
          <button onClick={onClose} aria-label="Close menu" className="rounded-lg p-1 text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100 md:hidden"><X className="h-5 w-5" /></button>
        </div>

        <nav aria-label="Main" className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          <NavLink to="/" end onClick={onClose} className={linkClass(collapsed)} title={collapsed ? 'Dashboard' : undefined}><LayoutDashboard className="h-5 w-5 shrink-0" aria-hidden="true" /><span className={hideWhenSlim}>Dashboard</span></NavLink>
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} onClick={onClose} className={linkClass(collapsed)} title={collapsed ? link.label : undefined}>
              <link.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className={`truncate ${hideWhenSlim}`}>{link.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="space-y-3 px-3 pb-4 pt-2">
          {brand && ['tenant-admin', 'branch-manager'].includes(user?.role) && (
            <div className={`rounded-2xl border border-gray-200 bg-gray-50 px-3.5 py-2.5 dark:border-white/10 dark:bg-white/5 ${hideWhenSlim}`}>
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400">{user.role === 'tenant-admin' ? 'Multi-branch' : 'Your branch'}</p>
              <p className="mt-0.5 flex items-center gap-2 truncate text-sm font-medium text-gray-900 dark:text-gray-100"><Building2 className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />{brand.name}</p>
            </div>
          )}
          {onTrial && (
            <div className={`relative overflow-hidden rounded-2xl border border-gray-200 bg-gradient-to-br from-accent/10 to-white p-4 dark:border-white/10 dark:from-gray-800 dark:to-gray-900 ${hideWhenSlim}`}>
              <div aria-hidden="true" className="absolute -right-6 -top-6 h-20 w-12 rotate-45 bg-gradient-to-b from-accent to-accent/0 opacity-60" />
              <p className="flex items-center gap-1.5 text-sm font-bold text-gray-900 dark:text-white"><Sparkles className="h-4 w-4 text-accent-strong dark:text-accent" aria-hidden="true" /> Grow your club</p>
              <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">{subscription.daysLeft} day{subscription.daysLeft === 1 ? '' : 's'} left in your free trial.</p>
              <Link to="/billing" onClick={onClose} className="mt-3 inline-flex rounded-xl bg-accent-strong dark:bg-accent px-3 py-1.5 text-xs font-bold text-white dark:text-accent-ink hover:brightness-110">Upgrade plan</Link>
            </div>
          )}
          <div className={hideWhenSlim}><UserMenu variant="card" placement="top" /></div>
          {collapsed && <div className="hidden justify-center md:flex"><UserMenu variant="avatar" placement="top" /></div>}
          <div className={`px-1 ${hideWhenSlim}`}><InstallButton /></div>
        </div>
      </aside>
    </>
  );
}
