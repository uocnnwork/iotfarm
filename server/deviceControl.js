import {
  getDeviceDefinition,
  getDeviceLabel,
  isKnownDeviceId,
  toDeviceMqttPayload,
} from "./config/devices.js";
import { DEVICE_CONTROL_TOPICS, GATEWAY_CONTROL_TOPIC, LED_BRIGHTNESS_TOPIC, FAN_SPEED_TOPIC, INTERVAL_CONTROL_TOPIC } from "./mqttTopics.js";
import { publishMqtt } from "./mqtt.js";
import { broadcastRealtime } from "./realtime.js";
import { createDeviceCommandLog } from "./repositories/deviceCommandLogRepository.js";
import { upsertDeviceByName } from "./repositories/deviceRepository.js";

export { getDeviceLabel };

export const DEVICE_ALIASES = {
  pump_1: ["pump_1", "pump", "bơm khu 1", "bom khu 1"],
  mist_1: ["mist_1", "mist", "phun sương khu 1", "phun suong khu 1"],
  pump_2: ["pump_2", "bơm khu 2", "bom khu 2"],
  mist_2: ["mist_2", "phun sương khu 2", "phun suong khu 2"],
  fan: ["fan", "quạt", "quat", "thông gió", "thong gio"],
  led: ["led", "light", "đèn", "den", "ánh sáng", "anh sang"],
};

export function isValidDeviceId(deviceId) {
  return isKnownDeviceId(deviceId) && Boolean(DEVICE_CONTROL_TOPICS[deviceId]);
}

export function getActionLabel(isOn) {
  return isOn ? "Bật" : "Tắt";
}

export function toDeviceAction(isOn) {
  return isOn ? "turn_on" : "turn_off";
}

export function toDevicePayload({ deviceId, isOn, source = "manual" }) {
  return toDeviceMqttPayload({ deviceId, isOn, source });
}

export function normalizeUpdateFrequencySeconds(value) {
  const seconds = Number(value);
  if (!Number.isInteger(seconds) || seconds <= 0) return null;
  return seconds;
}

export function toGatewayUpdateFrequencyPayload({ seconds, source = "manual" }) {
  return {
    target: "gateway",
    command: "set_update_frequency",
    update_frequency_seconds: seconds,
    unit: "seconds",
    source,
  };
}

export function normalizeDeviceCommand({ deviceId, action, isOn }) {
  const normalizedDeviceId = String(deviceId || "").trim();
  const normalizedAction = String(action || "").trim();
  let nextIsOn = typeof isOn === "boolean" ? isOn : null;

  if (nextIsOn == null) {
    if (normalizedAction === "turn_on" || normalizedAction === "on") nextIsOn = true;
    if (normalizedAction === "turn_off" || normalizedAction === "off") nextIsOn = false;
  }

  if (!isValidDeviceId(normalizedDeviceId) || nextIsOn == null) {
    return null;
  }

  return {
    deviceId: normalizedDeviceId,
    isOn: nextIsOn,
    action: toDeviceAction(nextIsOn),
  };
}

export async function executeDeviceCommand({ deviceId, isOn, requestedBy = null, source = "manual" }) {
  const command = normalizeDeviceCommand({ deviceId, isOn });
  if (!command) {
    const error = new Error("Lệnh thiết bị không hợp lệ");
    error.status = 400;
    throw error;
  }

  const definition = getDeviceDefinition(command.deviceId);
  const topic = DEVICE_CONTROL_TOPICS[command.deviceId];
  const device = await upsertDeviceByName({
    name: definition.id,
    type: definition.type,
    scope: definition.scope,
    node_id: definition.node_id,
    ...(source === "manual" ? { mode: "manual" } : {}),
  });

  let payload;
  try {
    // pump và mist: ESP32 nhận "1" (bật) hoặc "0" (tắt)
    if (["pump_1", "pump_2", "mist_1", "mist_2"].includes(command.deviceId)) {
      payload = command.isOn ? "1" : "0";
    } else {
      payload = toDevicePayload({
        deviceId: command.deviceId,
        isOn: command.isOn,
        source,
      });
    }
  } catch (error) {
    error.status = error.status || 400;
    throw error;
  }

  let commandLog = null;

  try {
    await publishMqtt(topic, payload, { qos: 1 });
    commandLog = await createDeviceCommandLog({
      device_id: device.id,
      device_name: device.name,
      command: command.action,
      source,
      requested_by: requestedBy,
      mqtt_published: true,
      device_confirmed: false,
    });
    broadcastRealtime("device_command:new", commandLog);
  } catch (error) {
    const failedCommandLog = await createDeviceCommandLog({
      device_id: device.id,
      device_name: device.name,
      command: command.action,
      source,
      requested_by: requestedBy,
      mqtt_published: false,
      device_confirmed: false,
    }).catch((logError) => {
      console.error("[DeviceControl] Failed to record MQTT publish failure:", logError.message);
      return null;
    });
    if (failedCommandLog) broadcastRealtime("device_command:new", failedCommandLog);
    throw error;
  }

  return {
    device,
    commandLog,
    topic,
    payload,
    action: command.action,
    message: `Đã gửi lệnh ${getActionLabel(command.isOn).toLowerCase()} ${getDeviceLabel(command.deviceId)}, đang chờ thiết bị phản hồi.`,
  };
}

