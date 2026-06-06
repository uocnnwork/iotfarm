import { subscribeMqtt } from "./mqtt.js";
import {
  SENSOR_DATA_TOPIC_NODE1,
  SENSOR_DATA_TOPIC_NODE2,
  SENSOR_TOPIC_TO_NODE_ID,
} from "./mqttTopics.js";
import { ingestSensorReading } from "./sensorIngestion.js";

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
}

export function stopSensorMqttListener() {
  for (const unsub of unsubscribeFns) unsub();
  unsubscribeFns.length = 0;
}
