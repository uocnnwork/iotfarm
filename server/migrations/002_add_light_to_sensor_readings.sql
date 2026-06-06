ALTER TABLE sensor_readings
ADD COLUMN IF NOT EXISTS light DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS idx_sensor_readings_light
  ON sensor_readings(light);
