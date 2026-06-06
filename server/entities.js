import { hash } from "bcryptjs";
import { requireUser } from "./auth.js";
import { pool } from "./database.js";
import { readBody, sendJson } from "./httpUtils.js";
import { broadcastRealtime } from "./realtime.js";
import { publishSim800lSmsRequest } from "./sim800l.js";
import {
  ALERT_THRESHOLD_OPERATORS,
  evaluateAlertsForLatestReading,
  getAlertThresholdOperatorErrorMessage,
  invalidateThresholdCache,
  isValidAlertThresholdOperator,
  toLegacyAlert,
} from "./alerts.js";
import {
  executeDeviceCommand,
  normalizeDeviceCommand,
  publishGatewayUpdateFrequency,
  publishLedBrightness,
  publishFanSpeed,
  publishNodeInterval,
} from "./deviceControl.js";
import {
  evaluateAutomationRuleForSensorData,
  publishAutomationCommand,
} from "./automation.js";
import {
  hasAnyValidSensorValue,
  ingestSensorReading,
  toLegacySensorData,
  toSensorRepositoryData,
} from "./sensorIngestion.js";
import {
  createAlert,
  deleteAlert,
  getAlertById,
  listAlerts,
  markAllAlertsAsRead,
  updateAlert,
} from "./repositories/alertRepository.js";
import {
  createAutomationRule,
  deleteAutomationRule,
  getAutomationRuleById,
  listAutomationRules,
  updateAutomationRule,
} from "./repositories/automationRepository.js";
import {
  deleteDevice,
  getDeviceByName,
  listConfiguredDevices,
  listDevices,
  updateDevice,
  updateDeviceByName,
  upsertDeviceByName,
} from "./repositories/deviceRepository.js";
import {
  getDeviceCommandStatus,
  listDeviceCommandLogs,
} from "./repositories/deviceCommandLogRepository.js";
import {
  getPlantProfileById,
  listPlantProfiles,
} from "./repositories/plantProfileRepository.js";
import {
  deleteSensorReading,
  getLatestSensorReading,
  getSensorReadingById,
  getDailyStats,
  listLatestSensorReadingsByNode,
  listSensorReadings,
} from "./repositories/sensorRepository.js";
import {
  createUserPlant,
  deactivateUserPlant,
  getUserPlantById,
  listUserPlants,
  updateUserPlant,
} from "./repositories/userPlantRepository.js";
import {
  countActiveAdmins,
  createUser as createSystemUser,
  deleteUser as deleteSystemUser,
  findUserById as findSystemUserById,
  listUsers,
  updateUser as updateSystemUser,
} from "./repositories/userRepository.js";

const allowedEntities = new Set([
  "SensorData",
  "DeviceState",
  "DeviceCommandLog",
  "AutomationRule",
  "Alert",
  "AlertThreshold",
  "PlantProfile",
  "UserPlant",
  "User",
]);

function hasOwn(data, key) {
  return Object.prototype.hasOwnProperty.call(data, key);
}

function sortItems(items, sortBy) {
  if (!sortBy) return items;

  const isDesc = sortBy.startsWith("-");
  const key = isDesc ? sortBy.slice(1) : sortBy;

  return [...items].sort((a, b) => {
    const av = a?.[key];
    const bv = b?.[key];
    if (av == null && bv == null) return 0;
    if (av == null) return 1;
    if (bv == null) return -1;
    if (av > bv) return isDesc ? -1 : 1;
    if (av < bv) return isDesc ? 1 : -1;
    return 0;
  });
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(value || ""),
  );
}

function toLegacyDeviceState(device) {
  if (!device) return null;

  return {
    id: device.name,
    postgres_id: device.id,
    device_id: device.name,
    device_name: device.name,
    name: device.label || device.name,
    label: device.label || device.name,
    type: device.type,
    scope: device.scope,
    node_id: device.node_id,
    nodeId: device.node_id,
    zoneLabel: device.zoneLabel,
    is_on: device.is_on,
    mode: device.mode,
    online: device.online,
    is_connected: device.online,
    last_seen: device.last_seen_at,
    last_seen_at: device.last_seen_at,
    created_date: device.created_at,
    updated_date: device.updated_at,
    created_at: device.created_at,
    updated_at: device.updated_at,
  };
}

function toDeviceRepositoryData(data = {}) {
  const mapped = {
    ...data,
    name: data.name ?? data.device_id ?? data.id,
    type: data.type,
    scope: data.scope,
    node_id: data.node_id ?? data.nodeId,
    is_on: data.is_on ?? data.isOn,
    mode: data.mode,
    online: data.online,
    last_seen_at: data.last_seen_at ?? data.lastSeenAt ?? data.last_seen,
  };

  for (const key of Object.keys(mapped)) {
    if (mapped[key] === undefined) delete mapped[key];
  }

  return mapped;
}

function getSensorSortOptions(url) {
  const rawSortBy = url.searchParams.get("sortBy");
  const sortOrderParam = url.searchParams.get("sortOrder");
  const isDesc = rawSortBy?.startsWith("-");
  const sortByValue = isDesc ? rawSortBy.slice(1) : rawSortBy;
  const sortFieldAliases = {
    created_date: "created_at",
    soilMoisture: "soil_moisture",
  };

  const nodeId = url.searchParams.get("node_id") || url.searchParams.get("nodeId");

  return {
    limit: url.searchParams.get("limit"),
    page: url.searchParams.get("page"),
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
    nodeId: nodeId || undefined,
    sortBy: sortFieldAliases[sortByValue] || sortByValue || "created_at",
    sortOrder: isDesc ? "desc" : sortOrderParam,
  };
}

function toAlertRepositoryData(data = {}) {
  const mapped = {
    sensor_type: data.sensor_type ?? data.sensorType ?? data.type,
    node_id: data.node_id ?? data.nodeId,
    level: data.level ?? data.severity,
    message: data.message ?? data.title ?? data.content,
    value: data.value ?? data.sensor_value ?? data.sensorValue,
    is_read: data.is_read ?? data.isRead,
    created_at: data.created_at ?? data.createdAt ?? data.created_date ?? data.timestamp ?? data.time ?? data.date,
  };

  for (const key of Object.keys(mapped)) {
    if (mapped[key] === undefined) delete mapped[key];
  }

  return mapped;
}

