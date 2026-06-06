import React, { useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Cloud, Droplets, Fan, Lightbulb } from 'lucide-react';
import { cn } from '@/lib/utils';
import { DASHBOARD_VIEW_ALL } from '@/config/greenhouse';
import {
  getDashboardDeviceGroups,
  getDeviceDefinition,
  getDeviceLabel,
} from '@/config/devices';

const deviceIcons = {
  pump: Droplets,
  mist: Cloud,
  fan: Fan,
  light: Lightbulb,
};

function ModeBadge({ mode }) {
  if (mode !== 'auto' && mode !== 'manual') return null;
  const isAuto = mode === 'auto';
  return (
    <span
      className={cn(
        'inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-medium leading-none',
        isAuto
          ? 'bg-blue-50 text-blue-700 border-blue-200'
          : 'bg-slate-100 text-slate-600 border-slate-200',
      )}
    >
      {isAuto ? 'Tự động' : 'Thủ công'}
    </span>
  );
}

function DeviceStatusItem({ device }) {
  const deviceId = device?.device_id ?? device?.id ?? device?.name;
  const definition = getDeviceDefinition(deviceId);
  const isOn = device?.is_on || false;
  const Icon = deviceIcons[definition?.type] || Droplets;

  return (
    <div
      className={cn(
        'flex items-center gap-3 p-3 rounded-xl transition-all duration-300',
        isOn ? 'bg-primary/10' : 'bg-muted',
      )}
    >
      <div
        className={cn(
          'w-8 h-8 rounded-lg flex items-center justify-center transition-colors shrink-0',
          isOn
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted-foreground/10 text-muted-foreground',
        )}
      >
        <Icon className="w-4 h-4" />
      </div>
      <div className="min-w-0 flex flex-col gap-1">
        <p className="text-xs font-medium truncate">{device?.label || getDeviceLabel(deviceId)}</p>
        <div className="flex items-center gap-1.5 flex-wrap">
          <span
            className={cn(
              'text-xs font-semibold',
              isOn ? 'text-primary' : 'text-muted-foreground',
            )}
          >
            {isOn ? 'BẬT' : 'TẮT'}
          </span>
          <ModeBadge mode={device?.mode} />
        </div>
      </div>
    </div>
  );
}

export default function DeviceStatusBar({ devices = [], selectedNodeView = DASHBOARD_VIEW_ALL }) {
  const groups = useMemo(
    () => getDashboardDeviceGroups(selectedNodeView),
    [selectedNodeView],
  );

  const devicesById = useMemo(() => {
    const map = new Map();
    for (const device of devices) {
      const id = device?.device_id ?? device?.id ?? device?.name;
      if (id) map.set(id, device);
    }
    return map;
  }, [devices]);

  return (
    <Card className="p-5 border-0 shadow-sm space-y-5">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
        Trạng thái thiết bị
      </h3>

      {groups.map((group) => (
        <div key={group.title}>
          <p className="text-xs font-semibold text-muted-foreground mb-2">{group.title}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {group.deviceIds.map((deviceId) => (
              <DeviceStatusItem
                key={deviceId}
                device={devicesById.get(deviceId) || { device_id: deviceId, id: deviceId }}
              />
            ))}
          </div>
        </div>
      ))}
    </Card>
  );
}
