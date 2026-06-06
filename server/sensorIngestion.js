import { createAlertsForSensorData } from "./alerts.js";
import { publishAutomationCommand, runAutomationRulesForSensorData } from "./automation.js";
import { publishSim800lSmsRequest } from "./sim800l.js";
import { broadcastRealtime } from "./realtime.js";
import { createSensorReading } from "./repositories/sensorRepository.js";

function toNumberOrNull(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

export function toSensorRepositoryData(data = {}) {
  const mapped = {
    // "id" là node_id từ ESP32 (doc["id"] = NODE_ID)
    node_id: data.node_id ?? data.nodeId ?? data.id,
    // "t" là temperature từ ESP32 (doc["t"] = temperature)
    temperature: data.temperature ?? data.temp ?? data.t,
    // "h" là humidity từ ESP32 (doc["h"] = humidity)
    humidity: data.humidity ?? data.h,
    // "s" là soil_moisture từ ESP32 (doc["s"] = soilPercent)
    soil_moisture: data.soil_moisture ?? data.soilMoisture ?? data.soil ?? data.s,
    light: data.light ?? data.lux,
    created_at: data.created_at ?? data.createdAt ?? data.timestamp ?? data.created_date,
  };

  for (const key of Object.keys(mapped)) {
    if (mapped[key] === undefined) delete mapped[key];
  }

  return mapped;
}

export function hasAnyValidSensorValue(data = {}) {
  return [
    data.temperature ?? data.temp ?? data.t,
    data.humidity ?? data.h,
    data.soil_moisture ?? data.soilMoisture ?? data.soil ?? data.s,
    data.light ?? data.lux,
  ].some((value) => toNumberOrNull(value) != null);
}

export function toLegacySensorData(reading) {
  if (!reading) return null;

  return {
    id: reading.id,
    node_id: reading.node_id,
    nodeId: reading.node_id,
    temperature: reading.temperature,
    humidity: reading.humidity,
    soil_moisture: reading.soil_moisture,
    soilMoisture: reading.soil_moisture,
    light: reading.light,
    created_at: reading.created_at,
    created_date: reading.created_at,
  };
}

async function runSensorSideEffects(sensorData) {
  const now = sensorData.created_date || new Date().toISOString();
  const createdAlerts = await createAlertsForSensorData(sensorData, now);
  const automationCommands = await runAutomationRulesForSensorData(sensorData, now);

  return { createdAlerts, automationCommands };
}

function publishSensorSideEffects({ createdAlerts, automationCommands }) {
  for (const alert of createdAlerts) {
    publishSim800lSmsRequest(alert).catch((error) => {
      console.error("[SIM800L SMS] Failed to publish alert:", error.message);
    });
  }

  for (const command of automationCommands) {
    publishAutomationCommand(command).catch((error) => {
      console.error("[Automation] Failed to publish command:", error.message);
    });
  }
}

export async function ingestSensorReading(data) {
  if (!hasAnyValidSensorValue(data)) {
    const error = new Error("SensorData must include at least one valid sensor value");
    error.status = 400;
    throw error;
  }

  const reading = await createSensorReading(toSensorRepositoryData(data));
  const nextItem = toLegacySensorData(reading);
  const sideEffects = await runSensorSideEffects(nextItem);

  broadcastRealtime("sensor:update", nextItem);
  for (const alert of sideEffects.createdAlerts) {
    broadcastRealtime("alert:new", alert);
  }

  publishSensorSideEffects(sideEffects);

  return {
    reading: nextItem,
    ...sideEffects,
  };
}
