import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import ThemeToggle from './ThemeToggle';
import InstallButton from './InstallButton';
import BrandMark from './BrandMark';
import { useBrand } from '../context/BrandContext';
import { useFeature } from '../hooks/useFeature';

const NAV_BY_ROLE = {
  'super-admin': [
    { to: '/platform-admins', label: 'Platform Admins' },
    { to: '/tenants', label: 'Tenants' },
    { to: '/packages', label: 'Packages' },
    { to: '/audit-logs', label: 'Audit Log' },
    { to: '/platform-settings', label: 'Platform Settings' },
  ],
  'platform-admin': [
    { to: '/tenants', label: 'Tenants' },
    { to: '/packages', label: 'Packages' },
    { to: '/audit-logs', label: 'Audit Log' },
  ],
  'tenant-admin': [
    { to: '/branches', label: 'Branches' },
    { to: '/members', label: 'Members' },
    { to: '/equipment', label: 'Equipment' },
    { to: '/trainers', label: 'Trainers' },
    { to: '/trainer-report', label: 'Trainer Collections & Salary' },
    { to: '/membership-plans', label: 'Membership Plans' },
    { to: '/payments', label: 'Payments' },
    { to: '/reports', label: 'Reports' },
    { to: '/payment-settings', label: 'Payment Settings' },
    { to: '/branding', label: 'Branding & Address' },
  ],
  'branch-manager': [
    { to: '/members', label: 'Members' },
    { to: '/trainers', label: 'Trainers' },
    { to: '/equipment', label: 'Equipment' },
    { to: '/attendance', label: 'Attendance' },
    { to: '/payments', label: 'Payments' },
  ],
  trainer: [
    { to: '/my-members', label: 'My Members' },
  ],
};

export default function Sidebar({ isOpen = false, onClose = () => {} }) {
  const { user, logout } = useAuth();
  const { brand } = useBrand();
  const canBrand = useFeature('features:branding');
  const links = (NAV_BY_ROLE[user?.role] || []).filter((l) => l.to !== '/branding' || canBrand);

  return (
    <>
      {isOpen && (
        <div className="fixed inset-0 bg-black/40 z-30 md:hidden" onClick={onClose} />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 shrink-0 bg-gray-900 text-gray-100 flex flex-col
          transform transition-transform duration-200 ease-in-out
          ${isOpen ? 'translate-x-0' : '-translate-x-full'}
          md:static md:translate-x-0 md:w-56 md:min-h-screen`}
      >
        <div className="p-4 text-lg font-semibold border-b border-gray-700 flex items-center justify-between">
          <span className="flex items-center gap-2 min-w-0"><BrandMark brand={brand} size={28} /><span className="truncate">{brand?.name || 'FlexHub'}</span></span>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <button onClick={onClose} aria-label="Close menu" className="md:hidden text-gray-400 hover:text-gray-100">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          <NavLink to="/" end onClick={onClose} className={({ isActive }) => `block px-3 py-2 rounded-xl ${isActive ? 'bg-accent text-accent-ink font-semibold' : 'hover:bg-gray-800'}`}>
            Dashboard
          </NavLink>
          {links.map((link) => (
            <NavLink key={link.to} to={link.to} onClick={onClose} className={({ isActive }) => `block px-3 py-2 rounded-xl ${isActive ? 'bg-accent text-accent-ink font-semibold' : 'hover:bg-gray-800'}`}>
              {link.label}
            </NavLink>
          ))}
        </nav>
        <div className="p-4 pb-safe border-t border-gray-700 text-sm">
          <div className="mb-2 text-gray-400">{user?.name} ({user?.role})</div>
          <div className="flex items-center justify-between gap-2">
            <button onClick={logout} className="text-red-400 hover:text-red-300">
              Log out
            </button>
            <InstallButton />
          </div>
        </div>
      </aside>
    </>
  );
}
