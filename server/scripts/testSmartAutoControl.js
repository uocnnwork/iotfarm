/**
 * Test script cho smartAutoControl.js
 * Mock toàn bộ MQTT, DB, realtime — không cần phần cứng hay server chạy.
 *
 * Chạy: node server/scripts/testSmartAutoControl.js
 */

// ─── Mock infrastructure ─────────────────────────────────────────────────────

const mqttLog = [];
const dbUpdates = [];
const commandLogs = [];
const realtimeBroadcasts = [];

// Giả lập trạng thái thiết bị trong "DB"
const fakeDevices = {
  pump_1: { id: 1, name: "pump_1", is_on: false, mode: "auto" },
  mist_1: { id: 2, name: "mist_1", is_on: false, mode: "auto" },
  pump_2: { id: 3, name: "pump_2", is_on: false, mode: "auto" },
  mist_2: { id: 4, name: "mist_2", is_on: false, mode: "auto" },
  fan:    { id: 5, name: "fan",    is_on: false, mode: "auto" },
  led:    { id: 6, name: "led",    is_on: false, mode: "auto" },
};

// Plant profiles giả lập (cà chua Khu 1, ớt Khu 2)
const fakePlants = [
  {
    id: 1, name: "Cà chua Khu 1", node_id: "node1", active: true,
    plant_profile: {
      min_temperature: 18, max_temperature: 26,
      min_humidity: 60,    max_humidity: 80,
      min_soil_moisture: 50, max_soil_moisture: 80,
    },
  },
  {
    id: 2, name: "Ớt Khu 2", node_id: "node2", active: true,
    plant_profile: {
      min_temperature: 20, max_temperature: 30,
      min_humidity: 55,    max_humidity: 75,
      min_soil_moisture: 45, max_soil_moisture: 75,
    },
  },
];

// ─── Inject mocks bằng cách patch module cache thủ công (ESM workaround) ─────
// Vì ESM không hỗ trợ require cache patching, ta copy logic ra test trực tiếp.

// Inline toàn bộ logic từ smartAutoControl.js với mock dependencies
const SMART_AUTO_COOLDOWN_MS = 0; // 0 để test không bị chặn cooldown
const DEFAULT_INTERVAL_SECONDS = 5;
const ALERT_INTERVAL_SECONDS = 1;

const lastCommandAt = new Map();
const autoActiveDevices = new Set();
let currentIntervalSeconds = DEFAULT_INTERVAL_SECONDS;

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function isOutOfRange(value, min, max) {
  const v = toNumber(value);
  if (v == null) return null;
  if (min != null && v < min) return "low";
  if (max != null && v > max) return "high";
  return null;
}

function isInCooldown(deviceId) {
  const last = lastCommandAt.get(deviceId);
  if (!last) return false;
  return Date.now() - last < SMART_AUTO_COOLDOWN_MS;
}

function markCommandSent(deviceId) {
  lastCommandAt.set(deviceId, Date.now());
}

async function mockGetDeviceByName(name) {
  return fakeDevices[name] ? { ...fakeDevices[name] } : null;
}

async function mockUpdateDeviceByName(name, patch) {
  dbUpdates.push({ device: name, patch });
  if (fakeDevices[name]) Object.assign(fakeDevices[name], patch);
}

async function mockPublishMqtt(topic, payload) {
  mqttLog.push({ topic, payload });
}

async function mockPublishFanSpeed({ percent }) {
  mqttLog.push({ topic: "fan_control", payload: String(percent) });
}

async function mockPublishLedBrightness({ percent }) {
  mqttLog.push({ topic: "led_control", payload: String(percent) });
}

async function mockPublishNodeInterval({ seconds }) {
  mqttLog.push({ topic: "interval_control", payload: String(seconds) });
  currentIntervalSeconds = seconds;
}

async function mockCreateDeviceCommandLog(data) {
  const log = { id: commandLogs.length + 1, ...data };
  commandLogs.push(log);
  return log;
}

function mockBroadcastRealtime(event, data) {
  realtimeBroadcasts.push({ event, data });
}

