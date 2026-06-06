import React from 'react';
import { format } from 'date-fns';
import { Activity } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getDeviceLabel } from '@/config/devices';
import { cn } from '@/lib/utils';

const SOURCE_LABELS = {
  automation: 'Tự động',
  manual: 'Thủ công',
};

const ACTION_LABELS = {
  turn_on: 'Bật',
  turn_off: 'Tắt',
};

const SOURCE_BADGES = {
  automation: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100',
  manual: 'bg-blue-100 text-blue-700 hover:bg-blue-100',
};

const STATUS_LABELS = {
  command_sent: 'Đã gửi',
  confirmed: 'Đã xác nhận',
  failed: 'Gửi lỗi',
  timeout: 'Quá thời gian phản hồi',
};

const STATUS_BADGES = {
  command_sent: 'bg-amber-100 text-amber-700 hover:bg-amber-100',
  confirmed: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100',
  failed: 'bg-red-100 text-red-700 hover:bg-red-100',
  timeout: 'bg-red-100 text-red-700 hover:bg-red-100',
};

function getCreatedAt(log) {
  return log?.created_at || log?.created_date || null;
}

function formatTime(value) {
  if (!value) return '--';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '--';
  return format(date, 'HH:mm');
}

export default function ActivityLog({ logs }) {
  return (
    <Card className="p-5 border-0 shadow-sm">
      <div className="mb-4 flex items-center gap-2">
        <Activity className="h-4 w-4 text-muted-foreground" />
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
          Nhật ký hoạt động
        </h3>
      </div>

      {!logs?.length ? (
        <p className="text-sm text-muted-foreground text-center py-6">Chưa có hoạt động nào</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2.5">Thời gian</th>
                <th className="px-3 py-2.5">Thiết bị</th>
                <th className="px-3 py-2.5">Lệnh</th>
                <th className="px-3 py-2.5">Nguồn</th>
                <th className="px-3 py-2.5">Trạng thái</th>
              </tr>
            </thead>
            <tbody>
              {logs.slice(0, 8).map((log) => {
                const deviceName = log.device_name || log.deviceName || '--';
                const source = log.source || 'manual';
                const status = log.command_status || log.commandStatus || 'command_sent';

                return (
                  <tr key={log.id} className="border-b last:border-b-0">
                    <td className="whitespace-nowrap px-3 py-2.5 text-muted-foreground">
                      {formatTime(getCreatedAt(log))}
                    </td>
                    <td className="px-3 py-2.5 font-medium">
                      {getDeviceLabel(deviceName)}
                    </td>
                    <td className="px-3 py-2.5">
                      <span className="font-mono text-xs">{ACTION_LABELS[log.command] || log.command}</span>
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge className={cn('text-[10px]', SOURCE_BADGES[source] || SOURCE_BADGES.manual)}>
                        {SOURCE_LABELS[source] || source}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge className={cn('text-[10px]', STATUS_BADGES[status] || STATUS_BADGES.command_sent)}>
                        {STATUS_LABELS[status] || status}
                      </Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
