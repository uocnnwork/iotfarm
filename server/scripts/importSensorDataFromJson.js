import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closePool } from "../database.js";
import {
  createSensorReading,
  findDuplicateSensorReading,
} from "../repositories/sensorRepository.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../..");
const jsonDatabasePath = path.join(projectRoot, "server", "data", "db.json");

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

function normalizeDate(value) {
  if (!value) return null;

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;

  return date.toISOString();
}

function mapSensorRecord(record = {}) {
  const reading = {
    node_id: record.node_id ?? record.nodeId ?? "default",
    temperature: toNumberOrNull(record.temperature ?? record.temp),
    humidity: toNumberOrNull(record.humidity),
    soil_moisture: toNumberOrNull(
      record.soil_moisture ?? record.soilMoisture ?? record.soil ?? record.soil_moisture_percent,
    ),
    light: toNumberOrNull(record.light ?? record.lux),
  };

  const createdAt = normalizeDate(
    record.created_at ?? record.createdAt ?? record.timestamp ?? record.time ?? record.date ?? record.created_date,
  );

  if (createdAt) {
    reading.created_at = createdAt;
  }

  return reading;
}

function hasAnySensorValue(reading) {
  return [
    reading.temperature,
    reading.humidity,
    reading.soil_moisture,
    reading.light,
  ].some((value) => value != null);
}

function getRecordLabel(key, record = {}) {
  return record.id ? `${key} (${record.id})` : key;
}

try {
  const raw = await readFile(jsonDatabasePath, "utf8");
  const jsonDatabase = JSON.parse(raw);
  const entries = getCollectionItems(jsonDatabase.SensorData);

  let importedCount = 0;
  let skippedCount = 0;
  let duplicateCount = 0;
  let missingTimestampCount = 0;

  if (entries.length === 0) {
    console.log("[ImportSensors] SensorData is empty or missing. Nothing to import.");
  }

  for (const [key, record] of entries) {
    const label = getRecordLabel(key, record);
    const reading = mapSensorRecord(record);

    if (!hasAnySensorValue(reading)) {
      skippedCount += 1;
      console.log(`[ImportSensors] Skipped ${label}: no valid sensor values.`);
      continue;
    }

    if (!reading.created_at) {
      missingTimestampCount += 1;
      console.warn(
        `[ImportSensors] ${label}: missing/invalid timestamp, PostgreSQL default NOW() will be used. ` +
          "Running this import again may create a duplicate for this record.",
      );
    }

    const duplicate = await findDuplicateSensorReading(reading);
    if (duplicate) {
      duplicateCount += 1;
      console.log(`[ImportSensors] Skipped ${label}: duplicate sensor reading ${duplicate.id}.`);
      continue;
    }

    const created = await createSensorReading(reading);
    importedCount += 1;
    console.log(`[ImportSensors] Imported ${label}: ${created.id}.`);
  }

  console.log(
    `[ImportSensors] Done. Read=${entries.length}, imported=${importedCount}, ` +
      `skipped=${skippedCount}, duplicates=${duplicateCount}, missing_timestamp=${missingTimestampCount}.`,
  );
} catch (error) {
  console.error("[ImportSensors] Failed:", error.message);
  process.exitCode = 1;
} finally {
  await closePool().catch(() => {});
}
