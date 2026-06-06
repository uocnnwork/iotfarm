import { WebSocket, WebSocketServer } from "ws";
import { getUserFromToken } from "./auth.js";

const REALTIME_PATH = "/realtime";
const HEARTBEAT_INTERVAL_MS = 30_000;

let wss = null;
let heartbeatTimer = null;

function sendRealtime(socket, type, payload = {}, meta = {}) {
  if (socket.readyState !== WebSocket.OPEN) return;

  socket.send(JSON.stringify({
    type,
    payload,
    meta,
    created_at: new Date().toISOString(),
  }));
}

function rejectUpgrade(socket, statusCode, message) {
  socket.write(`HTTP/1.1 ${statusCode} ${message}\r\n\r\n`);
  socket.destroy();
}

function getRealtimeToken(req) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  return url.searchParams.get("token");
}

export function initRealtime(server) {
  if (wss) return wss;

  wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", async (req, socket, head) => {
    const url = new URL(req.url, `http://${req.headers.host}`);
    if (url.pathname !== REALTIME_PATH) return;

    let user = null;
    try {
      user = await getUserFromToken(getRealtimeToken(req));
    } catch (error) {
      console.error("[Realtime] Auth check failed:", error.message);
      rejectUpgrade(socket, 500, "Internal Server Error");
      return;
    }

    if (!user) {
      rejectUpgrade(socket, 401, "Unauthorized");
      return;
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req, user);
    });
  });

  wss.on("connection", (socket, _req, user) => {
    socket.isAlive = true;
    socket.user = user;

    socket.on("pong", () => {
      socket.isAlive = true;
    });

    sendRealtime(socket, "connected", {
      ok: true,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    });
  });

  heartbeatTimer = setInterval(() => {
    for (const socket of wss.clients) {
      if (socket.isAlive === false) {
        socket.terminate();
        continue;
      }

      socket.isAlive = false;
      socket.ping();
    }
  }, HEARTBEAT_INTERVAL_MS);
  heartbeatTimer.unref();

  server.on("close", () => {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
    wss.close();
  });

  console.log(`[Realtime] WebSocket ready at ${REALTIME_PATH}`);
  return wss;
}

export function broadcastRealtime(type, payload = {}, meta = {}) {
  if (!wss || wss.clients.size === 0) return;

  const message = JSON.stringify({
    type,
    payload,
    meta,
    created_at: new Date().toISOString(),
  });

  for (const socket of wss.clients) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(message);
    }
  }
}
