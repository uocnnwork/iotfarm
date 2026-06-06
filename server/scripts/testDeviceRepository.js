import { closePool } from "../database.js";
import { listDevices, upsertDeviceByName } from "../repositories/deviceRepository.js";

const sampleDevices = [
  { name: "pump", type: "pump", is_on: false, mode: "manual", online: false },
  { name: "fan", type: "fan", is_on: false, mode: "manual", online: false },
  { name: "light", type: "light", is_on: false, mode: "manual", online: false },
];

try {
  for (const device of sampleDevices) {
    const savedDevice = await upsertDeviceByName(device);
    console.log(`[DeviceRepository] Upserted ${savedDevice.name}:`, savedDevice);
  }

  const devices = await listDevices();
  console.log("[DeviceRepository] Devices:");
  console.table(devices);
} catch (error) {
  console.error("[DeviceRepository] Test failed:", error.message);
  process.exitCode = 1;
} finally {
  await closePool().catch(() => {});
}