// Mock DB query cho alert_thresholds (trả về rỗng — dùng profile cây)
async function mockQuery(sql) {
  if (sql.includes("alert_thresholds")) {
    return { rows: [] };
  }
  return { rows: [] };
}

// ─── Inline logic smartAutoControl với mocks ──────────────────────────────────

async function getThresholdsForNode(nodeId) {
  const plant = fakePlants.find((p) => p.node_id === nodeId);
  const profile = plant?.plant_profile ?? null;

  return {
    temperature:    { min: profile?.min_temperature, max: profile?.max_temperature },
    humidity:       { min: profile?.min_humidity,    max: profile?.max_humidity },
    soil_moisture:  { min: profile?.min_soil_moisture, max: profile?.max_soil_moisture },
  };
}

async function sendPumpMistCommand(deviceId, isOn) {
  const device = await mockGetDeviceByName(deviceId);
  if (!device) return;
  if (device.mode !== "auto") { console.info(`  [SKIP] ${deviceId}: manual mode`); return; }
  if (isInCooldown(deviceId)) { console.info(`  [SKIP] ${deviceId}: cooldown`); return; }

  const TOPICS = { pump_1: "pump1_control", mist_1: "mist1_control", pump_2: "pump2_control", mist_2: "mist2_control" };
  await mockPublishMqtt(TOPICS[deviceId] || deviceId, isOn ? "1" : "0");
  await mockUpdateDeviceByName(deviceId, { is_on: isOn });
  markCommandSent(deviceId);
  const log = await mockCreateDeviceCommandLog({ device_name: deviceId, command: isOn ? "turn_on" : "turn_off", source: "smart_auto", mqtt_published: true });
  mockBroadcastRealtime("device_command:new", log);
}

async function sendFanCommand(percent) {
  const device = await mockGetDeviceByName("fan");
  if (!device || device.mode !== "auto") { console.info(`  [SKIP] fan: manual mode`); return; }
  if (isInCooldown("fan")) { console.info(`  [SKIP] fan: cooldown`); return; }
  await mockPublishFanSpeed({ percent });
  await mockUpdateDeviceByName("fan", { is_on: percent > 0 });
  markCommandSent("fan");
  const log = await mockCreateDeviceCommandLog({ device_name: "fan", command: percent > 0 ? "turn_on" : "turn_off", source: "smart_auto", mqtt_published: true });
  mockBroadcastRealtime("device_command:new", log);
}

async function sendLedCommand(percent) {
  const device = await mockGetDeviceByName("led");
  if (!device || device.mode !== "auto") { console.info(`  [SKIP] led: manual mode`); return; }
  if (isInCooldown("led")) { console.info(`  [SKIP] led: cooldown`); return; }
  await mockPublishLedBrightness({ percent });
  await mockUpdateDeviceByName("led", { is_on: percent > 0 });
  markCommandSent("led");
  const log = await mockCreateDeviceCommandLog({ device_name: "led", command: percent > 0 ? "turn_on" : "turn_off", source: "smart_auto", mqtt_published: true });
  mockBroadcastRealtime("device_command:new", log);
}

async function updateInterval(seconds) {
  if (currentIntervalSeconds === seconds) return;
  await mockPublishNodeInterval({ seconds });
}

