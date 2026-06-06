import http from "node:http";
import path from "node:path";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { pool } from "./database.js";
import { handleAuth } from "./auth.js";
import { handleChatbot } from "./chatbot.js";
import { handleEntity } from "./entities.js";
import { startDeviceStatusMqttListener } from "./deviceStatus.js";
import { startSensorMqttListener } from "./sensorMqtt.js";
import { getRouteParts, sendJson, sendNoContent } from "./httpUtils.js";
import { initRealtime } from "./realtime.js";
import { checkRateLimit } from "./rateLimit.js";
import { startCronJobs } from "./cronJobs.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.join(__dirname, "migrations");

const PORT = Number(process.env.PORT || 3001);

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      sendNoContent(res);
      return;
    }

    const ip = req.socket.remoteAddress || req.headers['x-forwarded-for'] || "unknown";
    if (checkRateLimit(ip)) {
      sendJson(res, 429, { message: "Quá nhiều yêu cầu. Vui lòng thử lại sau 1 phút." });
      return;
    }

    const { url, parts } = getRouteParts(req);

    if (req.method === "GET" && url.pathname === "/health") {
      sendJson(res, 200, { status: "ok" });
      return;
    }

    if (parts[0] === "auth" && await handleAuth(req, res, parts)) return;
    if (parts[0] === "chatbot" && await handleChatbot(req, res, parts)) return;
    if (parts[0] === "api" && await handleEntity(req, res, url, parts)) return;

    sendJson(res, 404, { message: "Route not found" });
  } catch (error) {
    sendJson(res, 500, { message: error.message || "Server error" });
  }
});

try {
  await pool.query("SELECT 1");
  console.log("[Database] Connection pool ready.");
} catch (err) {
  console.error("[Database] Pool warm-up failed:", err.message);
  process.exit(1);
}

try {
  const migrationFiles = (await readdir(migrationsDir, { withFileTypes: true }))
    .filter((entry) => entry.isFile() && entry.name.endsWith(".sql"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

  const migrationsTableExists = await pool.query(
    `
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public' AND table_name = 'migrations'
    `,
  );

  if (migrationsTableExists.rowCount === 0) {
    console.error("[Database] migrations table not found.");
    console.error("[Database] Run: npm run db:migrate");
    process.exit(1);
  }

  const executedResult = await pool.query("SELECT name FROM migrations");
  const executed = new Set(executedResult.rows.map((r) => r.name));
  const pending = migrationFiles.filter((name) => !executed.has(name));

  if (pending.length > 0) {
    console.error("[Database] Pending migrations:", pending.join(", "));
    console.error("[Database] Run: npm run db:migrate");
    process.exit(1);
  }

  console.log(`[Database] Schema OK (${migrationFiles.length} migrations applied).`);
} catch (err) {
  console.error("[Database] Schema check failed:", err.message);
  process.exit(1);
}

startDeviceStatusMqttListener();
startSensorMqttListener();
initRealtime(server);
startCronJobs();

server.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.error(`[Server] Port ${PORT} is already in use.`);
    console.error(
      `[Server] Tip: find owner with \"Get-NetTCPConnection -LocalPort ${PORT}\" then \"taskkill /F /PID <pid>\".`,
    );
  } else {
    console.error("[Server] Listen error:", err.message);
  }
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`GreenHouse API running at http://localhost:${PORT}`);
});

let isShuttingDown = false;
function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[Server] Received ${signal}, shutting down...`);

  const forceExit = setTimeout(() => {
    console.error("[Server] Force exit after 5s timeout.");
    process.exit(1);
  }, 5000);
  forceExit.unref();

  server.close(async () => {
    try {
      await pool.end();
    } catch (err) {
      console.error("[Server] Pool end failed:", err.message);
    }
    console.log("[Server] Shutdown complete.");
    process.exit(0);
  });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
