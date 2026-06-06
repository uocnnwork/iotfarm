import React, { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import {
  LineChart,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  CartesianGrid,
} from 'recharts';
import { buildCompareChartData, getCompareSeries } from '@/lib/sensorChartData';
import { SENSOR_NODE_CHART_COLORS } from '@/config/greenhouse';

const CHART_HEIGHT = 120;

export default function CompareMiniChart({ historiesByNode, title, dataKey, unit }) {
  const series = useMemo(() => getCompareSeries(), []);
  const chartData = useMemo(
    () => buildCompareChartData(historiesByNode, dataKey),
    [historiesByNode, dataKey],
  );

  const hasEnoughPoints = chartData.some((point) =>
    series.some((s) => point[s.label] != null),
  ) && chartData.length > 1;

  return (
    <Card className="p-5 border-0 shadow-sm">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
        {title}
      </h3>
      {hasEnoughPoints ? (
        <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
          <LineChart data={chartData} margin={{ top: 5, right: 8, left: -10, bottom: 5 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} vertical={false} />
            <XAxis dataKey="time" hide />
            <YAxis
              domain={['auto', 'auto']}
              tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }}
              tickLine={false}
              axisLine={false}
              width={36}
            />
            <Tooltip
              contentStyle={{
                background: 'hsl(var(--card))',
                border: '1px solid hsl(var(--border))',
                borderRadius: '0.5rem',
                fontSize: '12px',
              }}
              formatter={(v, name) => [`${v}${unit}`, name]}
            />
            <Legend
              wrapperStyle={{ fontSize: '11px', paddingTop: '4px' }}
              iconType="line"
            />
            {series.map(({ nodeId, label }) => (
              <Line
                key={nodeId}
                type="monotone"
                dataKey={label}
                name={label}
                stroke={SENSOR_NODE_CHART_COLORS[nodeId]}
                strokeWidth={2}
                dot={false}
                isAnimationActive={false}
                connectNulls
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      ) : (
        <div
          className="flex items-center justify-center text-sm text-muted-foreground"
          style={{ height: CHART_HEIGHT }}
        >
          Chưa có dữ liệu
        </div>
      )}
    </Card>
  );
}
