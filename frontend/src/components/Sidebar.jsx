import { NavLink } from 'react-router-dom';
import {
  BarChart3, Building, Building2, CalendarCheck, CreditCard, Dumbbell, LayoutDashboard, Landmark, Package, Palette,
  QrCode, ScrollText, Settings, ShieldCheck, Star, Tags, UserCog, Users, Wallet, X, Sparkles,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import BrandLogo from './BrandLogo';
import InstallButton from './InstallButton';
import UserMenu from './UserMenu';
import { useBrand } from '../context/BrandContext';
import { useFeature } from '../hooks/useFeature';

const NAV_BY_ROLE = {
  'super-admin': [
    { to: '/platform-admins', label: 'Platform Admins', icon: ShieldCheck },
    { to: '/tenants', label: 'Tenants', icon: Building },
    { to: '/packages', label: 'Packages', icon: Package },
    { to: '/audit-logs', label: 'Audit Log', icon: ScrollText },
    { to: '/platform-settings', label: 'Platform Settings', icon: Settings },
  ],
  'platform-admin': [
    { to: '/tenants', label: 'Tenants', icon: Building },
    { to: '/packages', label: 'Packages', icon: Package },
    { to: '/audit-logs', label: 'Audit Log', icon: ScrollText },
  ],
  'tenant-admin': [
    { to: '/branches', label: 'Branches', icon: Building2 },
    { to: '/members', label: 'Members', icon: Users },
    { to: '/member-app-qr', label: 'Member App QR', icon: QrCode },
    { to: '/ratings', label: 'Ratings', icon: Star },
    { to: '/equipment', label: 'Equipment', icon: Dumbbell },
    { to: '/trainers', label: 'Trainers', icon: UserCog },
    { to: '/trainer-report', label: 'Trainer Collections & Salary', icon: Wallet },
    { to: '/membership-plans', label: 'Membership Plans', icon: Tags },
    { to: '/payments', label: 'Payments', icon: CreditCard },
    { to: '/reports', label: 'Reports', icon: BarChart3 },
    { to: '/payment-settings', label: 'Payment Settings', icon: Landmark },
    { to: '/branding', label: 'Branding & Address', icon: Palette },
  ],
  'branch-manager': [
    { to: '/members', label: 'Members', icon: Users },
    { to: '/member-app-qr', label: 'Member App QR', icon: QrCode },
    { to: '/ratings', label: 'Ratings', icon: Star },
    { to: '/trainers', label: 'Trainers', icon: UserCog },
    { to: '/equipment', label: 'Equipment', icon: Dumbbell },
    { to: '/attendance', label: 'Attendance', icon: CalendarCheck },
    { to: '/payments', label: 'Payments', icon: CreditCard },
  ],
  trainer: [
    { to: '/my-members', label: 'My Members', icon: Users },
  ],
};

const linkClass = ({ isActive }) => `flex items-center gap-3 rounded-2xl px-3.5 py-2.5 text-[15px] transition ${isActive ? 'bg-accent font-semibold text-accent-ink shadow-[0_8px_24px_-12px_rgb(var(--accent)/0.8)]' : 'text-gray-300 hover:bg-white/5 hover:text-white'}`;

// The support address for "upgrade" (set VITE_SUPPORT_EMAIL when building). Without it the button is simply not shown.
const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL;

export default function Sidebar({ isOpen = false, onClose = () => {} }) {
  const { user, subscription } = useAuth();
  const { brand } = useBrand();
  const canBrand = useFeature('features:branding');
  const links = (NAV_BY_ROLE[user?.role] || []).filter((l) => l.to !== '/branding' || canBrand);
  const onTrial = user?.role === 'tenant-admin' && subscription?.onTrial && !subscription.trialExpired;

  return (
    <>
      {isOpen && <div className="fixed inset-0 z-30 bg-black/50 md:hidden" onClick={onClose} />}
      <aside
        className={`fixed inset-y-0 left-0 z-40 flex w-72 shrink-0 flex-col border-r border-white/5 bg-gray-900 text-gray-100
          transform transition-transform duration-200 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          md:sticky md:top-0 md:h-screen md:w-64 md:translate-x-0`}
      >
        <div className="flex items-center justify-between px-5 pb-4 pt-5">
          <BrandLogo size={40} tagline onDark />
          <button onClick={onClose} aria-label="Close menu" className="rounded-lg p-1 text-gray-400 hover:text-gray-100 md:hidden"><X className="h-5 w-5" /></button>
        </div>

        <nav aria-label="Main" className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
          <NavLink to="/" end onClick={onClose} className={linkClass}><LayoutDashboard className="h-5 w-5 shrink-0" aria-hidden="true" />Dashboard</NavLink>
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} onClick={onClose} className={linkClass}>
              <link.icon className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="truncate">{link.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="space-y-3 px-3 pb-4 pt-2">
          {brand && ['tenant-admin', 'branch-manager'].includes(user?.role) && (
            <div className="rounded-2xl border border-white/10 bg-white/5 px-3.5 py-2.5">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">{user.role === 'tenant-admin' ? 'Multi-branch' : 'Your branch'}</p>
              <p className="mt-0.5 flex items-center gap-2 truncate text-sm font-medium text-gray-100"><Building2 className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />{brand.name}</p>
            </div>
          )}
          {onTrial && SUPPORT_EMAIL && (
            <div className="relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br from-gray-800 to-gray-900 p-4">
              <div aria-hidden="true" className="absolute -right-6 -top-6 h-20 w-12 rotate-45 bg-gradient-to-b from-accent to-accent/0 opacity-60" />
              <p className="flex items-center gap-1.5 text-sm font-bold text-white"><Sparkles className="h-4 w-4 text-accent" aria-hidden="true" /> Grow your club</p>
              <p className="mt-1 text-xs text-gray-300">{subscription.daysLeft} day{subscription.daysLeft === 1 ? '' : 's'} left in your free trial.</p>
              <a href={`mailto:${SUPPORT_EMAIL}?subject=Upgrade%20my%20plan`} className="mt-3 inline-flex rounded-xl bg-accent px-3 py-1.5 text-xs font-bold text-accent-ink hover:brightness-110">Upgrade plan</a>
            </div>
          )}
          <UserMenu variant="card" placement="top" />
          <div className="px-1"><InstallButton /></div>
        </div>
      </aside>
    </>
  );
}
