import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { appClient } from '@/api/appClient';
import { useToast } from '@/components/ui/use-toast';
import { useAuth } from '@/lib/AuthContext';
import { cn } from '@/lib/utils';
import { SENSOR_NODE_LABELS } from '@/config/greenhouse';

const TABS = [
  { key: 'profile', label: 'Hồ sơ' },
  { key: 'users', label: 'Người dùng', adminOnly: true },
  { key: 'plants', label: 'Cây trồng' },
];

const ROLE_BADGES = {
  admin: { className: 'bg-green-100 text-green-700 hover:bg-green-100', label: 'Admin' },
  operator: { className: 'bg-blue-100 text-blue-700 hover:bg-blue-100', label: 'Vận hành' },
  viewer: { className: 'bg-slate-100 text-slate-700 hover:bg-slate-100', label: 'Chỉ xem' },
};

const USER_STATUS_BADGES = {
  pending: { className: 'bg-amber-100 text-amber-700 hover:bg-amber-100', label: 'Chờ duyệt' },
  active: { className: 'bg-emerald-100 text-emerald-700 hover:bg-emerald-100', label: 'Hoạt động' },
  rejected: { className: 'bg-red-100 text-red-700 hover:bg-red-100', label: 'Từ chối' },
  disabled: { className: 'bg-slate-100 text-slate-700 hover:bg-slate-100', label: 'Đã khóa' },
};

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'operator', label: 'Vận hành' },
  { value: 'viewer', label: 'Chỉ xem' },
];

const USER_STATUS_OPTIONS = [
  { value: 'pending', label: 'Chờ duyệt' },
  { value: 'active', label: 'Hoạt động' },
  { value: 'rejected', label: 'Từ chối' },
  { value: 'disabled', label: 'Đã khóa' },
];

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
const TOKEN_KEY = 'greenhouse_auth_token';
const EMPTY_PLANT_FORM = {
  name: '',
  location: '',
  node_id: '',
  plant_profile_id: '',
  planted_at: '',
  notes: '',
};
const EMPTY_USER_FORM = {
  username: '',
  password: '',
  role: 'operator',
  status: 'active',
};
const MANUAL_PLANT_PROFILE_VALUE = 'manual';

async function changePasswordRequest({ currentPassword, newPassword }) {
  const token = localStorage.getItem(TOKEN_KEY);
  const response = await fetch(`${API_BASE_URL}/auth/password`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ currentPassword, newPassword }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const error = new Error(errorBody.message || 'Đổi mật khẩu thất bại');
    error.status = response.status;
    throw error;
  }

  if (response.status === 204) return null;
  return response.json();
}

async function listPlantProfiles() {
  return appClient.entities.PlantProfile.list('name', 500, { active: true });
}

async function listUserPlants() {
  return appClient.entities.UserPlant.list('location', 500, {
    active: true,
    sortOrder: 'asc',
  });
}

async function saveUserPlant(data) {
  const payload = {
    name: data.name.trim(),
    location: data.location.trim() || null,
    node_id: data.node_id || null,
    plant_profile_id: data.plant_profile_id || null,
    planted_at: data.planted_at || null,
    notes: data.notes.trim() || null,
    active: true,
  };

  if (data.id) return appClient.entities.UserPlant.update(data.id, payload);
  return appClient.entities.UserPlant.create(payload);
}

async function deactivateUserPlant(id) {
  return appClient.entities.UserPlant.delete(id);
}

async function listUsers() {
  return appClient.entities.User.list('created_at', 500);
}

async function createUser(data) {
  return appClient.entities.User.create(data);
}

async function updateUser(id, patch) {
  return appClient.entities.User.update(id, patch);
}

async function deleteUser(id) {
  return appClient.entities.User.delete(id);
}

function RoleBadge({ role }) {
  const config = ROLE_BADGES[role] || ROLE_BADGES.viewer;
  return <Badge className={config.className}>{config.label}</Badge>;
}

function UserStatusBadge({ status }) {
  const config = USER_STATUS_BADGES[status] || USER_STATUS_BADGES.pending;
  return <Badge className={config.className}>{config.label}</Badge>;
}

