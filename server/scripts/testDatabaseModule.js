import { closePool, query } from "../database.js";

try {
  const result = await query("SELECT NOW() AS now");
  console.log("[Database module] Connection OK:", result.rows[0]);
} catch (error) {
  console.error("[Database module] Connection failed:", error.message);
  process.exitCode = 1;
} finally {
  await closePool().catch(() => {});
}
