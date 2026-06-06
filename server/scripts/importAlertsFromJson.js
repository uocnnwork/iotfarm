import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closePool } from "../database.js";
import { createAlert, findDuplicateAlert } from "../repositories/alertRepository.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../..");
const jsonDatabasePath = path.join(projectRoot, "server", "data", "db.json");
const validLevels = new Set(["info", "warning", "danger"]);

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

function toBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true") return true;
  if (value === 0 || value === "0" || value === "false") return false;
  return fallback;
}

function normalizeLevel(value) {
  const level = String(value || "").toLowerCase();
  return validLevels.has(level) ? level : "warning";
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

function mapAlertRecord(record = {}) {
  const rawValue = record.value ?? record.sensor_value ?? record.sensorValue;
  const rawCreatedAt = record.created_at ??
    record.createdAt ??
    record.created_date ??
    record.timestamp ??
    record.time ??
    record.date;
  const createdAt = normalizeDate(rawCreatedAt);

  return {
    alert: {
      sensor_type: record.sensor_type ?? record.sensorType ?? record.type ?? null,
      level: normalizeLevel(record.level ?? record.severity),
      message: record.message ?? record.title ?? record.content ?? "",
      value: toNumberOrNull(rawValue),
      is_read: toBoolean(record.is_read ?? record.isRead, false),
      created_at: createdAt || new Date().toISOString(),
    },
    hadInvalidValue: hasOwn(record, "value") || hasOwn(record, "sensor_value") || hasOwn(record, "sensorValue")
      ? rawValue != null && rawValue !== "" && toNumberOrNull(rawValue) == null
      : false,
    hadInvalidDate: rawCreatedAt != null && !createdAt,
    usedDefaultDate: !createdAt,
    usedDefaultLevel: !validLevels.has(String(record.level ?? record.severity ?? "").toLowerCase()),
  };
}

function isValidAlert(alert) {
  return Boolean(alert.sensor_type || alert.message);
}

try {
  const raw = await readFile(jsonDatabasePath, "utf8");
  const jsonDatabase = JSON.parse(raw);
  const entries = getCollectionItems(jsonDatabase.Alert);

  let importedCount = 0;
  let skippedCount = 0;
  let duplicateCount = 0;
  let invalidDateCount = 0;
  let defaultDateCount = 0;
  let invalidValueCount = 0;
  let defaultLevelCount = 0;

  if (entries.length === 0) {
    console.log("[ImportAlerts] Alert is empty or missing. Nothing to import.");
  }

  for (const [key, record] of entries) {
    const label = getRecordLabel(key, record);

    if (!record || typeof record !== "object") {
      skippedCount += 1;
      console.log(`[ImportAlerts] Skipped ${label}: record is not an object.`);
      continue;
    }

    try {
      const {
        alert,
        hadInvalidValue,
        hadInvalidDate,
        usedDefaultDate,
        usedDefaultLevel,
      } = mapAlertRecord(record);

      if (!isValidAlert(alert)) {
        skippedCount += 1;
        console.log(`[ImportAlerts] Skipped ${label}: missing both sensor_type and message.`);
        continue;
      }

      if (hadInvalidValue) {
        invalidValueCount += 1;
        console.warn(`[ImportAlerts] ${label}: invalid value, importing value as null.`);
      }

      if (usedDefaultLevel) {
        defaultLevelCount += 1;
        console.warn(`[ImportAlerts] ${label}: missing/invalid level, using warning.`);
      }

      if (usedDefaultDate) {
        defaultDateCount += 1;
        if (hadInvalidDate) invalidDateCount += 1;
        console.warn(`[ImportAlerts] ${label}: missing/invalid created_at, using current time.`);
      }

      const duplicate = await findDuplicateAlert(alert);
      if (duplicate) {
        duplicateCount += 1;
        console.log(`[ImportAlerts] Skipped ${label}: duplicate alert ${duplicate.id}.`);
        continue;
      }

      const created = await createAlert(alert);
      importedCount += 1;
      console.log(`[ImportAlerts] Imported ${label}: ${created.id}.`);
    } catch (error) {
      skippedCount += 1;
      console.warn(`[ImportAlerts] Skipped ${label}: ${error.message}`);
    }
  }

  console.log(
    `[ImportAlerts] Done. Read=${entries.length}, imported=${importedCount}, ` +
      `skipped=${skippedCount}, duplicates=${duplicateCount}, invalid_dates=${invalidDateCount}, ` +
      `default_dates=${defaultDateCount}, invalid_values=${invalidValueCount}, default_levels=${defaultLevelCount}.`,
  );
} catch (error) {
  console.error("[ImportAlerts] Failed:", error.message);
  process.exitCode = 1;
} finally {
  await closePool().catch(() => {});
}
