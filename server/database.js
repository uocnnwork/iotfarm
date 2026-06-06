import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import pg from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(projectRoot, ".env"), quiet: true });

const { Pool } = pg;
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("[Database] DATABASE_URL is missing. Add it to .env first.");
  throw new Error("DATABASE_URL is missing");
}

const pool = new Pool({
  connectionString: databaseUrl,
});

pool.on("error", (error) => {
  console.error("[Database] Unexpected idle client error:", error.message);
});

export async function query(text, params) {
  try {
    return await pool.query(text, params);
  } catch (error) {
    console.error("[Database] Query failed:", error.message);
    throw error;
  }
}

export async function getClient() {
  try {
    return await pool.connect();
  } catch (error) {
    console.error("[Database] Failed to get client:", error.message);
    throw error;
  }
}

export async function closePool() {
  await pool.end();
}

export { pool };