function ProfileTab() {
  const { user } = useAuth();
  const { toast } = useToast();

  const [form, setForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [validationError, setValidationError] = useState('');

  const mutation = useMutation({
    mutationFn: changePasswordRequest,
    onSuccess: () => {
      setForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      setValidationError('');
      toast({
        title: 'Đổi mật khẩu thành công',
        description: 'Mật khẩu của bạn đã được cập nhật.',
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Đổi mật khẩu thất bại',
        description: error?.message || 'Đã có lỗi xảy ra, vui lòng thử lại.',
      });
    },
  });

  const handleChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    setValidationError('');

    if (!form.currentPassword) {
      setValidationError('Vui lòng nhập mật khẩu hiện tại.');
      return;
    }
    if (form.newPassword.length < 6) {
      setValidationError('Mật khẩu mới phải có tối thiểu 6 ký tự.');
      return;
    }
    if (form.newPassword !== form.confirmPassword) {
      setValidationError('Mật khẩu xác nhận không khớp với mật khẩu mới.');
      return;
    }

    mutation.mutate({
      currentPassword: form.currentPassword,
      newPassword: form.newPassword,
    });
  };

  return (
    <div className="space-y-6">
      <Card className="p-6 border-0 shadow-sm">
        <h2 className="text-base font-semibold">Thông tin cá nhân</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Thông tin tài khoản đăng nhập hệ thống
        </p>

        <div className="mt-5 grid gap-5 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="profile-username">Tên đăng nhập</Label>
            <Input
              id="profile-username"
              value={user?.username || ''}
              disabled
              readOnly
            />
          </div>

          <div className="space-y-2">
            <Label>Vai trò</Label>
            <div className="flex h-10 items-center">
              <RoleBadge role={user?.role} />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Trạng thái</Label>
            <div className="flex h-10 items-center">
              <UserStatusBadge status={user?.status || 'active'} />
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6 border-0 shadow-sm">
        <h2 className="text-base font-semibold">Đổi mật khẩu</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Cập nhật mật khẩu mới để bảo vệ tài khoản
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4 max-w-md">
          <div className="space-y-2">
            <Label htmlFor="current-password">Mật khẩu hiện tại</Label>
            <Input
              id="current-password"
              type="password"
              autoComplete="current-password"
              value={form.currentPassword}
              onChange={handleChange('currentPassword')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-password">Mật khẩu mới</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              value={form.newPassword}
              onChange={handleChange('newPassword')}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="confirm-password">Xác nhận mật khẩu mới</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              value={form.confirmPassword}
              onChange={handleChange('confirmPassword')}
            />
          </div>

          {validationError && (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {validationError}
            </div>
          )}

          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? 'Đang cập nhật...' : 'Cập nhật mật khẩu'}
          </Button>
        </form>
      </Card>
    </div>
  );
}

