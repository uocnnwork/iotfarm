import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Clock3,
  Droplets,
  Fan,
  Cloud,
  Lightbulb,
  Loader2,
  Power,
  RadioTower,
  SendHorizontal,
  Settings2,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import {
  DEVICE_CONTROL_GROUPS,
  DEVICE_IDS,
  getDeviceDefinition,
  getDeviceLabel,
  getDeviceSubtitle,
} from '@/config/devices';
import { deviceService } from '@/services/deviceService';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/lib/AuthContext';

const typeIcons = {
  pump: Droplets,
  mist: Cloud,
  fan: Fan,
  light: Lightbulb,
};

const typeStyles = {
  pump: {
    accent: 'bg-blue-500',
    soft: 'bg-blue-50 text-blue-700 border-blue-100',
    active: 'bg-blue-600 text-white',
  },
  mist: {
    accent: 'bg-cyan-500',
    soft: 'bg-cyan-50 text-cyan-700 border-cyan-100',
    active: 'bg-cyan-600 text-white',
  },
  fan: {
    accent: 'bg-teal-500',
    soft: 'bg-teal-50 text-teal-700 border-teal-100',
    active: 'bg-teal-600 text-white',
  },
  light: {
    accent: 'bg-amber-500',
    soft: 'bg-amber-50 text-amber-700 border-amber-100',
    active: 'bg-amber-500 text-white',
  },
};

function getDeviceCardConfig(deviceId) {
  const definition = getDeviceDefinition(deviceId);
  const type = definition?.type || 'pump';
  const styles = typeStyles[type] || typeStyles.pump;
  return {
    icon: typeIcons[type] || Droplets,
    label: definition?.name || getDeviceLabel(deviceId),
    desc: getDeviceSubtitle({ device_id: deviceId }) || 'Thiết bị nhà kính',
    ...styles,
  };
}

function getCommandStatus(log) {
  return log?.command_status || log?.commandStatus || 'command_sent';
}

function getLogCreatedAt(log) {
  return log?.created_at || log?.created_date || null;
}

function formatRelativeTimeVi(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;

  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 45) return 'vừa xong';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} phút trước`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} giờ trước`;
  const days = Math.floor(hours / 24);
  return `${days} ngày trước`;
}

function getCommandStatusLineText(log) {
  if (!log) return 'Chưa có lệnh';

  const status = getCommandStatus(log);
  if (status === 'command_sent') return 'Chờ xác nhận';
  if (status === 'failed') return 'Gửi thất bại';
  if (status === 'timeout') return 'Hết thời gian';

  return formatRelativeTimeVi(getLogCreatedAt(log)) || 'Đã xác nhận';
}

function DeviceStatusLine({ isOnline, latestCommandLog }) {
  const connection = isOnline ? 'Đã kết nối' : 'Chưa kết nối';
  const command = getCommandStatusLineText(latestCommandLog);

  return (
    <p className="mt-1.5 text-xs text-muted-foreground">
      {connection}
      {' · '}
      {command}
    </p>
  );
}

function matchesDeviceId(item, deviceId) {
  return item?.device_id === deviceId || item?.deviceName === deviceId || item?.name === deviceId;
}

function matchesCommandLog(log, deviceId) {
  return (log?.device_name || log?.deviceName) === deviceId;
}

function SummaryCard({ icon: Icon, label, value, tone }) {
  return (
    <Card className="rounded-lg border-0 bg-card/90 p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase text-muted-foreground">{label}</p>
          <p className="mt-1 text-2xl font-bold tracking-tight">{value}</p>
        </div>
        <div className={cn('flex h-10 w-10 items-center justify-center rounded-lg', tone)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}

function ModeButton({ active, disabled, children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'h-7 min-w-[4.5rem] rounded-md px-2.5 text-[11px] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        active
          ? 'bg-primary text-primary-foreground shadow-sm'
          : 'text-muted-foreground hover:bg-background hover:text-foreground',
      )}
    >
      {children}
    </button>
  );
}

