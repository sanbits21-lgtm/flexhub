import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { useTheme } from '../context/ThemeContext';

const CHART_INK = {
  light: { muted: '#898781', grid: '#e1e0d9', axis: '#c3c2b7', tooltipBg: '#ffffff', secondary: '#52514e', cursor: '#f9f9f7' },
  dark: { muted: '#9ca3af', grid: '#374151', axis: '#4b5563', tooltipBg: '#1f2937', secondary: '#d1d5db', cursor: '#374151' },
};
export const BAR_COLORS = {
  blue: { light: '#2a78d6', dark: '#3987e5' },
  aqua: { light: '#1baf7a', dark: '#199e70' },
  violet: { light: '#4a3aa7', dark: '#9085e9' },
};

export default function BarChartCard({ title, data, dataKey, xKey = 'month', colorKey = 'blue', valueFormatter, height = 220 }) {
  const { theme } = useTheme();
  const ink = CHART_INK[theme];
  const color = BAR_COLORS[colorKey][theme];
  const fmt = valueFormatter || ((v) => v);
  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
      <h3 className="text-sm text-gray-500 dark:text-gray-400 mb-3">{title}</h3>
      <ResponsiveContainer width="100%" height={height}>
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
    </div>
  );
}
