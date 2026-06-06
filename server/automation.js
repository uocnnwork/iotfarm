import { toDeviceMqttPayload } from "./config/devices.js";
import { getDeviceDefinition } from "./config/devices.js";
import { publishMqtt } from "./mqtt.js";
import { DEVICE_CONTROL_TOPICS } from "./mqttTopics.js";
import { broadcastRealtime } from "./realtime.js";
import { getActiveAutomationRules, updateAutomationRule } from "./repositories/automationRepository.js";
import { createDeviceCommandLog } from "./repositories/deviceCommandLogRepository.js";
import { getDeviceByName } from "./repositories/deviceRepository.js";

export const AUTOMATION_COOLDOWN_MS = Number(process.env.AUTOMATION_COOLDOWN_MS || 60_000);

const conditionOperators = {
  above: ">",
  above_or_equal: ">=",
  below: "<",
  below_or_equal: "<=",
  equals: "==",
};
const validOperators = new Set([">", ">=", "<", "<=", "=="]);
const validActions = new Set(["turn_on", "turn_off"]);

function toNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function isInCooldown(date, now) {
  if (!date) return false;

  const previousTime = new Date(date).getTime();
  const nowTime = new Date(now).getTime();
  if (!Number.isFinite(previousTime) || !Number.isFinite(nowTime)) return false;

  return nowTime - previousTime < AUTOMATION_COOLDOWN_MS;
}

function getRuleOperator(rule) {
  if (validOperators.has(rule?.operator)) return rule.operator;
  return conditionOperators[rule?.condition] || null;
}

function getTargetDevice(rule) {
  return String(rule?.target_device || rule?.device_name || rule?.device_id || "").trim();
}

function isRuleActive(rule) {
  return rule?.is_active !== false && rule?.active !== false;
}

function getLastTriggeredDate(rule) {
  return rule?.last_triggered_date || rule?.last_triggered_at;
}

function evaluateRuleCondition(value, rule, threshold) {
  const operator = getRuleOperator(rule);
  if (!operator) {
    return {
      matched: false,
      operator: null,
      sensorValue: null,
      threshold: toNumber(threshold),
      skippedReason: "invalid_operator",
    };
  }

  const numericValue = toNumber(value);
  const numericThreshold = toNumber(threshold);
  if (numericValue == null) {
    return {
      matched: false,
      operator,
      sensorValue: null,
      threshold: numericThreshold,
      skippedReason: "sensor_value_missing",
    };
  }
  if (numericThreshold == null) {
    return {
      matched: false,
      operator,
      sensorValue: numericValue,
      threshold: null,
      skippedReason: "invalid_threshold",
    };
  }

  let matched = false;
  if (operator === ">") matched = numericValue > numericThreshold;
  else if (operator === ">=") matched = numericValue >= numericThreshold;
  else if (operator === "<") matched = numericValue < numericThreshold;
  else if (operator === "<=") matched = numericValue <= numericThreshold;
  else matched = numericValue === numericThreshold;

  return {
    matched,
    operator,
    sensorValue: numericValue,
    threshold: numericThreshold,
    skippedReason: matched ? null : "condition_not_matched",
  };
}

function buildAutomationCommand({ rule, targetDevice, sensorValue, threshold, device }) {
  const isOn = rule.action === "turn_on";
  const payload = {
    ...toDeviceMqttPayload({
      deviceId: targetDevice,
      isOn,
      source: "automation",
    }),
    rule_id: rule.id,
    sensor_type: rule.sensor_type,
    value: sensorValue,
    threshold,
  };

  return {
    topic: DEVICE_CONTROL_TOPICS[targetDevice],
    payload,
    device,
  };
}

