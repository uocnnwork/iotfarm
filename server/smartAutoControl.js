/**
 * Smart Auto Control
 * Đánh giá dữ liệu cảm biến theo profile cây đang trồng + ngưỡng alert,
 * tự động bật/tắt thiết bị nếu thiết bị ở chế độ "auto".
 *
 * Quy tắc:
 *  - soil_moisture thấp  → bật bơm (pump_N) của khu đó
 *  - humidity thấp       → bật phun sương (mist_N) của khu đó
 *  - temperature cao     → bật quạt (fan)
 *  - temperature thấp    → bật đèn LED 100%
 *  - Khi chỉ số trở về ngưỡng → tắt thiết bị tương ứng
 *  - Khi bất kỳ thiết bị nào đang xử lý → đẩy interval lên 1s
 *  - Khi tất cả trong ngưỡng → khôi phục interval về DEFAULT_INTERVAL_SECONDS
 *
 * Chỉ hoạt động nếu thiết bị ở mode "auto".
 * Cooldown SMART_AUTO_COOLDOWN_MS để tránh spam lệnh.
 */

import { publishFanSpeed, publishLedBrightness, publishNodeInterval } from "./deviceControl.js";
import { getDeviceByName, updateDeviceByName } from "./repositories/deviceRepository.js";
import { listActiveUserPlants } from "./repositories/userPlantRepository.js";
import { query } from "./database.js";
import { broadcastRealtime } from "./realtime.js";
import { createDeviceCommandLog } from "./repositories/deviceCommandLogRepository.js";
import { publishMqtt } from "./mqtt.js";
import { DEVICE_CONTROL_TOPICS, INTERVAL_CONTROL_TOPIC } from "./mqttTopics.js";

export const SMART_AUTO_COOLDOWN_MS = Number(process.env.SMART_AUTO_COOLDOWN_MS || 15_000);
export const DEFAULT_INTERVAL_SECONDS = Number(process.env.DEFAULT_SENSOR_INTERVAL_SECONDS || 5);
export const ALERT_INTERVAL_SECONDS = 1;

// Track last command time per device để cooldown
const lastCommandAt = new Map();
// Track trạng thái interval hiện tại
let currentIntervalSeconds = DEFAULT_INTERVAL_SECONDS;
// Track các thiết bị đang ở trạng thái auto-active
const autoActiveDevices = new Set();

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isOutOfRange(value, min, max) {
  const v = toNumber(value);
  if (v == null) return null; // không có dữ liệu
  if (min != null && v < min) return "low";
  if (max != null && v > max) return "high";
  return null; // trong ngưỡng
}

function isInCooldown(deviceId) {
  const last = lastCommandAt.get(deviceId);
  if (!last) return false;
  return Date.now() - last < SMART_AUTO_COOLDOWN_MS;
}

function markCommandSent(deviceId) {
  lastCommandAt.set(deviceId, Date.now());
}

/**
 * Lấy ngưỡng alert từ DB (bổ sung ngoài profile cây).
 * Trả về { min, max } cho mỗi sensor_type theo node_id.
 */
async function loadAlertThresholdsForNode(nodeId) {
  const result = await query(
    `SELECT sensor_type, operator, value FROM alert_thresholds
     WHERE active = true AND (node_id IS NULL OR node_id = $1)`,
    [nodeId],
  );

  const bounds = {};
  for (const row of result.rows) {
    const v = toNumber(row.value);
    if (v == null) continue;
    if (!bounds[row.sensor_type]) bounds[row.sensor_type] = {};
    // Lấy ngưỡng min/max từ operator
    if (row.operator === "<" || row.operator === "<=") {
      // ngưỡng thấp: cảnh báo khi < value → min = value
      if (bounds[row.sensor_type].min == null || v > bounds[row.sensor_type].min) {
        bounds[row.sensor_type].min = v;
      }
    } else if (row.operator === ">" || row.operator === ">=") {
      // ngưỡng cao: cảnh báo khi > value → max = value
      if (bounds[row.sensor_type].max == null || v < bounds[row.sensor_type].max) {
        bounds[row.sensor_type].max = v;
      }
    }
  }
  return bounds;
}

