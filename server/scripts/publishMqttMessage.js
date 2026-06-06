import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import dotenv from "dotenv";
import mqtt from "mqtt";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, "../..");

dotenv.config({ path: path.join(projectRoot, ".env") });

function getArgValue(flag) {
  const prefix = `${flag}=`;
  const item = process.argv.slice(2).find((a) => a.startsWith(prefix));
  return item ? item.slice(prefix.length) : undefined;
}

function hasFlag(flag) {
  return process.argv.slice(2).includes(flag);
}

function printUsage() {
  console.log(`
Usage:
  node server/scripts/publishMqttMessage.js <topic> <payload> [--url=mqtt://host:1883] [--username=user] [--password=pass] [--qos=0|1|2] [--retain] [--json] [--count=100] [--intervalMs=0]
  node server/scripts/publishMqttMessage.js <topic> --payloadFile=payload.json [--url=...] [--username=...] [--password=...] [--qos=...] [--retain] [--json] [--count=100] [--intervalMs=0]

Examples:
  node server/scripts/publishMqttMessage.js greenhouse/your-project-id/control/fan ON
  node server/scripts/publishMqttMessage.js greenhouse/your-project-id/alerts/sms '{"message":"Hello"}' --json
  node server/scripts/publishMqttMessage.js greenhouse/your-project-id/control/light '{"state":"on"}' --json --url=mqtt://localhost:1883
  node server/scripts/publishMqttMessage.js greenhouse/your-project-id/alerts/sms --payloadFile=payload.json --json
  node server/scripts/publishMqttMessage.js greenhouse/your-project-id/sensors --payloadFile=sensor.json --json --count=100 --intervalMs=50
`.trim());
}

const positional = process.argv.slice(2).filter((a) => !a.startsWith("--"));
const topic = positional[0];
let rawPayload = positional[1];

if (hasFlag("--help") || hasFlag("-h")) {
  printUsage();
  process.exit(0);
}

if (!topic) {
  printUsage();
  process.exit(1);
}

const payloadFile = getArgValue("--payloadFile");
if (payloadFile) {
  try {
    rawPayload = await readFile(payloadFile, "utf8");
  } catch (error) {
    console.error(`[MQTT] Failed to read --payloadFile=${payloadFile}:`, error.message);
    process.exit(1);
  }
}

if (rawPayload == null) {
  printUsage();
  process.exit(1);
}

const brokerUrl =
  getArgValue("--url") || process.env.MQTT_BROKER_URL || "mqtt://broker.hivemq.com:1883";
const username = getArgValue("--username") || process.env.MQTT_USERNAME || "";
const password = getArgValue("--password") || process.env.MQTT_PASSWORD || "";

const qosRaw = getArgValue("--qos");
const qos = qosRaw == null ? 1 : Number(qosRaw);
if (![0, 1, 2].includes(qos)) {
  console.error(`[MQTT] Invalid --qos=${qosRaw}. Must be 0, 1, or 2.`);
  process.exit(1);
}

const retain = hasFlag("--retain");
const clientId = getArgValue("--clientId") || `greenhouse_pub_${randomUUID().slice(0, 8)}`;
const timeoutMsRaw = getArgValue("--timeoutMs");
const timeoutMs = timeoutMsRaw == null ? 10000 : Number(timeoutMsRaw);
const countRaw = getArgValue("--count");
const count = countRaw == null ? 1 : Number(countRaw);
if (!Number.isFinite(count) || count < 1 || !Number.isInteger(count)) {
  console.error(`[MQTT] Invalid --count=${countRaw}. Must be an integer >= 1.`);
  process.exit(1);
}

const intervalMsRaw = getArgValue("--intervalMs");
const intervalMs = intervalMsRaw == null ? 0 : Number(intervalMsRaw);
if (!Number.isFinite(intervalMs) || intervalMs < 0) {
  console.error(`[MQTT] Invalid --intervalMs=${intervalMsRaw}. Must be a number >= 0.`);
  process.exit(1);
}

let payloadToSend = rawPayload;
if (hasFlag("--json")) {
  try {
    payloadToSend = JSON.stringify(JSON.parse(rawPayload));
  } catch (error) {
    console.error("[MQTT] Invalid JSON payload:", error.message);
    process.exit(1);
  }
}

const connectOptions = {
  clientId,
  clean: true,
  connectTimeout: timeoutMs,
  reconnectPeriod: 0,
};

if (username) connectOptions.username = username;
if (password) connectOptions.password = password;

const client = mqtt.connect(brokerUrl, connectOptions);

try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Connect timeout after ${timeoutMs}ms`));
    }, timeoutMs + 250);

    client.once("connect", () => {
      clearTimeout(timer);
      resolve();
    });
    client.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
  });

  for (let i = 1; i <= count; i += 1) {
    await new Promise((resolve, reject) => {
      client.publish(topic, payloadToSend, { qos, retain }, (error) => {
        if (error) reject(error);
        else resolve();
      });
    });

    if (i === 1 || i === count || i % 10 === 0) {
      console.log(`[MQTT] Published ${i}/${count} to ${topic}`);
    }

    if (intervalMs > 0 && i < count) {
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
  }

  console.log(`[MQTT] Done. Published ${count} message(s) to ${topic} via ${brokerUrl}.`);
} catch (error) {
  console.error("[MQTT] Publish failed:", error.message || error);
  process.exitCode = 1;
} finally {
  await new Promise((resolve) => client.end(false, {}, resolve));
}
