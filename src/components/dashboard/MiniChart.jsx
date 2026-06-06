import React from 'react';
import { Card } from '@/components/ui/card';
import { AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { format } from 'date-fns';

const CHART_HEIGHT = 120;

export default function MiniChart({ data, title, dataKey, color, unit }) {
  // API trả về sensor data theo created_at DESC (newest first).
  // Lấy 20 bản ghi mới nhất rồi reverse để chart đọc oldest -> newest từ trái sang phải.
  // Chỉ giữ những điểm có giá trị hợp lệ cho dataKey để tránh đường line đứt/tụt 0.
  const chartData = (Array.isArray(data) ? data : [])
    .slice(0, 20)
    .filter((d) => d?.[dataKey] != null && Number.isFinite(Number(d[dataKey])))
    .reverse()
    .map((d) => ({
      time: d.created_date ? format(new Date(d.created_date), 'HH:mm') : '',
      value: Number(d[dataKey]),
    }));

  const latestValue = chartData.length > 0 ? chartData[chartData.length - 1].value : null;

  return (
    <Card className="p-5 border-0 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">{title}</h3>
        {latestValue != null && (
          <span className="text-lg font-bold">
            {latestValue}{unit}
          </span>
        )}
      </div>
      {chartData.length > 1 ? (
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <AreaChart data={chartData} margin={{ top: 5, right: 8, left: -10, bottom: 5 }}>
            <defs>
              <linearGradient id={`gradient-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity={0.3} />
                <stop offset="100%" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} vertical={false} />
            <XAxis dataKey="time" hide />
            <YAxis
              domain={['auto', 'auto']}
              tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              tickLine={false}
              axisLine={false}
              width={36}
              tickFormatter={(v) => `${v}`}
            />
            <Tooltip
              contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '0.5rem', fontSize: '12px' }}
              formatter={(v) => [`${v}${unit}`, title]}
            />
            <Area
              type="monotone"
              dataKey="value"
              stroke={color}
              strokeWidth={2}
              fill={`url(#gradient-${dataKey})`}
              dot={false}
              isAnimationActive={false}
              connectNulls
            />
          </AreaChart>
        </ResponsiveContainer>
      ) : (
        <div className="flex items-center justify-center text-sm text-muted-foreground" style={{ height: CHART_HEIGHT }}>
          Chưa có dữ liệu
        </div>
      )}
    </Card>
  );
}