function DeviceStateBadge({ device, isOn }) {
  if (!device) {
    return (
      <Badge variant="secondary" className="border border-dashed border-border bg-muted text-muted-foreground">
        Chưa có
      </Badge>
    );
  }

  return (
    <Badge className={cn('shrink-0 border px-2 py-0.5 text-[11px]', isOn
      ? 'border-primary/20 bg-primary text-primary-foreground'
      : 'border-slate-200 bg-slate-100 text-slate-600 hover:bg-slate-100'
    )}>
      {isOn ? 'Đang bật' : 'Đang tắt'}
    </Badge>
  );
}

function DeviceControlCard({
  deviceId,
  device,
  latestCommandLog,
  index,
  isTogglePending,
  isModePending,
  canControl,
  onToggle,
  onModeChange,
  // LED brightness props
  ledBrightness,
  onLedBrightnessChange,
  onLedBrightnessCommit,
  isLedBrightnessPending,
  // Fan speed props
  fanSpeed,
  onFanSpeedChange,
  onFanSpeedCommit,
  isFanSpeedPending,
}) {
  const config = getDeviceCardConfig(deviceId);
  const Icon = config.icon;
  const isOn = device?.is_on || false;
  const isDevicePending = isTogglePending || isModePending || !canControl;
  const isOnline = device?.online === true;
  const isLed = deviceId === 'led';
  const isFan = deviceId === 'fan';
  const isSliderDevice = isLed || isFan;
  const isManual = device?.mode === 'manual';

  const sliderValue = isLed ? ledBrightness : fanSpeed;
  const sliderOnChange = isLed ? onLedBrightnessChange : onFanSpeedChange;
  const sliderOnCommit = isLed ? onLedBrightnessCommit : onFanSpeedCommit;
  const sliderPending = isLed ? isLedBrightnessPending : isFanSpeedPending;
  const sliderLabel = isLed ? 'Độ sáng' : 'Tốc độ';
  const sliderColor = isLed ? 'text-amber-600' : 'text-teal-600';
  const sliderAccent = isLed ? 'accent-amber-500' : 'accent-teal-500';

  return (
    <motion.div
      key={deviceId}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.05 }}
    >
      <Card className={cn(
        'rounded-2xl border p-4 shadow-sm transition-shadow hover:shadow-md',
        isOn ? 'border-primary/25' : 'border-border',
      )}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <div className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-colors',
              isOn ? config.active : config.soft,
            )}>
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h3 className="truncate text-sm font-semibold leading-tight">{config.label}</h3>
              <p className="truncate text-xs text-muted-foreground">{config.desc}</p>
            </div>
          </div>
        </div>

        <div className="mt-2 border-t pt-1">
          <div className="flex flex-col gap-0 lg:flex-row lg:items-center lg:justify-between lg:gap-4">

            {/* LED/Fan: slider thay thế switch, chỉ ở manual */}
            {isSliderDevice && isManual ? (
              <div className="flex flex-col gap-2 py-2 lg:flex-1">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                    <Power className="h-3.5 w-3.5 text-muted-foreground" />
                    {sliderLabel}
                  </span>
                  <span className={cn('text-xs font-semibold tabular-nums', sliderColor)}>
                    {sliderValue}%
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={1}
                    value={sliderValue}
                    disabled={!device || isDevicePending || sliderPending}
                    onChange={(e) => sliderOnChange(Number(e.target.value))}
                    onMouseUp={(e) => sliderOnCommit(Number(e.target.value))}
                    onTouchEnd={(e) => sliderOnCommit(Number(e.target.value))}
                    className={cn('h-2 w-full cursor-pointer disabled:cursor-not-allowed disabled:opacity-50', sliderAccent)}
                  />
                </div>
              </div>
            ) : !isSliderDevice ? (
              <div className="flex items-center justify-between gap-3 py-2 lg:flex-1">
                <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                  <Power className="h-3.5 w-3.5 text-muted-foreground" />
                  Nguồn
                </span>
                <Switch
                  checked={isOn}
                  onCheckedChange={(checked) => onToggle(device, deviceId, checked)}
                  disabled={!device || isDevicePending}
                  className="scale-90"
                />
              </div>
            ) : null}

            <div className="flex items-center justify-between gap-2 border-t py-2 lg:flex-1 lg:border-t-0 lg:py-2">
              <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                <Settings2 className="h-3.5 w-3.5 text-muted-foreground" />
                Chế độ
              </span>
              <div className="inline-grid grid-cols-2 rounded-md bg-muted p-0.5">
                <ModeButton
                  active={device?.mode === 'manual'}
                  disabled={!device || isDevicePending || device?.mode === 'manual'}
                  onClick={() => onModeChange(device, 'manual')}
                >
                  Thủ công
                </ModeButton>
                <ModeButton
                  active={device?.mode === 'auto'}
                  disabled={!device || isDevicePending || device?.mode === 'auto'}
                  onClick={() => onModeChange(device, 'auto')}
                >
                  Tự động
                </ModeButton>
              </div>
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

