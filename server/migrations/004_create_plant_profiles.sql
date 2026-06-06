CREATE TABLE IF NOT EXISTS plant_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  code VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,

  min_temperature NUMERIC(5,2),
  max_temperature NUMERIC(5,2),

  min_humidity NUMERIC(5,2),
  max_humidity NUMERIC(5,2),

  min_soil_moisture NUMERIC(5,2),
  max_soil_moisture NUMERIC(5,2),

  min_light NUMERIC(10,2),
  max_light NUMERIC(10,2),

  watering_note TEXT,
  care_note TEXT,

  aliases TEXT[] NOT NULL DEFAULT '{}',
  active BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_plant_profiles_active
  ON plant_profiles(active);

DROP TRIGGER IF EXISTS trg_plant_profiles_updated_at ON plant_profiles;
CREATE TRIGGER trg_plant_profiles_updated_at
BEFORE UPDATE ON plant_profiles
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
