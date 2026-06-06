import { pool } from "./database.js";
import { createAlert, findRecentSimilarAlert } from "./repositories/alertRepository.js";
import { getLatestSensorReading } from "./repositories/sensorRepository.js";

export const ALERT_COOLDOWN_MS = 5 * 60 * 1000;
const THRESHOLD_CACHE_MS = 60 * 1000;

const SENSOR_META = {
  temperature: { label: "Nhiệt độ", unit: "°C" },
  humidity: { label: "Độ ẩm KK", unit: "%" },
  soil_moisture: { label: "Độ ẩm đất", unit: "%" },
  light: { label: "Ánh sáng", unit: "lux" },
};
const alertSensorTypes = new Set(Object.keys(SENSOR_META));

const NODE_LABELS = {
  "node1": "Khu 1",
  "node2": "Khu 2",
};

const validLevels = new Set(["info", "warning", "danger"]);
export const ALERT_THRESHOLD_OPERATORS = [">", ">=", "<", "<=", "=="];
const validOperators = new Set(ALERT_THRESHOLD_OPERATORS);

let thresholdCache = null;
let thresholdCacheAt = 0;

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function getAlertLevel(alert) {
  const level = String(alert?.level ?? alert?.severity ?? alert?.type ?? "").toLowerCase();
  return validLevels.has(level) ? level : "warning";
}

function normalizeOperator(operator) {
  return String(operator || "").trim();
}

export function isValidAlertThresholdOperator(operator) {
  return validOperators.has(normalizeOperator(operator));
}

export function getAlertThresholdOperatorErrorMessage(operator) {
  return `operator không hợp lệ: ${operator ?? ""}. Giá trị hợp lệ: ${ALERT_THRESHOLD_OPERATORS.join(", ")}`;
}

function getCooldownSince(now) {
  const nowTime = new Date(now).getTime();
  const safeNow = Number.isFinite(nowTime) ? nowTime : Date.now();
  return new Date(safeNow - ALERT_COOLDOWN_MS).toISOString();
}

export function toLegacyAlert(alert) {
  if (!alert) return null;

  const level = getAlertLevel(alert);
  const createdAt = alert.created_at ?? alert.created_date;

  return {
    id: alert.id,
    type: alert.type ?? level,
    level,
    message: alert.message || "",
    sensor_type: alert.sensor_type ?? alert.sensorType ?? null,
    sensorType: alert.sensor_type ?? alert.sensorType ?? null,
    node_id: alert.node_id ?? alert.nodeId ?? null,
    nodeId: alert.node_id ?? alert.nodeId ?? null,
    value: alert.value ?? null,
    is_read: alert.is_read === true,
    isRead: alert.is_read === true,
    created_at: createdAt,
    created_date: createdAt,
  };
}

export function normalizeAlert(alert, now = new Date().toISOString()) {
  const level = getAlertLevel(alert);

  return {
    type: alert.type || level,
    level,
    message: alert.message || "",
    sensor_type: alert.sensor_type ?? alert.sensorType ?? null,
    node_id: alert.node_id ?? alert.nodeId ?? null,
    value: alert.value ?? null,
    is_read: alert.is_read === true || alert.isRead === true,
    created_at: alert.created_at ?? alert.createdAt ?? alert.created_date ?? now,
    created_date: alert.created_date ?? alert.created_at ?? alert.createdAt ?? now,
  };
}

export function invalidateThresholdCache() {
  thresholdCache = null;
  thresholdCacheAt = 0;
}

