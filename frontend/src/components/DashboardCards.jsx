import { Link } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import {
  Activity, ArrowDownRight, ArrowRight, ArrowUpRight, Bike, CalendarDays, Dumbbell, Flower2, HeartPulse, Music, Sparkles, Swords, TrendingUp, Trophy, Users, Waves,
} from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import Widget from './Widget';
import { trendOf } from './StatCard';
import Sparkline from './Sparkline';

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const compact = (n) => new Intl.NumberFormat('en-IN', { notation: 'compact', maximumFractionDigits: 1 }).format(n);

const INK = {
  light: { muted: '#7A8499', grid: '#E3E6EC', tooltip: '#FFFFFF', border: '#DDE1E8' },
  dark: { muted: '#A3ABBC', grid: '#242935', tooltip: '#1A1E26', border: '#2C3340' },
};

/** Money over the months as a filled line, with the total and the change since the month before. */
export function RevenueCard({ title = 'Revenue overview', icon, data = [], className = '' }) {
  const { theme } = useTheme();
  const ink = INK[theme];
  const values = data.map((d) => d.amount);
  const total = values.reduce((s, n) => s + n, 0);
  const change = trendOf(values);
  return (
    <Widget title={title} icon={icon} action={<span className="rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-600 dark:border-white/10 dark:text-gray-300">Last {data.length} months</span>} className={className} bodyClassName="relative flex flex-col overflow-hidden">
      <div className="px-4">
        <p className="text-3xl font-extrabold tracking-tight text-gray-900 dark:text-white">{inr(total)}</p>
        {change !== null && (
          <p className={`flex items-center gap-1 text-sm ${change >= 0 ? 'text-green-600 dark:text-accent' : 'text-red-500 dark:text-red-400'}`}>
            <ArrowUpRight className={`h-4 w-4 ${change < 0 ? 'rotate-90' : ''}`} aria-hidden="true" />
            {Math.abs(change)}% <span className="text-gray-500 dark:text-gray-400">vs the month before</span>
          </p>
        )}
      </div>
      <div className="relative min-h-0 flex-1 px-1 pb-2 pt-2">
        <div className="absolute inset-0 px-1 pb-2 pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 14, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="rev-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0" stopColor="#C8F83A" stopOpacity={0.35} />
                  <stop offset="1" stopColor="#C8F83A" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke={ink.grid} />
              <XAxis dataKey="month" tick={{ fill: ink.muted, fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: ink.muted, fontSize: 12 }} axisLine={false} tickLine={false} tickFormatter={compact} width={44} />
              <Tooltip contentStyle={{ background: ink.tooltip, border: `1px solid ${ink.border}`, borderRadius: 12, fontSize: 12 }} formatter={(v) => [inr(v), 'Collected']} />
              <Area type="monotone" dataKey="amount" stroke="#C8F83A" strokeWidth={2.5} fill="url(#rev-fill)" dot={{ r: 3, fill: '#C8F83A', stroke: '#0B0E13', strokeWidth: 1 }} activeDot={{ r: 5 }} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </Widget>
  );
}

/** Active against inactive members as a ring, with the share in the middle. */
export function MembershipDonut({ title = 'Membership', icon, active = 0, total = 0, className = '' }) {
  const inactive = Math.max(0, total - active);
  const pct = total ? Math.round((active / total) * 100) : 0;
  const { theme } = useTheme();
  const track = theme === 'dark' ? '#343A48' : '#DDE1E8';
  const rows = [
    { label: 'Active', value: active, color: '#C8F83A' },
    { label: 'Inactive', value: inactive, color: track },
  ];
  return (
    <Widget title={title} icon={icon || Users} className={className} bodyClassName="flex items-center gap-3 px-4 pb-4">
      <div className="relative h-28 w-28 shrink-0 xl:h-32 xl:w-32">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie data={total ? rows : [{ label: 'none', value: 1, color: track }]} dataKey="value" innerRadius="72%" outerRadius="100%" startAngle={90} endAngle={-270} stroke="none" isAnimationActive={false}>
              {(total ? rows : [{ color: track }]).map((r) => <Cell key={r.label || 'none'} fill={r.color} />)}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-extrabold text-gray-900 dark:text-white">{pct}%</span>
          <span className="text-[10px] text-gray-500 dark:text-gray-400">Active</span>
        </div>
      </div>
      <ul className="min-w-0 flex-1 space-y-3 text-xs xl:text-sm">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center justify-between gap-3">
            <span className="flex items-center gap-2 text-gray-600 dark:text-gray-300"><span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color }} />{r.label}</span>
            <span className="font-semibold text-gray-900 dark:text-gray-100">{r.value.toLocaleString('en-IN')}</span>
          </li>
        ))}
      </ul>
    </Widget>
  );
}

