import { useId } from 'react';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';

// A tiny trend line with no axes, to sit beside a number.
export default function Sparkline({ data, color = '#C8F83A', className = 'h-12 w-28' }) {
  const id = `spark-${useId().replace(/[^a-zA-Z0-9]/g, '')}`;
  const points = data.map((v, i) => ({ i, v: Number(v) || 0 }));
  return (
    <div className={className} aria-hidden="true">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 4, right: 2, left: 2, bottom: 2 }}>
          <defs>
            <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor={color} stopOpacity={0.35} />
              <stop offset="1" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#${id})`} isAnimationActive={false} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
