import { query } from "../database.js";

const logColumns = [
  "id",
  "device_id",
  "device_name",
  "command",
  "source",
  "mqtt_published",
  "device_confirmed",
  "created_at",
].join(", ");

const sortableFields = new Set(["created_at", "device_name", "command", "source"]);
const configuredTimeoutMs = Number(process.env.DEVICE_COMMAND_CONFIRMATION_TIMEOUT_MS || 15_000);
export const DEVICE_COMMAND_CONFIRMATION_TIMEOUT_MS =
  Number.isFinite(configuredTimeoutMs) && configuredTimeoutMs > 0 ? configuredTimeoutMs : 15_000;

export function getDeviceCommandStatus(log, now = new Date()) {
  if (log?.device_confirmed === true) return "confirmed";
  if (log?.mqtt_published !== true) return "failed";

  const createdAt = new Date(log?.created_at || 0).getTime();
  const nowTime = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(createdAt) || !Number.isFinite(nowTime)) return "command_sent";

  return nowTime - createdAt > DEVICE_COMMAND_CONFIRMATION_TIMEOUT_MS
    ? "timeout"
    : "command_sent";
}

function normalizeLimit(value) {
  const limit = Number(value ?? 10);
  if (!Number.isFinite(limit) || limit <= 0) return 10;
  return Math.min(Math.trunc(limit), 100);
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

export async function listDeviceCommandLogs(options = {}) {
  const limit = normalizeLimit(options.limit);
  const page = normalizePage(options.page);
  const offset = (page - 1) * limit;
  const sortBy = normalizeSortBy(options.sortBy);
  const sortOrder = normalizeSortOrder(options.sortOrder);
  const where = [];
  const values = [];

  if (options.device_name) {
    values.push(options.device_name);
    where.push(`device_name = $${values.length}`);
  }

  if (options.source) {
    values.push(options.source);
    where.push(`source = $${values.length}`);
  }

  values.push(limit);
  const limitPlaceholder = `$${values.length}`;
  values.push(offset);
  const offsetPlaceholder = `$${values.length}`;

  const result = await query(
    `
      SELECT ${logColumns}
      FROM device_command_logs
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY ${sortBy} ${sortOrder}
      LIMIT ${limitPlaceholder}
      OFFSET ${offsetPlaceholder}
    `,
    values,
  );

  return result.rows;
}

export async function createDeviceCommandLog(data = {}) {
  const result = await query(
    `
      INSERT INTO device_command_logs (device_id, device_name, command, source, requested_by, mqtt_published, device_confirmed)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING ${logColumns}
    `,
    [
      data.device_id ?? null,
      data.device_name ?? null,
      data.command,
      data.source,
      data.requested_by ?? null,
      data.mqtt_published === true,
      data.device_confirmed === true,
    ],
  );

  return result.rows[0];
}

export async function markLatestDeviceCommandConfirmed(data = {}) {
  const deviceName = String(data.device_name ?? data.deviceName ?? "").trim();
  if (!deviceName || typeof data.is_on !== "boolean") return null;

  const command = data.is_on ? "turn_on" : "turn_off";
  const result = await query(
    `
      WITH latest_pending AS (
        SELECT id
        FROM device_command_logs
        WHERE device_name = $1
          AND command = $2
          AND mqtt_published = TRUE
          AND device_confirmed = FALSE
          AND created_at >= NOW() - ($3::double precision * INTERVAL '1 millisecond')
        ORDER BY created_at DESC
        LIMIT 1
      )
      UPDATE device_command_logs
      SET device_confirmed = TRUE
      WHERE id IN (SELECT id FROM latest_pending)
      RETURNING ${logColumns}
    `,
    [deviceName, command, DEVICE_COMMAND_CONFIRMATION_TIMEOUT_MS],
  );

  return result.rows[0] || null;
}
