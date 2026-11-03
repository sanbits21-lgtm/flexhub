import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useTheme } from '../context/ThemeContext';
import Widget from './Widget';

const CHART_INK = {
  light: { muted: '#898781', grid: '#e1e0d9', axis: '#c3c2b7', tooltipBg: '#ffffff', secondary: '#52514e', cursor: '#f9f9f7' },
  dark: { muted: '#A3ABBC', grid: '#242935', axis: '#343A48', tooltipBg: '#1A1E26', secondary: '#D5DAE3', cursor: '#1A1E26' },
};
export const BAR_COLORS = {
  blue: { light: '#2a78d6', dark: '#7AA2FF' },
  aqua: { light: '#1baf7a', dark: '#C8F83A' },
  violet: { light: '#4a3aa7', dark: '#A596FF' },
};

export default function BarChartCard({ title, data, dataKey, xKey = 'month', colorKey = 'blue', valueFormatter, height = 220, fill = false, className = '' }) {
  const { theme } = useTheme();
  const ink = CHART_INK[theme];
  const color = BAR_COLORS[colorKey][theme];
  const fmt = valueFormatter || ((v) => v);
  const chart = (
    <ResponsiveContainer width="100%" height={fill ? '100%' : height}>
        <BarChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={ink.grid} />
          <XAxis dataKey={xKey} tick={{ fill: ink.muted, fontSize: 12 }} axisLine={{ stroke: ink.axis }} tickLine={false} />
          <YAxis tick={{ fill: ink.muted, fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} tickFormatter={fmt} width={48} />
          <Tooltip
            cursor={{ fill: ink.cursor }}
            contentStyle={{ background: ink.tooltipBg, border: `1px solid ${ink.grid}`, borderRadius: 6, fontSize: 12 }}
            labelStyle={{ color: ink.secondary }}
            formatter={(value) => [fmt(value), title]}
          />
          <Bar dataKey={dataKey} fill={color} radius={[4, 4, 0, 0]} maxBarSize={24} />
        </BarChart>
      </ResponsiveContainer>
  );
  if (!fill) {
    return (
      <div className="bg-white dark:bg-gray-800 dark:border dark:border-gray-700 rounded-2xl shadow p-4">
        <h3 className="text-sm text-gray-500 dark:text-gray-400 mb-3">{title}</h3>
        {chart}
      </div>
    );
  }
  // fill: sized by the surrounding Widget. The absolutely-positioned box gives
  // ResponsiveContainer a definite pixel height to measure; "100%" inside a flex item
  // does not reliably resolve.
  return (
    <Widget title={title} className={className} bodyClassName="relative overflow-hidden">
      <div className="absolute inset-0 px-2 pb-2">{chart}</div>
    </Widget>
  );
}
