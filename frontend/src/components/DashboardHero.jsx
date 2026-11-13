import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const SUBTITLE = {
  'tenant-admin': "Let's keep your club active and growing.",
  'branch-manager': "Here is how your branch is doing today.",
  trainer: 'Here are your members and sessions.',
  'super-admin': 'Here is what is happening across your gyms.',
  'platform-admin': 'Here is what is happening across your gyms.',
};

// The welcome strip at the top of every dashboard. Drop a photo at frontend/public/images/dashboard-hero.jpg and
// it appears on the right, fading into the card; without one the strip is the gradient and the stripes alone.
export default function DashboardHero({ cta }) {
  const { user } = useAuth();
  const first = (user?.name || '').trim().split(/\s+/)[0] || 'there';
  return (
    <section className="relative overflow-hidden rounded-3xl border border-gray-200/80 bg-white shadow-sm dark:border-white/5 dark:bg-gray-800/80">
      <div aria-hidden="true" className="absolute inset-y-0 right-0 w-2/5 bg-cover bg-right opacity-0 grayscale dark:opacity-60" style={{ backgroundImage: "url('/images/dashboard-hero.jpg')" }} />
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-white via-white/80 to-transparent dark:from-gray-800 dark:via-gray-800/85 dark:to-transparent" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-10 h-56 w-16 rotate-[35deg] bg-gradient-to-b from-accent to-accent/0 opacity-80" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-2 top-4 h-56 w-6 rotate-[35deg] bg-gradient-to-b from-accent to-accent/0 opacity-60" />
      <div className="relative px-6 py-6 sm:px-8 sm:py-7">
        <h1 className="text-2xl font-extrabold tracking-tight text-gray-900 dark:text-white sm:text-3xl">
          Welcome back, <span className="text-green-700 dark:text-accent">{first}!</span>
        </h1>
        <p className="mt-1 text-gray-600 dark:text-gray-300">{SUBTITLE[user?.role] || ''}</p>
        {cta && (
          <Link to={cta.to} className="mt-4 inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2 text-sm font-bold text-accent-ink shadow-[0_8px_24px_-10px_rgb(var(--accent)/0.9)] hover:brightness-110">
            {cta.label} <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        )}
      </div>
    </section>
  );
}