/**
 * Gửi độ sáng LED tới ESP32 qua topic led_control.
 * ESP32 nhận chuỗi số nguyên, ví dụ "50" → PWM 127.
 */
export async function publishLedBrightness({ percent }) {
  const value = Math.round(Number(percent));
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    const error = new Error("Độ sáng LED phải là số từ 0 đến 100");
    error.status = 400;
    throw error;
  }

  await publishMqtt(LED_BRIGHTNESS_TOPIC, String(value), { qos: 1 });
  await updateDeviceByName("led", { led_brightness: value, is_on: value > 0 });

  return {
    topic: LED_BRIGHTNESS_TOPIC,
    percent: value,
    message: `Đã gửi độ sáng LED: ${value}%`,
  };
}

/**
 * Gửi tốc độ quạt tới ESP32 qua topic fan_control.
 * ESP32 nhận chuỗi số nguyên, ví dụ "75" → PWM 191.
 */
export async function publishFanSpeed({ percent }) {
  const value = Math.round(Number(percent));
  if (!Number.isFinite(value) || value < 0 || value > 100) {
    const error = new Error("Tốc độ quạt phải là số từ 0 đến 100");
    error.status = 400;
    throw error;
  }

  await publishMqtt(FAN_SPEED_TOPIC, String(value), { qos: 1 });
  await updateDeviceByName("fan", { fan_speed: value, is_on: value > 0 });

  return {
    topic: FAN_SPEED_TOPIC,
    percent: value,
    message: `Đã gửi tốc độ quạt: ${value}%`,
  };
}

/**
 * Gửi chu kỳ gửi dữ liệu tới ESP32 qua topic interval_control.
 * ESP32 nhận chuỗi số nguyên giây, ví dụ "10".
 */
export async function publishNodeInterval({ seconds }) {
  const value = Math.round(Number(seconds));
  if (!Number.isFinite(value) || value < 1) {
    const error = new Error("Chu kỳ phải là số nguyên dương tối thiểu 1 giây");
    error.status = 400;
    throw error;
  }

  await publishMqtt(INTERVAL_CONTROL_TOPIC, String(value), { qos: 1 });

  return {
    topic: INTERVAL_CONTROL_TOPIC,
    seconds: value,
    message: `Đã gửi chu kỳ cập nhật: ${value} giây`,
  };
}

export async function publishGatewayUpdateFrequency({ seconds, source = "manual" }) {  const normalizedSeconds = normalizeUpdateFrequencySeconds(seconds);
  if (normalizedSeconds == null) {
    const error = new Error("Tần suất cập nhật phải là số nguyên dương tính bằng giây");
    error.status = 400;
    throw error;
  }

  const payload = toGatewayUpdateFrequencyPayload({
    seconds: normalizedSeconds,
    source,
  });

  await publishMqtt(GATEWAY_CONTROL_TOPIC, payload, { qos: 1 });

  return {
    topic: GATEWAY_CONTROL_TOPIC,
    payload,
    seconds: normalizedSeconds,
    message: `Đã gửi tần suất cập nhật ${normalizedSeconds} giây cho chế độ tiết kiệm pin.`,
  };
}
