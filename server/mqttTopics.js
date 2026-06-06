const DEFAULT_TOPIC_PREFIX = "ngocUoC/iotfarm";

function normalizeTopicPart(value) {
  return String(value || "")
    .trim()
    .replace(/^\/+|\/+$/g, "");
}

function topic(suffix) {
  const prefix = normalizeTopicPart(process.env.MQTT_TOPIC_PREFIX || DEFAULT_TOPIC_PREFIX);
  const normalizedSuffix = normalizeTopicPart(suffix);
  return normalizedSuffix ? `${prefix}/${normalizedSuffix}` : prefix;
}

export const MQTT_TOPIC_PREFIX = normalizeTopicPart(process.env.MQTT_TOPIC_PREFIX || DEFAULT_TOPIC_PREFIX);

// 2 topic sensor tương ứng 2 ESP32 node
export const SENSOR_DATA_TOPIC_NODE1 = process.env.SENSOR_DATA_TOPIC_NODE1 || topic("node1");
export const SENSOR_DATA_TOPIC_NODE2 = process.env.SENSOR_DATA_TOPIC_NODE2 || topic("node2");

// Map topic → node_id để inject vào payload
export const SENSOR_TOPIC_TO_NODE_ID = {
  [SENSOR_DATA_TOPIC_NODE1]: "node1",
  [SENSOR_DATA_TOPIC_NODE2]: "node2",
};

export const DEVICE_STATUS_TOPIC = process.env.DEVICE_STATUS_TOPIC || topic("device/status");

export const SIM800L_SMS_TOPIC = process.env.SIM800L_SMS_TOPIC || topic("alerts/sms");

export const GATEWAY_CONTROL_TOPIC = process.env.GATEWAY_CONTROL_TOPIC || topic("control/gateway");

export const DEVICE_CONTROL_TOPICS = {
  pump_1: process.env.DEVICE_CONTROL_TOPIC_PUMP_1 || "ngocUoC/iotfarm/pump1_control",
  mist_1: process.env.DEVICE_CONTROL_TOPIC_MIST_1 || "ngocUoC/iotfarm/mist1_control",
  pump_2: process.env.DEVICE_CONTROL_TOPIC_PUMP_2 || "ngocUoC/iotfarm/pump2_control",
  mist_2: process.env.DEVICE_CONTROL_TOPIC_MIST_2 || "ngocUoC/iotfarm/mist2_control",
  fan: process.env.DEVICE_CONTROL_TOPIC_FAN || topic("control/fan"),
  led: process.env.DEVICE_CONTROL_TOPIC_LED || process.env.DEVICE_CONTROL_TOPIC_LIGHT || topic("control/led"),
};

// Topic điều khiển độ sáng LED (ESP32 nhận chuỗi số "0"-"100")
export const LED_BRIGHTNESS_TOPIC = process.env.LED_BRIGHTNESS_TOPIC || "ngocUoC/iotfarm/led_control";

// Topic điều khiển tốc độ quạt (ESP32 nhận chuỗi số "0"-"100")
export const FAN_SPEED_TOPIC = process.env.FAN_SPEED_TOPIC || "ngocUoC/iotfarm/fan_control";

// Topic điều khiển chu kỳ gửi dữ liệu của sensor node (ESP32 nhận chuỗi số nguyên giây)
export const INTERVAL_CONTROL_TOPIC = process.env.INTERVAL_CONTROL_TOPIC || "ngocUoC/iotfarm/interval_control";