function hasValidAlertData(data = {}) {
  return Boolean(data.sensor_type ?? data.sensorType ?? data.type ?? data.message ?? data.title ?? data.content);
}

function getAlertSortOptions(url) {
  const rawSortBy = url.searchParams.get("sortBy");
  const sortOrderParam = url.searchParams.get("sortOrder");
  const isDesc = rawSortBy?.startsWith("-");
  const sortByValue = isDesc ? rawSortBy.slice(1) : rawSortBy;
  const sortFieldAliases = {
    created_date: "created_at",
    sensorType: "sensor_type",
    isRead: "is_read",
  };

  return {
    limit: url.searchParams.get("limit"),
    page: url.searchParams.get("page"),
    level: url.searchParams.get("level"),
    sensor_type: url.searchParams.get("sensor_type") ?? url.searchParams.get("sensorType"),
    is_read: url.searchParams.get("is_read") ?? url.searchParams.get("isRead"),
    node_id: url.searchParams.get("node_id") ?? url.searchParams.get("nodeId"),
    from: url.searchParams.get("from"),
    to: url.searchParams.get("to"),
    sortBy: sortFieldAliases[sortByValue] || sortByValue || "created_at",
    sortOrder: isDesc ? "desc" : sortOrderParam,
  };
}

function getConditionFromOperator(operator) {
  if (operator === ">") return "above";
  if (operator === "<") return "below";
  if (operator === "==") return "equals";
  if (operator === ">=") return "above_or_equal";
  if (operator === "<=") return "below_or_equal";
  return operator || null;
}

function toLegacyAutomationRule(rule) {
  if (!rule) return null;

  return {
    id: rule.id,
    name: rule.name,
    sensor_type: rule.sensor_type,
    sensorType: rule.sensor_type,
    node_id: rule.node_id ?? null,
    nodeId: rule.node_id ?? null,
    operator: rule.operator,
    condition: getConditionFromOperator(rule.operator),
    threshold: rule.threshold,
    device_id: rule.device_id,
    deviceId: rule.device_id,
    device_name: rule.device_name,
    deviceName: rule.device_name,
    target_device: rule.device_name,
    targetDevice: rule.device_name,
    action: rule.action,
    active: rule.active,
    is_active: rule.active,
    isActive: rule.active,
    last_triggered_at: rule.last_triggered_at,
    lastTriggeredAt: rule.last_triggered_at,
    last_triggered_date: rule.last_triggered_at,
    created_at: rule.created_at,
    created_date: rule.created_at,
    updated_at: rule.updated_at,
    updated_date: rule.updated_at,
  };
}

function toAutomationRepositoryData(data = {}) {
  const mapped = {
    name: data.name,
    sensor_type: data.sensor_type ?? data.sensorType ?? data.sensor,
    node_id: data.node_id ?? data.nodeId,
    operator: data.operator,
    condition: data.condition,
    threshold: data.threshold,
    device_id: data.device_id ?? data.deviceId,
    device_name: data.device_name ?? data.deviceName ?? data.target_device ?? data.targetDevice ?? data.device,
    action: data.action,
    active: data.active ?? data.is_active ?? data.isActive,
    last_triggered_at: data.last_triggered_at ?? data.lastTriggeredAt ?? data.last_triggered_date,
    created_at: data.created_at ?? data.createdAt ?? data.created_date,
    updated_at: data.updated_at ?? data.updatedAt ?? data.updated_date,
  };

  for (const key of Object.keys(mapped)) {
    if (mapped[key] === undefined) delete mapped[key];
  }

  return mapped;
}

function getAutomationSortOptions(url) {
  const rawSortBy = url.searchParams.get("sortBy");
  const sortOrderParam = url.searchParams.get("sortOrder");
  const isDesc = rawSortBy?.startsWith("-");
  const sortByValue = isDesc ? rawSortBy.slice(1) : rawSortBy;
  const sortFieldAliases = {
    created_date: "created_at",
    updated_date: "updated_at",
    sensorType: "sensor_type",
    deviceName: "device_name",
    target_device: "device_name",
    targetDevice: "device_name",
    is_active: "active",
    isActive: "active",
    lastTriggeredAt: "last_triggered_at",
    last_triggered_date: "last_triggered_at",
  };

  return {
    limit: url.searchParams.get("limit"),
    page: url.searchParams.get("page"),
    active: url.searchParams.get("active") ?? url.searchParams.get("is_active") ?? url.searchParams.get("isActive"),
    sensor_type: url.searchParams.get("sensor_type") ?? url.searchParams.get("sensorType") ?? url.searchParams.get("sensor"),
    device_name: url.searchParams.get("device_name") ?? url.searchParams.get("deviceName") ??
      url.searchParams.get("target_device") ?? url.searchParams.get("targetDevice"),
    node_id: url.searchParams.get("node_id") ?? url.searchParams.get("nodeId"),
    sortBy: sortFieldAliases[sortByValue] || sortByValue || "created_at",
    sortOrder: isDesc ? "desc" : sortOrderParam,
  };
}

const sensorFieldAliases = [
  "temperature",
  "temp",
  "humidity",
  "soil_moisture",
  "soilMoisture",
  "soil",
  "light",
  "lux",
];

function hasAnySensorField(data = {}) {
  if (!data || typeof data !== "object") return false;

  return sensorFieldAliases.some((field) => Object.prototype.hasOwnProperty.call(data, field));
}

function getAutomationTestSensorPayload(body = {}) {
  if (!body || typeof body !== "object") return {};

  const candidates = [
    body.sensorData,
    body.sensor_data,
    body.sensor,
    body.payload,
    body.reading,
    body,
  ].filter((candidate) => candidate && typeof candidate === "object");

  return candidates.find(hasAnySensorField) || candidates[0] || {};
}

function parseBoolean(value) {
  if (typeof value === "boolean") return value;
  if (value === 1) return true;
  if (value === 0) return false;

  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
  if (normalized === "false" || normalized === "0" || normalized === "no") return false;
  return false;
}

function toAutomationTestSensorData(data = {}) {
  const normalized = toSensorRepositoryData(data);

  return {
    temperature: normalized.temperature ?? null,
    humidity: normalized.humidity ?? null,
    soil_moisture: normalized.soil_moisture ?? null,
    soilMoisture: normalized.soil_moisture ?? null,
    light: normalized.light ?? null,
    created_at: normalized.created_at ?? null,
    created_date: normalized.created_at ?? null,
  };
}

