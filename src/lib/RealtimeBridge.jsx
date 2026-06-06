import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
const TOKEN_KEY = 'greenhouse_auth_token';
const RECONNECT_DELAY_MS = 3000;

const invalidationsByEvent = {
  'sensor:update': [['sensorData']],
  'alert:new': [['alerts']],
  'alert:update': [['alerts']],
  'alert:delete': [['alerts']],
  'alert_threshold:update': [['alertThresholds'], ['alerts']],
  'device:update': [['devices']],
  'device:delete': [['devices']],
  'device_command:new': [['deviceCommandLogs']],
  'device_command:update': [['deviceCommandLogs'], ['devices']],
  'automation_rule:change': [['automationRules']],
  'plant:change': [['userPlants'], ['chatbotPlants']],
  'user:change': [['users']],
};

function createRealtimeUrl() {
  const token = localStorage.getItem(TOKEN_KEY);
  if (!token) return null;

  const url = new URL(API_BASE_URL, window.location.origin);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
  url.pathname = '/realtime';
  url.search = '';
  url.searchParams.set('token', token);
  return url.toString();
}

export default function RealtimeBridge({ enabled = true }) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return undefined;

    let socket = null;
    let reconnectTimer = null;
    let stopped = false;

    const invalidateForEvent = (eventType) => {
      const queryKeys = invalidationsByEvent[eventType] || [];
      for (const queryKey of queryKeys) {
        queryClient.invalidateQueries({ queryKey });
      }
    };

    const connect = () => {
      const realtimeUrl = createRealtimeUrl();
      if (!realtimeUrl || stopped) return;

      socket = new WebSocket(realtimeUrl);

      socket.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          invalidateForEvent(message.type);
        } catch (error) {
          console.error('[Realtime] Invalid WebSocket message:', error);
        }
      };

      socket.onclose = () => {
        if (stopped) return;
        reconnectTimer = window.setTimeout(connect, RECONNECT_DELAY_MS);
      };

      socket.onerror = () => {
        socket?.close();
      };
    };

    connect();

    return () => {
      stopped = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, [enabled, queryClient]);

  return null;
}
