ALTER TABLE sensor_readings
  ADD COLUMN IF NOT EXISTS node_id TEXT NOT NULL DEFAULT 'default';

CREATE INDEX IF NOT EXISTS idx_sensor_readings_node_created_at
  ON sensor_readings(node_id, created_at DESC);