async function resolveAutomationTestSensorData(body = {}) {
  const payload = getAutomationTestSensorPayload(body);

  if (hasAnySensorField(payload)) {
    if (!hasAnyValidSensorValue(payload)) {
      const error = new Error("Sensor payload must include at least one valid numeric sensor value");
      error.status = 400;
      throw error;
    }

    return {
      source: "payload",
      sensorData: toAutomationTestSensorData(payload),
    };
  }

  const latest = await getLatestSensorReading();
  if (!latest) {
    const error = new Error("No latest sensor reading available");
    error.status = 404;
    throw error;
  }

  return {
    source: "latest",
    sensorData: toLegacySensorData(latest),
  };
}

function toAutomationTestResult(evaluation, { confirm, published }) {
  return {
    matched: evaluation.matched,
    targetDevice: evaluation.targetDevice,
    action: evaluation.action,
    skippedReason: evaluation.skippedReason,
    confirm,
    published,
    wouldPublish: Boolean(evaluation.command),
    mqttTopic: evaluation.command?.topic || evaluation.topic || null,
    sensor_type: evaluation.sensorType,
    sensorValue: evaluation.sensorValue,
    operator: evaluation.operator,
    threshold: evaluation.threshold,
    deviceMode: evaluation.device?.mode ?? null,
  };
}

function getDeviceCommandLogSortOptions(url) {
  const rawSortBy = url.searchParams.get("sortBy");
  const sortOrderParam = url.searchParams.get("sortOrder");
  const isDesc = rawSortBy?.startsWith("-");
  const sortByValue = isDesc ? rawSortBy.slice(1) : rawSortBy;
  const sortFieldAliases = {
    created_date: "created_at",
    deviceName: "device_name",
  };

  return {
    limit: url.searchParams.get("limit"),
    page: url.searchParams.get("page"),
    device_name: url.searchParams.get("device_name") ?? url.searchParams.get("deviceName"),
    source: url.searchParams.get("source"),
    sortBy: sortFieldAliases[sortByValue] || sortByValue || "created_at",
    sortOrder: isDesc ? "desc" : sortOrderParam,
  };
}

function toLegacyDeviceCommandLog(log) {
  if (!log) return null;

  const commandStatus = getDeviceCommandStatus(log);
  return {
    id: log.id,
    device_id: log.device_id,
    device_name: log.device_name,
    deviceName: log.device_name,
    command: log.command,
    source: log.source,
    mqtt_published: log.mqtt_published,
    mqttPublished: log.mqtt_published,
    device_confirmed: log.device_confirmed,
    deviceConfirmed: log.device_confirmed,
    command_status: commandStatus,
    commandStatus,
    created_at: log.created_at,
    created_date: log.created_at,
  };
}

function toLegacyPlantProfile(profile) {
  if (!profile) return null;

  return {
    id: profile.id,
    code: profile.code,
    name: profile.name,
    min_temperature: profile.min_temperature,
    max_temperature: profile.max_temperature,
    min_humidity: profile.min_humidity,
    max_humidity: profile.max_humidity,
    min_soil_moisture: profile.min_soil_moisture,
    max_soil_moisture: profile.max_soil_moisture,
    min_light: profile.min_light,
    max_light: profile.max_light,
    watering_note: profile.watering_note,
    care_note: profile.care_note,
    aliases: profile.aliases,
    active: profile.active,
    is_active: profile.active,
    created_at: profile.created_at,
    updated_at: profile.updated_at,
  };
}

function toLegacyUserPlant(plant) {
  if (!plant) return null;

  return {
    id: plant.id,
    plant_profile_id: plant.plant_profile_id,
    plantProfileId: plant.plant_profile_id,
    name: plant.name,
    location: plant.location,
    node_id: plant.node_id,
    nodeId: plant.node_id,
    planted_at: plant.planted_at,
    plantedAt: plant.planted_at,
    notes: plant.notes,
    active: plant.active,
    is_active: plant.active,
    plant_profile: toLegacyPlantProfile(plant.plant_profile),
    plantProfile: toLegacyPlantProfile(plant.plant_profile),
    created_at: plant.created_at,
    updated_at: plant.updated_at,
  };
}

function toLegacyUser(user) {
  if (!user) return null;

  return {
    id: user.id,
    username: user.username,
    role: user.role,
    status: user.status || "active",
    created_at: user.created_at,
    created_date: user.created_at,
    updated_at: user.updated_at,
    updated_date: user.updated_at,
  };
}

function getUserSortOptions(url) {
  const rawSortBy = url.searchParams.get("sortBy");
  const sortOrderParam = url.searchParams.get("sortOrder");
  const isDesc = rawSortBy?.startsWith("-");
  const sortByValue = isDesc ? rawSortBy.slice(1) : rawSortBy;
  const sortFieldAliases = {
    created_date: "created_at",
    updated_date: "updated_at",
  };

  return {
    limit: url.searchParams.get("limit"),
    page: url.searchParams.get("page"),
    role: url.searchParams.get("role"),
    status: url.searchParams.get("status"),
    username: url.searchParams.get("username"),
    sortBy: sortFieldAliases[sortByValue] || sortByValue || "created_at",
    sortOrder: isDesc ? "desc" : sortOrderParam,
  };
}

async function getUserRepositoryData(data = {}, { requirePassword = false } = {}) {
  const mapped = {};

  if (hasOwn(data, "username")) mapped.username = String(data.username || "").trim();
  if (hasOwn(data, "role")) mapped.role = data.role;
  if (hasOwn(data, "status")) mapped.status = data.status;

  if (hasOwn(data, "password")) {
    const password = String(data.password || "");
    if (password.length < 6) {
      const error = new Error("Mật khẩu phải có tối thiểu 6 ký tự");
      error.status = 400;
      throw error;
    }
    mapped.password_hash = await hash(password, 10);
  } else if (requirePassword) {
    const error = new Error("password is required");
    error.status = 400;
    throw error;
  }

  return mapped;
}

async function blocksLastActiveAdmin(targetUser, patch = {}) {
  const currentStatus = targetUser?.status || "active";
  if (targetUser?.role !== "admin" || currentStatus !== "active") return false;

  const nextRole = patch.role ?? targetUser.role;
  const nextStatus = patch.status ?? currentStatus;
  if (nextRole === "admin" && nextStatus === "active") return false;

  return (await countActiveAdmins()) <= 1;
}

