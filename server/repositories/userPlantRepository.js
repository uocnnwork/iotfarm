import { query } from "../database.js";

const userPlantSelect = `
  up.id,
  up.plant_profile_id,
  up.name,
  up.location,
  up.node_id,
  up.planted_at,
  up.notes,
  up.active,
  up.created_at,
  up.updated_at,
  pp.id AS profile_id,
  pp.code AS profile_code,
  pp.name AS profile_name,
  pp.min_temperature,
  pp.max_temperature,
  pp.min_humidity,
  pp.max_humidity,
  pp.min_soil_moisture,
  pp.max_soil_moisture,
  pp.min_light,
  pp.max_light,
  pp.watering_note,
  pp.care_note,
  pp.aliases
`;

function toUserPlant(row) {
  if (!row) return null;

  return {
    id: row.id,
    plant_profile_id: row.plant_profile_id,
    name: row.name,
    location: row.location,
    node_id: row.node_id,
    planted_at: row.planted_at,
    notes: row.notes,
    active: row.active,
    created_at: row.created_at,
    updated_at: row.updated_at,
    plant_profile: row.profile_id
      ? {
          id: row.profile_id,
          code: row.profile_code,
          name: row.profile_name,
          min_temperature: row.min_temperature,
          max_temperature: row.max_temperature,
          min_humidity: row.min_humidity,
          max_humidity: row.max_humidity,
          min_soil_moisture: row.min_soil_moisture,
          max_soil_moisture: row.max_soil_moisture,
          min_light: row.min_light,
          max_light: row.max_light,
          watering_note: row.watering_note,
          care_note: row.care_note,
          aliases: row.aliases,
        }
      : null,
  };
}

const sortableFields = new Set([
  "name",
  "location",
  "planted_at",
  "active",
  "created_at",
  "updated_at",
]);

function hasOwn(data, key) {
  return Object.prototype.hasOwnProperty.call(data, key);
}

function toBooleanOrNull(value) {
  if (typeof value === "boolean") return value;
  if (value === 1 || value === "1" || value === "true") return true;
  if (value === 0 || value === "0" || value === "false") return false;
  return null;
}

