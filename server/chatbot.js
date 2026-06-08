import { requireUser } from "./auth.js";
import { readBody, sendJson } from "./httpUtils.js";
import { listAlerts } from "./repositories/alertRepository.js";
import { listAutomationRules } from "./repositories/automationRepository.js";
import { listDevices } from "./repositories/deviceRepository.js";
import { findPlantProfileByMessage, getPlantProfileById } from "./repositories/plantProfileRepository.js";
import { getLatestSensorReading, listLatestSensorReadingsByNode } from "./repositories/sensorRepository.js";
import {
  findUserPlantByMessage,
  getUserPlantById,
  listActiveUserPlants,
} from "./repositories/userPlantRepository.js";
import {
  DEVICE_ALIASES,
  executeDeviceCommand,
  getActionLabel,
  getDeviceLabel,
  normalizeDeviceCommand,
  toDeviceAction,
} from "./deviceControl.js";

const GEMINI_API_BASE_URL = "https://generativelanguage.googleapis.com/v1beta";
const DEFAULT_MODEL = "gemini-2.5-flash-lite";
const MAX_MESSAGE_LENGTH = 1200;
const MAX_HISTORY_MESSAGES = 8;
const RECENT_ALERT_LOOKBACK_HOURS = 48;
const CHATBOT_INSTRUCTIONS = `
Bạn là trợ lý AI cho hệ thống IoT nhà kính thông minh GreenHouse.

== DỮ LIỆU CONTEXT ĐƯỢC CUNG CẤP ==
- latest_sensor: cảm biến mới nhất (của node đang chọn hoặc chung)
- sensor_by_node: dữ liệu cảm biến chi tiết từng khu (node1=Khu 1, node2=Khu 2), kèm selected_plant_profile là loại cây người dùng đang chọn ở tab Tổng quan cho khu đó
- devices: danh sách thiết bị với trạng thái (is_on, mode=manual/auto, led_brightness%, fan_speed%)
- auto_active_devices: các thiết bị đang bật do hệ thống tự động điều khiển
- unread_alerts: cảnh báo chưa đọc (ưu tiên nhắc trước)
- recent_alerts: cảnh báo gần 48h
- unread_alert_count: số cảnh báo chưa đọc
- automation_rules: các luật tự động hóa đang cấu hình
- active_user_plants: tất cả cây đang trồng
- selected_user_plant: cây đang được hỏi (nếu có)
- plant_profile: ngưỡng phù hợp của cây (nhiệt độ, độ ẩm, ánh sáng...)

== NGUYÊN TẮC ==
1. Luôn dùng dữ liệu thực tế từ context, không bịa số liệu.
2. Ưu tiên nhắc unread_alerts trước nếu có liên quan.
3. Nếu auto_active_devices có thiết bị, thông báo hệ thống đang tự xử lý.
4. Dùng sensor_by_node để trả lời câu hỏi về từng khu cụ thể.
5. Thiết bị LED: led_brightness% là công suất đèn hiện tại. Fan: fan_speed%.
6. Chế độ "auto" = hệ thống tự điều khiển; "manual" = người dùng điều khiển tay.
7. Không khẳng định đã điều khiển thiết bị nếu chưa có xác nhận. Chỉ nói "có thể bấm xác nhận bên dưới".
8. Trả lời bằng tiếng Việt, thân thiện, ngắn gọn (tối đa 5-6 gạch đầu dòng).
9. Đơn vị: nhiệt độ °C, độ ẩm KK %, độ ẩm đất %, ánh sáng %.
10. Khi so sánh với ngưỡng cây: dùng plant_profile (temperature_range, humidity_range, soil_moisture_range).
11. Nếu không có plant_profile, dùng kiến thức nông nghiệp phổ thông và nói rõ đây là khuyến nghị chung.
12. Nếu người dùng hỏi "tình hình hiện tại", "tổng quan", hãy tóm tắt: từng khu + chỉ số nổi bật + cảnh báo chưa đọc + thiết bị đang hoạt động.

== PHÂN TÍCH CHUẨN ==
- soil_moisture thấp hơn min → đề nghị tưới / kiểm tra bơm
- humidity thấp hơn min → đề nghị phun sương
- temperature cao hơn max → đề nghị bật quạt / che nắng
- temperature thấp hơn min → đề nghị bật đèn / giữ ấm
- Thiết bị auto + bật → hệ thống đang tự xử lý, không cần thao tác thủ công
`.trim();

