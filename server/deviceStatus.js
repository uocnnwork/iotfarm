import { getDeviceDefinition, isKnownDeviceId } from "./config/devices.js";
import { subscribeMqtt } from "./mqtt.js";
import { DEVICE_STATUS_TOPIC } from "./mqttTopics.js";
import { broadcastRealtime } from "./realtime.js";
import { markLatestDeviceCommandConfirmed } from "./repositories/deviceCommandLogRepository.js";
import { getDeviceByName, updateDeviceByName, upsertDeviceByName } from "./repositories/deviceRepository.js";

let unsubscribeDeviceStatus = null;
const validModes = new Set(["manual", "auto"]);

function hasOwn(data, key) {
  return Object.prototype.hasOwnProperty.call(data, key);
}

function getLastSeenAt(payload = {}, now = new Date().toISOString()) {
  if (hasOwn(payload, "last_seen_at")) return payload.last_seen_at;
  if (hasOwn(payload, "lastSeenAt")) return payload.lastSeenAt;
  if (hasOwn(payload, "last_seen")) return payload.last_seen;
  if (hasOwn(payload, "timestamp")) return payload.timestamp;
  return now;
}

function validateStatusPayload(payload = {}) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { valid: false, reason: "payload must be a JSON object" };
  }

  if (!hasOwn(payload, "device")) {
    return { valid: false, reason: "missing required field device" };
  }

  const deviceName = String(payload.device || "").trim();
  if (!deviceName) {
    return { valid: false, reason: "field device must be a non-empty string" };
  }

  if (!hasOwn(payload, "is_on")) {
    return { valid: false, reason: "missing required field is_on" };
  }

  if (typeof payload.is_on !== "boolean") {
    return { valid: false, reason: "field is_on must be a boolean" };
  }

  return {
    valid: true,
    deviceName,
    isOn: payload.is_on,
  };
}

function mapStatusPayloadToUpdate(payload = {}, now = new Date().toISOString()) {
  const update = {
    is_on: payload.is_on,
    last_seen_at: getLastSeenAt(payload, now),
  };

  if (validModes.has(payload.mode)) update.mode = payload.mode;
  if (typeof payload.online === "boolean") update.online = payload.online;

  return update;
}

function toLoggableDevice(device) {
  return {
    ...device,
    device_id: device.name,
  };
}

export async function updateDeviceStateFromStatus(payload) {
  const validation = validateStatusPayload(payload);

  if (!validation.valid) {
    console.warn(`[DeviceStatus] Ignored status payload: ${validation.reason}.`, payload);
    return null;
  }

  let existingDevice = await getDeviceByName(validation.deviceName);
  if (!existingDevice && isKnownDeviceId(validation.deviceName)) {
    const definition = getDeviceDefinition(validation.deviceName);
    existingDevice = await upsertDeviceByName({
      name: definition.id,
      type: definition.type,
      scope: definition.scope,
      node_id: definition.node_id,
    });
  }
  if (!existingDevice) {
    console.warn(
      `[DeviceStatus] Ignored status payload: device "${validation.deviceName}" not found in database.`,
      payload,
    );
    return null;
  }

  const savedDevice = await updateDeviceByName(
    existingDevice.name,
    mapStatusPayloadToUpdate(payload),
  );
  const confirmedCommand = await markLatestDeviceCommandConfirmed({
    device_name: savedDevice.name,
    is_on: validation.isOn,
  });

  if (confirmedCommand) {
    broadcastRealtime("device_command:update", confirmedCommand);
    console.log(
      `[DeviceStatus] Confirmed command ${confirmedCommand.command} for ${savedDevice.name} from device status.`,
    );
  }

  const loggableDevice = toLoggableDevice(savedDevice);
  broadcastRealtime("device:update", loggableDevice);
  return loggableDevice;
}

export function startDeviceStatusMqttListener() {
  if (unsubscribeDeviceStatus) return unsubscribeDeviceStatus;

  unsubscribeDeviceStatus = subscribeMqtt(DEVICE_STATUS_TOPIC, async (message) => {
    let payload;
    try {
      payload = JSON.parse(message);
    } catch {
      console.error(`[DeviceStatus] Invalid JSON on ${DEVICE_STATUS_TOPIC}: ${message}`);
      return;
    }

    try {
      const device = await updateDeviceStateFromStatus(payload);
      if (!device) return;

      console.log(
        `[DeviceStatus] Updated ${device.device_id}: is_on=${device.is_on}, mode=${device.mode}, online=${device.online}`,
      );
    } catch (error) {
      console.error("[DeviceStatus] Failed to update device status:", error.message);
    }
  });

  return unsubscribeDeviceStatus;
}
