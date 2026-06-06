INSERT INTO user_plants (plant_profile_id, name, location, planted_at, notes)
SELECT id, 'Cà chua - Khay 1', 'Khay 1', CURRENT_DATE - INTERVAL '20 days', 'Cây cà chua demo trong khu vực khay 1.'
FROM plant_profiles
WHERE code = 'tomato'
ON CONFLICT (name, location) DO UPDATE SET
  plant_profile_id = EXCLUDED.plant_profile_id,
  planted_at = EXCLUDED.planted_at,
  notes = EXCLUDED.notes,
  active = TRUE;

INSERT INTO user_plants (plant_profile_id, name, location, planted_at, notes)
SELECT id, 'Xà lách - Khay 2', 'Khay 2', CURRENT_DATE - INTERVAL '12 days', 'Xà lách demo trong khu vực khay 2.'
FROM plant_profiles
WHERE code = 'lettuce'
ON CONFLICT (name, location) DO UPDATE SET
  plant_profile_id = EXCLUDED.plant_profile_id,
  planted_at = EXCLUDED.planted_at,
  notes = EXCLUDED.notes,
  active = TRUE;

INSERT INTO user_plants (plant_profile_id, name, location, planted_at, notes)
SELECT id, 'Dâu tây - Chậu 1', 'Chậu 1', CURRENT_DATE - INTERVAL '30 days', 'Dâu tây demo trong chậu 1.'
FROM plant_profiles
WHERE code = 'strawberry'
ON CONFLICT (name, location) DO UPDATE SET
  plant_profile_id = EXCLUDED.plant_profile_id,
  planted_at = EXCLUDED.planted_at,
  notes = EXCLUDED.notes,
  active = TRUE;
