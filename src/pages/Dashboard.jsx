import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Thermometer, Droplets, CloudRain, Leaf, AlertTriangle, CheckCircle } from 'lucide-react';
import SensorCard from '@/components/dashboard/SensorCard';
import DeviceStatusBar from '@/components/dashboard/DeviceStatusBar';
import RecentAlerts from '@/components/dashboard/RecentAlerts';
import MiniChart from '@/components/dashboard/MiniChart';
import CompareMiniChart from '@/components/dashboard/CompareMiniChart';
import ActivityLog from '@/components/dashboard/ActivityLog';
import NodeSelector from '@/components/dashboard/NodeSelector';
import { Card } from '@/components/ui/card';
import { appClient } from '@/api/appClient';
import { alertService } from '@/services/alertService';
import { deviceService } from '@/services/deviceService';
import { getSensorWarning } from '@/services/alertRules';
import {
  DASHBOARD_VIEW_ALL,
  EXPECTED_SENSOR_NODES,
  mergeLatestByExpectedNodes,
  SENSOR_LABELS,
} from '@/config/greenhouse';
import { sensorService } from '@/services/sensorService';
import { cn } from '@/lib/utils';

const sensorCards = [
  { type: 'temperature', icon: Thermometer, label: SENSOR_LABELS.temperature, unit: '°C', color: 'bg-red-100 text-red-600' },
  { type: 'humidity', icon: Droplets, label: SENSOR_LABELS.humidity, unit: '%', color: 'bg-blue-100 text-blue-600' },
  { type: 'soil_moisture', icon: CloudRain, label: SENSOR_LABELS.soil_moisture, unit: '%', color: 'bg-emerald-100 text-emerald-600' },
];

const miniCharts = [
  { title: SENSOR_LABELS.temperature, dataKey: 'temperature', color: '#ef4444', unit: '°C' },
  { title: 'Độ ẩm không khí', dataKey: 'humidity', color: '#3b82f6', unit: '%' },
  { title: SENSOR_LABELS.soil_moisture, dataKey: 'soil_moisture', color: '#10b981', unit: '%' },
];

// Map sensor type → device IDs có thể khắc phục (theo node)
// pump khắc phục soil_moisture, mist khắc phục humidity, fan khắc phục temperature
function getRemedyDeviceIds(sensorType, nodeId) {
  if (sensorType === 'soil_moisture') {
    if (nodeId === 'node1') return ['pump_1'];
    if (nodeId === 'node2') return ['pump_2'];
    return ['pump_1', 'pump_2'];
  }
  if (sensorType === 'humidity') {
    if (nodeId === 'node1') return ['mist_1'];
    if (nodeId === 'node2') return ['mist_2'];
    return ['mist_1', 'mist_2'];
  }
  if (sensorType === 'temperature') return ['fan'];
  return [];
}

function isDeviceActive(deviceId, devicesById) {
  const device = devicesById.get(deviceId);
  if (!device) return false;
  if (deviceId === 'fan') {
    const stored = Number(sessionStorage.getItem('ctrl_fanSpeed') || 0);
    return stored > 0 || device.is_on;
  }
  if (deviceId === 'led') {
    const stored = Number(sessionStorage.getItem('ctrl_ledBrightness') || 0);
    return stored > 0 || device.is_on;
  }
  return device.is_on || false;
}
function getPlantWarnings(latest, profile) {
  if (!profile || !latest) return [];
  const warnings = [];

  const checks = [
    { key: 'temperature', label: 'Nhiệt độ', unit: '°C', min: profile.min_temperature, max: profile.max_temperature },
    { key: 'humidity', label: 'Độ ẩm KK', unit: '%', min: profile.min_humidity, max: profile.max_humidity },
    { key: 'soil_moisture', label: 'Độ ẩm đất', unit: '%', min: profile.min_soil_moisture, max: profile.max_soil_moisture },
  ];

  for (const { key, label, unit, min, max } of checks) {
    const value = latest[key];
    if (value == null || !Number.isFinite(Number(value))) continue;
    const v = Number(value);
    if (min != null && v < min) {
      warnings.push({ key, label, value: v, unit, type: 'low', message: `${label} quá thấp (${v}${unit}), cần ≥ ${min}${unit}` });
    } else if (max != null && v > max) {
      warnings.push({ key, label, value: v, unit, type: 'high', message: `${label} quá cao (${v}${unit}), cần ≤ ${max}${unit}` });
    }
  }

  return warnings;
}

