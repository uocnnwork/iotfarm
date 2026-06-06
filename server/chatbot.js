import { requireUser } from "./auth.js";
import { readBody, sendJson } from "./httpUtils.js";
import { listAlerts } from "./repositories/alertRepository.js";
import { listAutomationRules } from "./repositories/automationRepository.js";
import { listDevices } from "./repositories/deviceRepository.js";
import { findPlantProfileByMessage } from "./repositories/plantProfileRepository.js";
import { getLatestSensorReading } from "./repositories/sensorRepository.js";
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
const DEFAULT_MODEL = "gemini-3.1-flash-lite";
const MAX_MESSAGE_LENGTH = 1200;
const MAX_HISTORY_MESSAGES = 8;
const RECENT_ALERT_LOOKBACK_HOURS = 48;
const CHATBOT_INSTRUCTIONS = `
Bạn là trợ lý AI cho một hệ thống IoT chăm sóc cây trồng thông minh.

Mục tiêu chính:
- Hỗ trợ người dùng theo dõi và chăm sóc từng loại cây trồng.
- Đưa ra lời khuyên dựa trên dữ liệu cảm biến, loại cây, thiết bị, cảnh báo và luật tự động hóa.
- Giúp người dùng hiểu tình trạng hiện tại của cây và nên làm gì tiếp theo.

Ngữ cảnh hệ thống:
- Hệ thống có thể có dữ liệu cảm biến như nhiệt độ, độ ẩm đất, độ ẩm không khí, ánh sáng, thời gian đo.
- Hệ thống có thể có thiết bị như máy bơm, đèn, quạt.
- Hệ thống có thể có cảnh báo gần đây và luật tự động hóa.
- Mỗi cây trồng có thể có ngưỡng phù hợp riêng về nhiệt độ, độ ẩm đất, độ ẩm không khí và ánh sáng.

Nguyên tắc trả lời:
1. Luôn ưu tiên dữ liệu thực tế được cung cấp trong ngữ cảnh.
2. Không tự bịa số liệu cảm biến, trạng thái thiết bị, cảnh báo hoặc luật tự động hóa.
3. Nếu thiếu dữ liệu quan trọng, hãy nói rõ đang thiếu dữ liệu nào.
4. Nếu người dùng hỏi về một cây cụ thể, hãy tư vấn theo đặc điểm của cây đó.
5. Nếu có ngưỡng phù hợp của cây, hãy so sánh dữ liệu hiện tại với ngưỡng đó.
6. Nếu dữ liệu cảm biến bất thường, hãy giải thích ngắn gọn nguyên nhân có thể xảy ra.
7. Không đưa lời khuyên nguy hiểm như tưới quá nhiều, dùng hóa chất tùy tiện, hoặc can thiệp điện không an toàn.
8. Khi không chắc chắn, hãy nói "chưa đủ dữ liệu để kết luận chính xác" và đưa ra khuyến nghị an toàn.
9. Trả lời bằng tiếng Việt.
10. Văn phong thân thiện, dễ hiểu, ngắn gọn, phù hợp với người dùng phổ thông.
11. Nếu context có selected_user_plant, hãy hiểu đó là cây/khu vực đang được hỏi và ưu tiên dữ liệu của cây này.
12. Nếu context có plant_profile_status là "matched_from_user_plant" hoặc "matched_from_database", hãy ưu tiên plant_profile làm nguồn ngưỡng chính.
13. Nếu plant_profile_status là "not_found_use_general_agriculture_knowledge", hãy tư vấn bằng kiến thức nông nghiệp phổ thông và nói rõ đây là khuyến nghị chung.
14. Không được nói database có ngưỡng riêng nếu plant_profile là null.
15. Nếu người dùng hỏi "cây này" nhưng selected_user_plant là null và active_user_plants có nhiều cây, hãy hỏi người dùng chọn cây/khu vực cụ thể.
16. Dùng đúng đơn vị trong context: nhiệt độ °C, độ ẩm không khí %, độ ẩm đất %, ánh sáng lux.
17. Khi hiển thị số, làm gọn số nếu phù hợp: viết 800 thay vì 800.00, 28.5 thay vì 28.50.
18. Chỉ nhắc cảnh báo có trong recent_alerts. Nếu recent_alerts rỗng, không nhắc cảnh báo cũ.
19. Trả lời ngắn gọn, ưu tiên tối đa 4-6 gạch đầu dòng. Không mở đầu dài dòng nếu không cần.
20. Nếu cần bật/tắt thiết bị, chỉ nói là "có thể bấm nút xác nhận bên dưới"; không khẳng định đã điều khiển thiết bị.

Cách phân tích:
- Nếu độ ẩm đất thấp hơn ngưỡng phù hợp: gợi ý tưới nước.
- Nếu độ ẩm đất cao hơn ngưỡng phù hợp: khuyên không tưới thêm, kiểm tra thoát nước.
- Nếu nhiệt độ cao hơn ngưỡng phù hợp: khuyên che nắng, tăng thông gió, tránh tưới giữa trưa.
- Nếu nhiệt độ thấp hơn ngưỡng phù hợp: khuyên giữ ấm hoặc chuyển cây đến nơi phù hợp hơn.
- Nếu ánh sáng thấp: khuyên đưa cây ra nơi sáng hơn hoặc bật đèn trồng cây nếu có.
- Nếu ánh sáng quá mạnh: khuyên che nắng nhẹ.
- Nếu có cảnh báo gần đây: nhắc lại cảnh báo liên quan và đề xuất xử lý.
- Nếu có thiết bị liên quan đang tắt/mở: có thể gợi ý bật/tắt thiết bị, nhưng không được khẳng định đã điều khiển thiết bị nếu hệ thống chưa thực hiện.

Định dạng câu trả lời nên dùng:
- Tình trạng hiện tại của cây.
- Vấn đề chính nếu có.
- Lời khuyên cụ thể.
- Lưu ý an toàn hoặc dữ liệu còn thiếu nếu cần.
- Chỉ nhắc thiết bị hoặc cảnh báo khi liên quan trực tiếp đến câu hỏi.

Ví dụ phong cách trả lời:
"Độ ẩm đất của cây cà chua hiện đang thấp hơn mức phù hợp, nên cây có thể đang thiếu nước. Bạn nên tưới nhẹ vào sáng sớm hoặc chiều mát, tránh tưới giữa trưa. Nếu sau khi tưới độ ẩm vẫn không tăng, hãy kiểm tra cảm biến hoặc hệ thống tưới."
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
    temperature: toCompactNumber(reading.temperature),
    humidity: toCompactNumber(reading.humidity),
    soil_moisture: toCompactNumber(reading.soil_moisture),
    light: toCompactNumber(reading.light),
    created_at: reading.created_at,
  };
}

function compactDevice(device) {
  return {
    name: device.name,
    type: device.type,
    is_on: device.is_on,
    mode: device.mode,
    online: device.online,
    last_seen_at: device.last_seen_at,
  };
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

async function getGreenhouseContext(message, plantId) {
  const alertFrom = new Date(Date.now() - RECENT_ALERT_LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
  const selectedUserPlantPromise = plantId ? getUserPlantById(plantId) : findUserPlantByMessage(message);
  const [selectedUserPlantFromRequest, activeUserPlants] = await Promise.all([
    selectedUserPlantPromise,
    listActiveUserPlants(),
  ]);
  const selectedUserPlant = selectedUserPlantFromRequest ||
    (activeUserPlants.length === 1 && isCurrentPlantQuestion(message) ? activeUserPlants[0] : null);

  const nodeIdFilter = selectedUserPlant?.node_id ? { node_id: selectedUserPlant.node_id } : {};

  const [latestSensor, devices, alerts, automationRules, messagePlantProfile] = await Promise.all([
    getLatestSensorReading(nodeIdFilter),
    listDevices(),
    listAlerts({ limit: 5, from: alertFrom, sortBy: "created_at", sortOrder: "desc", ...nodeIdFilter }),
    listAutomationRules({ limit: 8, sortBy: "created_at", sortOrder: "desc", ...nodeIdFilter }),
    findPlantProfileByMessage(message),
  ]);

  const plantProfile = selectedUserPlant?.plant_profile || messagePlantProfile;
  const plantProfileStatus = selectedUserPlant?.plant_profile
    ? "matched_from_user_plant"
    : plantProfile
      ? "matched_from_database"
      : "not_found_use_general_agriculture_knowledge";

  return {
    units: {
      temperature: "°C",
      humidity: "%",
      soil_moisture: "%",
      light: "lux",
    },
    selected_user_plant: compactUserPlant(selectedUserPlant),
    user_plant_status: getUserPlantStatus(selectedUserPlant, plantId, activeUserPlants),
    active_user_plants: activeUserPlants.map((plant) => compactUserPlant(plant, { includeProfile: false })),
    plant_profile: compactPlantProfile(plantProfile),
    plant_profile_status: plantProfileStatus,
    latest_sensor: compactSensorReading(latestSensor),
    devices: devices.slice(0, 20).map(compactDevice),
    recent_alerts: alerts.map(compactAlert),
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
  const greenhouseContext = await getGreenhouseContext(message, plantId);

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