function normalizeMessage(value) {
  return String(value || "").trim().slice(0, MAX_MESSAGE_LENGTH);
}

function normalizePlantId(value) {
  const id = String(value || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
    ? id
    : null;
}

function isCurrentPlantQuestion(message) {
  const normalized = String(message || "").toLowerCase();
  return [
    "cây này",
    "cay nay",
    "cây hiện tại",
    "cay hien tai",
    "cây đang trồng",
    "cay dang trong",
    "cây của tôi",
    "cay cua toi",
  ].some((phrase) => normalized.includes(phrase));
}

function normalizeHistory(messages = []) {
  if (!Array.isArray(messages)) return [];

  return messages
    .filter((item) => item && ["user", "assistant"].includes(item.role))
    .map((item) => ({
      role: item.role,
      content: normalizeMessage(item.content),
    }))
    .filter((item) => item.content)
    .slice(-MAX_HISTORY_MESSAGES);
}

function formatConversation(messages) {
  return messages
    .map((item) => `${item.role === "user" ? "Người dùng" : "Trợ lý"}: ${item.content}`)
    .join("\n");
}

function toCompactNumber(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number)) return value;
  return Math.round(number * 100) / 100;
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d");
}

function compactSensorReading(reading) {
  if (!reading) return null;

  return {
    node_id: reading.node_id ?? null,
    temperature: toCompactNumber(reading.temperature),
    humidity: toCompactNumber(reading.humidity),
    soil_moisture: toCompactNumber(reading.soil_moisture),
    light: toCompactNumber(reading.light),
    created_at: reading.created_at,
  };
}

function compactDevice(device) {
  const base = {
    name: device.name,
    type: device.type,
    is_on: device.is_on,
    mode: device.mode,
    online: device.online,
    last_seen_at: device.last_seen_at,
  };
  if (device.name === "led" || device.type === "light") base.led_brightness = device.led_brightness ?? 0;
  if (device.name === "fan" || device.type === "fan") base.fan_speed = device.fan_speed ?? 0;
  return base;
}

function compactAlert(alert) {
  return {
    sensor_type: alert.sensor_type,
    level: alert.level,
    message: alert.message,
    value: toCompactNumber(alert.value),
    is_read: alert.is_read,
    created_at: alert.created_at,
  };
}

function compactAutomationRule(rule) {
  return {
    name: rule.name,
    sensor_type: rule.sensor_type,
    operator: rule.operator,
    threshold: toCompactNumber(rule.threshold),
    device_name: rule.device_name,
    action: rule.action,
    active: rule.active,
    last_triggered_at: rule.last_triggered_at,
  };
}

function compactPlantProfile(profile) {
  if (!profile) return null;

  return {
    id: profile.id,
    code: profile.code,
    name: profile.name,
    temperature_range: [toCompactNumber(profile.min_temperature), toCompactNumber(profile.max_temperature)],
    humidity_range: [toCompactNumber(profile.min_humidity), toCompactNumber(profile.max_humidity)],
    soil_moisture_range: [toCompactNumber(profile.min_soil_moisture), toCompactNumber(profile.max_soil_moisture)],
    light_range: [toCompactNumber(profile.min_light), toCompactNumber(profile.max_light)],
    watering_note: profile.watering_note,
    care_note: profile.care_note,
    aliases: profile.aliases,
  };
}

function compactUserPlant(userPlant, { includeProfile = true } = {}) {
  if (!userPlant) return null;

  const profile = userPlant.plant_profile;

  return {
    id: userPlant.id,
    name: userPlant.name,
    location: userPlant.location,
    planted_at: userPlant.planted_at,
    notes: userPlant.notes,
    plant_profile: includeProfile
      ? compactPlantProfile(profile)
      : profile
        ? {
            id: profile.id,
            code: profile.code,
            name: profile.name,
          }
        : null,
  };
}

function getUserPlantStatus(selectedUserPlant, plantId, activeUserPlants) {
  if (selectedUserPlant && plantId) return "selected_by_request";
  if (selectedUserPlant) return "matched_from_message";
  return activeUserPlants.length > 0 ? "not_selected" : "none_configured";
}

function getContextDevice(context, deviceId) {
  return context.devices.find((device) => device.name === deviceId || device.device_id === deviceId);
}

