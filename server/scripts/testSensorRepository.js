import { closePool } from "../database.js";
import {
  createSensorReading,
  getDailyStats,
  getLatestSensorReading,
  listLatestSensorReadingsByNode,
  listSensorReadings,
} from "../repositories/sensorRepository.js";

try {
  const created = await createSensorReading({
    node_id: "node-test",
    temperature: 28.5,
    humidity: 65,
    soilMoisture: 42,
    light: 1000,
  });
  console.log("[SensorRepository] Created:", created);

  const latest = await getLatestSensorReading({ nodeId: "node-test" });
  console.log("[SensorRepository] Latest:", latest);

  const latestByNode = await listLatestSensorReadingsByNode();
  console.log("[SensorRepository] Latest by node:");
  console.table(latestByNode);

  const readings = await listSensorReadings({ limit: 5, page: 1 });
  console.log("[SensorRepository] Recent readings:");
  console.table(readings);

  const dailyStats = await getDailyStats();
  console.log("[SensorRepository] Daily stats:");
  console.table(dailyStats);
} catch (error) {
  console.error("[SensorRepository] Test failed:", error.message);
  process.exitCode = 1;
} finally {
  await closePool().catch(() => {});
}