/**
 * Lấy ngưỡng cho node: ưu tiên profile cây, fallback về alert thresholds.
 */
async function getThresholdsForNode(nodeId) {
  const plants = await listActiveUserPlants();
  // Tìm cây ở đúng khu này
  const plant = plants.find((p) => p.node_id === nodeId);
  const profile = plant?.plant_profile ?? null;

  const alertBounds = await loadAlertThresholdsForNode(nodeId);

  return {
    temperature: {
      min: profile?.min_temperature ?? alertBounds.temperature?.min ?? null,
      max: profile?.max_temperature ?? alertBounds.temperature?.max ?? null,
    },
    humidity: {
      min: profile?.min_humidity ?? alertBounds.humidity?.min ?? null,
      max: profile?.max_humidity ?? alertBounds.humidity?.max ?? null,
    },
    soil_moisture: {
      min: profile?.min_soil_moisture ?? alertBounds.soil_moisture?.min ?? null,
      max: profile?.max_soil_moisture ?? alertBounds.soil_moisture?.max ?? null,
    },
  };
}

/**
 * Gửi lệnh bật/tắt pump/mist qua MQTT (chuỗi "1"/"0").
 */
async function sendPumpMistCommand(deviceId, isOn, source = "smart_auto") {
  const topic = DEVICE_CONTROL_TOPICS[deviceId];
  if (!topic) return;

  const device = await getDeviceByName(deviceId);
  if (!device) return;
  if (device.mode !== "auto") {
    console.info(`[SmartAuto] Skipped ${deviceId}: not in auto mode`);
    return;
  }
  if (isInCooldown(deviceId)) {
    console.info(`[SmartAuto] Skipped ${deviceId}: cooldown`);
    return;
  }

  const payload = isOn ? "1" : "0";
  try {
    await publishMqtt(topic, payload, { qos: 1 });
    await updateDeviceByName(deviceId, { is_on: isOn });
    markCommandSent(deviceId);

    const log = await createDeviceCommandLog({
      device_id: device.id,
      device_name: deviceId,
      command: isOn ? "turn_on" : "turn_off",
      source,
      mqtt_published: true,
      device_confirmed: false,
    });
    broadcastRealtime("device_command:new", log);
    console.log(`[SmartAuto] ${isOn ? "BẬT" : "TẮT"} ${deviceId}`);
  } catch (err) {
    console.error(`[SmartAuto] Failed to send command to ${deviceId}:`, err.message);
  }
}

/**
 * Gửi lệnh quạt qua fan_control topic (percent string).
 */
async function sendFanCommand(percent) {
  const device = await getDeviceByName("fan");
  if (!device || device.mode !== "auto") {
    console.info("[SmartAuto] Skipped fan: not in auto mode");
    return;
  }
  if (isInCooldown("fan")) {
    console.info("[SmartAuto] Skipped fan: cooldown");
    return;
  }
  try {
    await publishFanSpeed({ percent });
    await updateDeviceByName("fan", { is_on: percent > 0 });
    markCommandSent("fan");

    const log = await createDeviceCommandLog({
      device_id: device.id,
      device_name: "fan",
      command: percent > 0 ? "turn_on" : "turn_off",
      source: "smart_auto",
      mqtt_published: true,
      device_confirmed: false,
    });
    broadcastRealtime("device_command:new", log);
    console.log(`[SmartAuto] Quạt → ${percent}%`);
  } catch (err) {
    console.error("[SmartAuto] Failed to send fan command:", err.message);
  }
}

/**
 * Gửi lệnh LED qua led_control topic (percent string).
 */
