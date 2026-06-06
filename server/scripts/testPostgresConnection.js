import dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const { Client } = pg;
const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("[PostgreSQL] DATABASE_URL is missing. Add it to .env first.");
  process.exit(1);
}

const client = new Client({
  connectionString: databaseUrl,
});

try {
  await client.connect();
  const result = await client.query("SELECT NOW() AS now");
  console.log("[PostgreSQL] Connection OK:", result.rows[0]);
} catch (error) {
  console.error("[PostgreSQL] Connection failed:", error.message);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