export async function evaluateAutomationRuleForSensorData(rule, sensorData, options = {}) {
  const now = options.now || new Date().toISOString();
  const enforceCooldown = options.enforceCooldown !== false;
  const prioritizeDeviceMode = options.prioritizeDeviceMode === true;
  const triggeredDeviceNames = options.triggeredDeviceNames || new Set();
  const targetDevice = getTargetDevice(rule);
  const dataNodeId = sensorData?.node_id ?? sensorData?.nodeId ?? null;
  const ruleNodeId = rule?.node_id ?? rule?.nodeId ?? null;
  const condition = evaluateRuleCondition(sensorData?.[rule?.sensor_type], rule, rule?.threshold);
  const result = {
    ruleId: rule?.id ?? null,
    matched: condition.matched,
    targetDevice: targetDevice || null,
    action: rule?.action || null,
    sensorType: rule?.sensor_type || null,
    sensorValue: condition.sensorValue,
    operator: condition.operator,
    threshold: condition.threshold,
    skippedReason: condition.skippedReason,
    device: null,
    topic: targetDevice ? DEVICE_CONTROL_TOPICS[targetDevice] || null : null,
    command: null,
  };

  if (!condition.matched) {
    return result;
  }

  // Check node_id match: rule scoped to a specific node only triggers for that node's data
  if (ruleNodeId && ruleNodeId !== dataNodeId) {
    result.skippedReason = "node_mismatch";
    return result;
  }

  // For zone-scoped devices, verify the target device belongs to the sensor's node
  if (targetDevice) {
    const deviceDef = getDeviceDefinition(targetDevice);
    if (deviceDef && deviceDef.scope === "zone" && dataNodeId && deviceDef.node_id !== dataNodeId) {
      result.skippedReason = "device_node_mismatch";
      return result;
    }
  }

  if (!isRuleActive(rule)) {
    result.skippedReason = "rule_inactive";
    return result;
  }

  if (!validActions.has(rule.action)) {
    result.skippedReason = "invalid_action";
    return result;
  }

  if (!DEVICE_CONTROL_TOPICS[targetDevice]) {
    result.skippedReason = "unsupported_device";
    return result;
  }

  if (!prioritizeDeviceMode && enforceCooldown && isInCooldown(getLastTriggeredDate(rule), now)) {
    result.skippedReason = "cooldown";
    return result;
  }

  if (triggeredDeviceNames.has(targetDevice)) {
    result.skippedReason = "device_already_triggered";
    return result;
  }

  const device = await getDeviceByName(targetDevice);
  result.device = device;
  if (!device) {
    result.skippedReason = "device_not_found";
    return result;
  }

  if (device.mode !== "auto") {
    result.skippedReason = "device_manual";
    return result;
  }

  if (prioritizeDeviceMode && enforceCooldown && isInCooldown(getLastTriggeredDate(rule), now)) {
    result.skippedReason = "cooldown";
    return result;
  }

  result.skippedReason = null;
  result.command = buildAutomationCommand({
    rule,
    targetDevice,
    sensorValue: condition.sensorValue,
    threshold: condition.threshold,
    device,
  });

  return result;
}

export async function runAutomationRulesForSensorData(sensorData, now = new Date().toISOString()) {
  const rules = await getActiveAutomationRules();
  const commands = [];
  const triggeredDeviceNames = new Set();

  for (const rule of rules) {
    const evaluation = await evaluateAutomationRuleForSensorData(rule, sensorData, {
      now,
      triggeredDeviceNames,
    });

    if (evaluation.skippedReason === "device_not_found") {
      console.warn(
        `[Automation] Skipped rule "${rule.name}" (${rule.id}): device "${evaluation.targetDevice}" not found.`,
      );
      continue;
    }

    if (evaluation.skippedReason === "device_manual") {
      console.info(
        `[Automation] Skipped rule "${rule.name}" (${rule.id}) for device "${evaluation.targetDevice}": device is in manual mode.`,
      );
      continue;
    }

    if (!evaluation.command) {
      continue;
    }

    await updateAutomationRule(rule.id, { last_triggered_at: now });
    triggeredDeviceNames.add(evaluation.targetDevice);
    commands.push(evaluation.command);
  }

  return commands;
}

export async function publishAutomationCommand(command) {
  const logData = {
    device_id: command.device?.id ?? null,
    device_name: command.payload.device,
    command: command.payload.action,
    source: "automation",
    mqtt_published: false,
    device_confirmed: false,
  };

  try {
    await publishMqtt(command.topic, command.payload, { qos: 1 });
    const commandLog = await createDeviceCommandLog({
      ...logData,
      mqtt_published: true,
    });
    broadcastRealtime("device_command:new", commandLog);
    console.log(
      `[Automation] Command sent ${command.payload.action} to ${command.topic}; waiting for device status confirmation.`,
    );
  } catch (error) {
    const failedCommandLog = await createDeviceCommandLog(logData).catch((logError) => {
      console.error("[Automation] Failed to record MQTT publish failure:", logError.message);
      return null;
    });
    if (failedCommandLog) broadcastRealtime("device_command:new", failedCommandLog);
    throw error;
  }
}
