-- Demo defaults for a fresh database.
-- This migration intentionally avoids overwriting existing runtime data.

INSERT INTO users (username, password_hash, role)
VALUES ('admin', crypt('admin123', gen_salt('bf', 10)), 'admin')
ON CONFLICT (username) DO NOTHING;

INSERT INTO devices (name, type, is_on, mode, online, last_seen_at)
VALUES
  ('pump', 'pump', false, 'manual', false, NULL),
  ('fan', 'fan', false, 'manual', false, NULL),
  ('light', 'light', false, 'manual', false, NULL)
ON CONFLICT (name) DO NOTHING;

WITH demo_thresholds(sensor_type, operator, value, level) AS (
  VALUES
    ('temperature', '>', 35, 'warning'),
    ('temperature', '>', 45, 'danger'),
    ('humidity', '<', 45, 'warning'),
    ('soil_moisture', '<', 30, 'warning'),
    ('soil_moisture', '<', 20, 'danger'),
    ('light', '<', 350, 'warning'),
    ('light', '>', 1000, 'warning')
)
INSERT INTO alert_thresholds (sensor_type, operator, value, level)
SELECT sensor_type, operator, value, level
FROM demo_thresholds t
WHERE NOT EXISTS (
  SELECT 1
  FROM alert_thresholds existing
  WHERE existing.sensor_type = t.sensor_type
    AND existing.operator = t.operator
    AND existing.value = t.value
    AND existing.level = t.level
);

WITH demo_rules(name, sensor_type, operator, threshold, device_name, action, active) AS (
  VALUES
    ('Tưới khi đất khô', 'soil_moisture', '<', 30, 'pump', 'turn_on', true),
    ('Tắt bơm khi đất đủ ẩm', 'soil_moisture', '>', 75, 'pump', 'turn_off', true),
    ('Bật quạt khi nhiệt độ cao', 'temperature', '>', 35, 'fan', 'turn_on', true),
    ('Bật đèn khi thiếu sáng', 'light', '<', 350, 'light', 'turn_on', true)
)
INSERT INTO automation_rules (name, sensor_type, operator, threshold, device_name, action, active)
SELECT name, sensor_type, operator, threshold, device_name, action, active
FROM demo_rules r
WHERE NOT EXISTS (
  SELECT 1
  FROM automation_rules existing
  WHERE existing.name = r.name
);

INSERT INTO sensor_readings (temperature, humidity, soil_moisture, light, created_at)
SELECT *
FROM (
  VALUES
    (27.2, 70.0, 52.0, 620.0, NOW() - INTERVAL '55 minutes'),
    (27.8, 69.0, 49.0, 660.0, NOW() - INTERVAL '50 minutes'),
    (28.1, 68.0, 46.0, 710.0, NOW() - INTERVAL '45 minutes'),
    (28.6, 67.0, 43.0, 760.0, NOW() - INTERVAL '40 minutes'),
    (29.0, 66.0, 39.0, 800.0, NOW() - INTERVAL '35 minutes'),
    (29.3, 65.0, 35.0, 820.0, NOW() - INTERVAL '30 minutes'),
    (29.6, 64.0, 31.0, 790.0, NOW() - INTERVAL '25 minutes'),
    (29.8, 64.0, 28.0, 760.0, NOW() - INTERVAL '20 minutes'),
    (30.0, 65.0, 25.0, 730.0, NOW() - INTERVAL '15 minutes'),
    (30.0, 65.0, 20.0, 700.0, NOW() - INTERVAL '10 minutes')
) AS demo(temperature, humidity, soil_moisture, light, created_at)
WHERE NOT EXISTS (SELECT 1 FROM sensor_readings);

INSERT INTO alerts (sensor_type, level, message, value, is_read, created_at)
SELECT *
FROM (
  VALUES
    (
      'soil_moisture',
      'warning',
      'Độ ẩm đất thấp, cần tưới nước. Giá trị: 20 %, ngưỡng: 30 %',
      20.0,
      false,
      NOW() - INTERVAL '9 minutes'
    ),
    (
      'temperature',
      'warning',
      'Nhiệt độ đang tăng, nên theo dõi thông gió. Giá trị: 35 °C, ngưỡng: 35 °C',
      35.0,
      true,
      NOW() - INTERVAL '30 minutes'
    )
) AS demo(sensor_type, level, message, value, is_read, created_at)
WHERE NOT EXISTS (SELECT 1 FROM alerts);

WITH admin_user AS (
  SELECT id FROM users WHERE username = 'admin' LIMIT 1
),
pump_device AS (
  SELECT id FROM devices WHERE name = 'pump' LIMIT 1
),
fan_device AS (
  SELECT id FROM devices WHERE name = 'fan' LIMIT 1
)
INSERT INTO device_command_logs (
  device_id,
  device_name,
  command,
  source,
  requested_by,
  mqtt_published,
  device_confirmed,
  created_at
)
SELECT *
FROM (
  SELECT
    pump_device.id,
    'pump',
    'turn_on',
    'automation',
    NULL::uuid,
    true,
    false,
    NOW() - INTERVAL '8 minutes'
  FROM pump_device
  UNION ALL
  SELECT
    fan_device.id,
    'fan',
    'turn_on',
    'manual',
    admin_user.id,
    true,
    false,
    NOW() - INTERVAL '25 minutes'
  FROM fan_device, admin_user
) AS demo(device_id, device_name, command, source, requested_by, mqtt_published, device_confirmed, created_at)
WHERE NOT EXISTS (SELECT 1 FROM device_command_logs);