function createDeviceAction({ deviceId, isOn, reason }) {
  return {
    id: `${toDeviceAction(isOn)}_${deviceId}`,
    deviceId,
    action: toDeviceAction(isOn),
    isOn,
    label: `${getActionLabel(isOn)} ${getDeviceLabel(deviceId)}`,
    confirmLabel: `Xác nhận ${getActionLabel(isOn).toLowerCase()} ${getDeviceLabel(deviceId)}`,
    reason,
  };
}

function addDeviceAction(actions, action) {
  if (!action) return;
  const exists = actions.some((item) => item.deviceId === action.deviceId && item.isOn === action.isOn);
  if (!exists) actions.push(action);
}

function findExplicitDeviceActions(message, context) {
  const normalized = normalizeText(message);
  const wantsOn = /\b(bat|mo|on|turn on)\b/.test(normalized);
  const wantsOff = /\b(tat|dong|off|turn off)\b/.test(normalized);
  if (wantsOn === wantsOff) return [];

  const actions = [];
  for (const [deviceId, aliases] of Object.entries(DEVICE_ALIASES)) {
    const matchesDevice = aliases.some((alias) => normalized.includes(normalizeText(alias)));
    if (!matchesDevice) continue;

    const device = getContextDevice(context, deviceId);
    const nextIsOn = wantsOn;
    if (device?.is_on === nextIsOn) continue;

    addDeviceAction(actions, createDeviceAction({
      deviceId,
      isOn: nextIsOn,
      reason: "Người dùng yêu cầu thao tác thiết bị trong câu hỏi.",
    }));
  }

  return actions;
}