/** Four shortcuts to the things done most. */
export function QuickActions({ actions, className = '' }) {
  return (
    <Widget title="Quick actions" className={className} bodyClassName="grid grid-cols-2 gap-3 p-4 pt-1 content-start xl:grid-cols-4">
      {actions.map((a) => (
        <Link key={a.label} to={a.to} className="group flex flex-col items-center gap-2 rounded-2xl border border-gray-200 bg-gray-50 px-1.5 py-4 text-center text-xs font-medium text-gray-800 transition hover:border-accent/60 hover:bg-accent/10 dark:border-white/5 dark:bg-white/5 dark:text-gray-100">
          <a.icon className="h-6 w-6 text-green-700 dark:text-accent" aria-hidden="true" />
          {a.label}
        </Link>
      ))}
    </Widget>
  );
}

const clock = (d) => new Date(d).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
const dayLabel = (d) => {
  const day = new Date(d); const today = new Date();
  if (day.toDateString() === today.toDateString()) return 'Today';
  const tomorrow = new Date(today.getTime() + 86400000);
  return day.toDateString() === tomorrow.toDateString() ? 'Tomorrow' : day.toLocaleDateString([], { weekday: 'short', day: 'numeric', month: 'short' });
};

const ACTIVITY_ICONS = [
  [/swim|pool|aqua/i, Waves], [/yoga|pilates|stretch|meditat/i, Flower2], [/box|mma|karate|judo|martial|wrestl|taekwondo/i, Swords],
  [/zumba|dance|aerobic/i, Music], [/cycl|spin|bike/i, Bike], [/cardio|hiit|run|treadmill/i, HeartPulse],
  [/football|soccer|cricket|tennis|badminton|basket|volley|squash|sport/i, Trophy], [/gym|weight|strength|crossfit|lift|body/i, Dumbbell],
];
const activityIcon = (name) => ACTIVITY_ICONS.find(([re]) => re.test(name))?.[1] || Activity;

