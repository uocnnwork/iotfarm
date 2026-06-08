/**
 * Email Alert Module
 * Gửi email cảnh báo khi có alert mới.
 * Không gửi nếu thiết bị khắc phục chỉ số đó đã ở chế độ "auto"
 * (vì hệ thống tự xử lý rồi).
 *
 * Cấu hình qua .env:
 *   ALERT_EMAIL_TO      - địa chỉ nhận (mặc định uocnn.study@gmail.com)
 *   ALERT_EMAIL_FROM    - địa chỉ gửi (Gmail)
 *   ALERT_EMAIL_PASS    - App Password của Gmail
 *   ALERT_EMAIL_ENABLED - "true" để bật (mặc định true nếu có ALERT_EMAIL_PASS)
 */

import nodemailer from "nodemailer";
import { getDeviceByName } from "./repositories/deviceRepository.js";

const ALERT_EMAIL_TO   = process.env.ALERT_EMAIL_TO   || "uocnn.study@gmail.com";
const ALERT_EMAIL_FROM = process.env.ALERT_EMAIL_FROM || process.env.ALERT_EMAIL_TO || "uocnn.study@gmail.com";
const ALERT_EMAIL_PASS = process.env.ALERT_EMAIL_PASS || "";
const ALERT_EMAIL_ENABLED = process.env.ALERT_EMAIL_ENABLED !== "false";

const NODE_LABELS = { node1: "Khu 1", node2: "Khu 2" };
const SENSOR_LABELS = {
  temperature:   "Nhiệt độ",
  humidity:      "Độ ẩm không khí",
  soil_moisture: "Độ ẩm đất",
  light:         "Ánh sáng",
};

// Map sensor_type → device_id có thể khắc phục
// (giống logic ở smartAutoControl và Dashboard)
function getRemedyDeviceIds(sensorType, nodeId) {
  if (sensorType === "soil_moisture") {
    return nodeId === "node1" ? ["pump_1"] : nodeId === "node2" ? ["pump_2"] : ["pump_1", "pump_2"];
  }
  if (sensorType === "humidity") {
    return nodeId === "node1" ? ["mist_1"] : nodeId === "node2" ? ["mist_2"] : ["mist_1", "mist_2"];
  }
  if (sensorType === "temperature") return ["fan"];
  return [];
}

/**
 * Kiểm tra xem bất kỳ thiết bị khắc phục nào đang ở mode auto không.
 * Nếu có → hệ thống tự xử lý → không cần gửi mail.
 */
async function isRemedyDeviceAuto(sensorType, nodeId) {
  const deviceIds = getRemedyDeviceIds(sensorType, nodeId);
  for (const deviceId of deviceIds) {
    const device = await getDeviceByName(deviceId);
    if (device?.mode === "auto") return true;
  }
  return false;
}

function createTransporter() {
  if (!ALERT_EMAIL_PASS) return null;
  return nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: ALERT_EMAIL_FROM, pass: ALERT_EMAIL_PASS },
  });
}

function buildEmailContent(alert) {
  const nodeLabel = alert.node_id ? (NODE_LABELS[alert.node_id] || alert.node_id) : "Toàn hệ thống";
  const sensorLabel = SENSOR_LABELS[alert.sensor_type] || alert.sensor_type || "Cảm biến";
  const levelTag = alert.level === "danger" ? "🔴 NGUY HIỂM" : "🟡 CẢNH BÁO";
  const time = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

  const subject = `${levelTag} [GreenHouse] ${sensorLabel} - ${nodeLabel}`;

  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
      <div style="background:${alert.level === "danger" ? "#dc2626" : "#d97706"};padding:16px 20px">
        <h2 style="margin:0;color:#fff;font-size:16px">${levelTag} Cảnh báo nhà kính</h2>
      </div>
      <div style="padding:20px">
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <tr><td style="padding:6px 0;color:#6b7280;width:140px">Khu vực</td>
              <td style="padding:6px 0;font-weight:600">${nodeLabel}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280">Chỉ số</td>
              <td style="padding:6px 0;font-weight:600">${sensorLabel}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280">Giá trị</td>
              <td style="padding:6px 0;font-weight:600;color:${alert.level === "danger" ? "#dc2626" : "#d97706"}">${alert.value ?? "N/A"}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280">Chi tiết</td>
              <td style="padding:6px 0">${alert.message}</td></tr>
          <tr><td style="padding:6px 0;color:#6b7280">Thời gian</td>
              <td style="padding:6px 0">${time}</td></tr>
        </table>
        <p style="margin:16px 0 0;font-size:12px;color:#9ca3af">
          Email này được gửi tự động từ hệ thống GreenHouse IoT.<br>
          Thiết bị khắc phục chỉ số này đang ở chế độ <strong>Thủ công</strong> — cần can thiệp thủ công.
        </p>
      </div>
    </div>
  `;

  return { subject, html };
}

/**
 * Gửi email cảnh báo nếu:
 * 1. Tính năng email được bật và có cấu hình
 * 2. Alert level là warning hoặc danger
 * 3. Thiết bị khắc phục chỉ số này KHÔNG ở mode auto
 */
export async function sendAlertEmail(alert) {
  if (!ALERT_EMAIL_ENABLED || !ALERT_EMAIL_PASS) return;
  if (!["warning", "danger"].includes(alert.level ?? alert.type)) return;

  // Nếu thiết bị khắc phục đang auto → hệ thống tự xử lý → không spam mail
  const remedyIsAuto = await isRemedyDeviceAuto(alert.sensor_type, alert.node_id);
  if (remedyIsAuto) {
    console.log(`[EmailAlert] Skipped: remedy device for ${alert.sensor_type} (${alert.node_id}) is in auto mode`);
    return;
  }

  const transporter = createTransporter();
  if (!transporter) return;

  const { subject, html } = buildEmailContent(alert);

  try {
    await transporter.sendMail({
      from: `"GreenHouse IoT" <${ALERT_EMAIL_FROM}>`,
      to: ALERT_EMAIL_TO,
      subject,
      html,
    });
    console.log(`[EmailAlert] Sent to ${ALERT_EMAIL_TO}: ${subject}`);
  } catch (err) {
    console.error("[EmailAlert] Failed to send email:", err.message);
  }
}
