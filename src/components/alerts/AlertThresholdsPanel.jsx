import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Plus, Trash2, Leaf } from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';
import { appClient } from '@/api/appClient';
import { SENSOR_LABELS, SENSOR_NODE_LABELS, EXPECTED_SENSOR_NODES } from '@/config/greenhouse';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
const TOKEN_KEY = 'greenhouse_auth_token';

const OPERATOR_LABELS = {
  '>': 'Lớn hơn',
  '>=': 'Lớn hơn hoặc bằng',
  '<': 'Nhỏ hơn',
  '<=': 'Nhỏ hơn hoặc bằng',
  '==': 'Bằng',
};

const LEVEL_BADGES = {
  danger: { className: 'bg-red-100 text-red-700 hover:bg-red-100', label: 'Nguy hiểm' },
  warning: { className: 'bg-amber-100 text-amber-700 hover:bg-amber-100', label: 'Cảnh báo' },
  info: { className: 'bg-blue-100 text-blue-700 hover:bg-blue-100', label: 'Thông tin' },
};

// Đọc loại cây đang chọn cho từng node từ localStorage (Dashboard lưu vào đây)
function getPlantByNode() {
  try { return JSON.parse(localStorage.getItem('plantByNode') || '{}'); } catch { return {}; }
}

// Từ plant profile, tạo ra các hàng ngưỡng để hiển thị readonly
function buildProfileThresholdRows(profile, nodeId) {
  if (!profile) return [];
  const rows = [];
  const checks = [
    { key: 'temperature', min: profile.min_temperature, max: profile.max_temperature, unit: '°C' },
    { key: 'humidity', min: profile.min_humidity, max: profile.max_humidity, unit: '%' },
    { key: 'soil_moisture', min: profile.min_soil_moisture, max: profile.max_soil_moisture, unit: '%' },
  ];
  for (const { key, min, max } of checks) {
    if (min != null) rows.push({ key: `${nodeId}-${key}-min`, sensor_type: key, operator: '<', value: min, nodeId });
    if (max != null) rows.push({ key: `${nodeId}-${key}-max`, sensor_type: key, operator: '>', value: max, nodeId });
  }
  return rows;
}