function getPlantProfileSortOptions(url) {
  const rawSortBy = url.searchParams.get("sortBy");
  const sortOrderParam = url.searchParams.get("sortOrder");
  const isDesc = rawSortBy?.startsWith("-");
  const sortByValue = isDesc ? rawSortBy.slice(1) : rawSortBy;
  const sortFieldAliases = {
    created_date: "created_at",
    updated_date: "updated_at",
    is_active: "active",
    isActive: "active",
  };

  return {
    limit: url.searchParams.get("limit"),
    page: url.searchParams.get("page"),
    active: url.searchParams.get("active") ?? url.searchParams.get("is_active") ?? url.searchParams.get("isActive"),
    sortBy: sortFieldAliases[sortByValue] || sortByValue || "name",
    sortOrder: isDesc ? "desc" : sortOrderParam,
  };
}

function getUserPlantSortOptions(url) {
  const rawSortBy = url.searchParams.get("sortBy");
  const sortOrderParam = url.searchParams.get("sortOrder");
  const isDesc = rawSortBy?.startsWith("-");
  const sortByValue = isDesc ? rawSortBy.slice(1) : rawSortBy;
  const sortFieldAliases = {
    plantedAt: "planted_at",
    planted_date: "planted_at",
    created_date: "created_at",
    updated_date: "updated_at",
    is_active: "active",
    isActive: "active",
  };

  return {
    limit: url.searchParams.get("limit"),
    page: url.searchParams.get("page"),
    active: url.searchParams.get("active") ?? url.searchParams.get("is_active") ?? url.searchParams.get("isActive"),
    sortBy: sortFieldAliases[sortByValue] || sortByValue || "created_at",
    sortOrder: isDesc ? "desc" : sortOrderParam,
  };
}

function toLegacyDailySensorStats(row) {
  if (!row) return null;

  return {
    date: row.date instanceof Date ? row.date.toISOString().slice(0, 10) : row.date,
    avg_temperature: row.avg_temperature == null ? null : Number(row.avg_temperature),
    min_temperature: row.min_temperature == null ? null : Number(row.min_temperature),
    max_temperature: row.max_temperature == null ? null : Number(row.max_temperature),
    avg_humidity: row.avg_humidity == null ? null : Number(row.avg_humidity),
    min_humidity: row.min_humidity == null ? null : Number(row.min_humidity),
    max_humidity: row.max_humidity == null ? null : Number(row.max_humidity),
    avg_soil_moisture: row.avg_soil_moisture == null ? null : Number(row.avg_soil_moisture),
    min_soil_moisture: row.min_soil_moisture == null ? null : Number(row.min_soil_moisture),
    max_soil_moisture: row.max_soil_moisture == null ? null : Number(row.max_soil_moisture),
    avg_light: row.avg_light == null ? null : Number(row.avg_light),
    min_light: row.min_light == null ? null : Number(row.min_light),
    max_light: row.max_light == null ? null : Number(row.max_light),
  };
}

async function handleSensorData(req, res, url, id, action) {
  if (req.method === "GET" && id === "stats" && action === "daily") {
    const stats = await getDailyStats(getSensorSortOptions(url));
    sendJson(res, 200, stats.map(toLegacyDailySensorStats));
    return true;
  }

  if (req.method === "GET" && id === "latest-by-node") {
    const readings = await listLatestSensorReadingsByNode();
    sendJson(res, 200, readings.map(toLegacySensorData));
    return true;
  }

  if (req.method === "GET" && !id) {
    const readings = await listSensorReadings(getSensorSortOptions(url));
    sendJson(res, 200, readings.map(toLegacySensorData));
    return true;
  }

  if (req.method === "GET" && id) {
    const reading = await getSensorReadingById(id);
    if (!reading) {
      sendJson(res, 404, { message: "Item not found" });
      return true;
    }

    sendJson(res, 200, toLegacySensorData(reading));
    return true;
  }

  if (req.method === "POST" && !id) {
    const data = await readBody(req);

    if (!hasAnyValidSensorValue(data)) {
      sendJson(res, 400, { message: "SensorData must include at least one valid sensor value" });
      return true;
    }

    const { reading } = await ingestSensorReading(data);
    sendJson(res, 201, reading);
    return true;
  }

  if (req.method === "DELETE" && id) {
    const deleted = await deleteSensorReading(id);
    if (!deleted) {
      sendJson(res, 404, { message: "Item not found" });
      return true;
    }

    sendJson(res, 200, { success: true, item: toLegacySensorData(deleted) });
    return true;
  }

  if (req.method === "DELETE" && !id) {
    sendJson(res, 400, { message: "SensorData id is required" });
    return true;
  }

  if (req.method === "PATCH" && id) {
    sendJson(res, 405, { message: "PATCH is not supported for SensorData" });
    return true;
  }

  return false;
}

async function handleAlert(req, res, url, id, action) {
  if (id === "read-all" && req.method === "POST") {
    const updatedAlerts = await markAllAlertsAsRead();
    broadcastRealtime("alert:update", {
      updated: updatedAlerts.length,
      items: updatedAlerts.map(toLegacyAlert),
    });
    sendJson(res, 200, {
      success: true,
      updated: updatedAlerts.length,
      items: updatedAlerts.map(toLegacyAlert),
    });
    return true;
  }

  if (id && action === "read" && ["POST", "PATCH"].includes(req.method)) {
    const updatedAlert = await updateAlert(id, { is_read: true });
    if (!updatedAlert) {
      sendJson(res, 404, { message: "Item not found" });
      return true;
    }

    broadcastRealtime("alert:update", toLegacyAlert(updatedAlert));
    sendJson(res, 200, toLegacyAlert(updatedAlert));
    return true;
  }

  if (req.method === "GET" && !id) {
    const alerts = await listAlerts(getAlertSortOptions(url));
    sendJson(res, 200, alerts.map(toLegacyAlert));
    return true;
  }

  if (req.method === "GET" && id) {
    const alert = await getAlertById(id);
    if (!alert) {
      sendJson(res, 404, { message: "Item not found" });
      return true;
    }

    sendJson(res, 200, toLegacyAlert(alert));
    return true;
  }

  if (req.method === "POST" && !id) {
    const data = await readBody(req);

    if (!hasValidAlertData(data)) {
      sendJson(res, 400, { message: "Alert must include sensor_type or message" });
      return true;
    }

    const alert = toLegacyAlert(await createAlert(toAlertRepositoryData(data)));
    broadcastRealtime("alert:new", alert);
    publishSim800lSmsRequest(alert).catch((error) => {
      console.error("[SIM800L SMS] Failed to publish alert:", error.message);
    });

    sendJson(res, 201, alert);
    return true;
  }

  if (req.method === "PATCH" && id) {
    const patch = await readBody(req);
    const alert = await updateAlert(id, toAlertRepositoryData(patch));
    if (!alert) {
      sendJson(res, 404, { message: "Item not found" });
      return true;
    }

    const legacyAlert = toLegacyAlert(alert);
    broadcastRealtime("alert:update", legacyAlert);
    sendJson(res, 200, legacyAlert);
    return true;
  }

  if (req.method === "DELETE" && id) {
    const deleted = await deleteAlert(id);
    if (!deleted) {
      sendJson(res, 404, { message: "Item not found" });
      return true;
    }

    broadcastRealtime("alert:delete", toLegacyAlert(deleted));
    sendJson(res, 200, { success: true, item: toLegacyAlert(deleted) });
    return true;
  }

  if (req.method === "DELETE" && !id) {
    sendJson(res, 400, { message: "Alert id is required" });
    return true;
  }

  return false;
}

