import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, AlertCircle, Info, CheckCircle2, Bell, Trash2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { SENSOR_LABELS, SENSOR_NODE_LABELS } from '@/config/greenhouse';
import { alertService } from '@/services/alertService';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/lib/AuthContext';
import AlertsSegment from '@/components/alerts/AlertsSegment';
import AlertThresholdsPanel from '@/components/alerts/AlertThresholdsPanel';

const typeConfig = {
  danger: { icon: AlertTriangle, color: 'text-red-500', bg: 'bg-red-50', badge: 'bg-red-100 text-red-700', label: 'Nguy hiểm' },
  warning: { icon: AlertCircle, color: 'text-amber-500', bg: 'bg-amber-50', badge: 'bg-amber-100 text-amber-700', label: 'Cảnh báo' },
  info: { icon: Info, color: 'text-blue-500', bg: 'bg-blue-50', badge: 'bg-blue-100 text-blue-700', label: 'Thông tin' },
};

export default function Alerts() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [activeSegment, setActiveSegment] = useState('alerts');
  const [nodeFilter, setNodeFilter] = useState('all');
  const showThresholds = isAdmin && activeSegment === 'thresholds';

  const { data: alerts = [] } = useQuery({
    queryKey: ['alerts', 'list'],
    queryFn: () => alertService.listAll(),
    refetchOnMount: 'always',
    refetchInterval: 3000,
  });

  const markReadMutation = useMutation({
    mutationFn: (id) => alertService.markRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['alerts'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => alertService.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      toast({ title: 'Đã xóa cảnh báo' });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Xóa thất bại',
        description: error?.message || 'Có lỗi xảy ra',
      });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => alertService.markAllRead(),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['alerts'] });
      toast({
        title: 'Đã đánh dấu tất cả cảnh báo là đã đọc',
        description: `Đã cập nhật ${result?.updated ?? 0} cảnh báo.`,
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Không thể đánh dấu tất cả',
        description: error?.message || 'Vui lòng kiểm tra backend rồi thử lại.',
      });
    },
  });

  const filteredAlerts = nodeFilter === 'all'
    ? alerts
    : alerts.filter(a => (a.node_id ?? a.nodeId) === nodeFilter);
  const unreadCount = filteredAlerts.filter(a => !a.is_read).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Cảnh báo</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {showThresholds
                ? 'Cấu hình ngưỡng kích hoạt cảnh báo theo từng cảm biến'
                : unreadCount > 0
                  ? `${unreadCount} cảnh báo chưa đọc`
                  : 'Tất cả cảnh báo đã được đọc'}
            </p>
          </div>
          {isAdmin && (
            <AlertsSegment value={activeSegment} onChange={setActiveSegment} />
          )}
        </div>
        {!showThresholds && (
          <div className="flex items-center gap-2 shrink-0">
            <Select value={nodeFilter} onValueChange={setNodeFilter}>
              <SelectTrigger className="h-9 w-[130px]">
                <SelectValue placeholder="Tất cả khu" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tất cả khu</SelectItem>
                {Object.entries(SENSOR_NODE_LABELS).map(([id, label]) => (
                  <SelectItem key={id} value={id}>{label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {unreadCount > 0 && (
              <Button
                variant="outline"
                onClick={() => markAllReadMutation.mutate()}
                disabled={markAllReadMutation.isPending}
                className="gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                {markAllReadMutation.isPending ? 'Đang cập nhật...' : 'Đánh dấu tất cả đã đọc'}
              </Button>
            )}
          </div>
        )}
      </div>

      {showThresholds ? (
        <AlertThresholdsPanel />
      ) : filteredAlerts.length === 0 ? (
        <Card className="p-12 border-0 shadow-sm text-center">
          <Bell className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground">
            {nodeFilter !== 'all' ? `Không có cảnh báo nào cho ${SENSOR_NODE_LABELS[nodeFilter] || nodeFilter}` : 'Không có cảnh báo nào'}
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {filteredAlerts.map((alert, i) => {
              const config = typeConfig[alert.type] || typeConfig.info;
              const Icon = config.icon;
              const alertNodeId = alert.node_id ?? alert.nodeId;
              const nodeLabel = alertNodeId ? SENSOR_NODE_LABELS[alertNodeId] : null;
              return (
                <motion.div
                  key={alert.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.03 }}
                >
                  <Card className={cn(
                    "p-5 border-0 shadow-sm transition-all group",
                    !alert.is_read && "ring-1 ring-primary/20 bg-primary/[0.02]",
                    deleteMutation.isPending && deleteMutation.variables === alert.id && "opacity-50"
                  )}>
                    <div className="flex items-start gap-4">
                      <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0", config.bg)}>
                        <Icon className={cn("w-5 h-5", config.color)} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge className={cn("text-[10px]", config.badge)}>{config.label}</Badge>
                          <Badge variant="outline" className="text-[10px]">{SENSOR_LABELS[alert.sensor_type]}</Badge>
                          {nodeLabel && (
                            <Badge variant="outline" className="text-[10px] border-primary/30 bg-primary/5 text-primary">
                              {nodeLabel}
                            </Badge>
                          )}
                          {!alert.is_read && <div className="w-2 h-2 rounded-full bg-primary" />}
                        </div>
                        <p className="font-medium mt-2">{alert.message}</p>
                        <div className="flex items-center justify-between mt-2">
                          <div className="flex items-center gap-4 text-xs text-muted-foreground">
                            <span>Giá trị: <span className="font-semibold text-foreground">{alert.value}</span></span>
                            <span>{alert.created_date ? format(new Date(alert.created_date), 'dd/MM/yyyy HH:mm:ss') : ''}</span>
                          </div>
                          {isAdmin && (
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                              disabled={deleteMutation.isPending}
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteMutation.mutate(alert.id);
                              }}
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </Button>
                          )}
                        </div>
                      </div>
                      {!alert.is_read && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => markReadMutation.mutate(alert.id)}
                          disabled={markReadMutation.isPending && markReadMutation.variables === alert.id}
                          className="text-xs"
                        >
                          Đã đọc
                        </Button>
                      )}
                    </div>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