async function sendLedCommand(percent) {
  const device = await getDeviceByName("led");
  if (!device || device.mode !== "auto") {
    console.info("[SmartAuto] Skipped led: not in auto mode");
    return;
  }
  if (isInCooldown("led")) {
    console.info("[SmartAuto] Skipped led: cooldown");
    return;
  }
  try {
    await publishLedBrightness({ percent });
    await updateDeviceByName("led", { is_on: percent > 0 });
    markCommandSent("led");

    const log = await createDeviceCommandLog({
      device_id: device.id,
      device_name: "led",
      command: percent > 0 ? "turn_on" : "turn_off",
      source: "smart_auto",
      mqtt_published: true,
      device_confirmed: false,
    });
    broadcastRealtime("device_command:new", log);
    console.log(`[SmartAuto] LED → ${percent}%`);
  } catch (err) {
    console.error("[SmartAuto] Failed to send LED command:", err.message);
  }
}

/**
 * Cập nhật interval ESP32 nếu thực sự thay đổi.
 */
async function updateInterval(seconds) {
  if (currentIntervalSeconds === seconds) return;
  try {
    await publishNodeInterval({ seconds });
    currentIntervalSeconds = seconds;
    console.log(`[SmartAuto] Interval → ${seconds}s`);
  } catch (err) {
    console.error("[SmartAuto] Failed to set interval:", err.message);
  }
}

/**
 * Điểm vào chính: gọi sau mỗi lần nhận sensor data.
 */
export async function runSmartAutoControl(sensorData) {
  const nodeId = sensorData?.node_id ?? sensorData?.nodeId;
  if (!nodeId) return;

  const thresholds = await getThresholdsForNode(nodeId);

  const tempStatus = isOutOfRange(sensorData.temperature, thresholds.temperature.min, thresholds.temperature.max);
  const humidStatus = isOutOfRange(sensorData.humidity, thresholds.humidity.min, thresholds.humidity.max);
  const soilStatus = isOutOfRange(sensorData.soil_moisture, thresholds.soil_moisture.min, thresholds.soil_moisture.max);

  const pumpId = nodeId === "node1" ? "pump_1" : "pump_2";
  const mistId = nodeId === "node1" ? "mist_1" : "mist_2";

  // --- Độ ẩm đất ---
  if (soilStatus === "low") {
    await sendPumpMistCommand(pumpId, true);
    autoActiveDevices.add(pumpId);
  } else {
    // trong ngưỡng hoặc cao → tắt bơm nếu đang auto-active
    if (autoActiveDevices.has(pumpId)) {
      await sendPumpMistCommand(pumpId, false);
      autoActiveDevices.delete(pumpId);
    }
  }

  // --- Độ ẩm không khí ---
  if (humidStatus === "low") {
    await sendPumpMistCommand(mistId, true);
    autoActiveDevices.add(mistId);
  } else {
    if (autoActiveDevices.has(mistId)) {
      await sendPumpMistCommand(mistId, false);
      autoActiveDevices.delete(mistId);
    }
  }

  // --- Nhiệt độ ---
  if (tempStatus === "high") {
    // Quá cao → bật quạt, tắt LED
    await sendFanCommand(100);
    autoActiveDevices.add("fan");
    if (autoActiveDevices.has("led")) {
      await sendLedCommand(0);
      autoActiveDevices.delete("led");
    }
  } else if (tempStatus === "low") {
    // Quá thấp → bật LED 100%, tắt quạt
    await sendLedCommand(100);
    autoActiveDevices.add("led");
    if (autoActiveDevices.has("fan")) {
      await sendFanCommand(0);
      autoActiveDevices.delete("fan");
    }
  } else {
    // Trong ngưỡng → tắt cả quạt và LED nếu đang auto-active
    if (autoActiveDevices.has("fan")) {
      await sendFanCommand(0);
      autoActiveDevices.delete("fan");
    }
    if (autoActiveDevices.has("led")) {
      await sendLedCommand(0);
      autoActiveDevices.delete("led");
    }
  }

  // --- Điều chỉnh interval ---
  const anyActive = autoActiveDevices.size > 0;
  await updateInterval(anyActive ? ALERT_INTERVAL_SECONDS : DEFAULT_INTERVAL_SECONDS);
}