function normalizeLimit(value) {
  const limit = Number(value ?? 100);
  if (!Number.isFinite(limit) || limit <= 0) return 100;
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

function normalizeTextOrNull(value) {
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function normalizeDateOrNull(value) {
  if (value == null || value === "") return null;
  return value;
}

function normalizePlantProfileId(data = {}) {
  return normalizeTextOrNull(data.plant_profile_id ?? data.plantProfileId ?? data.profile_id ?? data.profileId);
}

function normalizeUserPlant(data = {}) {
  return {
    plant_profile_id: normalizePlantProfileId(data),
    name: normalizeTextOrNull(data.name),
    location: normalizeTextOrNull(data.location),
    node_id: normalizeTextOrNull(data.node_id ?? data.nodeId),
    planted_at: normalizeDateOrNull(data.planted_at ?? data.plantedAt),
    notes: data.notes == null ? null : String(data.notes),
    active: toBooleanOrNull(data.active ?? data.is_active ?? data.isActive) ?? true,
  };
}

function normalizeMessage(value) {
  return String(value || "").trim().toLowerCase();
}

export async function listUserPlants(options = {}) {
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
    where.push(`up.active = $${values.length}`);
  }

  values.push(limit);
  const limitPlaceholder = `$${values.length}`;
  values.push(offset);
  const offsetPlaceholder = `$${values.length}`;

  const result = await query(
    `
      SELECT ${userPlantSelect}
      FROM user_plants up
      LEFT JOIN plant_profiles pp ON pp.id = up.plant_profile_id
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY up.${sortBy} ${sortOrder} NULLS LAST, up.name ASC
      LIMIT ${limitPlaceholder}
      OFFSET ${offsetPlaceholder}
    `,
    values,
  );

  return result.rows.map(toUserPlant);
}

export async function listActiveUserPlants() {
  return listUserPlants({ active: true, sortBy: "location", sortOrder: "asc", limit: 500 });
}

export async function getUserPlantById(id, options = {}) {
  if (!id) return null;

  const values = [id];
  const requestedActive = toBooleanOrNull(options.active ?? options.is_active ?? options.isActive);
  const active = options.includeInactive ? requestedActive : (requestedActive ?? true);
  let activeClause = "";
  if (active != null) {
    values.push(active);
    activeClause = `AND up.active = $${values.length}`;
  }
  const result = await query(
    `
      SELECT ${userPlantSelect}
      FROM user_plants up
      LEFT JOIN plant_profiles pp ON pp.id = up.plant_profile_id
      WHERE up.id = $1 ${activeClause}
      LIMIT 1
    `,
    values,
  );

  return toUserPlant(result.rows[0]);
}

function getUpdateFields(data = {}) {
  const normalized = normalizeUserPlant(data);
  const fields = [];

  if (hasOwn(data, "plant_profile_id") || hasOwn(data, "plantProfileId") || hasOwn(data, "profile_id") || hasOwn(data, "profileId")) {
    fields.push(["plant_profile_id", normalized.plant_profile_id]);
  }
  if (hasOwn(data, "name")) fields.push(["name", normalized.name]);
  if (hasOwn(data, "location")) fields.push(["location", normalized.location]);
  if (hasOwn(data, "node_id") || hasOwn(data, "nodeId")) fields.push(["node_id", normalized.node_id]);
  if (hasOwn(data, "planted_at") || hasOwn(data, "plantedAt")) fields.push(["planted_at", normalized.planted_at]);
  if (hasOwn(data, "notes")) fields.push(["notes", normalized.notes]);
  if (hasOwn(data, "active") || hasOwn(data, "is_active") || hasOwn(data, "isActive")) {
    fields.push(["active", normalized.active]);
  }

  return fields;
}

export async function createUserPlant(data = {}) {
  const plant = normalizeUserPlant(data);
  if (!plant.name) throw new Error("name is required");

  const result = await query(
    `
      INSERT INTO user_plants (plant_profile_id, name, location, node_id, planted_at, notes, active)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING id
    `,
    [
      plant.plant_profile_id,
      plant.name,
      plant.location,
      plant.node_id,
      plant.planted_at,
      plant.notes,
      plant.active,
    ],
  );

  return getUserPlantById(result.rows[0].id);
}

export async function updateUserPlant(id, data = {}) {
  const fields = getUpdateFields(data);
  if (fields.length === 0) return getUserPlantById(id);

  const nameField = fields.find(([column]) => column === "name");
  if (nameField && !nameField[1]) throw new Error("name is required");

  const setClause = fields.map(([column], index) => `${column} = $${index + 2}`).join(", ");
  const values = [id, ...fields.map(([, value]) => value)];
  const result = await query(
    `
      UPDATE user_plants
      SET ${setClause}
      WHERE id = $1
      RETURNING id
    `,
    values,
  );

  if (result.rowCount === 0) return null;
  const updatedActive = toBooleanOrNull(data.active ?? data.is_active ?? data.isActive);
  return getUserPlantById(id, updatedActive == null ? {} : { active: updatedActive });
}

export async function deactivateUserPlant(id) {
  const result = await query(
    `
      UPDATE user_plants
      SET active = false
      WHERE id = $1
      RETURNING id
    `,
    [id],
  );

  if (result.rowCount === 0) return null;
  return getUserPlantById(id, { active: false });
}

export async function findUserPlantByMessage(message) {
  const normalizedMessage = normalizeMessage(message);
  if (!normalizedMessage) return null;

  const result = await query(
    `
      SELECT ${userPlantSelect}, match_length
      FROM (
        SELECT
          up.*,
          GREATEST(
            CASE WHEN LOWER($1) LIKE '%' || LOWER(up.name) || '%' THEN length(up.name) ELSE 0 END,
            CASE WHEN up.location IS NOT NULL AND LOWER($1) LIKE '%' || LOWER(up.location) || '%' THEN length(up.location) ELSE 0 END,
            CASE WHEN pp.name IS NOT NULL AND LOWER($1) LIKE '%' || LOWER(pp.name) || '%' THEN length(pp.name) ELSE 0 END,
            CASE WHEN pp.code IS NOT NULL AND LOWER($1) LIKE '%' || LOWER(pp.code) || '%' THEN length(pp.code) ELSE 0 END,
            COALESCE(alias_match.match_length, 0)
          ) AS match_length
        FROM user_plants up
        LEFT JOIN plant_profiles pp ON pp.id = up.plant_profile_id
        LEFT JOIN LATERAL (
          SELECT length(alias) AS match_length
          FROM unnest(COALESCE(pp.aliases, '{}'::text[])) AS alias
          WHERE alias <> ''
            AND LOWER($1) LIKE '%' || LOWER(alias) || '%'
          ORDER BY length(alias) DESC
          LIMIT 1
        ) alias_match ON true
        WHERE up.active = true
      ) AS up
      LEFT JOIN plant_profiles pp ON pp.id = up.plant_profile_id
      WHERE match_length > 0
      ORDER BY match_length DESC, length(up.name) DESC, up.name ASC
      LIMIT 1
    `,
    [normalizedMessage],
  );

  return toUserPlant(result.rows[0]);
}
