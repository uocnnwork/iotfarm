import { query } from "../database.js";

const alertColumns = "id, sensor_type, node_id, level, message, value, is_read, created_at";
const sortableFields = new Set(["created_at", "level", "sensor_type", "is_read", "value"]);
const validLevels = new Set(["info", "warning", "danger"]);
const DEFAULT_ALERT_COOLDOWN_MS = 5 * 60 * 1000;

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

function normalizeLevel(value) {
  const level = String(value || "").toLowerCase();
  return validLevels.has(level) ? level : "warning";
}

function normalizeAlert(data = {}) {
  return {
    sensor_type: data.sensor_type ?? data.sensorType ?? data.type ?? null,
    node_id: data.node_id ?? data.nodeId ?? null,
    level: normalizeLevel(data.level ?? data.severity),
    message: data.message ?? data.title ?? data.content ?? "",
    value: toNumberOrNull(data.value ?? data.sensor_value ?? data.sensorValue),
    is_read: toBooleanOrNull(data.is_read ?? data.isRead) ?? false,
    created_at: data.created_at ?? data.createdAt ?? data.created_date ?? data.timestamp ?? data.time ?? data.date ?? null,
  };
}

function addDateFilters(where, values, options = {}) {
  if (options.from) {
    values.push(options.from);
    where.push(`created_at >= $${values.length}`);
  }

  if (options.to) {
    values.push(options.to);
    where.push(`created_at <= $${values.length}`);
  }
}

function getUpdateFields(data = {}) {
  const fields = [];

  if (hasOwn(data, "sensor_type") || hasOwn(data, "sensorType") || hasOwn(data, "type")) {
    fields.push(["sensor_type", data.sensor_type ?? data.sensorType ?? data.type ?? null]);
  }
  if (hasOwn(data, "level") || hasOwn(data, "severity")) {
    fields.push(["level", normalizeLevel(data.level ?? data.severity)]);
  }
  if (hasOwn(data, "message") || hasOwn(data, "title") || hasOwn(data, "content")) {
    fields.push(["message", data.message ?? data.title ?? data.content ?? ""]);
  }
  if (hasOwn(data, "value") || hasOwn(data, "sensor_value") || hasOwn(data, "sensorValue")) {
    fields.push(["value", toNumberOrNull(data.value ?? data.sensor_value ?? data.sensorValue)]);
  }
  if (hasOwn(data, "is_read") || hasOwn(data, "isRead")) {
    fields.push(["is_read", toBooleanOrNull(data.is_read ?? data.isRead) ?? false]);
  }
  if (
    hasOwn(data, "created_at") ||
    hasOwn(data, "createdAt") ||
    hasOwn(data, "created_date") ||
    hasOwn(data, "timestamp") ||
    hasOwn(data, "time") ||
    hasOwn(data, "date")
  ) {
    fields.push(["created_at", data.created_at ?? data.createdAt ?? data.created_date ?? data.timestamp ?? data.time ?? data.date]);
  }

  return fields;
}

export async function listAlerts(options = {}) {
  const limit = normalizeLimit(options.limit);
  const page = normalizePage(options.page);
  const offset = (page - 1) * limit;
  const sortBy = normalizeSortBy(options.sortBy);
  const sortOrder = normalizeSortOrder(options.sortOrder);
  const where = [];
  const values = [];

  if (options.level) {
    values.push(normalizeLevel(options.level));
    where.push(`level = $${values.length}`);
  }

  const sensorType = options.sensor_type ?? options.sensorType;
  if (sensorType) {
    values.push(sensorType);
    where.push(`sensor_type = $${values.length}`);
  }

  const isRead = toBooleanOrNull(options.is_read ?? options.isRead);
  if (isRead != null) {
    values.push(isRead);
    where.push(`is_read = $${values.length}`);
  }

  const nodeId = options.node_id ?? options.nodeId;
  if (nodeId) {
    values.push(nodeId);
    where.push(`node_id = $${values.length}`);
  }

  addDateFilters(where, values, options);

  values.push(limit);
  const limitPlaceholder = `$${values.length}`;
  values.push(offset);
  const offsetPlaceholder = `$${values.length}`;

  const result = await query(
    `
      SELECT ${alertColumns}
      FROM alerts
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY ${sortBy} ${sortOrder}
      LIMIT ${limitPlaceholder}
      OFFSET ${offsetPlaceholder}
    `,
    values,
  );

  return result.rows;
}

