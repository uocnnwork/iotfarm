import { query } from "../database.js";

const plantProfileColumns = [
  "id",
  "code",
  "name",
  "min_temperature",
  "max_temperature",
  "min_humidity",
  "max_humidity",
  "min_soil_moisture",
  "max_soil_moisture",
  "min_light",
  "max_light",
  "watering_note",
  "care_note",
  "aliases",
  "active",
  "created_at",
  "updated_at",
].join(", ");

const sortableFields = new Set(["name", "code", "active", "created_at", "updated_at"]);

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
  return sortableFields.has(value) ? value : "name";
}

function normalizeSortOrder(value) {
  return String(value || "asc").toLowerCase() === "desc" ? "DESC" : "ASC";
}

function normalizeMessage(value) {
  return String(value || "").trim().toLowerCase();
}

export async function listPlantProfiles(options = {}) {
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

  values.push(limit);
  const limitPlaceholder = `$${values.length}`;
  values.push(offset);
  const offsetPlaceholder = `$${values.length}`;

  const result = await query(
    `
      SELECT ${plantProfileColumns}
      FROM plant_profiles
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY ${sortBy} ${sortOrder}, name ASC
      LIMIT ${limitPlaceholder}
      OFFSET ${offsetPlaceholder}
    `,
    values,
  );

  return result.rows;
}

export async function getPlantProfileById(id) {
  if (!id) return null;

  const result = await query(
    `SELECT ${plantProfileColumns} FROM plant_profiles WHERE id = $1 LIMIT 1`,
    [id],
  );

  return result.rows[0] || null;
}

export async function findPlantProfileByMessage(message) {
  const normalizedMessage = normalizeMessage(message);
  if (!normalizedMessage) return null;

  const result = await query(
    `
      SELECT ${plantProfileColumns}, match_length
      FROM (
        SELECT
          plant_profiles.*,
          GREATEST(
            CASE WHEN LOWER($1) LIKE '%' || LOWER(name) || '%' THEN length(name) ELSE 0 END,
            CASE WHEN LOWER($1) LIKE '%' || LOWER(code) || '%' THEN length(code) ELSE 0 END,
            COALESCE(alias_match.match_length, 0)
          ) AS match_length
        FROM plant_profiles
        LEFT JOIN LATERAL (
          SELECT length(alias) AS match_length
          FROM unnest(aliases) AS alias
          WHERE alias <> ''
            AND LOWER($1) LIKE '%' || LOWER(alias) || '%'
          ORDER BY length(alias) DESC
          LIMIT 1
        ) alias_match ON true
        WHERE active = true
      ) AS profile
      WHERE match_length > 0
      ORDER BY match_length DESC, length(name) DESC, name ASC
      LIMIT 1
    `,
    [normalizedMessage],
  );

  return result.rows[0] || null;
}