function UserManagementTab() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY_USER_FORM);

  const { data: users = [], isLoading } = useQuery({
    queryKey: ['users'],
    queryFn: listUsers,
    refetchOnMount: 'always',
  });

  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      setForm(EMPTY_USER_FORM);
      toast({ title: 'Đã tạo tài khoản' });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Tạo tài khoản thất bại',
        description: error?.message || 'Không thể tạo tài khoản.',
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, patch }) => updateUser(id, patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast({ title: 'Đã cập nhật tài khoản' });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Cập nhật tài khoản thất bại',
        description: error?.message || 'Không thể cập nhật tài khoản.',
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users'] });
      toast({ title: 'Đã xóa tài khoản' });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Xóa tài khoản thất bại',
        description: error?.message || 'Không thể xóa tài khoản.',
      });
    },
  });

  const pendingUsers = users.filter((item) => item.status === 'pending');
  const isCreating = createMutation.isPending;

  const handleCreate = (event) => {
    event.preventDefault();
    if (!form.username.trim() || form.password.length < 6) {
      toast({
        variant: 'destructive',
        title: 'Dữ liệu chưa hợp lệ',
        description: 'Tên đăng nhập là bắt buộc và mật khẩu phải có tối thiểu 6 ký tự.',
      });
      return;
    }

    createMutation.mutate({
      username: form.username.trim(),
      password: form.password,
      role: form.role,
      status: form.status,
    });
  };

  const updateAccount = (id, patch) => {
    updateMutation.mutate({ id, patch });
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(320px,420px)_1fr]">
      <Card className="p-6 border-0 shadow-sm">
        <h2 className="text-base font-semibold">Tạo tài khoản</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Tài khoản do admin tạo có thể hoạt động ngay hoặc để ở trạng thái chờ duyệt
        </p>

        <form onSubmit={handleCreate} className="mt-5 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-user-username">Tên đăng nhập</Label>
            <Input
              id="new-user-username"
              value={form.username}
              onChange={(event) => setForm((prev) => ({ ...prev, username: event.target.value }))}
              disabled={isCreating}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="new-user-password">Mật khẩu tạm thời</Label>
            <Input
              id="new-user-password"
              type="password"
              value={form.password}
              onChange={(event) => setForm((prev) => ({ ...prev, password: event.target.value }))}
              disabled={isCreating}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Vai trò</Label>
              <Select
                value={form.role}
                onValueChange={(value) => setForm((prev) => ({ ...prev, role: value }))}
                disabled={isCreating}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Trạng thái</Label>
              <Select
                value={form.status}
                onValueChange={(value) => setForm((prev) => ({ ...prev, status: value }))}
                disabled={isCreating}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {USER_STATUS_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button type="submit" disabled={isCreating}>
            {isCreating ? 'Đang tạo...' : 'Tạo tài khoản'}
          </Button>
        </form>
      </Card>

      <Card className="p-6 border-0 shadow-sm">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">Quản lý người dùng</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Duyệt tài khoản đăng ký mới và phân quyền truy cập
            </p>
          </div>
          <Badge variant="outline" className="w-fit">
            {pendingUsers.length} chờ duyệt
          </Badge>
        </div>

        <div className="mt-5 space-y-3">
          {isLoading ? (
            Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-24 rounded-md border bg-muted/40 animate-pulse" />
            ))
          ) : users.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              Chưa có tài khoản nào
            </div>
          ) : (
            users.map((account) => {
              const isCurrentUser = account.id === user?.id;
              const isUpdatingThis =
                updateMutation.isPending && updateMutation.variables?.id === account.id;
              const isDeletingThis =
                deleteMutation.isPending && deleteMutation.variables === account.id;
              const isBusy = isUpdatingThis || isDeletingThis;

              return (
                <div
                  key={account.id}
                  className="flex flex-col gap-4 rounded-md border p-4 lg:flex-row lg:items-center lg:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium">{account.username}</h3>
                      {isCurrentUser && <Badge variant="outline">Bạn</Badge>}
                      <RoleBadge role={account.role} />
                      <UserStatusBadge status={account.status} />
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Tạo ngày {account.created_at ? String(account.created_at).slice(0, 10) : 'không rõ'}
                    </p>
                  </div>

                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <Select
                      value={account.role}
                      onValueChange={(value) => updateAccount(account.id, { role: value })}
                      disabled={isBusy || isCurrentUser}
                    >
                      <SelectTrigger className="w-full sm:w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {ROLE_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select
                      value={account.status || 'active'}
                      onValueChange={(value) => updateAccount(account.id, { status: value })}
                      disabled={isBusy || isCurrentUser}
                    >
                      <SelectTrigger className="w-full sm:w-36">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {USER_STATUS_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    {account.status === 'pending' && (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => updateAccount(account.id, { status: 'active' })}
                          disabled={isBusy}
                        >
                          Duyệt
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => updateAccount(account.id, { status: 'rejected' })}
                          disabled={isBusy}
                        >
                          Từ chối
                        </Button>
                      </>
                    )}

                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => deleteMutation.mutate(account.id)}
                      disabled={isBusy || isCurrentUser}
                    >
                      {isDeletingThis ? 'Đang xóa...' : 'Xóa'}
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>
    </div>
  );
}

function formatPlantLabel(plant) {
  const profileName = plant?.plant_profile?.name || plant?.plantProfile?.name || plant?.name || 'Cây nhập tay';
  const nodeLabel = plant?.node_id ? SENSOR_NODE_LABELS[plant.node_id] : null;
  const parts = [];
  if (nodeLabel) parts.push(nodeLabel);
  if (plant?.location) parts.push(plant.location);

  if (parts.length === 0) return profileName;
  return `${profileName} - ${parts.join(' - ')}`;
}

function PlantsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(EMPTY_PLANT_FORM);
  const [editingId, setEditingId] = useState(null);

  const { data: profiles = [], isLoading: isLoadingProfiles } = useQuery({
    queryKey: ['plantProfiles', 'active'],
    queryFn: listPlantProfiles,
  });
  const { data: plants = [], isLoading: isLoadingPlants } = useQuery({
    queryKey: ['userPlants', 'active'],
    queryFn: listUserPlants,
  });

  const saveMutation = useMutation({
    mutationFn: saveUserPlant,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userPlants'] });
      queryClient.invalidateQueries({ queryKey: ['chatbotPlants'] });
      setForm(EMPTY_PLANT_FORM);
      setEditingId(null);
      toast({
        title: editingId ? 'Đã cập nhật cây trồng' : 'Đã thêm cây trồng',
        description: 'Danh sách cây đang trồng đã được cập nhật.',
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Lưu cây trồng thất bại',
        description: error?.message || 'Đã có lỗi xảy ra, vui lòng thử lại.',
      });
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: deactivateUserPlant,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['userPlants'] });
      queryClient.invalidateQueries({ queryKey: ['chatbotPlants'] });
      toast({
        title: 'Đã ngừng theo dõi cây trồng',
        description: 'Cây này không còn xuất hiện trong danh sách cây đang trồng.',
      });
    },
    onError: (error) => {
      toast({
        variant: 'destructive',
        title: 'Không thể ngừng theo dõi',
        description: error?.message || 'Đã có lỗi xảy ra, vui lòng thử lại.',
      });
    },
  });

  const handleChange = (field) => (event) => {
    setForm((prev) => ({ ...prev, [field]: event.target.value }));
  };

  const handleSubmit = (event) => {
    event.preventDefault();

    if (!form.name.trim()) {
      toast({
        variant: 'destructive',
        title: 'Thiếu tên cây/khu vực',
        description: 'Vui lòng nhập tên để nhận diện cây đang trồng.',
      });
      return;
    }

    saveMutation.mutate({ ...form, id: editingId });
  };

  const startEdit = (plant) => {
    setEditingId(plant.id);
    setForm({
      name: plant.name || '',
      location: plant.location || '',
      node_id: plant.node_id || plant.nodeId || '',
      plant_profile_id: plant.plant_profile_id || plant.plantProfileId || '',
      planted_at: plant.planted_at ? String(plant.planted_at).slice(0, 10) : '',
      notes: plant.notes || '',
    });
  };

  const resetForm = () => {
    setEditingId(null);
    setForm(EMPTY_PLANT_FORM);
  };

  const isSaving = saveMutation.isPending;
  const isLoading = isLoadingProfiles || isLoadingPlants;

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(320px,420px)_1fr]">
      <Card className="p-6 border-0 shadow-sm">
        <h2 className="text-base font-semibold">
          {editingId ? 'Sửa cây đang trồng' : 'Thêm cây đang trồng'}
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Chọn PlantProfile có sẵn hoặc nhập tên cây trực tiếp từ bàn phím
        </p>

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="plant-profile">PlantProfile hoặc nhập tay</Label>
            <Select
              value={form.plant_profile_id || MANUAL_PLANT_PROFILE_VALUE}
              onValueChange={(value) => setForm((prev) => ({
                ...prev,
                plant_profile_id: value === MANUAL_PLANT_PROFILE_VALUE ? '' : value,
              }))}
              disabled={isSaving || isLoadingProfiles}
            >
              <SelectTrigger id="plant-profile">
                <SelectValue placeholder="Chọn loại cây" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={MANUAL_PLANT_PROFILE_VALUE}>
                  Nhập tên cây từ bàn phím
                </SelectItem>
                {profiles.map((profile) => (
                  <SelectItem key={profile.id} value={profile.id}>
                    {profile.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {!form.plant_profile_id && (
              <p className="text-xs text-muted-foreground">
                Không dùng hồ sơ cây có sẵn; chatbot sẽ nhận diện theo tên bạn nhập và dùng kiến thức chăm sóc chung.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="plant-name">Tên cây/khu vực</Label>
            <Input
              id="plant-name"
              value={form.name}
              onChange={handleChange('name')}
              placeholder="Ví dụ: Cà chua luống A"
              disabled={isSaving}
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="plant-node-id">Khu vực (để chatbot lấy dữ liệu)</Label>
              <Select
                value={form.node_id || '__all__'}
                onValueChange={(value) => setForm((prev) => ({ ...prev, node_id: value === '__all__' ? '' : value }))}
                disabled={isSaving}
              >
                <SelectTrigger id="plant-node-id">
                  <SelectValue placeholder="Chọn khu vực" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Không xác định</SelectItem>
                  {Object.entries(SENSOR_NODE_LABELS).map(([id, label]) => (
                    <SelectItem key={id} value={id}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="plant-location">Vị trí (mô tả)</Label>
              <Input
                id="plant-location"
                value={form.location}
                onChange={handleChange('location')}
                placeholder="Luống A, Góc trái..."
                disabled={isSaving}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="plant-date">Ngày trồng</Label>
            <Input
              id="plant-date"
              type="date"
              value={form.planted_at}
              onChange={handleChange('planted_at')}
              disabled={isSaving}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="plant-notes">Ghi chú</Label>
            <Input
              id="plant-notes"
              value={form.notes}
              onChange={handleChange('notes')}
              placeholder="Tình trạng, giống cây, khu vực..."
              disabled={isSaving}
            />
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={isSaving}>
              {isSaving ? 'Đang lưu...' : editingId ? 'Lưu thay đổi' : 'Thêm cây'}
            </Button>
            {editingId && (
              <Button type="button" variant="outline" onClick={resetForm} disabled={isSaving}>
                Hủy
              </Button>
            )}
          </div>
        </form>
      </Card>

      <Card className="p-6 border-0 shadow-sm">
        <h2 className="text-base font-semibold">Danh sách cây đang trồng</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Các cây active sẽ xuất hiện trong dropdown chatbot
        </p>

        <div className="mt-5 space-y-3">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-20 rounded-md border bg-muted/40 animate-pulse" />
            ))
          ) : plants.length === 0 ? (
            <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
              Chưa có cây đang trồng
            </div>
          ) : (
            plants.map((plant) => {
              const isDeleting =
                deactivateMutation.isPending && deactivateMutation.variables === plant.id;

              return (
                <div
                  key={plant.id}
                  className="flex flex-col gap-3 rounded-md border p-4 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-medium">{plant.name}</h3>
                      <Badge variant="outline">{plant.plant_profile?.name || 'Nhập tay'}</Badge>
                    </div>
                    <div className="mt-1 text-sm text-muted-foreground">
                      {formatPlantLabel(plant)}
                      {plant.planted_at && ` · Trồng ngày ${String(plant.planted_at).slice(0, 10)}`}
                    </div>
                    {plant.notes && (
                      <p className="mt-1 text-sm text-muted-foreground line-clamp-2">{plant.notes}</p>
                    )}
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => startEdit(plant)}
                      disabled={isSaving || isDeleting}
                    >
                      Sửa
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => deactivateMutation.mutate(plant.id)}
                      disabled={isDeleting}
                    >
                      {isDeleting ? 'Đang tắt...' : 'Ngừng trồng'}
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </Card>
    </div>
  );
}

export default function Settings() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const visibleTabs = TABS.filter((tab) => !tab.adminOnly || isAdmin);

  const [activeTab, setActiveTab] = useState('profile');
  const safeActiveTab = visibleTabs.some((tab) => tab.key === activeTab)
    ? activeTab
    : visibleTabs[0]?.key || 'profile';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Cài đặt</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Quản lý cấu hình hệ thống
        </p>
      </div>

      <div className="flex items-center gap-1 border-b">
        {visibleTabs.map((tab) => {
          const isActive = safeActiveTab === tab.key;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={cn(
                'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                isActive
                  ? 'border-primary text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {safeActiveTab === 'users' && <UserManagementTab />}
      {safeActiveTab === 'plants' && <PlantsTab />}
      {safeActiveTab === 'profile' && <ProfileTab />}
    </div>
  );
}
