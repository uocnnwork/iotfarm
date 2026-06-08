import { subscribeMqtt } from "./mqtt.js";
import {
  SENSOR_DATA_TOPIC_NODE1,
  SENSOR_DATA_TOPIC_NODE2,
  SENSOR_TOPIC_TO_NODE_ID,
} from "./mqttTopics.js";
import { ingestSensorReading } from "./sensorIngestion.js";
import { runLedAutoLightControl } from "./smartAutoControl.js";

const GATEWAY_SENSOR_TOPIC = process.env.GATEWAY_SENSOR_TOPIC || "ngocUoC/iotfarm/gateway/sensor";

const unsubscribeFns = [];

function parseSensorPayload(message) {
  const payload = JSON.parse(message);

  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new Error("Sensor payload must be a JSON object");
  }

  return payload;
}

/**
 * Tạo handler cho một topic cụ thể.
 * node_id được lấy từ SENSOR_TOPIC_TO_NODE_ID theo topic,
 * ưu tiên hơn field "id" trong payload của ESP32.
 */
function makeHandler(topic) {
  return async (message) => {
    let payload;
    try {
      payload = parseSensorPayload(message);
    } catch (error) {
      console.error(`[SensorMQTT] Invalid JSON on ${topic}:`, error.message);
      return;
    }

    // Inject node_id từ topic mapping, fallback về field "id" trong payload
    const nodeIdFromTopic = SENSOR_TOPIC_TO_NODE_ID[topic];
    if (nodeIdFromTopic) {
      payload.node_id = nodeIdFromTopic;
    }

    try {
      const { reading, createdAlerts, automationCommands } = await ingestSensorReading(payload);
      console.log(
        `[SensorMQTT] Saved reading ${reading.id} node=${reading.node_id} from ${topic}. ` +
          `alerts=${createdAlerts.length}, automation=${automationCommands.length}`,
      );
    } catch (error) {
      console.error("[SensorMQTT] Failed to ingest sensor payload:", error.message);
    }
  };
}

export function startSensorMqttListener() {
  if (unsubscribeFns.length > 0) return;

  const sensorTopics = [SENSOR_DATA_TOPIC_NODE1, SENSOR_DATA_TOPIC_NODE2];

  for (const topic of sensorTopics) {
    const unsub = subscribeMqtt(topic, makeHandler(topic));
    unsubscribeFns.push(unsub);
    console.log(`[SensorMQTT] Listening on ${topic}`);
  }

  // Lắng nghe light sensor từ gateway để điều khiển LED tự động
  const unsubGateway = subscribeMqtt(GATEWAY_SENSOR_TOPIC, async (message) => {
    let payload;
    try { payload = JSON.parse(message); } catch { return; }
    const light = Number(payload?.light);
    if (Number.isFinite(light)) {
      runLedAutoLightControl(light).catch((err) => {
        console.error("[SensorMQTT] LED light control error:", err.message);
      });
    }
  });
  unsubscribeFns.push(unsubGateway);
  console.log(`[SensorMQTT] Listening on ${GATEWAY_SENSOR_TOPIC} for LED auto control`);
}

export function stopSensorMqttListener() {
  for (const unsub of unsubscribeFns) unsub();
  unsubscribeFns.length = 0;
}
