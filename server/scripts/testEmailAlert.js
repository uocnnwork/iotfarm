/**
 * Test gửi email alert thực tế.
 * Chạy: node server/scripts/testEmailAlert.js
 *
 * Đọc config từ .env, gửi 1 email cảnh báo mẫu tới ALERT_EMAIL_TO.
 */

import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

// Load .env thủ công (không dùng dotenv package để tránh dependency)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.join(__dirname, "../../.env");

try {
  const envContent = await readFile(envPath, "utf8");
  for (const line of envContent.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, "");
    if (key && !process.env[key]) process.env[key] = value;
  }
  console.log("✅ Loaded .env");
} catch {
  console.warn("⚠️  .env not found, using process.env only");
}

const ALERT_EMAIL_TO   = process.env.ALERT_EMAIL_TO   || "uocnn.study@gmail.com";
const ALERT_EMAIL_FROM = process.env.ALERT_EMAIL_FROM || ALERT_EMAIL_TO;
const ALERT_EMAIL_PASS = process.env.ALERT_EMAIL_PASS || "";

if (!ALERT_EMAIL_PASS) {
  console.error("❌ ALERT_EMAIL_PASS chưa được cấu hình trong .env");
  process.exit(1);
}

console.log(`📧 From : ${ALERT_EMAIL_FROM}`);
console.log(`📧 To   : ${ALERT_EMAIL_TO}`);
console.log("📤 Đang gửi email test...\n");

// Import nodemailer
const { default: nodemailer } = await import("nodemailer");

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: { user: ALERT_EMAIL_FROM, pass: ALERT_EMAIL_PASS },
});

// Alert mẫu — nhiệt độ Khu 1 quá cao, thiết bị quạt ở manual
const fakeAlert = {
  id: "test-001",
  level: "warning",
  type: "warning",
  sensor_type: "temperature",
  node_id: "node1",
  value: 35.2,
  message: "[Khu 1] Nhiệt độ vượt ngưỡng. Giá trị: 35.2°C, ngưỡng: > 30°C",
};

const nodeLabel   = "Khu 1";
const sensorLabel = "Nhiệt độ";
const levelTag    = "🟡 CẢNH BÁO";
const time        = new Date().toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

const subject = `${levelTag} [GreenHouse] ${sensorLabel} - ${nodeLabel}`;
const html = `
  <div style="font-family:sans-serif;max-width:520px;margin:0 auto;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden">
    <div style="background:#d97706;padding:16px 20px">
      <h2 style="margin:0;color:#fff;font-size:16px">${levelTag} Cảnh báo nhà kính</h2>
    </div>
    <div style="padding:20px">
      <table style="width:100%;border-collapse:collapse;font-size:14px">
        <tr><td style="padding:6px 0;color:#6b7280;width:140px">Khu vực</td>
            <td style="padding:6px 0;font-weight:600">${nodeLabel}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Chỉ số</td>
            <td style="padding:6px 0;font-weight:600">${sensorLabel}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Giá trị</td>
            <td style="padding:6px 0;font-weight:600;color:#d97706">${fakeAlert.value}°C</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Chi tiết</td>
            <td style="padding:6px 0">${fakeAlert.message}</td></tr>
        <tr><td style="padding:6px 0;color:#6b7280">Thời gian</td>
            <td style="padding:6px 0">${time}</td></tr>
      </table>
      <p style="margin:16px 0 0;font-size:12px;color:#9ca3af">
        Email này được gửi tự động từ hệ thống GreenHouse IoT.<br>
        Thiết bị khắc phục đang ở chế độ <strong>Thủ công</strong> — cần can thiệp thủ công.
      </p>
      <p style="margin:8px 0 0;font-size:11px;color:#d1d5db">[TEST EMAIL — không phải cảnh báo thật]</p>
    </div>
  </div>
`;

try {
  const info = await transporter.sendMail({
    from: `"GreenHouse IoT" <${ALERT_EMAIL_FROM}>`,
    to: ALERT_EMAIL_TO,
    subject,
    html,
  });
  console.log("✅ Email gửi thành công!");
  console.log(`   Message ID : ${info.messageId}`);
  console.log(`   Accepted   : ${info.accepted?.join(", ")}`);
} catch (err) {
  console.error("❌ Gửi email thất bại:", err.message);
  if (err.message.includes("Invalid login") || err.message.includes("Username and Password")) {
    console.error("\n💡 Gợi ý: Kiểm tra lại ALERT_EMAIL_FROM và ALERT_EMAIL_PASS trong .env");
    console.error("   ALERT_EMAIL_PASS phải là Gmail App Password (16 ký tự), không phải mật khẩu thường");
    console.error("   Tạo tại: https://myaccount.google.com/apppasswords");
  }
  process.exit(1);
}
