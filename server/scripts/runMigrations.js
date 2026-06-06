import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../..");
const migrationsDir = path.join(projectRoot, "server", "migrations");

dotenv.config({ path: path.join(projectRoot, ".env") });

const { Client } = pg;
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("[Migrations] DATABASE_URL is missing. Add it to .env first.");
  process.exit(1);
}

const client = new Client({
  connectionString: databaseUrl,
});

async function ensureMigrationsTable() {
  await client.query(`
    CREATE TABLE IF NOT EXISTS migrations (
      id BIGSERIAL PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

async function getMigrationFiles() {
  const entries = await readdir(migrationsDir, { withFileTypes: true });

  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

async function getExecutedMigrationNames() {
  const result = await client.query("SELECT name FROM migrations ORDER BY name ASC");
  return new Set(result.rows.map((row) => row.name));
}

async function runMigration(fileName) {
  const filePath = path.join(migrationsDir, fileName);
  const sql = await readFile(filePath, "utf8");

  console.log(`[Migrations] Running ${fileName}`);

  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("INSERT INTO migrations (name) VALUES ($1)", [fileName]);
    await client.query("COMMIT");
    console.log(`[Migrations] Completed ${fileName}`);
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`[Migrations] Failed ${fileName}:`, error.message);
    throw error;
  }
}

try {
  await client.connect();
  await ensureMigrationsTable();

  const migrationFiles = await getMigrationFiles();
  const executedMigrationNames = await getExecutedMigrationNames();

  if (migrationFiles.length === 0) {
    console.log("[Migrations] No migration files found.");
  }

  for (const fileName of migrationFiles) {
    if (executedMigrationNames.has(fileName)) {
      console.log(`[Migrations] Skipped ${fileName}`);
      continue;
    }

    await runMigration(fileName);
  }

  console.log("[Migrations] Done.");
} catch (error) {
  console.error("[Migrations] Stopped:", error.message || error);
  if (error.code) console.error("[Migrations] Error code:", error.code);
  if (error.stack) console.error("[Migrations] Stack:", error.stack);
  if (Array.isArray(error.errors)) {
    for (const item of error.errors) {
      console.error("[Migrations] Cause:", item.message || item);
      if (item.code) console.error("[Migrations] Cause code:", item.code);
    }
  }
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