async function handleAutomationRuleTest(req, res, url, id) {
  const body = await readBody(req);
  const rule = await getAutomationRuleById(id);
  if (!rule) {
    sendJson(res, 404, { message: "Item not found" });
    return true;
  }

  let sensorData;
  let source;
  try {
    const resolved = await resolveAutomationTestSensorData(body);
    sensorData = resolved.sensorData;
    source = resolved.source;
  } catch (error) {
    sendJson(res, error.status || 400, { message: error.message || "Invalid sensor payload" });
    return true;
  }

  const confirm = parseBoolean(body.confirm ?? url.searchParams.get("confirm"));
  const now = new Date().toISOString();
  const evaluation = await evaluateAutomationRuleForSensorData(rule, sensorData, {
    now,
    prioritizeDeviceMode: true,
  });
  let published = false;

  if (confirm && evaluation.command) {
    try {
      const updatedRule = await updateAutomationRule(rule.id, { last_triggered_at: now });
      broadcastRealtime("automation_rule:change", {
        action: "update",
        item: toLegacyAutomationRule(updatedRule),
      });
      await publishAutomationCommand(evaluation.command);
      published = true;
    } catch (error) {
      sendJson(res, 502, {
        success: false,
        message: "Không thể publish MQTT cho automation test",
        error: error.message,
        source,
        sensor: sensorData,
        rule: toLegacyAutomationRule(rule),
        result: toAutomationTestResult(evaluation, { confirm, published: false }),
      });
      return true;
    }
  }

  sendJson(res, 200, {
    success: true,
    source,
    sensor: sensorData,
    rule: toLegacyAutomationRule(rule),
    result: toAutomationTestResult(evaluation, { confirm, published }),
  });
  return true;
}

async function handleAutomationRule(req, res, url, id, action) {
  if (id && action === "test") {
    if (req.method !== "POST") {
      sendJson(res, 405, { message: "Method not allowed" });
      return true;
    }

    return handleAutomationRuleTest(req, res, url, id);
  }

  if (req.method === "GET" && !id) {
    const rules = await listAutomationRules(getAutomationSortOptions(url));
    sendJson(res, 200, rules.map(toLegacyAutomationRule));
    return true;
  }

  if (req.method === "GET" && id) {
    const rule = await getAutomationRuleById(id);
    if (!rule) {
      sendJson(res, 404, { message: "Item not found" });
      return true;
    }

    sendJson(res, 200, toLegacyAutomationRule(rule));
    return true;
  }

  if (req.method === "POST" && !id) {
    const data = await readBody(req);

    try {
      const rule = await createAutomationRule(toAutomationRepositoryData(data));
      broadcastRealtime("automation_rule:change", {
        action: "create",
        item: toLegacyAutomationRule(rule),
      });
      sendJson(res, 201, toLegacyAutomationRule(rule));
    } catch (error) {
      sendJson(res, 400, { message: error.message || "Invalid automation rule" });
    }

    return true;
  }

  if (req.method === "PATCH" && id) {
    const patch = await readBody(req);

    try {
      const rule = await updateAutomationRule(id, toAutomationRepositoryData(patch));
      if (!rule) {
        sendJson(res, 404, { message: "Item not found" });
        return true;
      }

      broadcastRealtime("automation_rule:change", {
        action: "update",
        item: toLegacyAutomationRule(rule),
      });
      sendJson(res, 200, toLegacyAutomationRule(rule));
    } catch (error) {
      sendJson(res, 400, { message: error.message || "Invalid automation rule" });
    }

    return true;
  }

  if (req.method === "DELETE" && id) {
    const deleted = await deleteAutomationRule(id);
    if (!deleted) {
      sendJson(res, 404, { message: "Item not found" });
      return true;
    }

    broadcastRealtime("automation_rule:change", {
      action: "delete",
      item: toLegacyAutomationRule(deleted),
    });
    sendJson(res, 200, { success: true, item: toLegacyAutomationRule(deleted) });
    return true;
  }

  if (req.method === "DELETE" && !id) {
    sendJson(res, 400, { message: "AutomationRule id is required" });
    return true;
  }

  return false;
}

