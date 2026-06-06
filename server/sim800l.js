import { publishMqtt } from "./mqtt.js";
import { SIM800L_SMS_TOPIC } from "./mqttTopics.js";

const sim800lPhoneNumbers = (process.env.SIM800L_PHONE_NUMBERS || "")
  .split(",")
  .map((phone) => phone.trim())
  .filter(Boolean);

function formatAlertMessage(alert) {
  return `[GreenHouse] ${alert.type?.toUpperCase() || "ALERT"}: ${alert.message}. Giá trị: ${alert.value}`;
}

export async function publishSim800lSmsRequest(alert) {
  if (!["warning", "danger"].includes(alert.type)) return;

  const message = formatAlertMessage(alert);
  const payload = {
    id: alert.id,
    type: alert.type,
    message,
    sensor_type: alert.sensor_type,
    value: alert.value,
    phone_numbers: sim800lPhoneNumbers,
    created_date: alert.created_date,
  };

  if (sim800lPhoneNumbers.length === 0) {
    console.log(`[SIM800L SMS] No SIM800L_PHONE_NUMBERS configured. ESP32 can use local default. Message: ${message}`);
  }

  await publishMqtt(SIM800L_SMS_TOPIC, payload, { qos: 1 });
  console.log(`[SIM800L SMS] Published SMS request to ${SIM800L_SMS_TOPIC}`);
}
