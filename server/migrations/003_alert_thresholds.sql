CREATE TABLE IF NOT EXISTS alert_thresholds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sensor_type VARCHAR(50) NOT NULL,
  operator VARCHAR(5) NOT NULL,
  value NUMERIC NOT NULL,
  level VARCHAR(20) NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO alert_thresholds (sensor_type, operator, value, level) VALUES
  ('temperature', '>', 40, 'warning'),
  ('temperature', '>', 50, 'danger'),
  ('soil_moisture', '<', 30, 'warning')
ON CONFLICT DO NOTHING;