function getAuthHeaders() {
  const token = localStorage.getItem(TOKEN_KEY);
  return { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

async function listThresholds() {
  const response = await fetch(`${API_BASE_URL}/api/AlertThreshold`);
  if (!response.ok) throw new Error('Không tải được danh sách ngưỡng');
  return response.json();
}

async function createThreshold(body) {
  const response = await fetch(`${API_BASE_URL}/api/AlertThreshold`, {
    method: 'POST', headers: getAuthHeaders(), body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw Object.assign(new Error(err.message || 'Tạo ngưỡng thất bại'), { status: response.status });
  }
  return response.json();
}

async function patchThreshold(id, body) {
  const response = await fetch(`${API_BASE_URL}/api/AlertThreshold/${encodeURIComponent(id)}`, {
    method: 'PATCH', headers: getAuthHeaders(), body: JSON.stringify(body),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw Object.assign(new Error(err.message || 'Cập nhật ngưỡng thất bại'), { status: response.status });
  }
  if (response.status === 204) return null;
  return response.json();
}

async function deleteThreshold(id) {
  const response = await fetch(`${API_BASE_URL}/api/AlertThreshold/${encodeURIComponent(id)}`, {
    method: 'DELETE', headers: getAuthHeaders(),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw Object.assign(new Error(err.message || 'Xóa ngưỡng thất bại'), { status: response.status });
  }
  return response.json();
}

const INITIAL_CREATE_FORM = { sensor_type: '', operator: '', value: '', level: 'warning', node_id: '' };

// ─── Plant Profile Thresholds (readonly) ─────────────────────────────────────
function PlantProfileThresholdSection({ profiles }) {
  const plantByNode = getPlantByNode();

  const sections = EXPECTED_SENSOR_NODES.map((nodeId) => {
    const profileId = plantByNode[nodeId];
    const profile = profiles.find((p) => p.id === profileId) ?? null;
    const rows = buildProfileThresholdRows(profile, nodeId);
    return { nodeId, profile, rows };
  });

  const hasAny = sections.some((s) => s.profile);
  if (!hasAny) return (
    <Card className="border-0 p-6 shadow-sm mb-4">
      <div className="flex items-center gap-2 mb-1">
        <Leaf className="h-4 w-4 text-emerald-600" />
        <h2 className="text-base font-semibold">Ngưỡng theo loại cây</h2>
      </div>
      <p className="text-sm text-muted-foreground">
        Chưa chọn loại cây cho khu nào. Vào tab <strong>Tổng quan</strong> để chọn loại cây cho từng khu.
      </p>
    </Card>
  );

  return (
    <Card className="border-0 p-6 shadow-sm mb-4">
      <div className="flex items-center gap-2 mb-4">
        <Leaf className="h-4 w-4 text-emerald-600" />
        <h2 className="text-base font-semibold">Ngưỡng theo loại cây</h2>
        <span className="text-xs text-muted-foreground">(từ dashboard — chỉ xem)</span>
      </div>
      <div className="space-y-5">
        {sections.map(({ nodeId, profile, rows }) => (
          <div key={nodeId}>
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline" className="text-[11px] border-primary/30 bg-primary/5 text-primary">
                {SENSOR_NODE_LABELS[nodeId]}
              </Badge>
              {profile
                ? <span className="text-sm font-medium text-emerald-700">{profile.name}</span>
                : <span className="text-xs text-muted-foreground">Chưa chọn loại cây</span>}
            </div>
            {rows.length > 0 && (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/40 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <th className="px-3 py-2 text-left">Cảm biến</th>
                      <th className="px-3 py-2 text-left">Điều kiện</th>
                      <th className="px-3 py-2 text-left">Ngưỡng</th>
                      <th className="px-3 py-2 text-left">Mức</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr key={row.key} className="border-b last:border-0">
                        <td className="px-3 py-2 font-medium">{SENSOR_LABELS[row.sensor_type]}</td>
                        <td className="px-3 py-2 text-muted-foreground">{OPERATOR_LABELS[row.operator]}</td>
                        <td className="px-3 py-2 font-semibold">{row.value}</td>
                        <td className="px-3 py-2">
                          <Badge className={LEVEL_BADGES.warning.className}>Cảnh báo</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function AlertThresholdsPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState(null);
  const [editingValue, setEditingValue] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState(INITIAL_CREATE_FORM);

  const { data: thresholds = [], isLoading } = useQuery({
    queryKey: ['alertThresholds'],
    queryFn: listThresholds,
  });

  const { data: plantProfiles = [] } = useQuery({
    queryKey: ['plantProfiles', 'active'],
    queryFn: () => appClient.entities.PlantProfile.list('name', 500, { active: true }),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['alertThresholds'] });
    queryClient.invalidateQueries({ queryKey: ['alerts'] });
  };

  const createMutation = useMutation({
    mutationFn: createThreshold,
    onSuccess: () => {
      invalidate();
      setCreateOpen(false);
      setCreateForm(INITIAL_CREATE_FORM);
      toast({ title: 'Đã tạo ngưỡng cảnh báo mới' });
    },
    onError: (e) => toast({ variant: 'destructive', title: 'Tạo ngưỡng thất bại', description: e?.message }),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }) => patchThreshold(id, { active }),
    onSuccess: () => invalidate(),
    onError: (e) => toast({ variant: 'destructive', title: 'Cập nhật thất bại', description: e?.message }),
  });

  const valueMutation = useMutation({
    mutationFn: ({ id, value }) => patchThreshold(id, { value }),
    onSuccess: () => { setEditingId(null); setEditingValue(''); invalidate(); },
    onError: (e) => toast({ variant: 'destructive', title: 'Cập nhật ngưỡng thất bại', description: e?.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: deleteThreshold,
    onSuccess: () => { invalidate(); toast({ title: 'Đã xóa ngưỡng cảnh báo' }); },
    onError: (e) => toast({ variant: 'destructive', title: 'Xóa ngưỡng thất bại', description: e?.message }),
  });

  const handleSave = (id) => {
    const number = Number(editingValue);
    if (!Number.isFinite(number)) {
      toast({ variant: 'destructive', title: 'Giá trị không hợp lệ', description: 'Ngưỡng phải là số.' });
      return;
    }
    valueMutation.mutate({ id, value: number });
  };

  const handleCreateSubmit = (e) => {
    e.preventDefault();
    const value = Number(createForm.value);
    if (!Number.isFinite(value)) { toast({ variant: 'destructive', title: 'Ngưỡng phải là số' }); return; }
    createMutation.mutate({
      sensor_type: createForm.sensor_type,
      operator: createForm.operator,
      value,
      level: createForm.level,
      node_id: createForm.node_id || null,
    });
  };

  return (
    <div className="space-y-0">
      {/* Phần 1: Ngưỡng từ plant profile (readonly) */}
      <PlantProfileThresholdSection profiles={plantProfiles} />

      {/* Phần 2: Ngưỡng thêm tay */}
      <Card className="border-0 p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold">Ngưỡng tùy chỉnh</h2>
            <p className="mt-1 text-sm text-muted-foreground">Thêm ngưỡng cảnh báo thủ công cho từng cảm biến</p>
          </div>
          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2" size="sm"><Plus className="w-4 h-4" />Thêm ngưỡng</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>Tạo ngưỡng cảnh báo mới</DialogTitle></DialogHeader>
              <form onSubmit={handleCreateSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Cảm biến</Label>
                    <Select disabled={createMutation.isPending} value={createForm.sensor_type}
                      onValueChange={(v) => setCreateForm({ ...createForm, sensor_type: v })}>
                      <SelectTrigger><SelectValue placeholder="Chọn" /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(SENSOR_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Điều kiện</Label>
                    <Select disabled={createMutation.isPending} value={createForm.operator}
                      onValueChange={(v) => setCreateForm({ ...createForm, operator: v })}>
                      <SelectTrigger><SelectValue placeholder="Chọn" /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(OPERATOR_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Ngưỡng giá trị</Label>
                    <Input disabled={createMutation.isPending} type="number" value={createForm.value}
                      onChange={(e) => setCreateForm({ ...createForm, value: e.target.value })} placeholder="VD: 40" />
                  </div>
                  <div>
                    <Label>Mức cảnh báo</Label>
                    <Select disabled={createMutation.isPending} value={createForm.level}
                      onValueChange={(v) => setCreateForm({ ...createForm, level: v })}>
                      <SelectTrigger><SelectValue placeholder="Chọn" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="info">Thông tin</SelectItem>
                        <SelectItem value="warning">Cảnh báo</SelectItem>
                        <SelectItem value="danger">Nguy hiểm</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Áp dụng cho khu vực</Label>
                  <Select disabled={createMutation.isPending} value={createForm.node_id || '__all__'}
                    onValueChange={(v) => setCreateForm({ ...createForm, node_id: v === '__all__' ? '' : v })}>
                    <SelectTrigger><SelectValue placeholder="Chọn" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">Tất cả khu vực</SelectItem>
                      {Object.entries(SENSOR_NODE_LABELS).map(([id, label]) => <SelectItem key={id} value={id}>{label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <Button type="submit" className="w-full" disabled={createMutation.isPending}>
                  {createMutation.isPending ? 'Đang tạo...' : 'Tạo ngưỡng'}
                </Button>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        <div className="mt-5 overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="px-3 py-2.5">Cảm biến</th>
                <th className="px-3 py-2.5">Khu vực</th>
                <th className="px-3 py-2.5">Điều kiện</th>
                <th className="px-3 py-2.5">Ngưỡng</th>
                <th className="px-3 py-2.5">Mức</th>
                <th className="px-3 py-2.5">Trạng thái</th>
                <th className="px-3 py-2.5 text-right">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 3 }).map((_, idx) => (
                  <tr key={idx} className="animate-pulse border-b last:border-b-0">
                    {Array.from({ length: 7 }).map((__, c) => (
                      <td key={c} className="px-3 py-3"><div className="h-3 rounded bg-muted/70" /></td>
                    ))}
                  </tr>
                ))
              ) : thresholds.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-8 text-center text-muted-foreground">
                    Chưa có ngưỡng nào. Nhấn &quot;Thêm ngưỡng&quot; để bắt đầu.
                  </td>
                </tr>
              ) : (
                thresholds.map((threshold) => {
                  const isEditing = editingId === threshold.id;
                  const levelConfig = LEVEL_BADGES[threshold.level] || LEVEL_BADGES.warning;
                  const isTogglingThis = toggleMutation.isPending && toggleMutation.variables?.id === threshold.id;
                  const isSavingThis = valueMutation.isPending && valueMutation.variables?.id === threshold.id;
                  const isDeletingThis = deleteMutation.isPending && deleteMutation.variables === threshold.id;
                  const thresholdNodeId = threshold.node_id ?? threshold.nodeId;
                  const nodeLabel = thresholdNodeId ? SENSOR_NODE_LABELS[thresholdNodeId] : null;

                  return (
                    <tr key={threshold.id} className={`border-b last:border-b-0 ${isDeletingThis ? 'opacity-50' : ''}`}>
                      <td className="px-3 py-2.5 font-medium">{SENSOR_LABELS[threshold.sensor_type] || threshold.sensor_type}</td>
                      <td className="px-3 py-2.5">
                        {nodeLabel
                          ? <Badge variant="outline" className="text-[10px] border-primary/30 bg-primary/5 text-primary">{nodeLabel}</Badge>
                          : <span className="text-xs text-muted-foreground">Tất cả</span>}
                      </td>
                      <td className="px-3 py-2.5 text-muted-foreground">{OPERATOR_LABELS[threshold.operator] || threshold.operator}</td>
                      <td className="px-3 py-2.5">
                        {isEditing
                          ? <Input type="number" value={editingValue} onChange={(e) => setEditingValue(e.target.value)} className="h-8 w-28" autoFocus />
                          : <span className="font-medium">{threshold.value}</span>}
                      </td>
                      <td className="px-3 py-2.5"><Badge className={levelConfig.className}>{levelConfig.label}</Badge></td>
                      <td className="px-3 py-2.5">
                        <Switch checked={Boolean(threshold.active)} disabled={isTogglingThis}
                          onCheckedChange={(next) => toggleMutation.mutate({ id: threshold.id, active: next })} />
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {isEditing ? (
                          <div className="flex justify-end gap-2">
                            <Button type="button" size="sm" variant="outline" onClick={() => { setEditingId(null); setEditingValue(''); }} disabled={isSavingThis}>Hủy</Button>
                            <Button type="button" size="sm" onClick={() => handleSave(threshold.id)} disabled={isSavingThis}>
                              {isSavingThis ? 'Đang lưu...' : 'Lưu'}
                            </Button>
                          </div>
                        ) : (
                          <div className="flex justify-end gap-2">
                            <Button type="button" size="sm" variant="outline" onClick={() => { setEditingId(threshold.id); setEditingValue(String(threshold.value ?? '')); }}>Sửa</Button>
                            <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              disabled={isDeletingThis} onClick={() => deleteMutation.mutate(threshold.id)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
