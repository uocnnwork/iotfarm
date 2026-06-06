import { appClient } from '@/api/appClient';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
const TOKEN_KEY = 'greenhouse_auth_token';

async function requestGatewayUpdateFrequency(seconds) {
  const token = localStorage.getItem(TOKEN_KEY);
  const response = await fetch(`${API_BASE_URL}/api/DeviceState/gateway/update-frequency`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ update_frequency_seconds: seconds }),
  });

  if (!response.ok) {
    const errorBody = await response.json().catch(() => ({}));
    const error = new Error(errorBody.message || 'Không thể gửi cấu hình tiết kiệm pin');
    error.status = response.status;
    throw error;
  }

  return response.json();
}

export const deviceService = {
  list() {
    return appClient.entities.DeviceState.list();
  },
  update(id, patch) {
    return appClient.entities.DeviceState.update(id, patch);
  },
  command(deviceId, data) {
    return appClient.devices.command(deviceId, data);
  },
  setLedBrightness(percent) {
    return appClient.devices.setLedBrightness(percent);
  },
  setFanSpeed(percent) {
    return appClient.devices.setFanSpeed(percent);
  },
  updateGatewayFrequency(seconds) {
    return requestGatewayUpdateFrequency(seconds);
  },
  setNodeInterval(seconds) {
    return appClient.devices.setNodeInterval(seconds);
  },
  listCommandLogs(limit = 10) {
    return appClient.entities.DeviceCommandLog.list('-created_date', limit);
  },
};
