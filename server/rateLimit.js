// Bộ đếm lưu trữ số lượng request theo IP
const ipRequestCounts = new Map();

// Cấu hình: 200 requests / 1 phút (60,000 ms)
const WINDOW_MS = 60 * 1000;
const MAX_REQUESTS = 200;

/**
 * Kiểm tra xem IP này có vượt quá giới hạn request hay không.
 * @param {string} ip - Địa chỉ IP của người dùng
 * @returns {boolean} - Trả về true nếu bị chặn (quá giới hạn), false nếu hợp lệ
 */
export function checkRateLimit(ip) {
  if (!ip) return false;

  const now = Date.now();
  let record = ipRequestCounts.get(ip);

  // Nếu chưa có hoặc đã quá thời gian cửa sổ (1 phút), tạo mới
  if (!record || now - record.startTime > WINDOW_MS) {
    ipRequestCounts.set(ip, {
      count: 1,
      startTime: now,
    });
    return false;
  }

  // Tăng biến đếm
  record.count++;

  // Nếu quá giới hạn
  if (record.count > MAX_REQUESTS) {
    return true;
  }

  return false;
}

// Xóa rác bộ đếm (ngăn rò rỉ bộ nhớ) mỗi 5 phút
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of ipRequestCounts.entries()) {
    if (now - record.startTime > WINDOW_MS) {
      ipRequestCounts.delete(ip);
    }
  }
}, 5 * 60 * 1000).unref(); // unref() để không chặn tiến trình Node.js thoát
