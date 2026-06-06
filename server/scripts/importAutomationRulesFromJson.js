import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closePool } from "../database.js";
import {
  createAutomationRule,
  findDuplicateAutomationRule,
} from "../repositories/automationRepository.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../..");
const jsonDatabasePath = path.join(projectRoot, "server", "data", "db.json");
const validOperators = new Set([">", ">=", "<", "<=", "=="]);
const conditionOperatorMap = {
  above: ">",
  below: "<",
  equals: "==",
  greater_than: ">",
  less_than: "<",
};

function hasOwn(data, key) {
  return Object.prototype.hasOwnProperty.call(data, key);
}

function getCollectionItems(collection) {
  if (Array.isArray(collection)) {
    return collection.map((value, index) => [String(index), value]);
  }

  if (collection && typeof collection === "object") {
    return Object.entries(collection);
  }

  return [];
}

function toNumberOrNull(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toBoolean(value, fallback = true) {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true") return true;
  if (value === 0 || value === "0" || value === "false") return false;
  return fallback;
}

function normalizeOperator(data = {}) {
  const rawOperator = data.operator ?? data.condition;
  if (validOperators.has(rawOperator)) return rawOperator;

  return conditionOperatorMap[String(rawOperator || "").toLowerCase()] || null;
}

function normalizeAction(value) {
  if (value === true || value === 1 || value === "1") return "turn_on";
  if (value === false || value === 0 || value === "0") return "turn_off";

  const action = String(value || "").toLowerCase();
  if (action === "turn_on" || action === "on" || action === "true") return "turn_on";
  if (action === "turn_off" || action === "off" || action === "false") return "turn_off";
  return null;
}

function normalizeDate(value) {
  if (!value) return null;

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;

  return date.toISOString();
}

function getRecordLabel(key, record = {}) {
  return record.id ? `${key} (${record.id})` : key;
}

function getDeviceName(record = {}) {
  return record.device_name ?? record.deviceName ?? record.target_device ?? record.targetDevice ?? record.device ?? null;
}

function mapAutomationRuleRecord(record = {}) {
  const sensorType = record.sensor_type ?? record.sensorType ?? record.sensor ?? null;
  const operator = normalizeOperator(record);
  const threshold = toNumberOrNull(record.threshold);
  const deviceName = getDeviceName(record);
  const deviceId = record.device_id ?? record.deviceId ?? null;
  const action = normalizeAction(record.action);
  const rawCreatedAt = record.created_at ?? record.createdAt ?? record.created_date;
  const rawUpdatedAt = record.updated_at ?? record.updatedAt ?? record.updated_date;
  const rawLastTriggeredAt = record.last_triggered_at ?? record.lastTriggeredAt ?? record.last_triggered_date;
  const createdAt = normalizeDate(rawCreatedAt);
  const updatedAt = normalizeDate(rawUpdatedAt);
  const lastTriggeredAt = normalizeDate(rawLastTriggeredAt);
  const name = record.name || `Auto ${sensorType || "sensor"} ${operator || "?"} ${threshold ?? "?"} -> ${deviceName || deviceId || "device"} ${action || "action"}`;
  const rule = {
    name,
    sensor_type: sensorType,
    operator,
    threshold,
    device_id: deviceId,
    device_name: deviceName,
    action,
    active: toBoolean(record.active ?? record.is_active ?? record.isActive, true),
  };

  if (createdAt) rule.created_at = createdAt;
  if (updatedAt) rule.updated_at = updatedAt;
  if (lastTriggeredAt) rule.last_triggered_at = lastTriggeredAt;

  return {
    rule,
    invalidDates: [
      rawCreatedAt != null && !createdAt ? "created_at" : null,
      rawUpdatedAt != null && !updatedAt ? "updated_at" : null,
      rawLastTriggeredAt != null && !lastTriggeredAt ? "last_triggered_at" : null,
    ].filter(Boolean),
    generatedName: !record.name,
    invalidThreshold: hasOwn(record, "threshold") && threshold == null,
  };
}

function getValidationError(rule) {
  if (!rule.sensor_type) return "missing sensor_type";
  if (!rule.operator) return "missing/invalid operator or condition";
  if (rule.threshold == null) return "threshold must be a valid number";
  if (!rule.device_name && !rule.device_id) return "missing device_name or device_id";
  if (!rule.action) return "missing/invalid action";
  return null;
}

try {
  const raw = await readFile(jsonDatabasePath, "utf8");
  const jsonDatabase = JSON.parse(raw);
  const entries = getCollectionItems(jsonDatabase.AutomationRule);

  let importedCount = 0;
  let skippedCount = 0;
  let duplicateCount = 0;
  let invalidDateCount = 0;
  let generatedNameCount = 0;

  if (entries.length === 0) {
    console.log("[ImportAutomation] AutomationRule is empty or missing. Nothing to import.");
  }

  for (const [key, record] of entries) {
    const label = getRecordLabel(key, record);

    if (!record || typeof record !== "object") {
      skippedCount += 1;
      console.log(`[ImportAutomation] Skipped ${label}: record is not an object.`);
      continue;
    }

    try {
      const { rule, invalidDates, generatedName } = mapAutomationRuleRecord(record);
      const validationError = getValidationError(rule);

      if (validationError) {
        skippedCount += 1;
        console.log(`[ImportAutomation] Skipped ${label}: ${validationError}.`);
        continue;
      }

      if (generatedName) {
        generatedNameCount += 1;
        console.warn(`[ImportAutomation] ${label}: missing name, generated "${rule.name}".`);
      }

      if (invalidDates.length > 0) {
        invalidDateCount += invalidDates.length;
        console.warn(
          `[ImportAutomation] ${label}: ignored invalid date field(s): ${invalidDates.join(", ")}.`,
        );
      }

      const duplicate = await findDuplicateAutomationRule(rule);
      if (duplicate) {
        duplicateCount += 1;
        console.log(`[ImportAutomation] Skipped ${label}: duplicate automation rule ${duplicate.id}.`);
        continue;
      }

      const created = await createAutomationRule(rule);
      importedCount += 1;
      console.log(`[ImportAutomation] Imported ${label}: ${created.id}.`);
    } catch (error) {
      skippedCount += 1;
      console.warn(`[ImportAutomation] Skipped ${label}: ${error.message}`);
    }
  }

  console.log(
    `[ImportAutomation] Done. Read=${entries.length}, imported=${importedCount}, ` +
      `skipped=${skippedCount}, duplicates=${duplicateCount}, invalid_dates=${invalidDateCount}, ` +
      `generated_names=${generatedNameCount}.`,
  );
} catch (error) {
  console.error("[ImportAutomation] Failed:", error.message);
  process.exitCode = 1;
} finally {
  await closePool().catch(() => {});
}
