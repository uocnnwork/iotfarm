-- Migration 020: thêm led_brightness và fan_speed vào bảng devices
ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS led_brightness INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fan_speed      INTEGER NOT NULL DEFAULT 0;
