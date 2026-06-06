import { query } from "../database.js";

const publicUserColumns = "id, username, role, status, created_at, updated_at";
const userColumnsWithPasswordHash = `${publicUserColumns}, password_hash`;
const validRoles = new Set(["admin", "operator", "viewer"]);
const validStatuses = new Set(["pending", "active", "rejected", "disabled"]);
const sortableFields = new Set(["created_at", "updated_at", "username", "role", "status"]);

function hasOwn(data, key) {
  return Object.prototype.hasOwnProperty.call(data, key);
}

function normalizeUsername(value) {
  const username = String(value ?? "").trim();
  if (!username) throw new Error("username is required");
  return username;
}

function normalizePasswordHashValue(value) {
  const passwordHash = String(value ?? "");
  if (!passwordHash) throw new Error("password_hash is required");
  return passwordHash;
}

function normalizePasswordHash(data = {}) {
  return normalizePasswordHashValue(data.password_hash ?? data.passwordHash);
}

function normalizeRole(value, fallback = "operator") {
  if (value == null || value === "") {
    if (fallback == null) throw new Error("role is required");
    return fallback;
  }

  const role = String(value).trim().toLowerCase();
  if (!validRoles.has(role)) {
    throw new Error("role must be one of: admin, operator, viewer");
  }

  return role;
}

function normalizeStatus(value, fallback = "active") {
  if (value == null || value === "") {
    if (fallback == null) throw new Error("status is required");
    return fallback;
  }

  const status = String(value).trim().toLowerCase();
  if (!validStatuses.has(status)) {
    throw new Error("status must be one of: pending, active, rejected, disabled");
  }

  return status;
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

function getUpdateFields(data = {}) {
  const fields = [];

  if (hasOwn(data, "username")) {
    fields.push(["username", normalizeUsername(data.username)]);
  }

  if (hasOwn(data, "password_hash") || hasOwn(data, "passwordHash")) {
    fields.push(["password_hash", normalizePasswordHash(data)]);
  }

  if (hasOwn(data, "role")) {
    fields.push(["role", normalizeRole(data.role, null)]);
  }

  if (hasOwn(data, "status")) {
    fields.push(["status", normalizeStatus(data.status, null)]);
  }

  return fields;
}

export async function listUsers(options = {}) {
  const limit = normalizeLimit(options.limit);
  const page = normalizePage(options.page);
  const offset = (page - 1) * limit;
  const sortBy = normalizeSortBy(options.sortBy);
  const sortOrder = normalizeSortOrder(options.sortOrder);
  const selectedColumns = options.includePasswordHash ? userColumnsWithPasswordHash : publicUserColumns;
  const where = [];
  const values = [];

  if (options.role) {
    values.push(normalizeRole(options.role, null));
    where.push(`role = $${values.length}`);
  }

  if (options.status) {
    values.push(normalizeStatus(options.status, null));
    where.push(`status = $${values.length}`);
  }

  const username = options.username ? String(options.username).trim() : "";
  if (username) {
    values.push(username);
    where.push(`username = $${values.length}`);
  }

  values.push(limit);
  const limitPlaceholder = `$${values.length}`;
  values.push(offset);
  const offsetPlaceholder = `$${values.length}`;

  const result = await query(
    `
      SELECT ${selectedColumns}
      FROM users
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY ${sortBy} ${sortOrder}
      LIMIT ${limitPlaceholder}
      OFFSET ${offsetPlaceholder}
    `,
    values,
  );

  return result.rows;
}

export async function findUserById(id) {
  const result = await query(`SELECT ${publicUserColumns} FROM users WHERE id = $1`, [id]);
  return result.rows[0] || null;
}

export async function findUserByUsername(username) {
  const result = await query(
    `SELECT ${userColumnsWithPasswordHash} FROM users WHERE username = $1`,
    [String(username ?? "").trim()],
  );
  return result.rows[0] || null;
}

export async function createUser(data = {}) {
  const username = normalizeUsername(data.username);
  const passwordHash = normalizePasswordHash(data);
  const role = normalizeRole(data.role, "operator");
  const status = normalizeStatus(data.status, "active");
  const result = await query(
    `
      INSERT INTO users (username, password_hash, role, status)
      VALUES ($1, $2, $3, $4)
      RETURNING ${publicUserColumns}
    `,
    [username, passwordHash, role, status],
  );

  return result.rows[0];
}

export async function updateUser(id, data = {}) {
  const fields = getUpdateFields(data);

  if (fields.length === 0) {
    return findUserById(id);
  }

  const setClause = fields.map(([column], index) => `${column} = $${index + 2}`).join(", ");
  const values = [id, ...fields.map(([, value]) => value)];
  const result = await query(
    `
      UPDATE users
      SET ${setClause}
      WHERE id = $1
      RETURNING ${publicUserColumns}
    `,
    values,
  );

  return result.rows[0] || null;
}

export async function updatePassword(userId, passwordHash) {
  const result = await query(
    `
      UPDATE users
      SET password_hash = $2
      WHERE id = $1
      RETURNING ${publicUserColumns}
    `,
    [userId, normalizePasswordHashValue(passwordHash)],
  );

  return result.rows[0] || null;
}

export async function updateRole(userId, role) {
  const result = await query(
    `
      UPDATE users
      SET role = $2
      WHERE id = $1
      RETURNING ${publicUserColumns}
    `,
    [userId, normalizeRole(role, null)],
  );

  return result.rows[0] || null;
}

export async function updateStatus(userId, status) {
  const result = await query(
    `
      UPDATE users
      SET status = $2
      WHERE id = $1
      RETURNING ${publicUserColumns}
    `,
    [userId, normalizeStatus(status, null)],
  );

  return result.rows[0] || null;
}

export async function countActiveAdmins() {
  const result = await query(
    "SELECT COUNT(*)::integer AS count FROM users WHERE role = 'admin' AND status = 'active'",
  );
  return Number(result.rows[0]?.count || 0);
}

export async function deleteUser(id) {
  const result = await query(`DELETE FROM users WHERE id = $1 RETURNING ${publicUserColumns}`, [id]);
  return result.rows[0] || null;
}

export async function upsertUserByUsername(data = {}) {
  const username = normalizeUsername(data.username);
  const passwordHash = normalizePasswordHash(data);
  const role = normalizeRole(data.role, "operator");
  const status = normalizeStatus(data.status, "active");
  const result = await query(
    `
      INSERT INTO users (username, password_hash, role, status)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (username)
      DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        role = EXCLUDED.role,
        status = EXCLUDED.status
      RETURNING ${publicUserColumns}
    `,
    [username, passwordHash, role, status],
  );

  return result.rows[0];
}