async function loadThresholds() {
  const now = Date.now();
  if (thresholdCache && now - thresholdCacheAt < THRESHOLD_CACHE_MS) {
    return thresholdCache;
  }

  const result = await pool.query(
    "SELECT id, sensor_type, operator, value, level, active FROM alert_thresholds WHERE active = true",
  );

  thresholdCache = result.rows
    .filter((row) => alertSensorTypes.has(row.sensor_type))
    .map((row) => {
      const operator = normalizeOperator(row.operator);
      if (!isValidAlertThresholdOperator(operator)) {
        throw new Error(getAlertThresholdOperatorErrorMessage(row.operator));
      }

      return {
        id: row.id,
        sensor_type: row.sensor_type,
        node_id: row.node_id ?? null,
        operator,
        value: Number(row.value),
        level: validLevels.has(String(row.level).toLowerCase())
          ? String(row.level).toLowerCase()
          : "warning",
      };
    })
    .filter((t) => Number.isFinite(t.value));
  thresholdCacheAt = now;

  return thresholdCache;
}

function buildAlertMessage({ sensor_type, operator, value, threshold, level, node_id }) {
  const meta = SENSOR_META[sensor_type] || { label: sensor_type, unit: "" };
  const unit = meta.unit ? ` ${meta.unit}` : "";
  const direction = {
    ">": "vượt ngưỡng",
    ">=": "đạt hoặc vượt ngưỡng",
    "<": "dưới ngưỡng",
    "<=": "bằng hoặc dưới ngưỡng",
    "==": "bằng ngưỡng",
  }[operator];
  const prefix = level === "danger" ? "Nguy hiểm! " : "";
  const nodeLabel = node_id && NODE_LABELS[node_id] ? `[${NODE_LABELS[node_id]}] ` : "";

  return `${prefix}${nodeLabel}${meta.label} ${direction}. Giá trị: ${value}${unit}, ngưỡng: ${operator} ${threshold}${unit}`;
}

function isThresholdTriggered(operator, value, threshold) {
  if (operator === ">") return value > threshold;
  if (operator === ">=") return value >= threshold;
  if (operator === "<") return value < threshold;
  if (operator === "<=") return value <= threshold;
  if (operator === "==") return value === threshold;
  throw new Error(getAlertThresholdOperatorErrorMessage(operator));
}

async function createAlertIfAllowed(alertData, now) {
  const candidate = normalizeAlert(alertData, now);
  const recentAlert = await findRecentSimilarAlert({
    sensor_type: candidate.sensor_type,
    level: candidate.level,
    node_id: candidate.node_id,
    since: getCooldownSince(now),
  });

  if (recentAlert) {
    return { alert: toLegacyAlert(recentAlert), created: false };
  }

  const alert = await createAlert(candidate);
  return { alert: toLegacyAlert(alert), created: true };
}

export async function evaluateAlertsForLatestReading(now = new Date().toISOString()) {
  const reading = await getLatestSensorReading();
  if (!reading) return [];

  const sensorData = {
    temperature: reading.temperature,
    humidity: reading.humidity,
    soil_moisture: reading.soil_moisture,
    light: reading.light,
    created_date: reading.created_at,
  };

  return createAlertsForSensorData(sensorData, now);
}

export async function createAlertsForSensorData(sensorData, now = new Date().toISOString()) {
  const thresholds = await loadThresholds();
  const candidates = [];
  const dataNodeId = sensorData.node_id ?? sensorData.nodeId ?? null;

  for (const threshold of thresholds) {
    // Skip thresholds that are scoped to a different node
    if (threshold.node_id && threshold.node_id !== dataNodeId) continue;

    const value = toNumber(sensorData[threshold.sensor_type]);
    if (value == null) continue;
    if (!isThresholdTriggered(threshold.operator, value, threshold.value)) continue;

    candidates.push({
      type: threshold.level,
      level: threshold.level,
      message: buildAlertMessage({
        sensor_type: threshold.sensor_type,
        operator: threshold.operator,
        value,
        threshold: threshold.value,
        level: threshold.level,
        node_id: dataNodeId,
      }),
      sensor_type: threshold.sensor_type,
      node_id: dataNodeId,
      value,
      is_read: false,
      created_at: now,
    });
  }

  const createdAlerts = [];
  for (const candidate of candidates) {
    const result = await createAlertIfAllowed(candidate, now);
    if (result.created) createdAlerts.push(result.alert);
  }

  return createdAlerts;
}