async function handleDeviceState(req, res, url, id, action) {
  // POST /api/DeviceState/led/brightness — điều chỉnh độ sáng LED (0-100%)
  if (id === "led" && action === "brightness" && req.method === "POST") {
    const body = await readBody(req);
    try {
      const result = await publishLedBrightness({ percent: body.percent ?? body.value });
      sendJson(res, 200, { success: true, message: result.message, topic: result.topic, percent: result.percent });
    } catch (error) {
      sendJson(res, error.status || 500, { message: error.message || "Không thể gửi độ sáng LED" });
    }
    return true;
  }

  // POST /api/DeviceState/fan/speed — điều chỉnh tốc độ quạt (0-100%)
  if (id === "fan" && action === "speed" && req.method === "POST") {
    const body = await readBody(req);
    try {
      const result = await publishFanSpeed({ percent: body.percent ?? body.value });
      sendJson(res, 200, { success: true, message: result.message, topic: result.topic, percent: result.percent });
    } catch (error) {
      sendJson(res, error.status || 500, { message: error.message || "Không thể gửi tốc độ quạt" });
    }
    return true;
  }

  // POST /api/DeviceState/gateway/interval — chu kỳ gửi dữ liệu sensor node
  if (id === "gateway" && action === "interval" && req.method === "POST") {
    const body = await readBody(req);
    try {
      const result = await publishNodeInterval({ seconds: body.seconds ?? body.value });
      sendJson(res, 200, { success: true, message: result.message, topic: result.topic, seconds: result.seconds });
    } catch (error) {
      sendJson(res, error.status || 500, { message: error.message || "Không thể gửi chu kỳ cập nhật" });
    }
    return true;
  }

  if (id === "gateway" && action === "update-frequency" && req.method === "POST") {
    const body = await readBody(req);

    try {
      const result = await publishGatewayUpdateFrequency({
        seconds: body.seconds ??
          body.update_frequency_seconds ??
          body.updateFrequencySeconds ??
          body.interval_seconds ??
          body.intervalSeconds,
        source: "manual",
      });

      sendJson(res, 200, {
        success: true,
        message: result.message,
        topic: result.topic,
        payload: result.payload,
      });
    } catch (error) {
      sendJson(res, error.status || 500, {
        message: error.status ? error.message : "Không thể gửi cấu hình tiết kiệm pin lúc này",
      });
    }

    return true;
  }

  if (id && action === "command" && req.method === "POST") {
    const body = await readBody(req);
    const command = normalizeDeviceCommand({
      ...body,
      deviceId: body.deviceId ?? body.device_id ?? id,
    });

    if (!command) {
      sendJson(res, 400, { message: "Lệnh thiết bị không hợp lệ" });
      return true;
    }

    try {
      const result = await executeDeviceCommand({
        deviceId: command.deviceId,
        isOn: command.isOn,
        requestedBy: req.user?.id,
        source: "manual",
      });

      sendJson(res, 200, {
        success: true,
        message: result.message,
        device: toLegacyDeviceState(result.device),
      });
    } catch (error) {
      sendJson(res, error.status || 500, {
        message: error.status ? error.message : "Không thể gửi lệnh thiết bị lúc này",
      });
    }

    return true;
  }

  if (req.method === "GET" && !id) {
    const sortBy = url.searchParams.get("sortBy");
    const limitParam = url.searchParams.get("limit");
    const limit = limitParam == null ? null : Number(limitParam);
    const devices = (await listConfiguredDevices()).map(toLegacyDeviceState);
    const sorted = sortItems(devices, sortBy);
    sendJson(res, 200, Number.isFinite(limit) ? sorted.slice(0, limit) : sorted);
    return true;
  }

  if (req.method === "POST" && !id) {
    const data = await readBody(req);
    const device = await upsertDeviceByName(toDeviceRepositoryData(data));
    broadcastRealtime("device:update", toLegacyDeviceState(device));
    sendJson(res, 201, toLegacyDeviceState(device));
    return true;
  }

  if (req.method === "PATCH" && id) {
    const patch = await readBody(req);
    const device = isUuid(id)
      ? await updateDevice(id, toDeviceRepositoryData(patch))
      : await updateDeviceByName(id, toDeviceRepositoryData(patch));

    if (!device) {
      sendJson(res, 404, { message: "Item not found" });
      return true;
    }

    broadcastRealtime("device:update", toLegacyDeviceState(device));
    sendJson(res, 200, toLegacyDeviceState(device));
    return true;
  }

  if (req.method === "DELETE" && id) {
    const device = isUuid(id) ? await deleteDevice(id) : await getDeviceByName(id).then((item) => (
      item ? deleteDevice(item.id) : null
    ));

    broadcastRealtime("device:delete", toLegacyDeviceState(device));
    sendJson(res, 200, { success: true, item: toLegacyDeviceState(device) });
    return true;
  }

  return false;
}

async function handleDeviceCommandLog(req, res, url, id) {
  if (req.method === "GET" && !id) {
    const logs = await listDeviceCommandLogs(getDeviceCommandLogSortOptions(url));
    sendJson(res, 200, logs.map(toLegacyDeviceCommandLog));
    return true;
  }

  sendJson(res, id ? 404 : 405, {
    message: id ? "Item not found" : "Method not allowed",
  });
  return true;
}

async function handlePlantProfile(req, res, url, id) {
  if (req.method === "GET" && !id) {
    const profiles = await listPlantProfiles(getPlantProfileSortOptions(url));
    sendJson(res, 200, profiles.map(toLegacyPlantProfile));
    return true;
  }

  if (req.method === "GET" && id) {
    const profile = await getPlantProfileById(id);
    if (!profile) {
      sendJson(res, 404, { message: "Item not found" });
      return true;
    }

    sendJson(res, 200, toLegacyPlantProfile(profile));
    return true;
  }

  sendJson(res, 405, { message: "Method not allowed" });
  return true;
}

function getUserPlantErrorMessage(error) {
  if (error?.code === "23505") return "Tên cây/khu vực đã tồn tại";
  if (error?.code === "23503") return "Hồ sơ cây không tồn tại";
  return error?.message || "Dữ liệu cây trồng không hợp lệ";
}

