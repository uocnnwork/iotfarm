CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'operator' CHECK (role IN ('admin', 'operator', 'viewer')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL,
  is_on BOOLEAN NOT NULL DEFAULT FALSE,
  mode TEXT NOT NULL DEFAULT 'manual' CHECK (mode IN ('manual', 'auto')),
  online BOOLEAN NOT NULL DEFAULT FALSE,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sensor_readings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  temperature DOUBLE PRECISION,
  humidity DOUBLE PRECISION,
  soil_moisture DOUBLE PRECISION,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS automation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  sensor_type TEXT NOT NULL,
  operator TEXT NOT NULL CHECK (operator IN ('>', '>=', '<', '<=', '==')),
  threshold DOUBLE PRECISION NOT NULL,
  device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
  device_name TEXT,
  action TEXT NOT NULL CHECK (action IN ('turn_on', 'turn_off')),
  active BOOLEAN NOT NULL DEFAULT TRUE,
  last_triggered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sensor_type TEXT,
  level TEXT NOT NULL DEFAULT 'warning' CHECK (level IN ('info', 'warning', 'danger')),
  message TEXT NOT NULL,
  value DOUBLE PRECISION,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS device_command_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
  device_name TEXT,
  command TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('manual', 'automation')),
  requested_by UUID REFERENCES users(id) ON DELETE SET NULL,
  mqtt_published BOOLEAN NOT NULL DEFAULT FALSE,
  device_confirmed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sensor_readings_created_at
  ON sensor_readings(created_at);

CREATE INDEX IF NOT EXISTS idx_alerts_created_at
  ON alerts(created_at);

CREATE INDEX IF NOT EXISTS idx_alerts_is_read
  ON alerts(is_read);

CREATE INDEX IF NOT EXISTS idx_alerts_sensor_type
  ON alerts(sensor_type);

CREATE INDEX IF NOT EXISTS idx_device_command_logs_created_at
  ON device_command_logs(created_at);

CREATE INDEX IF NOT EXISTS idx_device_command_logs_device_id
  ON device_command_logs(device_id);

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at
BEFORE UPDATE ON users
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_devices_updated_at ON devices;
CREATE TRIGGER trg_devices_updated_at
BEFORE UPDATE ON devices
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS trg_automation_rules_updated_at ON automation_rules;
CREATE TRIGGER trg_automation_rules_updated_at
BEFORE UPDATE ON automation_rules
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
