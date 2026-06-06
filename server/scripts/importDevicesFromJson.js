import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { closePool } from "../database.js";
import { upsertDeviceByName } from "../repositories/deviceRepository.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../..");
const jsonDatabasePath = path.join(projectRoot, "server", "data", "db.json");

function hasOwn(data, key) {
  return Object.prototype.hasOwnProperty.call(data, key);
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true") return true;
  if (value === 0 || value === "0" || value === "false") return false;
  return fallback;
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

function getName(key, device = {}) {
  return String(device.name ?? device.device_id ?? device.id ?? key ?? "").trim();
}

function getLastSeenAt(device = {}) {
  if (hasOwn(device, "last_seen_at")) return device.last_seen_at;
  if (hasOwn(device, "lastSeenAt")) return device.lastSeenAt;
  if (hasOwn(device, "last_seen")) return device.last_seen;
  return null;
}

function mapDeviceStateToDevice(key, device = {}) {
  const name = getName(key, device);

  return {
    name,
    type: device.type || name,
    is_on: hasOwn(device, "is_on")
      ? normalizeBoolean(device.is_on, false)
      : normalizeBoolean(device.isOn, false),
    mode: device.mode || "manual",
    online: normalizeBoolean(device.online, false),
    last_seen_at: getLastSeenAt(device),
  };
}

try {
  const raw = await readFile(jsonDatabasePath, "utf8");
  const jsonDatabase = JSON.parse(raw);
  const deviceEntries = getCollectionItems(jsonDatabase.DeviceState);

  if (deviceEntries.length === 0) {
    console.log("[ImportDevices] DeviceState is empty or missing. Nothing to import.");
  } else {
    let importedCount = 0;

    for (const [key, deviceState] of deviceEntries) {
      const device = mapDeviceStateToDevice(key, deviceState);

      if (!device.name) {
        console.log(`[ImportDevices] Skipped DeviceState entry ${key}: missing name.`);
        continue;
      }

      const savedDevice = await upsertDeviceByName(device);
      importedCount += 1;
      console.log(`[ImportDevices] Imported/updated ${savedDevice.name}`);
    }

    console.log(`[ImportDevices] Done. Imported/updated ${importedCount} device(s).`);
  }
} catch (error) {
  console.error("[ImportDevices] Failed:", error.message);
  process.exitCode = 1;
} finally {
  await closePool().catch(() => {});
}