function getRangeValue(range, index) {
  const value = range?.[index];
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function findSensorBasedDeviceActions(context) {
  const profile = context.plant_profile;
  const sensor = context.latest_sensor;
  if (!profile || !sensor) return [];

  const actions = [];
  const soilMin = getRangeValue(profile.soil_moisture_range, 0);
  const soilMax = getRangeValue(profile.soil_moisture_range, 1);
  const tempMax = getRangeValue(profile.temperature_range, 1);
  const lightMin = getRangeValue(profile.light_range, 0);
  const lightMax = getRangeValue(profile.light_range, 1);

  const pumpId = context.selected_user_plant?.node_id === 'node2' ? 'pump_2' : 'pump_1';
  const pump = getContextDevice(context, pumpId);
  const fan = getContextDevice(context, "fan");
  const light = getContextDevice(context, "led");

  if (soilMin != null && sensor.soil_moisture != null && sensor.soil_moisture < soilMin && pump?.is_on !== true) {
    addDeviceAction(actions, createDeviceAction({
      deviceId: pumpId,
      isOn: true,
      reason: `Độ ẩm đất ${sensor.soil_moisture}% thấp hơn ngưỡng ${soilMin}%.`,
    }));
  }

  if (soilMax != null && sensor.soil_moisture != null && sensor.soil_moisture > soilMax && pump?.is_on === true) {
    addDeviceAction(actions, createDeviceAction({
      deviceId: pumpId,
      isOn: false,
      reason: `Độ ẩm đất ${sensor.soil_moisture}% cao hơn ngưỡng ${soilMax}%.`,
    }));
  }

  if (tempMax != null && sensor.temperature != null && sensor.temperature > tempMax && fan?.is_on !== true) {
    addDeviceAction(actions, createDeviceAction({
      deviceId: "fan",
      isOn: true,
      reason: `Nhiệt độ ${sensor.temperature}°C cao hơn ngưỡng ${tempMax}°C.`,
    }));
  }

  if (lightMin != null && sensor.light != null && sensor.light < lightMin && light?.is_on !== true) {
    addDeviceAction(actions, createDeviceAction({
      deviceId: "led",
      isOn: true,
      reason: `Ánh sáng ${sensor.light} lux thấp hơn ngưỡng ${lightMin} lux.`,
    }));
  }

  if (lightMax != null && sensor.light != null && sensor.light > lightMax && light?.is_on === true) {
    addDeviceAction(actions, createDeviceAction({
      deviceId: "led",
      isOn: false,
      reason: `Ánh sáng ${sensor.light} lux cao hơn ngưỡng ${lightMax} lux.`,
    }));
  }

  return actions;
}

function shouldSuggestSensorActions(message) {
  const normalized = normalizeText(message);
  return [
    "can tuoi",
    "nen tuoi",
    "co can tuoi",
    "can lam gi",
    "nen lam gi",
    "xu ly",
    "cham soc",
    "co on",
    "the nao",
    "tinh trang",
    "trang thai",
    "kiem tra",
  ].some((phrase) => normalized.includes(phrase));
}

function buildDeviceActions(message, context) {
  const actions = [];
  for (const action of findExplicitDeviceActions(message, context)) addDeviceAction(actions, action);
  if (shouldSuggestSensorActions(message)) {
    for (const action of findSensorBasedDeviceActions(context)) addDeviceAction(actions, action);
  }
  return actions.slice(0, 3);
}

async function getGreenhouseContext(message, plantId, plantByNode = {}) {
  const alertFrom = new Date(Date.now() - RECENT_ALERT_LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
  const selectedUserPlantPromise = plantId ? getUserPlantById(plantId) : findUserPlantByMessage(message);
  const [selectedUserPlantFromRequest, activeUserPlants] = await Promise.all([
    selectedUserPlantPromise,
    listActiveUserPlants(),
  ]);
  const selectedUserPlant = selectedUserPlantFromRequest ||
    (activeUserPlants.length === 1 && isCurrentPlantQuestion(message) ? activeUserPlants[0] : null);

  const nodeIdFilter = selectedUserPlant?.node_id ? { node_id: selectedUserPlant.node_id } : {};

  const [latestSensor, latestByNode, devices, alerts, unreadAlerts, automationRules, messagePlantProfile] = await Promise.all([
    getLatestSensorReading(nodeIdFilter),
    listLatestSensorReadingsByNode(),
    listDevices(),
    listAlerts({ limit: 8, from: alertFrom, sortBy: "created_at", sortOrder: "desc", ...nodeIdFilter }),
    listAlerts({ limit: 5, is_read: false, sortBy: "created_at", sortOrder: "desc" }),
    listAutomationRules({ limit: 10, sortBy: "created_at", sortOrder: "desc" }),
    findPlantProfileByMessage(message),
  ]);

  // Load plant profiles được chọn trên Dashboard theo từng node
  const nodeProfileIds = Object.values(plantByNode).filter(Boolean);
  const nodeProfiles = nodeProfileIds.length > 0
    ? await Promise.all(nodeProfileIds.map((id) => getPlantProfileById(id)))
    : [];
  const nodeProfileMap = {};
  for (const [nodeId, profileId] of Object.entries(plantByNode)) {
    if (profileId) nodeProfileMap[nodeId] = nodeProfiles.find((p) => p?.id === profileId) ?? null;
  }

  const plantProfile = selectedUserPlant?.plant_profile || messagePlantProfile;
  const plantProfileStatus = selectedUserPlant?.plant_profile
    ? "matched_from_user_plant"
    : plantProfile
      ? "matched_from_database"
      : "not_found_use_general_agriculture_knowledge";

  // Gom sensor theo node, kết hợp với profile cây được chọn trên Dashboard
  const NODE_LABELS = { node1: "Khu 1", node2: "Khu 2" };
  const sensorByNode = {};
  for (const reading of latestByNode) {
    const nid = reading.node_id ?? reading.nodeId;
    if (!nid) continue;
    const dashboardProfile = nodeProfileMap[nid] ?? null;
    // Fallback: tìm trong user_plants nếu không có lựa chọn Dashboard
    const userPlant = activeUserPlants.find((p) => p.node_id === nid);
    sensorByNode[nid] = {
      node_label: NODE_LABELS[nid] ?? nid,
      sensor: compactSensorReading(reading),
      selected_plant_profile: dashboardProfile ? compactPlantProfile(dashboardProfile) : null,
      user_plant: !dashboardProfile && userPlant ? compactUserPlant(userPlant, { includeProfile: true }) : null,
    };
  }

  const autoActiveDevices = devices
    .filter((d) => d.mode === "auto" && d.is_on)
    .map((d) => d.name);

  return {
    units: { temperature: "°C", humidity: "%", soil_moisture: "%", light: "%" },
    latest_sensor: compactSensorReading(latestSensor),
    sensor_by_node: sensorByNode,
    selected_user_plant: compactUserPlant(selectedUserPlant),
    user_plant_status: getUserPlantStatus(selectedUserPlant, plantId, activeUserPlants),
    active_user_plants: activeUserPlants.map((p) => compactUserPlant(p, { includeProfile: false })),
    plant_profile: compactPlantProfile(plantProfile),
    plant_profile_status: plantProfileStatus,
    devices: devices.map(compactDevice),
    auto_active_devices: autoActiveDevices,
    recent_alerts: alerts.map(compactAlert),
    unread_alert_count: unreadAlerts.length,
    unread_alerts: unreadAlerts.map(compactAlert),
    recent_alert_window_hours: RECENT_ALERT_LOOKBACK_HOURS,
    automation_rules: automationRules.map(compactAutomationRule),
    generated_at: new Date().toISOString(),
  };
}

function extractGeminiResponseText(data) {
  const textParts = [];
  for (const candidate of data?.candidates || []) {
    for (const part of candidate?.content?.parts || []) {
      if (typeof part?.text === "string") textParts.push(part.text);
    }
  }

  return textParts.join("\n").trim();
}

async function askGemini({ message, history, greenhouseContext }) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const error = new Error("GEMINI_API_KEY is not configured");
    error.status = 503;
    throw error;
  }

  const model = String(process.env.GEMINI_MODEL || DEFAULT_MODEL).replace(/^models\//, "");

  const input = [
    "Ngữ cảnh nhà kính hiện tại dạng JSON:",
    JSON.stringify(greenhouseContext, null, 2),
    "",
    "Lịch sử hội thoại gần đây:",
    formatConversation(history) || "Chưa có.",
    "",
    `Câu hỏi mới của người dùng: ${message}`,
  ].join("\n");

  const response = await fetch(
    `${GEMINI_API_BASE_URL}/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: CHATBOT_INSTRUCTIONS }],
        },
        contents: [
          {
            role: "user",
            parts: [{ text: input }],
          },
        ],
        generationConfig: {
          maxOutputTokens: 450,
          temperature: 0.4,
        },
      }),
    },
  );

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data?.error?.message || "Gemini request failed");
    error.status = response.status;
    throw error;
  }

  return extractGeminiResponseText(data) || "Tôi chưa tạo được câu trả lời. Vui lòng thử lại.";
}

async function askChatbot({ message, history, greenhouseContext }) {
  return askGemini({ message, history, greenhouseContext });
}

export async function handleChatbot(req, res, parts) {
  if (req.method === "GET" && parts[1] === "plants") {
    const user = await requireUser(req, res);
    if (!user) return true;

    const plants = await listActiveUserPlants();
    sendJson(res, 200, plants.map((plant) => compactUserPlant(plant, { includeProfile: false })));
    return true;
  }

  if (req.method === "POST" && parts[1] === "device-action") {
    const user = await requireUser(req, res);
    if (!user) return true;

    if (user.role === "viewer") {
      sendJson(res, 403, { message: "Tài khoản viewer chỉ được xem dữ liệu" });
      return true;
    }

    const body = await readBody(req);
    const command = normalizeDeviceCommand(body);
    if (!command) {
      sendJson(res, 400, { message: "Lệnh thiết bị không hợp lệ" });
      return true;
    }

    try {
      const result = await executeDeviceCommand({
        deviceId: command.deviceId,
        isOn: command.isOn,
        requestedBy: user.id,
        source: "manual",
      });

      sendJson(res, 200, {
        success: true,
        message: result.message,
        device: compactDevice(result.device),
      });
    } catch (error) {
      console.error("[Chatbot] Device action failed:", error.message);
      sendJson(res, error.status || 500, {
        message: error.status ? error.message : "Không thể gửi lệnh thiết bị lúc này",
      });
    }

    return true;
  }

  if (req.method !== "POST" || parts[1] !== "message") {
    sendJson(res, 404, { message: "Route not found" });
    return true;
  }

  const user = await requireUser(req, res);
  if (!user) return true;

  const body = await readBody(req);
  const message = normalizeMessage(body.message);
  if (!message) {
    sendJson(res, 400, { message: "Vui lòng nhập nội dung cần hỏi" });
    return true;
  }

  const history = normalizeHistory(body.messages);
  const plantId = normalizePlantId(body.plantId ?? body.userPlantId);
  const plantByNode = (body.plantByNode && typeof body.plantByNode === "object") ? body.plantByNode : {};
  const greenhouseContext = await getGreenhouseContext(message, plantId, plantByNode);

  try {
    const reply = await askChatbot({ message, history, greenhouseContext });
    const deviceActions = user.role === "viewer" ? [] : buildDeviceActions(message, greenhouseContext);
    sendJson(res, 200, { reply, deviceActions });
  } catch (error) {
    const status = error.status === 503 ? 503 : 502;
    console.error("[Chatbot] Gemini request failed:", error.message);
    sendJson(res, status, {
      message: status === 503
        ? "Chưa cấu hình GEMINI_API_KEY cho backend"
        : "Không thể kết nối Gemini lúc này",
    });
  }

  return true;
}
