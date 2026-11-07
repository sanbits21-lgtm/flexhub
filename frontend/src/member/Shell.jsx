import { NavLink, Navigate, Outlet, useLocation } from 'react-router-dom';
import { useMemberAuth } from './MemberAuth';
import { Icon, ICONS, Loading } from './ui';

const TABS = [
  { to: '/member', label: 'Home', icon: ICONS.home, end: true },
  { to: '/member/sessions', label: 'Sessions', icon: ICONS.calendar },
  { to: '/member/workout', label: 'Workout', icon: ICONS.barbell },
  { to: '/member/diet', label: 'Diet', icon: ICONS.nutrition },
  { to: '/member/gym', label: 'My gym', icon: ICONS.gym },
  { to: '/member/profile', label: 'Profile', icon: ICONS.person },
];

// Signed-in frame: the page, and a bottom tab bar that stays put like a native app's. The bar
// pays back the phone's home-indicator inset (viewport-fit=cover in index.html).
export default function Shell() {
  const { ready, member } = useMemberAuth();
  const location = useLocation();
  if (!ready) return <Loading />;
  if (!member) return <Navigate to="/member/login" replace state={{ from: location.pathname }} />;

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <main className="max-w-lg mx-auto pb-24">
        <Outlet />
      </main>
      <nav aria-label="Member app" className="fixed bottom-0 inset-x-0 z-30 border-t border-gray-200 dark:border-gray-700 bg-white/95 dark:bg-gray-900/95 backdrop-blur">
        <ul className="max-w-lg mx-auto grid grid-cols-6 pb-safe">
          {TABS.map((t) => (
            <li key={t.to}>
              <NavLink
                to={t.to}
                end={t.end}
                className={({ isActive }) => `flex flex-col items-center gap-0.5 pt-2 pb-1 text-[10px] font-bold ${isActive ? 'text-gray-900 dark:text-accent' : 'text-gray-400 dark:text-gray-500'}`}
              >
                <Icon d={t.icon} className="w-6 h-6" />
                {t.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