async function handleUserPlant(req, res, url, id, action) {
  if (id && action === "deactivate" && ["POST", "PATCH"].includes(req.method)) {
    const plant = await deactivateUserPlant(id);
    if (!plant) {
      sendJson(res, 404, { message: "Item not found" });
      return true;
    }

    broadcastRealtime("plant:change", {
      action: "deactivate",
      item: toLegacyUserPlant(plant),
    });
    sendJson(res, 200, { success: true, item: toLegacyUserPlant(plant) });
    return true;
  }

  if (req.method === "GET" && !id) {
    const plants = await listUserPlants(getUserPlantSortOptions(url));
    sendJson(res, 200, plants.map(toLegacyUserPlant));
    return true;
  }

  if (req.method === "GET" && id) {
    const plant = await getUserPlantById(id, { includeInactive: true });
    if (!plant) {
      sendJson(res, 404, { message: "Item not found" });
      return true;
    }

    sendJson(res, 200, toLegacyUserPlant(plant));
    return true;
  }

  if (req.method === "POST" && !id) {
    const data = await readBody(req);

    try {
      const plant = await createUserPlant(data);
      broadcastRealtime("plant:change", {
        action: "create",
        item: toLegacyUserPlant(plant),
      });
      sendJson(res, 201, toLegacyUserPlant(plant));
    } catch (error) {
      sendJson(res, 400, { message: getUserPlantErrorMessage(error) });
    }

    return true;
  }

  if (req.method === "PATCH" && id) {
    const patch = await readBody(req);

    try {
      const plant = await updateUserPlant(id, patch);
      if (!plant) {
        sendJson(res, 404, { message: "Item not found" });
        return true;
      }

      broadcastRealtime("plant:change", {
        action: "update",
        item: toLegacyUserPlant(plant),
      });
      sendJson(res, 200, toLegacyUserPlant(plant));
    } catch (error) {
      sendJson(res, 400, { message: getUserPlantErrorMessage(error) });
    }

    return true;
  }

  if (req.method === "DELETE" && id) {
    const plant = await deactivateUserPlant(id);
    if (!plant) {
      sendJson(res, 404, { message: "Item not found" });
      return true;
    }

    broadcastRealtime("plant:change", {
      action: "deactivate",
      item: toLegacyUserPlant(plant),
    });
    sendJson(res, 200, { success: true, item: toLegacyUserPlant(plant) });
    return true;
  }

  if (req.method === "DELETE" && !id) {
    sendJson(res, 400, { message: "UserPlant id is required" });
    return true;
  }

  return false;
}

async function handleUser(req, res, url, id, currentUser) {
  if (currentUser.role !== "admin") {
    sendJson(res, 403, { message: "Không có quyền admin" });
    return true;
  }

  if (req.method === "GET" && !id) {
    const users = await listUsers(getUserSortOptions(url));
    sendJson(res, 200, users.map(toLegacyUser));
    return true;
  }

  if (req.method === "GET" && id) {
    const user = await findSystemUserById(id);
    if (!user) {
      sendJson(res, 404, { message: "Item not found" });
      return true;
    }

    sendJson(res, 200, toLegacyUser(user));
    return true;
  }

  if (req.method === "POST" && !id) {
    const body = await readBody(req);

    try {
      const data = await getUserRepositoryData(
        {
          ...body,
          status: body.status || "active",
        },
        { requirePassword: true },
      );
      const user = await createSystemUser(data);
      broadcastRealtime("user:change", { action: "create", item: toLegacyUser(user) });
      sendJson(res, 201, toLegacyUser(user));
    } catch (error) {
      if (error.code === "23505") {
        sendJson(res, 409, { message: "Tên đăng nhập đã tồn tại" });
        return true;
      }
      sendJson(res, error.status || 400, { message: error.message || "Không thể tạo tài khoản" });
    }

    return true;
  }

  if (req.method === "PATCH" && id) {
    const targetUser = await findSystemUserById(id);
    if (!targetUser) {
      sendJson(res, 404, { message: "Item not found" });
      return true;
    }

    const body = await readBody(req);

    try {
      const data = await getUserRepositoryData(body);

      if (Object.keys(data).length === 0) {
        sendJson(res, 400, { message: "Không có field hợp lệ để cập nhật" });
        return true;
      }

      if (
        targetUser.id === currentUser.id &&
        ((hasOwn(data, "role") && data.role !== "admin") ||
          (hasOwn(data, "status") && data.status !== "active"))
      ) {
        sendJson(res, 400, { message: "Không thể tự hạ quyền hoặc khóa tài khoản admin đang dùng" });
        return true;
      }

      if (await blocksLastActiveAdmin(targetUser, data)) {
        sendJson(res, 400, { message: "Không thể thay đổi admin active cuối cùng" });
        return true;
      }

      const user = await updateSystemUser(id, data);
      broadcastRealtime("user:change", { action: "update", item: toLegacyUser(user) });
      sendJson(res, 200, toLegacyUser(user));
    } catch (error) {
      if (error.code === "23505") {
        sendJson(res, 409, { message: "Tên đăng nhập đã tồn tại" });
        return true;
      }
      sendJson(res, error.status || 400, { message: error.message || "Không thể cập nhật tài khoản" });
    }

    return true;
  }

  if (req.method === "DELETE" && id) {
    const targetUser = await findSystemUserById(id);
    if (!targetUser) {
      sendJson(res, 404, { message: "Item not found" });
      return true;
    }

    if (targetUser.id === currentUser.id) {
      sendJson(res, 400, { message: "Không thể xóa tài khoản đang đăng nhập" });
      return true;
    }

    if (await blocksLastActiveAdmin(targetUser, { status: "disabled" })) {
      sendJson(res, 400, { message: "Không thể xóa admin active cuối cùng" });
      return true;
    }

    const user = await deleteSystemUser(id);
    broadcastRealtime("user:change", { action: "delete", item: toLegacyUser(user) });
    sendJson(res, 200, { success: true, item: toLegacyUser(user) });
    return true;
  }

  if (req.method === "DELETE" && !id) {
    sendJson(res, 400, { message: "User id is required" });
    return true;
  }

  return false;
}