export async function getAlertById(id) {
  const result = await query(`SELECT ${alertColumns} FROM alerts WHERE id = $1`, [id]);
  return result.rows[0] || null;
}

export async function createAlert(data) {
  const alert = normalizeAlert(data);
  const columns = ["sensor_type", "node_id", "level", "message", "value", "is_read"];
  const values = [alert.sensor_type, alert.node_id, alert.level, alert.message, alert.value, alert.is_read];

  if (alert.created_at) {
    columns.push("created_at");
    values.push(alert.created_at);
  }

  const placeholders = values.map((_, index) => `$${index + 1}`);
  const result = await query(
    `
      INSERT INTO alerts (${columns.join(", ")})
      VALUES (${placeholders.join(", ")})
      RETURNING ${alertColumns}
    `,
    values,
  );

  return result.rows[0];
}

export async function markAlertAsRead(id) {
  const result = await query(
    `
      UPDATE alerts
      SET is_read = TRUE
      WHERE id = $1
      RETURNING ${alertColumns}
    `,
    [id],
  );

  return result.rows[0] || null;
}

export async function markAllAlertsAsRead() {
  const result = await query(
    `
      UPDATE alerts
      SET is_read = TRUE
      WHERE is_read = FALSE
      RETURNING ${alertColumns}
    `,
  );

  return result.rows;
}

export async function updateAlert(id, data) {
  const fields = getUpdateFields(data);

  if (fields.length === 0) {
    return getAlertById(id);
  }

  const setClause = fields.map(([column], index) => `${column} = $${index + 2}`).join(", ");
  const values = [id, ...fields.map(([, value]) => value)];
  const result = await query(
    `
      UPDATE alerts
      SET ${setClause}
      WHERE id = $1
      RETURNING ${alertColumns}
    `,
    values,
  );

  return result.rows[0] || null;
}

export async function deleteAlert(id) {
  const result = await query(`DELETE FROM alerts WHERE id = $1 RETURNING ${alertColumns}`, [id]);
  return result.rows[0] || null;
}

export async function findRecentSimilarAlert(data = {}) {
  const sensorType = data.sensor_type ?? data.sensorType ?? data.type;
  if (!sensorType) return null;

  const since = data.since || new Date(Date.now() - DEFAULT_ALERT_COOLDOWN_MS).toISOString();
  const nodeId = data.node_id ?? data.nodeId ?? null;

  const values = [sensorType, normalizeLevel(data.level), since];
  let nodeClause;
  if (nodeId) {
    values.push(nodeId);
    nodeClause = `AND node_id = $${values.length}`;
  } else {
    nodeClause = "AND node_id IS NULL";
  }

  const result = await query(
    `
      SELECT ${alertColumns}
      FROM alerts
      WHERE sensor_type = $1
        AND level = $2
        AND created_at >= $3
        ${nodeClause}
      ORDER BY created_at DESC
      LIMIT 1
    `,
    values,
  );

  return result.rows[0] || null;
}

export async function findDuplicateAlert(data = {}) {
  const alert = normalizeAlert(data);

  if (!alert.created_at) {
    return null;
  }

  const result = await query(
    `
      SELECT ${alertColumns}
      FROM alerts
      WHERE sensor_type IS NOT DISTINCT FROM $1
        AND level = $2
        AND message = $3
        AND value IS NOT DISTINCT FROM $4
        AND created_at = $5
      LIMIT 1
    `,
    [alert.sensor_type, alert.level, alert.message, alert.value, alert.created_at],
  );

  return result.rows[0] || null;
}

export async function deleteOldAlerts(beforeDate) {
  const result = await query(
    `
      DELETE FROM alerts
      WHERE created_at < $1
      RETURNING ${alertColumns}
    `,
    [beforeDate],
  );

  return result.rows;
}
