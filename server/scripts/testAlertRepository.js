import { closePool } from "../database.js";
import {
  createAlert,
  findRecentSimilarAlert,
  getAlertById,
  listAlerts,
  markAlertAsRead,
} from "../repositories/alertRepository.js";

try {
  const created = await createAlert({
    sensor_type: "temperature",
    level: "warning",
    message: "Test alert from alertRepository",
    value: 41.5,
  });
  console.log("[AlertRepository] Created:", created);

  const alerts = await listAlerts({ limit: 5, page: 1 });
  console.log("[AlertRepository] Recent alerts:");
  console.table(alerts);

  const similar = await findRecentSimilarAlert({
    sensor_type: created.sensor_type,
    level: created.level,
    since: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  });
  console.log("[AlertRepository] Recent similar:", similar);

  const marked = await markAlertAsRead(created.id);
  console.log("[AlertRepository] Marked as read:", marked);

  const fetched = await getAlertById(created.id);
  console.log("[AlertRepository] Fetched:", fetched);
} catch (error) {
  console.error("[AlertRepository] Test failed:", error.message);
  process.exitCode = 1;
} finally {
  await closePool().catch(() => {});
}
