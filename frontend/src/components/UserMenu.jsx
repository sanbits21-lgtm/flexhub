import { useEffect, useRef, useState } from 'react';
import { Camera, ChevronDown, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import StaffAvatar from './StaffAvatar';
import ProfilePhotoModal from './ProfilePhotoModal';
import ThemeToggle from './ThemeToggle';

const ROLE_LABEL = { 'super-admin': 'Owner', 'platform-admin': 'Platform admin', 'tenant-admin': 'Admin', 'branch-manager': 'Branch manager', trainer: 'Trainer' };
const initialsOf = (name = '') => name.trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase() || '?';

// The signed-in person: who they are, change your photo, switch theme, log out. Used twice: as a card at
// the foot of the sidebar (`variant="card"`) and as a round avatar in the top bar (`variant="avatar"`).
export default function UserMenu({ variant = 'avatar', placement = 'bottom' }) {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [photoOpen, setPhotoOpen] = useState(false);
  const box = useRef(null);
  const canHavePhoto = ['tenant-admin', 'branch-manager', 'trainer'].includes(user?.role);

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const esc = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc); };
  }, [open]);

  if (!user) return null;
  const role = ROLE_LABEL[user.role] || user.role;
  const avatar = canHavePhoto && user.hasPhoto
    ? <StaffAvatar userId={user._id} hasPhoto name={user.name} size={variant === 'card' ? 40 : 36} />
    : <span aria-hidden="true" className="inline-flex shrink-0 items-center justify-center rounded-full bg-accent font-bold text-accent-ink" style={{ width: variant === 'card' ? 40 : 36, height: variant === 'card' ? 40 : 36, fontSize: 14 }}>{initialsOf(user.name)}</span>;

  return (
    <div ref={box} className="relative">
      {variant === 'card' ? (
        <button type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} className="flex w-full items-center gap-3 rounded-2xl border border-white/10 bg-white/5 p-2.5 text-left hover:bg-white/10">
          {avatar}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-gray-100">{user.name}</span>
            <span className="block truncate text-xs text-gray-400">{role}</span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-gray-400" aria-hidden="true" />
        </button>
      ) : (
        <button type="button" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} aria-label="Account menu" className="flex items-center gap-1 rounded-full p-0.5 hover:bg-gray-200 dark:hover:bg-white/10">
          {avatar}
          <ChevronDown className="mr-1 h-4 w-4 text-gray-500 dark:text-gray-400" aria-hidden="true" />
        </button>
      )}
      {open && (
        <div role="menu" className={`absolute z-50 w-60 overflow-hidden rounded-2xl border border-gray-200 bg-white p-1.5 shadow-2xl dark:border-white/10 dark:bg-gray-800 ${placement === 'top' ? 'bottom-full left-0 mb-2' : 'right-0 top-full mt-2'}`}>
          <div className="px-3 py-2">
            <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{user.name}</p>
            <p className="truncate text-xs text-gray-500 dark:text-gray-400">{user.email} · {role}</p>
          </div>
          <div className="my-1 h-px bg-gray-200 dark:bg-white/10" />
          {canHavePhoto && (
            <button type="button" role="menuitem" onClick={() => { setOpen(false); setPhotoOpen(true); }} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-white/10">
              <Camera className="h-4 w-4" aria-hidden="true" /> {user.hasPhoto ? 'Change photo' : 'Add a photo'}
            </button>
          )}
          <div className="flex items-center justify-between px-3 py-1 text-sm text-gray-700 dark:text-gray-200">
            <span>Theme</span>
            <ThemeToggle className="text-gray-500 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-white/10" />
          </div>
          <button type="button" role="menuitem" onClick={logout} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-400/10">
            <LogOut className="h-4 w-4" aria-hidden="true" /> Log out
          </button>
        </div>
      )}
      {canHavePhoto && <ProfilePhotoModal open={photoOpen} onClose={() => setPhotoOpen(false)} />}
    </div>
  );
}
