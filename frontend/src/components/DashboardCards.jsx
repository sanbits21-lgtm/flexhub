import { Link } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ArrowUpRight, Users } from 'lucide-react';
import { useTheme } from '../context/ThemeContext';
import Widget from './Widget';
import { trendOf } from './StatCard';

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
    <Widget title="Quick actions" className={className} bodyClassName="grid grid-cols-2 gap-3 p-4 pt-1 content-start">
      {actions.map((a) => (
        <Link key={a.label} to={a.to} className="group flex flex-col items-center gap-2 rounded-2xl border border-gray-200 bg-gray-50 px-2 py-4 text-center text-sm font-medium text-gray-800 transition hover:border-accent/60 hover:bg-accent/10 dark:border-white/5 dark:bg-white/5 dark:text-gray-100">
          <a.icon className="h-6 w-6 text-green-700 dark:text-accent" aria-hidden="true" />
          {a.label}
        </Link>
      ))}
    </Widget>
  );
}