function GatewayFrequencyCard({
  value,
  isPending,
  canControl,
  onChange,
  onSubmit,
}) {
  return (
    <Card className="rounded-lg border bg-card p-5 shadow-sm">
      <form onSubmit={onSubmit} className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <RadioTower className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-base font-semibold">Tiết kiệm pin</h2>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="gateway-update-frequency">Tần suất cập nhật</Label>
            <div className="relative w-full sm:w-64">
              <Input
                id="gateway-update-frequency"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={value}
                onChange={(event) => onChange(event.target.value)}
                disabled={isPending || !canControl}
                className="pr-14"
              />
              <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-sm font-medium text-muted-foreground">
                giây
              </span>
            </div>
          </div>
        </div>

        <Button type="submit" disabled={isPending || !canControl} className="w-full gap-2 sm:w-fit">
          {isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <SendHorizontal className="h-4 w-4" />
          )}
          Gửi
        </Button>
      </form>
    </Card>
  );
}

export default function Controls() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const [gatewayFrequencySeconds, setGatewayFrequencySeconds] = useState(() => {
    return sessionStorage.getItem('ctrl_gatewayFreq') || '5';
  });
  const [ledBrightness, setLedBrightness] = useState(() => {
    return Number(sessionStorage.getItem('ctrl_ledBrightness') || 0);
  });
  const [fanSpeed, setFanSpeed] = useState(() => {
    return Number(sessionStorage.getItem('ctrl_fanSpeed') || 0);
  });

  const handleGatewayFreqChange = (val) => {
    setGatewayFrequencySeconds(val);
    sessionStorage.setItem('ctrl_gatewayFreq', val);
  };
  const handleLedBrightnessChange = (val) => {
    setLedBrightness(val);
    sessionStorage.setItem('ctrl_ledBrightness', val);
  };
  const handleFanSpeedChange = (val) => {
    setFanSpeed(val);
    sessionStorage.setItem('ctrl_fanSpeed', val);
  };
  const canControl = user?.role !== 'viewer';

  const { data: devices = [] } = useQuery({
    queryKey: ['devices', 'list'],
    queryFn: () => deviceService.list(),
    refetchOnMount: 'always',
    refetchInterval: 3000,
  });

  const { data: commandLogs = [] } = useQuery({
    queryKey: ['deviceCommandLogs', 'recent', 20],
    queryFn: () => deviceService.listCommandLogs(20),
    refetchOnMount: 'always',
    refetchInterval: 3000,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ device_id, is_on }) => deviceService.command(device_id, { isOn: is_on }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      queryClient.invalidateQueries({ queryKey: ['deviceCommandLogs'] });
      const label = getDeviceLabel(variables.device_id);
      toast({
        title: 'Đã gửi lệnh thiết bị',
        description: `${variables.is_on ? 'Bật' : 'Tắt'} ${label}. Đang chờ thiết bị xác nhận.`,
      });
    },
    onError: (error, variables) => {
      const label = getDeviceLabel(variables?.device_id) || 'thiết bị';
      toast({
        variant: 'destructive',
        title: 'Gửi lệnh thất bại',
        description: error?.message || `Không thể gửi lệnh tới ${label}. Kiểm tra backend/MQTT rồi thử lại.`,
      });
    },
  });

  const modeMutation = useMutation({
    mutationFn: ({ id, mode }) => deviceService.update(id, { mode }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['devices'] });
      const label = getDeviceLabel(variables.device_id);
      toast({
        title: 'Đã cập nhật chế độ',
        description: `${label} đang ở chế độ ${variables.mode === 'auto' ? 'Tự động' : 'Thủ công'}.`,
      });
    },
    onError: (error, variables) => {
      const label = getDeviceLabel(variables?.device_id) || 'thiết bị';
      toast({
        variant: 'destructive',
        title: 'Cập nhật chế độ thất bại',
        description: error?.message || `Không thể đổi chế độ cho ${label}.`,
      });
    },
  });

  const gatewayFrequencyMutation = useMutation({
    mutationFn: (seconds) => deviceService.setNodeInterval(seconds),
    onSuccess: (_data, seconds) => {
      toast({
        title: 'Đã gửi chu kỳ cập nhật',
        description: `Sensor node sẽ gửi dữ liệu mỗi ${seconds} giây.`,
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Gửi chu kỳ thất bại',
        description: error?.message || 'Không thể gửi chu kỳ cập nhật lúc này.',
      });
    },
  });

  const ledBrightnessMutation = useMutation({
    mutationFn: (percent) => deviceService.setLedBrightness(percent),
    onSuccess: (_data, percent) => {
      toast({ title: 'Đã gửi độ sáng LED', description: `Độ sáng: ${percent}%` });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Gửi độ sáng LED thất bại',
        description: error?.message || 'Không thể gửi lệnh LED lúc này.',
      });
    },
  });

  const fanSpeedMutation = useMutation({
    mutationFn: (percent) => deviceService.setFanSpeed(percent),
    onSuccess: (_data, percent) => {
      toast({ title: 'Đã gửi tốc độ quạt', description: `Tốc độ: ${percent}%` });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Gửi tốc độ quạt thất bại',
        description: error?.message || 'Không thể gửi lệnh quạt lúc này.',
      });
    },
  });

  const handleToggleDevice = (device, deviceId, isOn) => {
    if (!canControl) {
      toast({
        variant: 'destructive',
        title: 'Chỉ được xem',
        description: 'Tài khoản viewer không được điều khiển thiết bị.',
      });
      return;
    }
    if (!device) return;
    if (toggleMutation.isPending && toggleMutation.variables?.device_id === deviceId) return;
    toggleMutation.mutate({ device_id: deviceId, is_on: isOn });
  };

  const handleModeChange = (device, mode) => {
    if (!canControl) {
      toast({
        variant: 'destructive',
        title: 'Chỉ được xem',
        description: 'Tài khoản viewer không được đổi chế độ thiết bị.',
      });
      return;
    }
    if (!device || device.mode === mode) return;
    const deviceId = device.device_id || device.name;
    if (modeMutation.isPending && modeMutation.variables?.device_id === deviceId) return;
    modeMutation.mutate({ id: device.id, device_id: deviceId, mode });
  };

  const handleGatewayFrequencySubmit = (event) => {
    event.preventDefault();

    if (!canControl) {
      toast({
        variant: 'destructive',
        title: 'Chỉ được xem',
        description: 'Tài khoản viewer không được gửi cấu hình thiết bị.',
      });
      return;
    }

    const seconds = Number(gatewayFrequencySeconds);    if (!Number.isInteger(seconds) || seconds <= 0) {
      toast({
        variant: 'destructive',
        title: 'Tần suất không hợp lệ',
        description: 'Vui lòng nhập số nguyên dương, đơn vị giây.',
      });
      return;
    }

    gatewayFrequencyMutation.mutate(seconds);
  };

  const handleLedBrightnessCommit = (percent) => {
    if (!canControl) return;
    ledBrightnessMutation.mutate(percent);
  };

  const handleFanSpeedCommit = (percent) => {
    if (!canControl) return;
    fanSpeedMutation.mutate(percent);
  };

  const configuredDevices = DEVICE_IDS.map((deviceId) => devices.find((d) => matchesDeviceId(d, deviceId)));
  const activeCount = configuredDevices.filter((device) => {
    if (!device) return false;
    if (device.device_id === 'led' || device.name === 'led') return ledBrightness > 0;
    if (device.device_id === 'fan' || device.name === 'fan') return fanSpeed > 0;
    return device?.is_on;
  }).length;
  const autoCount = configuredDevices.filter((device) => device?.mode === 'auto').length;
  const pendingCount = DEVICE_IDS
    .map((deviceId) => commandLogs.find((log) => matchesCommandLog(log, deviceId)))
    .filter(Boolean)
    .filter((log) => getCommandStatus(log) === 'command_sent')
    .length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Điều khiển thiết bị</h1>
          <p className="mt-1 text-sm text-muted-foreground">Bật/tắt relay và chuyển chế độ vận hành</p>
        </div>
        <Badge variant="outline" className="w-fit gap-1.5 border-primary/20 bg-primary/5 px-3 py-1 text-primary">
          <RadioTower className="h-3.5 w-3.5" />
          {canControl ? `${DEVICE_IDS.length} thiết bị` : 'Chế độ chỉ xem'}
        </Badge>
      </div>

      {!canControl && (
        <Card className="rounded-lg border-dashed bg-muted/40 p-4 text-sm text-muted-foreground shadow-none">
          Tài khoản viewer chỉ được xem trạng thái thiết bị. Các thao tác bật/tắt, đổi chế độ và gửi cấu hình đã bị khóa.
        </Card>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <SummaryCard
          icon={Power}
          label="Đang bật"
          value={`${activeCount}/${DEVICE_IDS.length}`}
          tone="bg-primary/10 text-primary"
        />
        <SummaryCard
          icon={Settings2}
          label="Tự động"
          value={autoCount}
          tone="bg-blue-50 text-blue-700"
        />
        <SummaryCard
          icon={Clock3}
          label="Đang chờ"
          value={pendingCount}
          tone="bg-amber-50 text-amber-700"
        />
      </div>

      <GatewayFrequencyCard
        value={gatewayFrequencySeconds}
        isPending={gatewayFrequencyMutation.isPending}
        canControl={canControl}
        onChange={handleGatewayFreqChange}
        onSubmit={handleGatewayFrequencySubmit}
      />

      <div className="space-y-8">
        {DEVICE_CONTROL_GROUPS.map((group) => (
          <section key={group.id} className="space-y-4">
            <h2 className="text-base font-semibold">{group.title}</h2>
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              {group.deviceIds.map((deviceId, i) => {
                const device = devices.find((d) => matchesDeviceId(d, deviceId));
                const latestCommandLog = commandLogs.find((log) => matchesCommandLog(log, deviceId));
                const isTogglePending = toggleMutation.isPending && toggleMutation.variables?.device_id === deviceId;
                const isModePending = modeMutation.isPending && modeMutation.variables?.device_id === deviceId;

                return (
                  <DeviceControlCard
                    key={deviceId}
                    deviceId={deviceId}
                    device={device}
                    latestCommandLog={latestCommandLog}
                    index={i}
                    isTogglePending={isTogglePending}
                    isModePending={isModePending}
                    canControl={canControl}
                    onToggle={handleToggleDevice}
                    onModeChange={handleModeChange}
                    ledBrightness={ledBrightness}
                    onLedBrightnessChange={handleLedBrightnessChange}
                    onLedBrightnessCommit={handleLedBrightnessCommit}
                    isLedBrightnessPending={ledBrightnessMutation.isPending}
                    fanSpeed={fanSpeed}
                    onFanSpeedChange={handleFanSpeedChange}
                    onFanSpeedCommit={handleFanSpeedCommit}
                    isFanSpeedPending={fanSpeedMutation.isPending}
                  />
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