async function runSmartAutoControl(sensorData) {
  const nodeId = sensorData?.node_id;
  if (!nodeId) return;

  const thresholds = await getThresholdsForNode(nodeId);
  const tempStatus  = isOutOfRange(sensorData.temperature,   thresholds.temperature.min,   thresholds.temperature.max);
  const humidStatus = isOutOfRange(sensorData.humidity,      thresholds.humidity.min,       thresholds.humidity.max);
  const soilStatus  = isOutOfRange(sensorData.soil_moisture, thresholds.soil_moisture.min,  thresholds.soil_moisture.max);

  const pumpId = nodeId === "node1" ? "pump_1" : "pump_2";
  const mistId  = nodeId === "node1" ? "mist_1" : "mist_2";

  if (soilStatus === "low") {
    await sendPumpMistCommand(pumpId, true);
    autoActiveDevices.add(pumpId);
  } else {
    if (autoActiveDevices.has(pumpId)) {
      await sendPumpMistCommand(pumpId, false);
      autoActiveDevices.delete(pumpId);
    }
  }

  if (humidStatus === "low") {
    await sendPumpMistCommand(mistId, true);
    autoActiveDevices.add(mistId);
  } else {
    if (autoActiveDevices.has(mistId)) {
      await sendPumpMistCommand(mistId, false);
      autoActiveDevices.delete(mistId);
    }
  }

  if (tempStatus === "high") {
    await sendFanCommand(100);
    autoActiveDevices.add("fan");
    if (autoActiveDevices.has("led")) { await sendLedCommand(0); autoActiveDevices.delete("led"); }
  } else if (tempStatus === "low") {
    await sendLedCommand(100);
    autoActiveDevices.add("led");
    if (autoActiveDevices.has("fan")) { await sendFanCommand(0); autoActiveDevices.delete("fan"); }
  } else {
    if (autoActiveDevices.has("fan")) { await sendFanCommand(0); autoActiveDevices.delete("fan"); }
    if (autoActiveDevices.has("led")) { await sendLedCommand(0); autoActiveDevices.delete("led"); }
  }

  await updateInterval(autoActiveDevices.size > 0 ? ALERT_INTERVAL_SECONDS : DEFAULT_INTERVAL_SECONDS);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resetState() {
  mqttLog.length = 0;
  dbUpdates.length = 0;
  commandLogs.length = 0;
  realtimeBroadcasts.length = 0;
  autoActiveDevices.clear();
  lastCommandAt.clear();
  currentIntervalSeconds = DEFAULT_INTERVAL_SECONDS;
  for (const d of Object.values(fakeDevices)) { d.is_on = false; d.mode = "auto"; }
}

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    console.log(`  ✅ ${message}`);
    passed++;
  } else {
    console.error(`  ❌ FAIL: ${message}`);
    failed++;
  }
}

function mqttSent(topic, payload) {
  return mqttLog.some((m) => m.topic === topic && (payload === undefined || m.payload === payload));
}

// ─── Test cases ───────────────────────────────────────────────────────────────

console.log("\n═══════════════════════════════════════════");
console.log("  Smart Auto Control — Unit Tests");
console.log("═══════════════════════════════════════════\n");

// TC1: Độ ẩm đất thấp → bật bơm Khu 1
console.log("TC1: Độ ẩm đất thấp (node1) → bật pump_1");
resetState();
await runSmartAutoControl({ node_id: "node1", temperature: 22, humidity: 65, soil_moisture: 20 });
assert(mqttSent("pump1_control", "1"), "MQTT pump1_control = '1'");
assert(fakeDevices.pump_1.is_on === true, "DB: pump_1.is_on = true");
assert(commandLogs.some(l => l.device_name === "pump_1" && l.command === "turn_on"), "CommandLog: pump_1 turn_on");
assert(mqttSent("interval_control", "1"), "Interval đẩy lên 1s");

// TC2: Độ ẩm KK thấp → bật phun sương Khu 1
console.log("\nTC2: Độ ẩm KK thấp (node1) → bật mist_1");
resetState();
await runSmartAutoControl({ node_id: "node1", temperature: 22, humidity: 40, soil_moisture: 60 });
assert(mqttSent("mist1_control", "1"), "MQTT mist1_control = '1'");
assert(fakeDevices.mist_1.is_on === true, "DB: mist_1.is_on = true");
assert(mqttSent("interval_control", "1"), "Interval đẩy lên 1s");

// TC3: Nhiệt độ cao → bật quạt
console.log("\nTC3: Nhiệt độ cao (node1) → bật fan 100%");
resetState();
await runSmartAutoControl({ node_id: "node1", temperature: 35, humidity: 65, soil_moisture: 60 });
assert(mqttSent("fan_control", "100"), "MQTT fan_control = '100'");
assert(fakeDevices.fan.is_on === true, "DB: fan.is_on = true");
assert(mqttSent("interval_control", "1"), "Interval đẩy lên 1s");

