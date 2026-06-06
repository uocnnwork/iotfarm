import { mergeDevicesWithDefinitions } from "../config/devices.js";
import { query } from "../database.js";

const validModes = new Set(["manual", "auto"]);

function hasOwn(data, key) {
  return Object.prototype.hasOwnProperty.call(data, key);
}

function normalizeName(data = {}) {
  return String(data.name ?? data.device_id ?? data.id ?? "").trim();
}

function normalizeType(data = {}, name = normalizeName(data)) {
  return String(data.type ?? name).trim();
}

function normalizeBoolean(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true") return true;
  if (value === 0 || value === "0" || value === "false") return false;
  return fallback;
}

function normalizeMode(value, fallback = "manual") {
  return validModes.has(value) ? value : fallback;
}

function normalizeLastSeenAt(data = {}) {
  if (hasOwn(data, "last_seen_at")) return data.last_seen_at;
  if (hasOwn(data, "last_seen")) return data.last_seen;
  return null;
}

function normalizeScope(value, fallback = "global") {
  const scope = String(value || fallback).trim();
  return scope === "zone" ? "zone" : "global";
}

function normalizeNodeId(value) {
  if (value == null || value === "") return null;
  return String(value).trim() || null;
}

function normalizeDeviceForCreate(data = {}) {
  const name = normalizeName(data);
  if (!name) throw new Error("Device name is required");

  return {
    name,
    type: normalizeType(data, name) || name,
    scope: normalizeScope(data.scope),
    node_id: normalizeNodeId(data.node_id ?? data.nodeId),
    is_on: normalizeBoolean(data.is_on, false),
    mode: normalizeMode(data.mode, "manual"),
    online: normalizeBoolean(data.online, false),
    last_seen_at: normalizeLastSeenAt(data),
  };
}

function getUpdateFields(data = {}, { allowName = false } = {}) {
  const fields = [];

  if (allowName && hasOwn(data, "name")) {
    const name = normalizeName(data);
    if (!name) throw new Error("Device name cannot be empty");
    fields.push(["name", name]);
  }

  if (hasOwn(data, "type")) fields.push(["type", normalizeType(data)]);
  if (hasOwn(data, "scope")) fields.push(["scope", normalizeScope(data.scope)]);
  if (hasOwn(data, "node_id") || hasOwn(data, "nodeId")) {
    fields.push(["node_id", normalizeNodeId(data.node_id ?? data.nodeId)]);
  }
  if (hasOwn(data, "is_on")) fields.push(["is_on", normalizeBoolean(data.is_on)]);
  if (hasOwn(data, "mode")) fields.push(["mode", normalizeMode(data.mode)]);
  if (hasOwn(data, "online")) fields.push(["online", normalizeBoolean(data.online)]);
  if (hasOwn(data, "last_seen_at") || hasOwn(data, "last_seen")) {
    fields.push(["last_seen_at", normalizeLastSeenAt(data)]);
  }

  return fields;
}

async function updateDeviceByWhere(whereClause, whereValue, data, options = {}) {
  const fields = getUpdateFields(data, options);

  if (fields.length === 0) {
    const result = await query(`SELECT * FROM devices WHERE ${whereClause} = $1`, [whereValue]);
    return result.rows[0] || null;
  }

  const setClause = fields.map(([column], index) => `${column} = $${index + 2}`).join(", ");
  const values = [whereValue, ...fields.map(([, value]) => value)];
  const result = await query(
    `
      UPDATE devices
      SET ${setClause}
      WHERE ${whereClause} = $1
      RETURNING *
    `,
    values,
  );

  return result.rows[0] || null;
}

export async function listDevices() {
  const result = await query("SELECT * FROM devices ORDER BY name ASC");
  return result.rows;
}

export async function listConfiguredDevices() {
  const rows = await listDevices();
  return mergeDevicesWithDefinitions(rows);
}

export async function getDeviceById(id) {
  const result = await query("SELECT * FROM devices WHERE id = $1", [id]);
  return result.rows[0] || null;
}

export async function getDeviceByName(name) {
  const result = await query("SELECT * FROM devices WHERE name = $1", [String(name).trim()]);
  return result.rows[0] || null;
}

export async function createDevice(data) {
  const device = normalizeDeviceForCreate(data);
  const result = await query(
    `
      INSERT INTO devices (name, type, scope, node_id, is_on, mode, online, last_seen_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING *
    `,
    [
      device.name,
      device.type,
      device.scope,
      device.node_id,
      device.is_on,
      device.mode,
      device.online,
      device.last_seen_at,
    ],
  );

  return result.rows[0];
}

export async function updateDevice(id, data) {
  return updateDeviceByWhere("id", id, data, { allowName: true });
}

export async function updateDeviceByName(name, data) {
  return updateDeviceByWhere("name", String(name).trim(), data);
}

export async function upsertDeviceByName(data) {
  const device = normalizeDeviceForCreate(data);
  const updateFields = getUpdateFields(data);
  const updateClause = updateFields.length > 0
    ? `DO UPDATE SET ${updateFields.map(([column]) => `${column} = EXCLUDED.${column}`).join(", ")}`
    : "DO NOTHING";

  const result = await query(
    `
      INSERT INTO devices (name, type, scope, node_id, is_on, mode, online, last_seen_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      ON CONFLICT (name) ${updateClause}
      RETURNING *
    `,
    [
      device.name,
      device.type,
      device.scope,
      device.node_id,
      device.is_on,
      device.mode,
      device.online,
      device.last_seen_at,
    ],
  );

  return result.rows[0] || getDeviceByName(device.name);
}

export async function deleteDevice(id) {
  const result = await query("DELETE FROM devices WHERE id = $1 RETURNING *", [id]);
  return result.rows[0] || null;
}
