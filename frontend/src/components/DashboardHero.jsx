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
// it appears on the right, fading into the card; without one the bundled dumbbell artwork (hero-dumbbell.svg) shows instead.
export default function DashboardHero({ cta }) {
  const { user } = useAuth();
  const first = (user?.name || '').trim().split(/\s+/)[0] || 'there';
  return (
    <section className="relative overflow-hidden rounded-3xl border border-[#E4F3DC] bg-gradient-to-r from-[#F1FAEA] via-[#F6FCF5] to-[#EAF8E1] shadow-[0_8px_28px_-14px_rgba(30,41,59,0.16)] dark:border-white/5 dark:bg-none dark:bg-gray-800/80 dark:shadow-sm">
      <img aria-hidden="true" alt="" src="/images/hero-light.jpg" className="pointer-events-none absolute inset-y-0 right-0 hidden h-full w-auto max-w-[62%] object-cover object-right [-webkit-mask-image:linear-gradient(to_right,transparent,black_32%)] [mask-image:linear-gradient(to_right,transparent,black_32%)] sm:block dark:hidden" />
      <div aria-hidden="true" className="absolute inset-y-0 right-0 w-3/5 opacity-0 dark:opacity-90" style={{ backgroundImage: "url('/images/dashboard-hero.jpg'), url('/images/hero-dumbbell.svg')", backgroundSize: 'cover, contain', backgroundPosition: 'right center, right center', backgroundRepeat: 'no-repeat' }} />
      <div aria-hidden="true" className="absolute inset-0 bg-gradient-to-r from-[#F1FAEA] via-[#F1FAEA]/70 to-transparent dark:from-gray-800 dark:via-gray-800/85 dark:to-transparent" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-10 -top-10 hidden h-56 w-16 rotate-[35deg] bg-gradient-to-b from-accent to-accent/0 opacity-80 dark:block" />
      <div aria-hidden="true" className="pointer-events-none absolute -right-2 top-4 hidden h-56 w-6 rotate-[35deg] bg-gradient-to-b from-accent to-accent/0 opacity-60 dark:block" />
      <div className="relative px-6 py-7 dark:py-6 sm:px-9 sm:py-9 dark:sm:px-8 dark:sm:py-7">
        <h1 className="text-2xl font-extrabold tracking-tight text-gray-900 dark:text-white sm:text-4xl dark:sm:text-3xl">
          Welcome back, <span className="text-accent-strong dark:text-accent">{first}!</span>
        </h1>
        <p className="mt-1.5 text-gray-600 dark:mt-1 dark:text-gray-300 sm:text-lg dark:sm:text-base">{SUBTITLE[user?.role] || ''}</p>
        {cta && (
          <Link to={cta.to} className="mt-5 inline-flex items-center gap-2 rounded-full bg-accent-strong dark:bg-accent px-6 py-2.5 text-sm font-bold text-white dark:mt-4 dark:px-5 dark:py-2 dark:text-accent-ink dark:shadow-[0_8px_24px_-10px_rgb(var(--accent)/0.9)] hover:brightness-110 sm:text-base dark:sm:text-sm">
            {cta.label} <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        )}
      </div>
    </section>
  );
}
