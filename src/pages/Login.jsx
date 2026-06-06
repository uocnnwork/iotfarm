import React, { useState } from 'react';
import { Eye, EyeOff, Leaf, Lock, UserPlus } from 'lucide-react';
import { useAuth } from '@/lib/AuthContext';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export default function Login() {
  const { login, register } = useAuth();
  const [mode, setMode] = useState('login');
  const [form, setForm] = useState({ username: '', password: '' });
  const [registerForm, setRegisterForm] = useState({ username: '', password: '', confirmPassword: '' });
  const [visiblePasswords, setVisiblePasswords] = useState({});
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const switchMode = (nextMode) => {
    setMode(nextMode);
    setError('');
    setSuccess('');
  };

  const handleLogin = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');
    setIsSubmitting(true);

    try {
      await login(form);
    } catch (err) {
      setError(err?.message || 'Đăng nhập thất bại');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRegister = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (registerForm.password !== registerForm.confirmPassword) {
      setError('Mật khẩu xác nhận không khớp');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await register({
        username: registerForm.username,
        password: registerForm.password,
      });
      setSuccess(result?.message || 'Đăng ký thành công. Vui lòng chờ admin duyệt tài khoản.');
      setRegisterForm({ username: '', password: '', confirmPassword: '' });
      setMode('login');
      setForm((prev) => ({ ...prev, username: registerForm.username, password: '' }));
    } catch (err) {
      setError(err?.message || 'Đăng ký thất bại');
    } finally {
      setIsSubmitting(false);
    }
  };

  const isLogin = mode === 'login';
  const togglePasswordVisibility = (key) => {
    setVisiblePasswords((current) => ({ ...current, [key]: !current[key] }));
  };

  const renderPasswordInput = ({ id, value, onChange, autoComplete }) => {
    const isVisible = Boolean(visiblePasswords[id]);
    const Icon = isVisible ? EyeOff : Eye;

    return (
      <div className="relative">
        <Input
          id={id}
          type={isVisible ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          className="pr-10"
          required
        />
        <button
          type="button"
          aria-label={isVisible ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
          onClick={() => togglePasswordVisibility(id)}
          className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-muted-foreground hover:text-foreground"
        >
          <Icon className="h-4 w-4" />
        </button>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="w-full max-w-sm p-6 border-0 shadow-sm">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
            <Leaf className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">GreenHouse</h1>
            <p className="text-sm text-muted-foreground">
              {isLogin ? 'Đăng nhập hệ thống' : 'Đăng ký tài khoản mới'}
            </p>
          </div>
        </div>

        {success && (
          <div className="mb-4 rounded-md bg-primary/10 px-3 py-2 text-sm text-primary">
            {success}
          </div>
        )}

        {isLogin ? (
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Tài khoản</Label>
              <Input
                id="username"
                value={form.username}
                onChange={(event) => setForm({ ...form, username: event.target.value })}
                autoComplete="username"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Mật khẩu</Label>
              {renderPasswordInput({
                id: 'password',
                value: form.password,
                onChange: (event) => setForm({ ...form, password: event.target.value }),
                autoComplete: 'current-password',
              })}
            </div>

            {error && (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              <Lock className="w-4 h-4" />
              {isSubmitting ? 'Đang đăng nhập...' : 'Đăng nhập'}
            </Button>
          </form>
        ) : (
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="register-username">Tài khoản</Label>
              <Input
                id="register-username"
                value={registerForm.username}
                onChange={(event) => setRegisterForm({ ...registerForm, username: event.target.value })}
                autoComplete="username"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="register-password">Mật khẩu</Label>
              {renderPasswordInput({
                id: 'register-password',
                value: registerForm.password,
                onChange: (event) => setRegisterForm({ ...registerForm, password: event.target.value }),
                autoComplete: 'new-password',
              })}
            </div>

            <div className="space-y-2">
              <Label htmlFor="register-confirm-password">Xác nhận mật khẩu</Label>
              {renderPasswordInput({
                id: 'register-confirm-password',
                value: registerForm.confirmPassword,
                onChange: (event) => setRegisterForm({ ...registerForm, confirmPassword: event.target.value }),
                autoComplete: 'new-password',
              })}
            </div>

            {error && (
              <div className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </div>
            )}

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              <UserPlus className="w-4 h-4" />
              {isSubmitting ? 'Đang đăng ký...' : 'Đăng ký'}
            </Button>
          </form>
        )}

        <Button
          type="button"
          variant="ghost"
          className="mt-3 w-full"
          onClick={() => switchMode(isLogin ? 'register' : 'login')}
          disabled={isSubmitting}
        >
          {isLogin ? 'Tạo tài khoản mới' : 'Quay lại đăng nhập'}
        </Button>

        <div className="mt-5 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          {isLogin
            ? 'Đăng nhập bằng tài khoản đã được admin cấp hoặc duyệt.'
            : 'Tài khoản mới cần admin duyệt trước khi đăng nhập.'}
        </div>
      </Card>
    </div>
  );
}
