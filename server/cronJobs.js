import { deleteOldSensorData } from "./repositories/sensorRepository.js";

// Chạy mỗi 24 giờ (86400000 ms)
const RETENTION_INTERVAL = 24 * 60 * 60 * 1000;
// Xóa dữ liệu cũ hơn 30 ngày
const DATA_RETENTION_DAYS = 30;

export function startCronJobs() {
  console.log(`[CronJobs] Started. Retention policy: delete sensor data older than ${DATA_RETENTION_DAYS} days.`);
  
  // Chạy ngay lần đầu khi server khởi động
  runRetentionJob();

  // Đặt lịch chạy định kỳ
  const intervalId = setInterval(runRetentionJob, RETENTION_INTERVAL);
  return intervalId;
}

async function runRetentionJob() {
  try {
    const deletedCount = await deleteOldSensorData(DATA_RETENTION_DAYS);
    if (deletedCount > 0) {
      console.log(`[CronJobs] Data retention task deleted ${deletedCount} old sensor readings.`);
    }
  } catch (error) {
    console.error("[CronJobs] Failed to run data retention task:", error.message);
  }
}