// TC4: Nhiệt độ thấp → bật LED 100%
console.log("\nTC4: Nhiệt độ thấp (node1) → bật LED 100%");
resetState();
await runSmartAutoControl({ node_id: "node1", temperature: 10, humidity: 65, soil_moisture: 60 });
assert(mqttSent("led_control", "100"), "MQTT led_control = '100'");
assert(fakeDevices.led.is_on === true, "DB: led.is_on = true");
assert(mqttSent("interval_control", "1"), "Interval đẩy lên 1s");

// TC5: Nhiệt độ cao + LED đang bật → bật quạt, tắt LED
console.log("\nTC5: Nhiệt độ cao + LED đang auto-active → tắt LED, bật quạt");
resetState();
autoActiveDevices.add("led");
fakeDevices.led.is_on = true;
await runSmartAutoControl({ node_id: "node1", temperature: 30, humidity: 65, soil_moisture: 60 });
assert(mqttSent("fan_control", "100"), "MQTT fan_control = '100'");
assert(mqttSent("led_control", "0"), "MQTT led_control = '0' (tắt LED)");
assert(fakeDevices.fan.is_on === true, "DB: fan.is_on = true");
assert(fakeDevices.led.is_on === false, "DB: led.is_on = false");

// TC6: Tất cả trong ngưỡng → không bật thiết bị, interval 5s
console.log("\nTC6: Tất cả trong ngưỡng → không gửi lệnh, không đổi interval");
resetState();
const mqttCountBefore = mqttLog.length;
await runSmartAutoControl({ node_id: "node1", temperature: 22, humidity: 65, soil_moisture: 60 });
assert(mqttLog.length === mqttCountBefore, "Không gửi MQTT command nào");
assert(currentIntervalSeconds === DEFAULT_INTERVAL_SECONDS, `Interval giữ nguyên ${DEFAULT_INTERVAL_SECONDS}s`);

// TC7: Chỉ số trong ngưỡng sau khi bơm đang chạy → tắt bơm, khôi phục interval
console.log("\nTC7: Soil moisture hồi phục → tắt pump_1, interval về 5s");
resetState();
autoActiveDevices.add("pump_1");
fakeDevices.pump_1.is_on = true;
currentIntervalSeconds = 1; // đang ở chế độ alert
await runSmartAutoControl({ node_id: "node1", temperature: 22, humidity: 65, soil_moisture: 65 });
assert(mqttSent("pump1_control", "0"), "MQTT pump1_control = '0'");
assert(fakeDevices.pump_1.is_on === false, "DB: pump_1.is_on = false");
assert(mqttSent("interval_control", "5"), "Interval khôi phục 5s");

// TC8: Device ở mode manual → bỏ qua
console.log("\nTC8: pump_1 ở mode manual → bỏ qua");
resetState();
fakeDevices.pump_1.mode = "manual";
await runSmartAutoControl({ node_id: "node1", temperature: 22, humidity: 65, soil_moisture: 20 });
assert(!mqttSent("pump1_control", "1"), "Không gửi MQTT vì manual mode");
assert(fakeDevices.pump_1.is_on === false, "DB: pump_1.is_on vẫn false");

// TC9: node2 → dùng pump_2/mist_2
console.log("\nTC9: Độ ẩm đất thấp node2 → bật pump_2 (không phải pump_1)");
resetState();
await runSmartAutoControl({ node_id: "node2", temperature: 25, humidity: 60, soil_moisture: 10 });
assert(mqttSent("pump2_control", "1"), "MQTT pump2_control = '1'");
assert(!mqttSent("pump1_control", "1"), "pump1_control KHÔNG bị gửi");

// TC10: Không có node_id → bỏ qua hoàn toàn
console.log("\nTC10: Không có node_id → không làm gì");
resetState();
await runSmartAutoControl({ temperature: 35, humidity: 40, soil_moisture: 10 });
assert(mqttLog.length === 0, "Không gửi MQTT khi thiếu node_id");

// ─── Kết quả ──────────────────────────────────────────────────────────────────
console.log("\n═══════════════════════════════════════════");
console.log(`  Kết quả: ${passed} passed, ${failed} failed`);
console.log("═══════════════════════════════════════════\n");

if (failed > 0) process.exit(1);