function toLegacyThreshold(row) {
  if (!row) return null;

  return {
    id: row.id,
    sensor_type: row.sensor_type,
    node_id: row.node_id ?? null,
    nodeId: row.node_id ?? null,
    operator: row.operator,
    value: row.value == null ? null : Number(row.value),
    level: row.level,
    active: row.active,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function handleAlertThreshold(req, res, id) {
  if (req.method === "GET" && !id) {
    const result = await pool.query(
      "SELECT * FROM alert_thresholds ORDER BY sensor_type, level",
    );
    sendJson(res, 200, result.rows.map(toLegacyThreshold));
    return true;
  }

  if (req.method === "POST" && !id) {
    const user = await requireUser(req, res);
    if (!user) return true;

    if (user.role !== "admin") {
      sendJson(res, 403, { message: "Không có quyền" });
      return true;
    }

    const body = await readBody(req);

    const validSensorTypes = new Set(["temperature", "humidity", "soil_moisture", "light"]);
    const sensorType = String(body.sensor_type || "").trim();
    if (!validSensorTypes.has(sensorType)) {
      sendJson(res, 400, { message: "sensor_type không hợp lệ. Giá trị hợp lệ: temperature, humidity, soil_moisture, light" });
      return true;
    }

    const operator = String(body.operator || "").trim();
    if (!isValidAlertThresholdOperator(operator)) {
      sendJson(res, 400, {
        message: getAlertThresholdOperatorErrorMessage(body.operator),
        allowed_operators: ALERT_THRESHOLD_OPERATORS,
      });
      return true;
    }

    const value = Number(body.value);
    if (!Number.isFinite(value)) {
      sendJson(res, 400, { message: "value phải là số" });
      return true;
    }

    const validLevels = new Set(["info", "warning", "danger"]);
    const level = String(body.level || "warning").trim().toLowerCase();
    if (!validLevels.has(level)) {
      sendJson(res, 400, { message: "level không hợp lệ. Giá trị hợp lệ: info, warning, danger" });
      return true;
    }

    const nodeId = body.node_id ?? body.nodeId ?? null;

    const result = await pool.query(
      `INSERT INTO alert_thresholds (sensor_type, operator, value, level, node_id, active)
       VALUES ($1, $2, $3, $4, $5, true)
       RETURNING *`,
      [sensorType, operator, value, level, nodeId],
    );

    invalidateThresholdCache();

    const item = toLegacyThreshold(result.rows[0]);
    broadcastRealtime("alert_threshold:create", { item });
    sendJson(res, 201, item);
    return true;
  }

  if (req.method === "PATCH" && id) {
    const user = await requireUser(req, res);
    if (!user) return true;

    if (user.role !== "admin") {
      sendJson(res, 403, { message: "Không có quyền" });
      return true;
    }

    const body = await readBody(req);
    const fields = [];
    const values = [];

    if (Object.prototype.hasOwnProperty.call(body, "value")) {
      const number = Number(body.value);
      if (!Number.isFinite(number)) {
        sendJson(res, 400, { message: "value phải là số" });
        return true;
      }
      values.push(number);
      fields.push(`value = $${values.length}`);
    }

    if (Object.prototype.hasOwnProperty.call(body, "operator")) {
      const operator = String(body.operator || "").trim();
      if (!isValidAlertThresholdOperator(operator)) {
        sendJson(res, 400, {
          message: getAlertThresholdOperatorErrorMessage(body.operator),
          allowed_operators: ALERT_THRESHOLD_OPERATORS,
        });
        return true;
      }
      values.push(operator);
      fields.push(`operator = $${values.length}`);
    }

    if (Object.prototype.hasOwnProperty.call(body, "active")) {
      if (typeof body.active !== "boolean") {
        sendJson(res, 400, { message: "active phải là boolean" });
        return true;
      }
      values.push(body.active);
      fields.push(`active = $${values.length}`);
    }

    if (Object.prototype.hasOwnProperty.call(body, "node_id") || Object.prototype.hasOwnProperty.call(body, "nodeId")) {
      const nodeId = body.node_id ?? body.nodeId ?? null;
      values.push(nodeId);
      fields.push(`node_id = $${values.length}`);
    }

    if (fields.length === 0) {
      sendJson(res, 400, { message: "Không có field hợp lệ để cập nhật" });
      return true;
    }

    fields.push("updated_at = NOW()");
    values.push(id);

    const result = await pool.query(
      `UPDATE alert_thresholds SET ${fields.join(", ")} WHERE id = $${values.length} RETURNING *`,
      values,
    );

    if (result.rowCount === 0) {
      sendJson(res, 404, { message: "Item not found" });
      return true;
    }

    invalidateThresholdCache();

    let createdAlerts = [];
    try {
      createdAlerts = await evaluateAlertsForLatestReading();
      for (const alert of createdAlerts) {
        broadcastRealtime("alert:new", alert);
        publishSim800lSmsRequest(alert).catch((error) => {
          console.error("[SIM800L SMS] Failed to publish alert:", error.message);
        });
      }
    } catch (error) {
      console.error("[AlertThreshold] Failed to evaluate latest reading:", error.message);
    }

    broadcastRealtime("alert_threshold:update", {
      item: toLegacyThreshold(result.rows[0]),
      alerts_created: createdAlerts.length,
    });
    sendJson(res, 200, {
      ...toLegacyThreshold(result.rows[0]),
      alerts_created: createdAlerts.length,
      alerts: createdAlerts,
    });
    return true;
  }

  if (req.method === "DELETE" && id) {
    const user = await requireUser(req, res);
    if (!user) return true;

    if (user.role !== "admin") {
      sendJson(res, 403, { message: "Không có quyền" });
      return true;
    }

    const result = await pool.query(
      "DELETE FROM alert_thresholds WHERE id = $1 RETURNING *",
      [id],
    );

    if (result.rowCount === 0) {
      sendJson(res, 404, { message: "Item not found" });
      return true;
    }

    invalidateThresholdCache();

    broadcastRealtime("alert_threshold:delete", { item: toLegacyThreshold(result.rows[0]) });
    sendJson(res, 200, { success: true, item: toLegacyThreshold(result.rows[0]) });
    return true;
  }

  sendJson(res, 405, { message: "Method not allowed" });
  return true;
}

export async function handleEntity(req, res, url, parts) {
  const entityName = parts[1];
  const id = parts[2];
  const action = parts[3];

  if (!allowedEntities.has(entityName)) {
    sendJson(res, 404, { message: "Entity not found" });
    return true;
  }

  if (entityName === "AlertThreshold") {
    return handleAlertThreshold(req, res, id);
  }

  const user = await requireUser(req, res);
  if (!user) return true;

  if (user.role === "viewer" && req.method !== "GET") {
    sendJson(res, 403, { message: "Tài khoản viewer chỉ được xem dữ liệu" });
    return true;
  }

  if (entityName === "DeviceState") {
    const handled = await handleDeviceState(req, res, url, id, action);
    if (!handled) sendJson(res, 404, { message: `DeviceState route not found: ${req.method} /${id}/${action ?? ''}` });
    return true;
  }

  if (entityName === "DeviceCommandLog") {
    return handleDeviceCommandLog(req, res, url, id);
  }

  if (entityName === "PlantProfile") {
    return handlePlantProfile(req, res, url, id);
  }

  if (entityName === "UserPlant") {
    return handleUserPlant(req, res, url, id, action);
  }

  if (entityName === "User") {
    return handleUser(req, res, url, id, user);
  }

  if (entityName === "SensorData") {
    return handleSensorData(req, res, url, id, action);
  }

  if (entityName === "Alert") {
    return handleAlert(req, res, url, id, action);
  }

  if (entityName === "AutomationRule") {
    return handleAutomationRule(req, res, url, id, action);
  }

  sendJson(res, 404, { message: "Entity not found" });
  return true;
}
