import React, { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { BarChart3, Download, Table } from "lucide-react";
import {
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import NodeSelector from "@/components/dashboard/NodeSelector";
import { sensorService } from "@/services/sensorService";
import HistorySensorTable from "@/components/history/HistorySensorTable";
import {
  buildCompareChartDataFromRows,
  buildSingleNodeChartData,
  getCompareSeries,
} from "@/lib/sensorChartData";
import {
  DASHBOARD_VIEW_ALL,
  EXPECTED_SENSOR_NODES,
  filterHistoryForView,
  getNodeLabel,
  isDashboardSensorNode,
  SENSOR_NODE_CHART_COLORS,
} from "@/config/greenhouse";

const METRICS = [
  { key: "temperature", label: "Nhiệt độ", unit: "°C", stroke: "#ef4444", fill: "#fecaca" },
  { key: "humidity", label: "Độ ẩm KK", unit: "%", stroke: "#3b82f6", fill: "#bfdbfe" },
  { key: "soil_moisture", label: "Độ ẩm đất", unit: "%", stroke: "#22c55e", fill: "#bbf7d0" },
  { key: "light", label: "Ánh sáng", unit: "lux", stroke: "#eab308", fill: "#fef08a" },
];

const CHART_HEIGHT = 300;
const HISTORY_LIMIT = 100;
const DAILY_STATS_SKELETON_ROWS = 4;

function getCreatedAt(item) {
  return item?.created_at || item?.created_date || null;
}

function getNodeId(item) {
  return item?.node_id ?? item?.nodeId ?? null;
}

function formatNumber(value) {
  if (value == null || value === "") return "--";
  const number = Number(value);
  if (!Number.isFinite(number)) return "--";
  return Number.isInteger(number) ? number.toString() : number.toFixed(1);
}

function formatDateOnly(value) {
  if (!value) return "--";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-");
    return `${day}/${month}/${year}`;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return format(date, "dd/MM/yyyy");
}

function toDateFilter(value, endOfDay = false) {
  if (!value) return "";
  return `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}`;
}

function escapeCsvValue(value) {
  if (value == null) return "";
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map(escapeCsvValue).join(",")).join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function ChartTooltip({ active, payload, metric }) {
  if (!active || !payload || payload.length === 0) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  return (
    <div className="rounded-md border bg-popover text-popover-foreground shadow-sm px-3 py-2 text-xs">
      <div className="text-muted-foreground">
        {point.fullTime ? format(new Date(point.fullTime), "dd/MM/yyyy HH:mm:ss") : ""}
      </div>
      <div className="font-semibold mt-1">
        {metric.label}: {formatNumber(point.value)}
        {metric.unit ? ` ${metric.unit}` : ""}
      </div>
    </div>
  );
}

function CompareChartTooltip({ active, payload, metric }) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  return (
    <div className="rounded-md border bg-popover text-popover-foreground shadow-sm px-3 py-2 text-xs space-y-1">
      <div className="text-muted-foreground">{point.time || ""}</div>
      {payload.map((entry) => (
        <div key={entry.dataKey} className="font-semibold" style={{ color: entry.color }}>
          {entry.name}: {formatNumber(entry.value)}
          {metric.unit ? ` ${metric.unit}` : ""}
        </div>
      ))}
    </div>
  );
}

export default function History() {
  const [viewMode, setViewMode] = useState(DASHBOARD_VIEW_ALL);
  const [metricKey, setMetricKey] = useState("temperature");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const isCompareView = viewMode === DASHBOARD_VIEW_ALL;
  const metric = METRICS.find((m) => m.key === metricKey) || METRICS[0];
  const compareSeries = useMemo(() => getCompareSeries(), []);

  const filters = useMemo(
    () => ({
      from: toDateFilter(fromDate),
      to: toDateFilter(toDate, true),
    }),
    [fromDate, toDate],
  );

  const { data: history = [], isLoading } = useQuery({
    queryKey: ["sensorData", "history", HISTORY_LIMIT, viewMode, filters.from, filters.to],
    queryFn: () =>
      sensorService.listHistory({
        limit: HISTORY_LIMIT,
        from: filters.from,
        to: filters.to,
        node_id: viewMode,
      }),
    refetchOnMount: "always",
    refetchInterval: 5000,
  });

  const { data: dailyStats = [], isLoading: isDailyStatsLoading } = useQuery({
    queryKey: ["sensorData", "stats", "daily", viewMode, filters.from, filters.to],
    queryFn: () =>
      sensorService.dailyStats({
        from: filters.from,
        to: filters.to,
        node_id: viewMode,
      }),
    enabled: !isCompareView,
    refetchOnMount: "always",
    refetchInterval: 10000,
  });

  const filteredHistory = useMemo(
    () => filterHistoryForView(history, viewMode),
    [history, viewMode],
  );

  const tableHistory = useMemo(() => {
    return [...filteredHistory].sort((a, b) => {
      const ta = new Date(getCreatedAt(a) || 0).getTime();
      const tb = new Date(getCreatedAt(b) || 0).getTime();
      return tb - ta;
    });
  }, [filteredHistory]);

  const tableHistoryByNode = useMemo(() => {
    const map = Object.fromEntries(EXPECTED_SENSOR_NODES.map((id) => [id, []]));
    for (const row of filteredHistory) {
      const nodeId = getNodeId(row);
      if (map[nodeId]) {
        map[nodeId].push(row);
      }
    }
    for (const nodeId of EXPECTED_SENSOR_NODES) {
      map[nodeId].sort((a, b) => {
        const ta = new Date(getCreatedAt(a) || 0).getTime();
        const tb = new Date(getCreatedAt(b) || 0).getTime();
        return tb - ta;
      });
    }
    return map;
  }, [filteredHistory]);

  const singleChartData = useMemo(() => {
    if (isCompareView) return [];
    return buildSingleNodeChartData(filteredHistory, metric.key, HISTORY_LIMIT);
  }, [filteredHistory, isCompareView, metric.key]);

  const compareChartData = useMemo(() => {
    if (!isCompareView) return [];
    return buildCompareChartDataFromRows(filteredHistory, metric.key, undefined, HISTORY_LIMIT);
  }, [filteredHistory, isCompareView, metric.key]);

  const chartTitle = useMemo(() => {
    if (isCompareView) {
      return `So sánh ${metric.label} theo khu vực`;
    }
    return `Lịch sử ${metric.label} - ${getNodeLabel(viewMode)}`;
  }, [isCompareView, metric.label, viewMode]);

  const hasChartData = isCompareView
    ? compareChartData.length > 1
      && compareSeries.some((s) => compareChartData.some((point) => point[s.label] != null))
    : singleChartData.length > 1;

  const handleExportCsv = () => {
    const rows = [
      ["time", "node_id", "khu_vuc", "temperature", "humidity", "soil_moisture", "light"],
      ...tableHistory.map((item) => {
        const nodeId = getNodeId(item);
        return [
          getCreatedAt(item) || "",
          nodeId || "",
          isDashboardSensorNode(nodeId) ? getNodeLabel(nodeId) : "",
          item.temperature ?? "",
          item.humidity ?? "",
          item.soil_moisture ?? "",
          item.light ?? "",
        ];
      }),
    ];

    const rangeLabel = fromDate || toDate ? `${fromDate || "start"}_${toDate || "now"}` : "latest";
    const nodeLabel = isCompareView ? "all" : viewMode;
    downloadCsv(`greenhouse_sensor_history_${nodeLabel}_${rangeLabel}.csv`, rows);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Lịch sử cảm biến</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Theo dõi dữ liệu môi trường đã ghi nhận
          </p>
        </div>
        <NodeSelector value={viewMode} onChange={setViewMode} />
      </div>

      <Card className="p-5 border-0 shadow-sm">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <div>
            <Label htmlFor="history-from">Từ ngày</Label>
            <Input
              id="history-from"
              type="date"
              value={fromDate}
              onChange={(event) => setFromDate(event.target.value)}
              max={toDate || undefined}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="history-to">Đến ngày</Label>
            <Input
              id="history-to"
              type="date"
              value={toDate}
              onChange={(event) => setToDate(event.target.value)}
              min={fromDate || undefined}
              className="mt-1"
            />
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setFromDate("");
                setToDate("");
              }}
              disabled={!fromDate && !toDate}
            >
              Xóa lọc
            </Button>
            <Button
              type="button"
              onClick={handleExportCsv}
              disabled={isLoading || filteredHistory.length === 0}
            >
              <Download className="w-4 h-4" />
              Xuất CSV
            </Button>
          </div>
        </div>
      </Card>

      <Card className="p-5 border-0 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
          <h2 className="text-base font-semibold">{chartTitle}</h2>
          <div className="w-full sm:w-56">
            <Select value={metricKey} onValueChange={setMetricKey}>
              <SelectTrigger>
                <SelectValue placeholder="Chọn chỉ số" />
              </SelectTrigger>
              <SelectContent>
                {METRICS.map((m) => (
                  <SelectItem key={m.key} value={m.key}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {isLoading ? (
          <div
            className="flex items-center justify-center text-sm text-muted-foreground animate-pulse"
            style={{ height: CHART_HEIGHT }}
          >
            Đang tải dữ liệu...
          </div>
        ) : hasChartData ? (
          <ResponsiveContainer width="100%" height={CHART_HEIGHT}>
            {isCompareView ? (
              <LineChart data={compareChartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="time"
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={24}
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  domain={["auto", "auto"]}
                  width={40}
                />
                <Tooltip content={<CompareChartTooltip metric={metric} />} />
                <Legend wrapperStyle={{ fontSize: "12px" }} iconType="line" />
                {compareSeries.map(({ nodeId, label }) => (
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
            ) : (
              <AreaChart data={singleChartData} margin={{ top: 10, right: 16, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={`history-${metric.key}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={metric.fill} stopOpacity={0.85} />
                    <stop offset="100%" stopColor={metric.fill} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis
                  dataKey="time"
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  minTickGap={24}
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  domain={["auto", "auto"]}
                  width={40}
                />
                <Tooltip content={<ChartTooltip metric={metric} />} />
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={metric.stroke}
                  strokeWidth={2}
                  fill={`url(#history-${metric.key})`}
                  dot={false}
                  isAnimationActive={false}
                  connectNulls
                />
              </AreaChart>
            )}
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

      {!isCompareView ? (
        <Card className="p-5 border-0 shadow-sm">
          <div className="flex items-center gap-2 mb-4">
            <BarChart3 className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">
              Thống kê theo ngày — {getNodeLabel(viewMode)}
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b">
                  <th className="px-3 py-2.5">Ngày</th>
                  <th className="px-3 py-2.5">Nhiệt độ TB</th>
                  <th className="px-3 py-2.5">Độ ẩm TB</th>
                  <th className="px-3 py-2.5">Đất TB</th>
                  <th className="px-3 py-2.5">Ánh sáng TB</th>
                </tr>
              </thead>
              <tbody>
                {isDailyStatsLoading ? (
                  Array.from({ length: DAILY_STATS_SKELETON_ROWS }).map((_, idx) => (
                    <tr key={`daily-skeleton-${idx}`} className="border-b last:border-b-0 animate-pulse">
                      {Array.from({ length: 5 }).map((__, cellIdx) => (
                        <td key={cellIdx} className="px-3 py-3">
                          <div className="h-3 rounded bg-muted/70" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : dailyStats.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                      Chưa có dữ liệu thống kê
                    </td>
                  </tr>
                ) : (
                  dailyStats.map((item) => (
                    <tr key={item.date} className="border-b last:border-b-0 transition-colors hover:bg-muted/50">
                      <td className="px-3 py-2.5 text-muted-foreground whitespace-nowrap">
                        {formatDateOnly(item.date)}
                      </td>
                      <td className="px-3 py-2.5 font-medium">{formatNumber(item.avg_temperature)} °C</td>
                      <td className="px-3 py-2.5 font-medium">{formatNumber(item.avg_humidity)} %</td>
                      <td className="px-3 py-2.5 font-medium">{formatNumber(item.avg_soil_moisture)} %</td>
                      <td className="px-3 py-2.5 font-medium">{formatNumber(item.avg_light)} lux</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <Card className="p-5 border-0 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <Table className="w-4 h-4 text-muted-foreground" />
          <h2 className="text-base font-semibold">Bảng dữ liệu</h2>
        </div>

        {isCompareView ? (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {EXPECTED_SENSOR_NODES.map((nodeId) => (
              <HistorySensorTable
                key={nodeId}
                title={getNodeLabel(nodeId)}
                rows={tableHistoryByNode[nodeId]}
                isLoading={isLoading}
              />
            ))}
          </div>
        ) : (
          <HistorySensorTable rows={tableHistory} isLoading={isLoading} />
        )}
      </Card>
    </div>
  );
}