/** The next few scheduled classes, with how full each is. */
export function UpcomingBookings({ sessions = [], className = '' }) {
  return (
    <Widget title="Upcoming bookings" icon={CalendarDays} className={className} bodyClassName="px-4 pb-4">
      {sessions.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">No classes scheduled yet. Classes you schedule will show up here.</p>
      ) : (
        <ul className="space-y-3">
          {sessions.map((s) => {
            const Icon = activityIcon(s.name);
            const full = s.capacity && s.booked >= s.capacity;
            return (
              <li key={s.id} className="flex items-center gap-3">
                <div className="w-16 shrink-0 text-xs text-gray-500 dark:text-gray-400"><div className="font-semibold text-gray-800 dark:text-gray-200">{clock(s.startAt)}</div>{dayLabel(s.startAt)}</div>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-green-600/10 text-green-700 dark:bg-accent/15 dark:text-accent"><Icon className="h-5 w-5" aria-hidden="true" /></span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{s.name}</p>
                  <p className="truncate text-xs text-gray-500 dark:text-gray-400">{[s.branchName, s.capacity ? `${s.booked}/${s.capacity} booked` : `${s.booked} booked`].filter(Boolean).join(' • ')}</p>
                </div>
                <span className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold ${full ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400' : 'bg-green-600/10 text-green-700 dark:bg-accent/15 dark:text-accent'}`}>{full ? 'Full' : 'Open'}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Widget>
  );
}

/** The activities the gym offers, as tiles. */
export function SportsActivities({ activities = [], className = '' }) {
  return (
    <Widget title="Sports activities" icon={Trophy} className={className} bodyClassName="p-4 pt-1">
      {activities.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">No activities set up yet. Add class types and they will appear here.</p>
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {activities.map((a) => {
            const Icon = activityIcon(a.name);
            return (
              <div key={a.id} className="flex flex-col items-center gap-2 rounded-2xl border border-gray-200 bg-gray-50 px-2 py-4 text-center text-xs font-medium text-gray-800 dark:border-white/5 dark:bg-white/5 dark:text-gray-100">
                <Icon className="h-6 w-6 text-green-700 dark:text-accent" aria-hidden="true" />
                <span className="line-clamp-2 break-words">{a.name}</span>
              </div>
            );
          })}
        </div>
      )}
    </Widget>
  );
}

/** The "take your club to the next level" card. Its button opens Billing, where the owner picks a plan and pays. */
export function UpgradeCard({ daysLeft, className = '' }) {
  return (
    <section className={`relative flex h-80 flex-col justify-between overflow-hidden rounded-3xl border border-gray-200/80 bg-white p-5 shadow-sm dark:border-white/5 dark:bg-gray-800/80 ${className}`}>
      <div aria-hidden="true" className="absolute inset-0 bg-contain bg-bottom bg-no-repeat opacity-80" style={{ backgroundImage: "url('/images/hero-dumbbell.svg')" }} />
      <div className="relative">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-green-700 dark:text-accent"><Sparkles className="h-4 w-4" aria-hidden="true" /> {daysLeft} day{daysLeft === 1 ? '' : 's'} left in your trial</p>
        <h3 className="mt-2 text-xl font-extrabold leading-tight text-gray-900 dark:text-white">Take your club to the next level</h3>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-300">Unlock more members and keep everything running for your gym.</p>
      </div>
      <Link to="/billing" className="relative inline-flex w-fit items-center gap-2 rounded-full bg-accent px-5 py-2 text-sm font-bold text-accent-ink hover:brightness-110">
        Choose a plan <ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    </section>
  );
}

const medals = ['text-amber-500', 'text-gray-400', 'text-orange-700'];

/** Which membership plans are selling: paid memberships per plan this month against last month, with the six-month line. */
export function PlansTrending({ plans = [], className = '' }) {
  return (
    <Widget title="Plans trending" icon={TrendingUp} className={className} action={<span className="rounded-full border border-gray-200 px-3 py-1 text-xs text-gray-600 dark:border-white/10 dark:text-gray-300">This month</span>} bodyClassName="px-4 pb-4">
      {plans.length === 0 ? (
        <p className="py-8 text-center text-sm text-gray-500 dark:text-gray-400">No plan sales yet. When members join or renew, the plans that sell best show up here.</p>
      ) : (
        <ol className="space-y-3">
          {plans.map((p, i) => {
            const up = p.change !== null && p.change >= 0;
            return (
              <li key={p.planId} className="flex items-center gap-3">
                <span className={`w-5 text-center text-sm font-extrabold ${medals[i] || 'text-gray-400'}`}>{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-gray-900 dark:text-gray-100">{p.name}</p>
                  <p className="truncate text-xs text-gray-500 dark:text-gray-400">{p.thisMonth} sale{p.thisMonth === 1 ? '' : 's'} · {p.activeMembers} active member{p.activeMembers === 1 ? '' : 's'}{p.revenueThisMonth > 0 ? ` · ${inr(p.revenueThisMonth)}` : ''}</p>
                </div>
                <Sparkline data={p.series} color={p.change !== null && p.change < 0 ? '#FF6B7A' : '#C8F83A'} className="h-9 w-16 shrink-0" />
                <span className={`flex w-14 shrink-0 items-center justify-end gap-0.5 text-xs font-semibold ${p.isNew ? 'text-blue-600 dark:text-[#7AA2FF]' : p.change === null ? 'text-gray-400' : up ? 'text-green-600 dark:text-accent' : 'text-red-500 dark:text-red-400'}`}>
                  {p.isNew ? 'New' : p.change === null ? '—' : <>{up ? <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" /> : <ArrowDownRight className="h-3.5 w-3.5" aria-hidden="true" />}{Math.abs(p.change)}%</>}
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </Widget>
  );
}
