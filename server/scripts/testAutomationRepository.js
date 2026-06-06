import { closePool } from "../database.js";
import {
  createAutomationRule,
  findDuplicateAutomationRule,
  getActiveAutomationRules,
  listAutomationRules,
  updateAutomationRule,
} from "../repositories/automationRepository.js";

try {
  const created = await createAutomationRule({
    name: `Repository test pump rule ${new Date().toISOString()}`,
    sensorType: "temperature",
    condition: "above",
    threshold: 39.5,
    targetDevice: "pump",
    action: "on",
    isActive: true,
  });
  console.log("[AutomationRepository] Created:", created);

  const rules = await listAutomationRules({ limit: 5, page: 1 });
  console.log("[AutomationRepository] Recent rules:");
  console.table(rules);

  const activeRules = await getActiveAutomationRules();
  console.log("[AutomationRepository] Active rule count:", activeRules.length);

  const lastTriggeredAt = new Date().toISOString();
  const updated = await updateAutomationRule(created.id, {
    lastTriggeredAt,
  });
  console.log("[AutomationRepository] Updated last_triggered_at:", updated);

  const duplicate = await findDuplicateAutomationRule({
    sensor_type: created.sensor_type,
    operator: created.operator,
    threshold: created.threshold,
    device_name: created.device_name,
    action: created.action,
  });
  console.log("[AutomationRepository] Duplicate:", duplicate);
} catch (error) {
  console.error("[AutomationRepository] Test failed:", error.message);
  process.exitCode = 1;
} finally {
  await closePool().catch(() => {});
}
