import React, { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';
import { Wifi, WifiOff, Loader2 } from 'lucide-react';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

export default function MqttStatusBadge() {
  const [status, setStatus] = useState('reconnecting');

  useEffect(() => {
    let cancelled = false;

    async function checkHealth() {
      try {
        const response = await fetch(`${API_BASE_URL}/health`);
        if (!cancelled) setStatus(response.ok ? 'connected' : 'disconnected');
      } catch {
        if (!cancelled) setStatus('disconnected');
      }
    }

    checkHealth();
    const interval = window.setInterval(checkHealth, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  const config = {
    connected: { icon: Wifi, color: 'text-green-400', dot: 'bg-green-400', label: 'Backend đã kết nối' },
    reconnecting: { icon: Loader2, color: 'text-amber-400', dot: 'bg-amber-400', label: 'Đang kiểm tra...' },
    disconnected: { icon: WifiOff, color: 'text-red-400', dot: 'bg-red-400', label: 'Mất kết nối backend' },
  }[status] || { icon: WifiOff, color: 'text-red-400', dot: 'bg-red-400', label: 'Mất kết nối' };

  const Icon = config.icon;

  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <div className={cn("w-2 h-2 rounded-full flex-shrink-0", config.dot, status === 'connected' && "animate-pulse")} />
      <Icon className={cn("w-3.5 h-3.5 flex-shrink-0", config.color, status === 'reconnecting' && "animate-spin")} />
      <span className={cn("text-xs", config.color)}>{config.label}</span>
    </div>
  );
}
