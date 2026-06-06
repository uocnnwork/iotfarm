CREATE TABLE IF NOT EXISTS user_plants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plant_profile_id UUID REFERENCES plant_profiles(id) ON DELETE SET NULL,

  name VARCHAR(100) NOT NULL,
  location VARCHAR(100),
  planted_at DATE,
  notes TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT user_plants_name_location_unique UNIQUE (name, location)
);

CREATE INDEX IF NOT EXISTS idx_user_plants_active
  ON user_plants(active);

CREATE INDEX IF NOT EXISTS idx_user_plants_location
  ON user_plants(location);

CREATE INDEX IF NOT EXISTS idx_user_plants_plant_profile_id
  ON user_plants(plant_profile_id);

DROP TRIGGER IF EXISTS trg_user_plants_updated_at ON user_plants;
CREATE TRIGGER trg_user_plants_updated_at
BEFORE UPDATE ON user_plants
FOR EACH ROW
EXECUTE FUNCTION update_updated_at_column();
