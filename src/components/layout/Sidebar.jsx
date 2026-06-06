import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, Sliders, Zap, Bell, BarChart3, Leaf, Menu, X, LogOut, Settings, Sun, Moon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import MqttStatusBadge from './MqttStatusBadge';
import { useAuth } from '@/lib/AuthContext';
import { useTheme } from '@/lib/ThemeContext';

const navItems = [
  { path: '/', label: 'Tổng quan', icon: LayoutDashboard },
  { path: '/controls', label: 'Điều khiển', icon: Sliders },
  { path: '/automation', label: 'Tự động hóa', icon: Zap },
  { path: '/alerts', label: 'Cảnh báo', icon: Bell },
  { path: '/history', label: 'Lịch sử', icon: BarChart3 },
  { path: '/settings', label: 'Cài đặt', icon: Settings },
];

export default function Sidebar() {
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user, logout } = useAuth();
  const { isDark, toggle } = useTheme();

  const NavContent = () => (
    <>
      <div className="flex items-center gap-3 px-6 py-6 border-b border-sidebar-border">
        <div className="w-10 h-10 rounded-xl bg-sidebar-primary/20 flex items-center justify-center">
          <Leaf className="w-5 h-5 text-sidebar-primary" />
        </div>
        <div>
          <h1 className="text-base font-bold text-sidebar-foreground tracking-tight">GreenHouse</h1>
          <p className="text-xs text-sidebar-foreground/50">Giám sát nhà kính</p>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200",
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-lg shadow-sidebar-primary/25"
                  : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
              )}
            >
              <item.icon className="w-4.5 h-4.5" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-4 py-4 border-t border-sidebar-border">
        <MqttStatusBadge />

        {/* Dark / Light toggle */}
        <button
          type="button"
          onClick={toggle}
          className="mt-3 w-full flex items-center justify-between px-3 py-2 rounded-lg text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors"
        >
          <span className="text-xs font-medium">{isDark ? 'Giao diện tối' : 'Giao diện sáng'}</span>
          <div className={cn(
            'relative flex h-5 w-9 items-center rounded-full transition-colors',
            isDark ? 'bg-sidebar-primary' : 'bg-sidebar-foreground/20',
          )}>
            <span className={cn(
              'absolute flex h-4 w-4 items-center justify-center rounded-full bg-white shadow transition-transform',
              isDark ? 'translate-x-[18px]' : 'translate-x-0.5',
            )}>
              {isDark
                ? <Moon className="h-2.5 w-2.5 text-sidebar-primary" />
                : <Sun className="h-2.5 w-2.5 text-amber-500" />}
            </span>
          </div>
        </button>

        {/* User */}
        <div className="mt-2 flex items-center justify-between gap-3 px-3">
          <div className="min-w-0">
            <p className="truncate text-xs font-medium text-sidebar-foreground">{user?.name || 'User'}</p>
            <p className="truncate text-[11px] text-sidebar-foreground/50">{user?.role || 'viewer'}</p>
          </div>
          <button
            type="button"
            onClick={logout}
            className="p-2 rounded-lg text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
            title="Đăng xuất"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setMobileOpen(!mobileOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-xl bg-card shadow-lg border border-border"
      >
        {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-40"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed top-0 left-0 h-screen w-64 bg-sidebar flex flex-col z-40 transition-transform duration-300",
        "lg:translate-x-0",
        mobileOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <NavContent />
      </aside>
    </>
  );
}
