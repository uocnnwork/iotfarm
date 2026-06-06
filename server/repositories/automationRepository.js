import { query } from "../database.js";

const automationRuleColumns = [
  "id",
  "name",
  "sensor_type",
  "node_id",
  "operator",
  "threshold",
  "device_id",
  "device_name",
  "action",
  "active",
  "last_triggered_at",
  "created_at",
  "updated_at",
].join(", ");

const sortableFields = new Set([
  "created_at",
  "updated_at",
  "sensor_type",
  "device_name",
  "active",
  "last_triggered_at",
]);
const validOperators = new Set([">", ">=", "<", "<=", "=="]);
const validActions = new Set(["turn_on", "turn_off"]);
const validSensorTypes = new Set(["temperature", "humidity", "soil_moisture", "light"]);
const conditionOperatorMap = {
  above: ">",
  above_or_equal: ">=",
  below: "<",
  below_or_equal: "<=",
  equals: "==",
  greater_than: ">",
  greater_than_or_equal: ">=",
  less_than: "<",
  less_than_or_equal: "<=",
};

function hasOwn(data, key) {
  return Object.prototype.hasOwnProperty.call(data, key);
}

function toNumberOrNull(value) {
  if (value == null || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function toBooleanOrNull(value) {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true") return true;
  if (value === 0 || value === "0" || value === "false") return false;
  return null;
}

function isUuid(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(
    String(value || ""),
  );
}

function normalizeLimit(value) {
  const limit = Number(value ?? 50);
  if (!Number.isFinite(limit) || limit <= 0) return 50;
  return Math.min(Math.trunc(limit), 500);
}

function normalizePage(value) {
  const page = Number(value ?? 1);
  if (!Number.isFinite(page) || page <= 0) return 1;
  return Math.trunc(page);
}

function normalizeSortBy(value) {
  return sortableFields.has(value) ? value : "created_at";
}

function normalizeSortOrder(value) {
  return String(value || "desc").toLowerCase() === "asc" ? "ASC" : "DESC";
}

function normalizeOperator(data = {}) {
  const rawOperator = data.operator ?? data.condition;
  if (validOperators.has(rawOperator)) return rawOperator;

  const mappedOperator = conditionOperatorMap[String(rawOperator || "").toLowerCase()];
  return mappedOperator || null;
}

function normalizeAction(value) {
  if (value === true || value === 1 || value === "1") return "turn_on";
  if (value === false || value === 0 || value === "0") return "turn_off";

  const action = String(value || "").toLowerCase();
  if (action === "turn_on" || action === "on" || action === "true") return "turn_on";
  if (action === "turn_off" || action === "off" || action === "false") return "turn_off";
  return null;
}

function normalizeDeviceId(data = {}) {
  const deviceId = data.device_id ?? data.deviceId;
  return isUuid(deviceId) ? deviceId : null;
}

function normalizeDeviceName(data = {}) {
  const explicitDeviceName = data.device_name ?? data.deviceName ?? data.target_device ?? data.targetDevice ?? data.device;
  if (explicitDeviceName != null && explicitDeviceName !== "") return String(explicitDeviceName).trim();

  const deviceId = data.device_id ?? data.deviceId;
  return deviceId && !isUuid(deviceId) ? String(deviceId).trim() : null;
}

function normalizeAutomationRule(data = {}) {
  const sensorType = data.sensor_type ?? data.sensorType ?? data.sensor ?? null;
  const operator = normalizeOperator(data);
  const threshold = toNumberOrNull(data.threshold);
  const deviceId = normalizeDeviceId(data);
  const deviceName = normalizeDeviceName(data);
  const action = normalizeAction(data.action);
  const nodeId = data.node_id ?? data.nodeId ?? null;

  return {
    name: data.name || `${sensorType || "sensor"} ${operator || "?"} ${threshold ?? "?"} -> ${deviceName || deviceId || "device"}`,
    sensor_type: sensorType,
    node_id: nodeId,
    operator,
    threshold,
    device_id: deviceId,
    device_name: deviceName,
    action,
    active: toBooleanOrNull(data.active ?? data.is_active ?? data.isActive) ?? true,
    last_triggered_at: data.last_triggered_at ?? data.lastTriggeredAt ?? data.last_triggered_date ?? null,
    created_at: data.created_at ?? data.createdAt ?? data.created_date ?? null,
    updated_at: data.updated_at ?? data.updatedAt ?? data.updated_date ?? null,
  };
}

function validateAutomationRuleForCreate(rule) {
  if (!rule.sensor_type) throw new Error("sensor_type is required");
  if (!validSensorTypes.has(rule.sensor_type)) throw new Error("sensor_type is invalid");
  if (!rule.operator) throw new Error("operator is required");
  if (rule.threshold == null) throw new Error("threshold must be a valid number");
  if (!rule.device_id && !rule.device_name) throw new Error("device_name or device_id is required");
  if (!rule.action) throw new Error("action is required");
}

function getUpdateFields(data = {}) {
  const normalized = normalizeAutomationRule(data);
  const fields = [];

  if (hasOwn(data, "name")) fields.push(["name", normalized.name]);
  if (hasOwn(data, "sensor_type") || hasOwn(data, "sensorType") || hasOwn(data, "sensor")) {
    if (!validSensorTypes.has(normalized.sensor_type)) throw new Error("sensor_type is invalid");
    fields.push(["sensor_type", normalized.sensor_type]);
  }
  if (hasOwn(data, "node_id") || hasOwn(data, "nodeId")) {
    fields.push(["node_id", normalized.node_id]);
  }
  if (hasOwn(data, "operator") || hasOwn(data, "condition")) {
    if (!normalized.operator) throw new Error("operator is invalid");
    fields.push(["operator", normalized.operator]);
  }
  if (hasOwn(data, "threshold")) {
    if (normalized.threshold == null) throw new Error("threshold must be a valid number");
    fields.push(["threshold", normalized.threshold]);
  }
  if (hasOwn(data, "device_id") || hasOwn(data, "deviceId")) {
    fields.push(["device_id", normalized.device_id]);
    if (normalized.device_name) fields.push(["device_name", normalized.device_name]);
  }
  if (
    hasOwn(data, "device_name") ||
    hasOwn(data, "deviceName") ||
    hasOwn(data, "target_device") ||
    hasOwn(data, "targetDevice") ||
    hasOwn(data, "device")
  ) {
    fields.push(["device_name", normalized.device_name]);
  }
  if (hasOwn(data, "action")) {
    if (!normalized.action) throw new Error("action is invalid");
    fields.push(["action", normalized.action]);
  }
  if (hasOwn(data, "active") || hasOwn(data, "is_active") || hasOwn(data, "isActive")) {
    fields.push(["active", normalized.active]);
  }
  if (hasOwn(data, "last_triggered_at") || hasOwn(data, "lastTriggeredAt") || hasOwn(data, "last_triggered_date")) {
    fields.push(["last_triggered_at", normalized.last_triggered_at]);
  }
  if (hasOwn(data, "created_at") || hasOwn(data, "createdAt") || hasOwn(data, "created_date")) {
    fields.push(["created_at", normalized.created_at]);
  }
  if (hasOwn(data, "updated_at") || hasOwn(data, "updatedAt") || hasOwn(data, "updated_date")) {
    fields.push(["updated_at", normalized.updated_at]);
  }

  return fields;
}

export async function listAutomationRules(options = {}) {
  const limit = normalizeLimit(options.limit);
  const page = normalizePage(options.page);
  const offset = (page - 1) * limit;
  const sortBy = normalizeSortBy(options.sortBy);
  const sortOrder = normalizeSortOrder(options.sortOrder);
  const where = [];
  const values = [];

  const active = toBooleanOrNull(options.active ?? options.is_active ?? options.isActive);
  if (active != null) {
    values.push(active);
    where.push(`active = $${values.length}`);
  }

  const sensorType = options.sensor_type ?? options.sensorType ?? options.sensor;
  if (sensorType) {
    values.push(sensorType);
    where.push(`sensor_type = $${values.length}`);
  }

  const deviceName = options.device_name ?? options.deviceName ?? options.target_device ?? options.targetDevice;
  if (deviceName) {
    values.push(deviceName);
    where.push(`device_name = $${values.length}`);
  }

  const nodeId = options.node_id ?? options.nodeId;
  if (nodeId) {
    values.push(nodeId);
    where.push(`node_id = $${values.length}`);
  }

  values.push(limit);
  const limitPlaceholder = `$${values.length}`;
  values.push(offset);
  const offsetPlaceholder = `$${values.length}`;

  const result = await query(
    `
      SELECT ${automationRuleColumns}
      FROM automation_rules
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY ${sortBy} ${sortOrder}
      LIMIT ${limitPlaceholder}
      OFFSET ${offsetPlaceholder}
    `,
    values,
  );

  return result.rows;
}

export async function getAutomationRuleById(id) {
  const result = await query(
    `SELECT ${automationRuleColumns} FROM automation_rules WHERE id = $1`,
    [id],
  );
  return result.rows[0] || null;
}

export async function getActiveAutomationRules() {
  const result = await query(
    `
      SELECT ${automationRuleColumns}
      FROM automation_rules
      WHERE active = TRUE
      ORDER BY created_at DESC
    `,
  );
  return result.rows;
}

export async function createAutomationRule(data) {
  const rule = normalizeAutomationRule(data);
  validateAutomationRuleForCreate(rule);
  const columns = [
    "name",
    "sensor_type",
    "node_id",
    "operator",
    "threshold",
    "device_id",
    "device_name",
    "action",
    "active",
    "last_triggered_at",
  ];
  const values = [
    rule.name,
    rule.sensor_type,
    rule.node_id,
    rule.operator,
    rule.threshold,
    rule.device_id,
    rule.device_name,
    rule.action,
    rule.active,
    rule.last_triggered_at,
  ];

  if (rule.created_at) {
    columns.push("created_at");
    values.push(rule.created_at);
  }

  if (rule.updated_at) {
    columns.push("updated_at");
    values.push(rule.updated_at);
  }

  const placeholders = values.map((_, index) => `$${index + 1}`);

  const result = await query(
    `
      INSERT INTO automation_rules (${columns.join(", ")})
      VALUES (${placeholders.join(", ")})
      RETURNING ${automationRuleColumns}
    `,
    values,
  );

  return result.rows[0];
}

export async function updateAutomationRule(id, data) {
  const fields = getUpdateFields(data);

  if (fields.length === 0) {
    return getAutomationRuleById(id);
  }

  const setClause = fields.map(([column], index) => `${column} = $${index + 2}`).join(", ");
  const values = [id, ...fields.map(([, value]) => value)];
  const result = await query(
    `
      UPDATE automation_rules
      SET ${setClause}
      WHERE id = $1
      RETURNING ${automationRuleColumns}
    `,
    values,
  );

  return result.rows[0] || null;
}

export async function deleteAutomationRule(id) {
  const result = await query(
    `DELETE FROM automation_rules WHERE id = $1 RETURNING ${automationRuleColumns}`,
    [id],
  );
  return result.rows[0] || null;
}

export async function findDuplicateAutomationRule(data) {
  const rule = normalizeAutomationRule(data);
  const result = await query(
    `
      SELECT ${automationRuleColumns}
      FROM automation_rules
      WHERE sensor_type = $1
        AND operator = $2
        AND threshold = $3
        AND device_name IS NOT DISTINCT FROM $4
        AND action = $5
        AND node_id IS NOT DISTINCT FROM $6
      LIMIT 1
    `,
    [rule.sensor_type, rule.operator, rule.threshold, rule.device_name, rule.action, rule.node_id],
  );

  return result.rows[0] || null;
}
