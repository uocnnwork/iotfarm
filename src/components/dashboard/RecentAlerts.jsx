import React from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, AlertCircle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';

const typeConfig = {
  danger: { icon: AlertTriangle, color: 'text-red-500 bg-red-50', badge: 'bg-red-100 text-red-700' },
  warning: { icon: AlertCircle, color: 'text-amber-500 bg-amber-50', badge: 'bg-amber-100 text-amber-700' },
  info: { icon: Info, color: 'text-blue-500 bg-blue-50', badge: 'bg-blue-100 text-blue-700' },
};

export default function RecentAlerts({ alerts }) {
  if (!alerts?.length) {
    return (
      <Card className="p-5 border-0 shadow-sm">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Cảnh báo gần đây</h3>
        <p className="text-sm text-muted-foreground text-center py-6">Không có cảnh báo nào</p>
      </Card>
    );
  }

  return (
    <Card className="p-5 border-0 shadow-sm">
      <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-4">Cảnh báo gần đây</h3>
      <div className="space-y-3 max-h-72 overflow-y-auto">
        {alerts.slice(0, 5).map((alert) => {
          const config = typeConfig[alert.type] || typeConfig.info;
          const Icon = config.icon;
          return (
            <div key={alert.id} className="flex items-start gap-3 p-3 rounded-xl bg-muted/50">
              <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0", config.color)}>
                <Icon className="w-4 h-4" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium leading-snug">{alert.message}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {alert.created_date ? format(new Date(alert.created_date), 'dd/MM/yyyy HH:mm') : ''}
                </p>
              </div>
              <Badge className={cn("text-[10px] flex-shrink-0", config.badge)}>
                {alert.type === 'danger' ? 'Nguy hiểm' : alert.type === 'warning' ? 'Cảnh báo' : 'Thông tin'}
              </Badge>
            </div>
          );
        })}
      </div>
    </Card>
  );
}