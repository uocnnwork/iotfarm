import { randomUUID } from "node:crypto";
import mqtt from "mqtt";

const MQTT_BROKER_URL = process.env.MQTT_BROKER_URL || "mqtt://broker.hivemq.com:1883";
const MQTT_USERNAME = process.env.MQTT_USERNAME || "";
const MQTT_PASSWORD = process.env.MQTT_PASSWORD || "";
let mqttClient = null;
const subscriptions = new Map();

function getMqttClient() {
  if (mqttClient) return mqttClient;

  const options = {
    clientId: `greenhouse_api_${randomUUID().slice(0, 8)}`,
    clean: true,
    connectTimeout: 10000,
    reconnectPeriod: 3000,
  };

  if (MQTT_USERNAME) options.username = MQTT_USERNAME;
  if (MQTT_PASSWORD) options.password = MQTT_PASSWORD;

  mqttClient = mqtt.connect(MQTT_BROKER_URL, options);

  mqttClient.on("connect", () => {
    console.log(`[MQTT] API connected to ${MQTT_BROKER_URL}`);
    for (const topic of subscriptions.keys()) {
      mqttClient.subscribe(topic, { qos: 1 }, (error) => {
        if (error) console.error(`[MQTT] Failed to subscribe ${topic}:`, error.message);
        else console.log(`[MQTT] Subscribed to ${topic}`);
      });
    }
  });

  mqttClient.on("message", (topic, payloadBuffer) => {
    const handlers = subscriptions.get(topic);
    if (!handlers || handlers.size === 0) return;

    const payload = payloadBuffer.toString();
    for (const handler of handlers) {
      Promise.resolve(handler(payload, topic)).catch((error) => {
        console.error(`[MQTT] Handler failed for ${topic}:`, error.message);
      });
    }
  });

  mqttClient.on("error", (error) => {
    console.error("[MQTT] API error:", error.message);
  });

  return mqttClient;
}

export async function publishMqtt(topic, payload, options = { qos: 1 }) {
  const client = getMqttClient();
  const message = typeof payload === "string" ? payload : JSON.stringify(payload);

  await new Promise((resolve, reject) => {
    client.publish(topic, message, options, (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

export function subscribeMqtt(topic, handler, options = { qos: 1 }) {
  const client = getMqttClient();
  const handlers = subscriptions.get(topic) || new Set();
  handlers.add(handler);
  subscriptions.set(topic, handlers);

  if (client.connected) {
    client.subscribe(topic, options, (error) => {
      if (error) console.error(`[MQTT] Failed to subscribe ${topic}:`, error.message);
      else console.log(`[MQTT] Subscribed to ${topic}`);
    });
  }

  return () => {
    const currentHandlers = subscriptions.get(topic);
    if (!currentHandlers) return;

    currentHandlers.delete(handler);
    if (currentHandlers.size === 0) {
      subscriptions.delete(topic);
      client.unsubscribe(topic);
    }
  };
}