// Trả về map { sensor_type → message } để truyền vào từng SensorCard
function getPlantWarningMap(warnings) {
  const map = {};
  for (const w of warnings) map[w.key] = `Cảnh báo: ${w.message}`;
  return map;
}

function PlantSelector({ profiles, selectedId, onChange }) {
  return (
    <div className="flex items-center gap-2">
      <Leaf className="h-4 w-4 text-emerald-600 shrink-0" />
      <select
        value={selectedId}
        onChange={(e) => onChange(e.target.value)}
        className="text-sm rounded-md border border-input bg-background px-3 py-1.5 text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="">-- Chọn loại cây --</option>
        {profiles.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>
    </div>
  );
}

function PlantWarningPanel({ profile, warnings, hasData }) {
  if (!profile) return null;

  return (
    <Card className="p-4 border-0 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Leaf className="h-4 w-4 text-emerald-600" />
          <span className="text-sm font-semibold">{profile.name}</span>
          <span className="text-xs text-muted-foreground">— Đánh giá môi trường</span>
        </div>
      </div>

      {!hasData ? (
        <p className="text-sm text-muted-foreground">Chưa có dữ liệu cảm biến để đánh giá.</p>
      ) : warnings.length === 0 ? (
        <div className="flex items-center gap-2 text-emerald-600">
          <CheckCircle className="h-4 w-4" />
          <span className="text-sm font-medium">Môi trường phù hợp với {profile.name}</span>
        </div>
      ) : (
        <div className="space-y-2">
          {warnings.map((w) => (
            <div key={w.key} className={cn(
              'flex items-start gap-2 rounded-md px-3 py-2 text-sm',
              w.type === 'high' ? 'bg-red-50 text-red-700' : 'bg-amber-50 text-amber-700',
            )}>
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{w.message}</span>
            </div>
          ))}
          {profile.care_note && (
            <p className="text-xs text-muted-foreground mt-2 pt-2 border-t">{profile.care_note}</p>
          )}
        </div>
      )}
    </Card>
  );
}

export default function Dashboard() {
  const [viewMode, setViewMode] = useState(DASHBOARD_VIEW_ALL);
  // Mỗi node lưu plantId riêng, không ảnh hưởng nhau
  const [plantByNode, setPlantByNode] = useState(() => {
    try { return JSON.parse(localStorage.getItem('plantByNode') || '{}'); } catch { return {}; }
  });
  const isCompareView = viewMode === DASHBOARD_VIEW_ALL;

  // Chỉ hiện dropdown khi đang xem từng node, không phải "Tất cả"
  const selectedPlantId = isCompareView ? '' : (plantByNode[viewMode] ?? '');
  const setSelectedPlantId = (id) => {
    if (isCompareView) return;
    setPlantByNode((prev) => {
      const next = { ...prev, [viewMode]: id };
      localStorage.setItem('plantByNode', JSON.stringify(next));
      return next;
    });
  };

  const { data: latestByNode = [] } = useQuery({
    queryKey: ['sensorData', 'latest-by-node'],
    queryFn: () => sensorService.listLatestByNode(),
    refetchOnMount: 'always',
    refetchInterval: 3000,
  });

  const nodesById = useMemo(() => {
    const map = new Map();
    for (const row of mergeLatestByExpectedNodes(latestByNode)) {
      map.set(row.node_id ?? row.nodeId, row);
    }
    return map;
  }, [latestByNode]);

  const latest = useMemo(() => {
    if (isCompareView) return {};
    return nodesById.get(viewMode) ?? { node_id: viewMode };
  }, [isCompareView, nodesById, viewMode]);

  const { data: sensorHistory = [] } = useQuery({
    queryKey: ['sensorData', 'history', 50, viewMode],
    queryFn: () => sensorService.listHistory({ limit: 50, nodeId: viewMode }),
    enabled: !isCompareView,
    refetchOnMount: 'always',
    refetchInterval: 5000,
  });

  const { data: historyNode1 = [] } = useQuery({
    queryKey: ['sensorData', 'history', 50, 'node1'],
    queryFn: () => sensorService.listHistory({ limit: 50, nodeId: 'node1' }),
    enabled: isCompareView,
    refetchOnMount: 'always',
    refetchInterval: 5000,
  });

  const { data: historyNode2 = [] } = useQuery({
    queryKey: ['sensorData', 'history', 50, 'node2'],
    queryFn: () => sensorService.listHistory({ limit: 50, nodeId: 'node2' }),
    enabled: isCompareView,
    refetchOnMount: 'always',
    refetchInterval: 5000,
  });

  const historiesByNode = useMemo(
    () => ({ 'node1': historyNode1, 'node2': historyNode2 }),
    [historyNode1, historyNode2],
  );

  const { data: devices = [] } = useQuery({
    queryKey: ['devices', 'list'],
    queryFn: () => deviceService.list(),
    refetchOnMount: 'always',
    refetchInterval: 3000,
  });

  const devicesById = useMemo(() => {
    const map = new Map();
    for (const d of devices) {
      const nameKey = d?.device_id ?? d?.name;
      if (nameKey) map.set(String(nameKey), d);
    }
    return map;
  }, [devices]);

  const { data: alerts = [] } = useQuery({
    queryFn: () => alertService.listRecent(10),
    refetchOnMount: 'always',
    refetchInterval: 3000,
  });

  const { data: alertThresholds = [] } = useQuery({
    queryKey: ['alertThresholds'],
    queryFn: () => appClient.entities.AlertThreshold.list(),
    refetchOnMount: 'always',
    refetchInterval: 5000,
  });

  const { data: activityLogs = [] } = useQuery({
    queryKey: ['deviceCommandLogs', 'recent', 10],
    queryFn: () => deviceService.listCommandLogs(10),
    refetchOnMount: 'always',
    refetchInterval: 3000,
  });

  const { data: plantProfiles = [] } = useQuery({
    queryKey: ['plantProfiles', 'active'],
    queryFn: () => appClient.entities.PlantProfile.list('name', 500, { active: true }),
  });

  const selectedProfile = useMemo(
    () => plantProfiles.find((p) => p.id === selectedPlantId) ?? null,
    [plantProfiles, selectedPlantId],
  );

  const plantWarnings = useMemo(
    () => getPlantWarnings(latest, selectedProfile),
    [latest, selectedProfile],
  );

  const plantWarningMap = useMemo(
    () => getPlantWarningMap(plantWarnings),
    [plantWarnings],
  );

  const hasLatestData = latest && (
    latest.temperature != null || latest.humidity != null || latest.soil_moisture != null
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tổng quan nhà kính</h1>
          <p className="text-muted-foreground text-sm mt-1">Giám sát dữ liệu môi trường từ backend</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {!isCompareView && (
            <PlantSelector
              profiles={plantProfiles}
              selectedId={selectedPlantId}
              onChange={setSelectedPlantId}
            />
          )}
          <NodeSelector value={viewMode} onChange={setViewMode} />
        </div>
      </div>

      {!isCompareView ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {sensorCards.map((sensor) => (
            <SensorCard
              key={sensor.type}
              icon={sensor.icon}
              label={sensor.label}
              value={latest[sensor.type]}
              unit={sensor.unit}
              color={sensor.color}
              warning={
                selectedProfile
                  ? (plantWarningMap[sensor.type] ?? null)
                  : getSensorWarning(sensor.type, latest[sensor.type], alertThresholds)
              }
              remedyActive={
                !!(
                  (selectedProfile
                    ? plantWarningMap[sensor.type]
                    : getSensorWarning(sensor.type, latest[sensor.type], alertThresholds)
                  ) &&
                  getRemedyDeviceIds(sensor.type, viewMode).some((id) => isDeviceActive(id, devicesById))
                )
              }
            />
          ))}
        </div>
      ) : null}

      {!isCompareView && selectedProfile && (
        <PlantWarningPanel
          profile={selectedProfile}
          warnings={plantWarnings}
          hasData={hasLatestData}
        />
      )}

      <DeviceStatusBar devices={devices} selectedNodeView={viewMode} />

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {isCompareView
          ? miniCharts.map((chart) => (
              <CompareMiniChart
                key={chart.dataKey}
                historiesByNode={historiesByNode}
                title={chart.title}
                dataKey={chart.dataKey}
                unit={chart.unit}
              />
            ))
          : miniCharts.map((chart) => (
              <MiniChart
                key={chart.dataKey}
                data={sensorHistory}
                title={chart.title}
                dataKey={chart.dataKey}
                color={chart.color}
                unit={chart.unit}
              />
            ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        <RecentAlerts alerts={alerts} />
        <ActivityLog logs={activityLogs} />
      </div>
    </div>
  );
}
