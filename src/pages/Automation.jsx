import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Zap, Trash2, ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { DEVICE_DEFINITIONS, getDeviceLabel } from '@/config/devices';
import { SENSOR_LABELS, SENSOR_NODE_LABELS } from '@/config/greenhouse';
import { automationService } from '@/services/automationService';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/lib/AuthContext';

const conditionLabels = { above: 'Lớn hơn', above_or_equal: 'Lớn hơn hoặc bằng', below: 'Nhỏ hơn', below_or_equal: 'Nhỏ hơn hoặc bằng', equals: 'Bằng' };
const actionLabels = { turn_on: 'Bật', turn_off: 'Tắt' };

export default function Automation() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ name: '', sensor_type: '', condition: '', threshold: '', target_device: '', action: '', is_active: true, node_id: '' });
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const canManageRules = user?.role !== 'viewer';

  const { data: rules = [] } = useQuery({
    queryKey: ['automationRules', 'list'],
    queryFn: () => automationService.listRules(),
    refetchOnMount: 'always',
    refetchInterval: 5000,
  });

  const createMutation = useMutation({
    mutationFn: (data) => automationService.createRule(data),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['automationRules'] });
      setOpen(false);
      resetForm();
      toast({ title: 'Đã tạo quy tắc tự động' });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Tạo quy tắc thất bại',
        description: error?.message || 'Không thể tạo quy tắc tự động. Kiểm tra dữ liệu rồi thử lại.',
      });
    },
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, is_active }) => automationService.updateRule(id, { is_active }),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['automationRules'] });
      toast({
        title: variables.is_active ? 'Đã bật quy tắc' : 'Đã tắt quy tắc',
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Cập nhật quy tắc thất bại',
        description: error?.message || 'Không thể cập nhật trạng thái quy tắc.',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => automationService.deleteRule(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['automationRules'] });
      toast({ title: 'Đã xóa quy tắc tự động' });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Xóa quy tắc thất bại',
        description: error?.message || 'Không thể xóa quy tắc tự động.',
      });
    },
  });

  const resetForm = () => setForm({ name: '', sensor_type: '', condition: '', threshold: '', target_device: '', action: '', is_active: true, node_id: '' });

  // Filter devices based on selected node_id
  const availableDevices = useMemo(() => {
    if (!form.node_id) {
      // No zone selected = global rule, only show global devices
      return DEVICE_DEFINITIONS.filter(d => d.scope === 'global');
    }
    // Zone selected: show zone-specific devices + global devices
    return DEVICE_DEFINITIONS.filter(
      d => d.scope === 'global' || d.node_id === form.node_id
    );
  }, [form.node_id]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!canManageRules) {
      toast({
        variant: 'destructive',
        title: 'Chỉ được xem',
        description: 'Tài khoản viewer không được tạo quy tắc tự động.',
      });
      return;
    }
    createMutation.mutate({
      ...form,
      threshold: Number(form.threshold),
      node_id: form.node_id || null,
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tự động hóa</h1>
          <p className="text-muted-foreground text-sm mt-1">Thiết lập quy tắc điều khiển tự động</p>
        </div>
        <div className="flex items-center gap-2">
          {!canManageRules && (
            <Badge variant="outline" className="border-primary/20 bg-primary/5 text-primary">
              Chế độ chỉ xem
            </Badge>
          )}
          <Dialog open={open} onOpenChange={(nextOpen) => canManageRules && setOpen(nextOpen)}>
            <DialogTrigger asChild>
              <Button className="gap-2" disabled={!canManageRules}>
                <Plus className="w-4 h-4" />
                Thêm quy tắc
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Tạo quy tắc mới</DialogTitle></DialogHeader>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <Label>Tên quy tắc</Label>
                  <Input disabled={createMutation.isPending} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="VD: Tự động tưới khi đất khô" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Cảm biến</Label>
                    <Select disabled={createMutation.isPending} value={form.sensor_type} onValueChange={(v) => setForm({ ...form, sensor_type: v })}>
                      <SelectTrigger><SelectValue placeholder="Chọn" /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(SENSOR_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Điều kiện</Label>
                    <Select disabled={createMutation.isPending} value={form.condition} onValueChange={(v) => setForm({ ...form, condition: v })}>
                      <SelectTrigger><SelectValue placeholder="Chọn" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="above">Lớn hơn</SelectItem>
                        <SelectItem value="above_or_equal">Lớn hơn hoặc bằng</SelectItem>
                        <SelectItem value="below">Nhỏ hơn</SelectItem>
                        <SelectItem value="below_or_equal">Nhỏ hơn hoặc bằng</SelectItem>
                        <SelectItem value="equals">Bằng</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Ngưỡng giá trị</Label>
                  <Input disabled={createMutation.isPending} type="number" value={form.threshold} onChange={(e) => setForm({ ...form, threshold: e.target.value })} placeholder="VD: 30" />
                </div>
                <div>
                  <Label>Áp dụng cho khu vực</Label>
                  <Select disabled={createMutation.isPending} value={form.node_id} onValueChange={(v) => {
                    const nextNodeId = v === '__all__' ? '' : v;
                    // Reset target_device if it's no longer valid for the new zone
                    const nextForm = { ...form, node_id: nextNodeId };
                    if (form.target_device) {
                      const dev = DEVICE_DEFINITIONS.find(d => d.id === form.target_device);
                      if (dev && dev.scope === 'zone' && dev.node_id !== nextNodeId) {
                        nextForm.target_device = '';
                      }
                    }
                    setForm(nextForm);
                  }}>
                    <SelectTrigger><SelectValue placeholder="Chọn" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Tất cả (chỉ thiết bị chung)</SelectItem>
                      {Object.entries(SENSOR_NODE_LABELS).map(([id, label]) => (
                        <SelectItem key={id} value={id}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Thiết bị</Label>
                    <Select disabled={createMutation.isPending} value={form.target_device} onValueChange={(v) => setForm({ ...form, target_device: v })}>
                      <SelectTrigger><SelectValue placeholder="Chọn" /></SelectTrigger>
                      <SelectContent>
                        {availableDevices.map((device) => (
                          <SelectItem key={device.id} value={device.id}>{device.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Hành động</Label>
                    <Select disabled={createMutation.isPending} value={form.action} onValueChange={(v) => setForm({ ...form, action: v })}>
                      <SelectTrigger><SelectValue placeholder="Chọn" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="turn_on">Bật</SelectItem>
                        <SelectItem value="turn_off">Tắt</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Đang tạo...' : 'Tạo quy tắc'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      </div>
      {!canManageRules && (
        <Card className="rounded-lg border-dashed bg-muted/40 p-4 text-sm text-muted-foreground shadow-none">
          Tài khoản viewer chỉ được xem danh sách quy tắc. Thao tác thêm, bật/tắt hoặc xóa quy tắc đã bị khóa.
        </Card>
      )}

      {rules.length === 0 ? (
        <Card className="p-12 border-0 shadow-sm text-center">
          <Zap className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground">Chưa có quy tắc tự động nào</p>
          <p className="text-sm text-muted-foreground/70 mt-1">Nhấn "Thêm quy tắc" để bắt đầu</p>
        </Card>
      ) : (
        <div className="space-y-3">
          <AnimatePresence>
            {rules.map((rule, i) => (
              <motion.div
                key={rule.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ delay: i * 0.05 }}
              >
                {(() => {
                  const isTogglingThis = toggleMutation.isPending && toggleMutation.variables?.id === rule.id;
                  const isDeletingThis = deleteMutation.isPending && deleteMutation.variables === rule.id;
                  const isRulePending = isTogglingThis || isDeletingThis;

                  return (
                <Card className={cn("p-5 border-0 shadow-sm transition-opacity", (!rule.is_active || isDeletingThis) && "opacity-50")}>
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h3 className="font-semibold">{rule.name}</h3>
                      <div className="flex items-center gap-2 mt-2 text-sm text-muted-foreground flex-wrap">
                        {(() => {
                          const ruleNodeId = rule.node_id ?? rule.nodeId;
                          const nodeLabel = ruleNodeId ? SENSOR_NODE_LABELS[ruleNodeId] : null;
                          return nodeLabel ? (
                            <Badge variant="outline" className="text-[10px] border-primary/30 bg-primary/5 text-primary">
                              {nodeLabel}
                            </Badge>
                          ) : (
                            <Badge variant="outline" className="text-[10px]">Tất cả</Badge>
                          );
                        })()}
                        <span className="px-2 py-0.5 bg-muted rounded-md">{SENSOR_LABELS[rule.sensor_type]}</span>
                        <span>{conditionLabels[rule.condition]}</span>
                        <span className="font-semibold text-foreground">{rule.threshold}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                        <span className="px-2 py-0.5 bg-primary/10 text-primary rounded-md">
                          {actionLabels[rule.action]} {getDeviceLabel(rule.target_device)}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={rule.is_active}
                        disabled={isRulePending || !canManageRules}
                        onCheckedChange={(checked) => toggleMutation.mutate({ id: rule.id, is_active: checked })}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={isRulePending || !canManageRules}
                        onClick={() => deleteMutation.mutate(rule.id)}
                        className="text-muted-foreground hover:text-destructive"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
                  );
                })()}
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
