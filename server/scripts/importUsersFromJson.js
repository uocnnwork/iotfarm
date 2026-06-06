import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { hash } from "bcryptjs";
import { closePool } from "../database.js";
import {
  findUserByUsername,
  upsertUserByUsername,
} from "../repositories/userRepository.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../..");
const jsonDatabasePath = path.join(projectRoot, "server", "data", "db.json");
const validRoles = new Set(["admin", "operator", "viewer"]);
const bcryptRounds = 10;

function hasOwn(data, key) {
  return Object.prototype.hasOwnProperty.call(data, key);
}

function looksLikeUserRecord(record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) return false;

  return [
    "username",
    "name",
    "email",
    "password",
    "password_plain",
    "plain_password",
    "password_hash",
    "passwordHash",
    "role",
  ].some((key) => hasOwn(record, key));
}

function getCollectionItems(collection) {
  if (Array.isArray(collection)) {
    return collection.map((value, index) => [String(index), value]);
  }

  if (looksLikeUserRecord(collection)) {
    return [["0", collection]];
  }

  if (collection && typeof collection === "object") {
    return Object.entries(collection);
  }

  return [];
}

function getFirstString(record, keys, { trim = true } = {}) {
  for (const key of keys) {
    if (!hasOwn(record, key)) continue;
    if (record[key] == null) continue;

    const value = String(record[key]);
    const normalized = trim ? value.trim() : value;
    if (normalized) return normalized;
  }

  return null;
}

function getUsername(record = {}) {
  return getFirstString(record, ["username", "name", "email"]);
}

function getExistingPasswordHash(record = {}) {
  return getFirstString(record, ["password_hash", "passwordHash"]);
}

function getPlainPassword(record = {}) {
  return getFirstString(record, ["password", "password_plain", "plain_password"], { trim: false });
}

function getRecordLabel(key, record = {}) {
  const username = looksLikeUserRecord(record) ? getUsername(record) : null;
  return username ? `${key} (${username})` : key;
}

function normalizeRole(value, username) {
  if (value == null || value === "") {
    return {
      role: username.toLowerCase() === "admin" ? "admin" : "operator",
      usedDefault: true,
      usedFallbackForInvalidRole: false,
    };
  }

  const role = String(value).trim().toLowerCase();

  if (!validRoles.has(role)) {
    return {
      role: "operator",
      usedDefault: false,
      usedFallbackForInvalidRole: true,
    };
  }

  return {
    role,
    usedDefault: false,
    usedFallbackForInvalidRole: false,
  };
}

function getPasswordHashSummary(passwordHash) {
  return `length=${passwordHash.length}, prefix=${passwordHash.slice(0, 7)}`;
}

async function mapUserRecord(record = {}) {
  const username = getUsername(record);
  if (!username) {
    return { error: "missing username/name/email" };
  }

  let passwordHash = getExistingPasswordHash(record);
  let passwordSource = "existing_hash";

  if (!passwordHash) {
    const plainPassword = getPlainPassword(record);

    if (!plainPassword) {
      return { error: "missing password/password_hash" };
    }

    passwordHash = await hash(plainPassword, bcryptRounds);
    passwordSource = "plain_password_hashed";
  }

  const roleResult = normalizeRole(record.role, username);

  return {
    user: {
      username,
      password_hash: passwordHash,
      role: roleResult.role,
    },
    passwordSource,
    roleResult,
  };
}

try {
  const raw = await readFile(jsonDatabasePath, "utf8");
  const jsonDatabase = JSON.parse(raw);
  const entries = getCollectionItems(jsonDatabase.Users);

  let importedCount = 0;
  let skippedCount = 0;
  let hashedPlainPasswordCount = 0;
  let reusedHashCount = 0;
  let defaultRoleCount = 0;
  let invalidRoleCount = 0;

  if (entries.length === 0) {
    console.log("[ImportUsers] Users is empty or missing. Nothing to import.");
  }

  for (const [key, record] of entries) {
    const label = getRecordLabel(key, record);

    if (!record || typeof record !== "object" || Array.isArray(record)) {
      skippedCount += 1;
      console.log(`[ImportUsers] Skipped ${label}: record is not an object.`);
      continue;
    }

    try {
      const mapped = await mapUserRecord(record);

      if (mapped.error) {
        skippedCount += 1;
        console.log(`[ImportUsers] Skipped ${label}: ${mapped.error}.`);
        continue;
      }

      if (mapped.roleResult.usedFallbackForInvalidRole) {
        invalidRoleCount += 1;
        console.warn(`[ImportUsers] ${label}: invalid role, using operator.`);
      }

      if (mapped.roleResult.usedDefault) {
        defaultRoleCount += 1;
      }

      if (mapped.passwordSource === "plain_password_hashed") {
        hashedPlainPasswordCount += 1;
      } else {
        reusedHashCount += 1;
      }

      const savedUser = await upsertUserByUsername(mapped.user);
      importedCount += 1;
      console.log(
        `[ImportUsers] Imported/updated ${savedUser.username}: role=${savedUser.role}, ` +
          `password_hash_${getPasswordHashSummary(mapped.user.password_hash)}.`,
      );
    } catch (error) {
      skippedCount += 1;
      console.warn(`[ImportUsers] Skipped ${label}: ${error.message}`);
    }
  }

  const adminUser = await findUserByUsername("admin");
  if (adminUser) {
    console.log(
      `[ImportUsers] Admin present: yes, role=${adminUser.role}, ` +
        `password_hash_${getPasswordHashSummary(adminUser.password_hash)}.`,
    );
  } else {
    console.log("[ImportUsers] Admin present: no.");
  }

  console.log(
    `[ImportUsers] Done. Read=${entries.length}, imported_or_updated=${importedCount}, ` +
      `skipped=${skippedCount}, hashed_plain_passwords=${hashedPlainPasswordCount}, ` +
      `reused_hashes=${reusedHashCount}, default_roles=${defaultRoleCount}, ` +
      `invalid_roles=${invalidRoleCount}.`,
  );
} catch (error) {
  console.error("[ImportUsers] Failed:", error.message);
  process.exitCode = 1;
} finally {
  await closePool().catch(() => {});
}
