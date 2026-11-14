import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import BrandLogo from '../BrandLogo';
import ThemeToggle from '../ThemeToggle';
import { useBrand } from '../../context/BrandContext';

// The frame every signed-out page shares: a dark gym backdrop with diagonal accent stripes, and a
// frosted card. Drop a photo at frontend/public/images/auth-bg.jpg and it appears behind the card;
// without it the backdrop is the gradient alone (a missing image is simply not drawn).
//
// On a gym's own address (iron.example.com) the card carries that gym's name and logo, because it is
// their login page; everywhere else it is the FitzyClub mark.
export default function AuthShell({ children, wide = false }) {
  const { brand } = useBrand();
  return (
    <div className="relative min-h-screen overflow-hidden bg-gray-100 dark:bg-gray-900">
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-cover bg-center opacity-0 grayscale dark:opacity-40"
        style={{ backgroundImage: "url('/images/auth-bg.jpg')" }}
      />
      <div aria-hidden="true" className="absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,rgb(var(--accent)/0.12),transparent_45%),radial-gradient(circle_at_90%_95%,rgb(var(--accent)/0.10),transparent_40%)] dark:bg-gradient-to-b dark:from-gray-900/60 dark:via-gray-900/80 dark:to-gray-900" />
      {/* the stripes in the corners */}
      <div aria-hidden="true" className="pointer-events-none absolute -left-16 -top-20 h-72 w-24 -rotate-45 bg-gradient-to-b from-accent to-accent/0 opacity-90" />
      <div aria-hidden="true" className="pointer-events-none absolute -left-2 -top-24 h-72 w-8 -rotate-45 bg-gradient-to-b from-accent to-accent/0 opacity-70" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-24 -right-14 h-72 w-24 -rotate-45 bg-gradient-to-t from-accent to-accent/0 opacity-90" />
      <div aria-hidden="true" className="pointer-events-none absolute -bottom-28 right-6 h-72 w-8 -rotate-45 bg-gradient-to-t from-accent to-accent/0 opacity-70" />

      <div className="absolute right-4 top-4 z-10">
        <ThemeToggle className="text-gray-500 hover:bg-gray-200 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white" />
      </div>

      <div className="relative flex min-h-screen items-center justify-center p-4 py-10">
        <div className={`w-full ${wide ? 'max-w-2xl' : 'max-w-[28rem]'} rounded-3xl border border-gray-200 bg-white/90 p-6 shadow-2xl backdrop-blur-xl dark:border-white/10 dark:bg-gray-800/70 sm:p-8`}>
          <header className="mb-6 border-b border-gray-200 pb-5 dark:border-white/10">
            <BrandLogo size={brand?.customBrand ? 56 : 60} tagline />
            {brand && !brand.customBrand && <p className="mt-3 truncate text-sm text-gray-500 dark:text-gray-300">Sign in to <span className="font-semibold text-gray-800 dark:text-gray-100">{brand.name}</span></p>}
          </header>
          {children}
        </div>
      </div>
    </div>
  );
}

const inputBase = 'w-full rounded-2xl border border-gray-300 bg-white py-3 pl-11 text-base text-gray-900 placeholder:text-gray-400 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/40 dark:border-gray-600/70 dark:bg-gray-900/60 dark:text-gray-100';

/** A labelled field with its icon in front. Give `password` to get the show/hide eye. */
export function AuthField({ id, label, icon: Icon, password = false, ...input }) {
  const [shown, setShown] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
        {Icon && <Icon className="h-4 w-4 text-gray-400" aria-hidden="true" />}
        {label}
      </label>
      <div className="relative">
        {Icon && <Icon className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" aria-hidden="true" />}
        <input id={id} {...input} type={password ? (shown ? 'text' : 'password') : input.type} className={`${inputBase} ${password ? 'pr-12' : 'pr-4'}`} />
        {password && (
          <button
            type="button"
            onClick={() => setShown((v) => !v)}
            aria-label={shown ? 'Hide password' : 'Show password'}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-gray-400 hover:text-gray-700 dark:hover:text-gray-100"
          >
            {shown ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        )}
      </div>
    </div>
  );
}

/** The big accent button. */
export function AuthButton({ icon: Icon, children, ...props }) {
  return (
    <button
      {...props}
      className="flex w-full items-center justify-center gap-2 rounded-2xl bg-accent px-4 py-3.5 text-lg font-bold text-accent-ink shadow-[0_0_32px_-8px_rgb(var(--accent)/0.7)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {Icon && <Icon className="h-5 w-5" aria-hidden="true" />}
      {children}
    </button>
  );
}

/** A line of text with a rule on each side, like the "Forgot your password?" row. */
export function RuleText({ children }) {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="h-px flex-1 bg-gray-200 dark:bg-white/10" />
      {children}
      <span className="h-px flex-1 bg-gray-200 dark:bg-white/10" />
    </div>
  );
}

export const authLink = 'font-semibold text-green-700 underline underline-offset-2 hover:opacity-80 dark:text-accent';
