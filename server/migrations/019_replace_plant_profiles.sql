-- Xóa toàn bộ cây không có trong bảng dữ liệu
DELETE FROM user_plants
WHERE plant_profile_id IN (
  SELECT id FROM plant_profiles
  WHERE code NOT IN ('tomato', 'cucumber_bitter', 'bell_pepper', 'strawberry', 'lettuce')
);

DELETE FROM plant_profiles
WHERE code NOT IN ('tomato', 'cucumber_bitter', 'bell_pepper', 'strawberry', 'lettuce');

-- Cà chua (Solanum lycopersicum)
-- Nhiệt độ: Ngày 22-26, Đêm 15-20 → min=15, max=26
-- Độ ẩm KK: 65-75 | Độ ẩm đất: 70-80
-- Không có light, watering_note, care_note
INSERT INTO plant_profiles (code, name, min_temperature, max_temperature, min_humidity, max_humidity, min_soil_moisture, max_soil_moisture, min_light, max_light, watering_note, care_note, aliases)
VALUES ('tomato', 'Cà chua', 15, 26, 65, 75, 70, 80, NULL, NULL, NULL, NULL,
  ARRAY['cà chua', 'ca chua', 'tomato', 'solanum lycopersicum'])
ON CONFLICT (code) DO UPDATE SET
  name             = 'Cà chua',
  min_temperature  = 15,
  max_temperature  = 26,
  min_humidity     = 65,
  max_humidity     = 75,
  min_soil_moisture = 70,
  max_soil_moisture = 80,
  min_light        = NULL,
  max_light        = NULL,
  watering_note    = NULL,
  care_note        = NULL,
  aliases          = ARRAY['cà chua', 'ca chua', 'tomato', 'solanum lycopersicum'],
  active           = TRUE;

-- Dưa chuột (Cucumis sativus)
-- Nhiệt độ: Ngày 24-30, Đêm 18-22 → min=18, max=30
-- Độ ẩm KK: 75-85 | Độ ẩm đất: 75-85
INSERT INTO plant_profiles (code, name, min_temperature, max_temperature, min_humidity, max_humidity, min_soil_moisture, max_soil_moisture, min_light, max_light, watering_note, care_note, aliases)
VALUES ('cucumber_bitter', 'Dưa chuột', 18, 30, 75, 85, 75, 85, NULL, NULL, NULL, NULL,
  ARRAY['dưa chuột', 'dua chuot', 'cucumis sativus', 'dưa leo', 'dua leo'])
ON CONFLICT (code) DO UPDATE SET
  name             = 'Dưa chuột',
  min_temperature  = 18,
  max_temperature  = 30,
  min_humidity     = 75,
  max_humidity     = 85,
  min_soil_moisture = 75,
  max_soil_moisture = 85,
  min_light        = NULL,
  max_light        = NULL,
  watering_note    = NULL,
  care_note        = NULL,
  aliases          = ARRAY['dưa chuột', 'dua chuot', 'cucumis sativus', 'dưa leo', 'dua leo'],
  active           = TRUE;

-- Ớt chuông (Capsicum annuum)
-- Nhiệt độ: Ngày 21-27, Đêm 15-20 → min=15, max=27
-- Độ ẩm KK: 65-75 | Độ ẩm đất: 70-85
INSERT INTO plant_profiles (code, name, min_temperature, max_temperature, min_humidity, max_humidity, min_soil_moisture, max_soil_moisture, min_light, max_light, watering_note, care_note, aliases)
VALUES ('bell_pepper', 'Ớt chuông', 15, 27, 65, 75, 70, 85, NULL, NULL, NULL, NULL,
  ARRAY['ớt chuông', 'ot chuong', 'capsicum annuum', 'bell pepper'])
ON CONFLICT (code) DO UPDATE SET
  name             = 'Ớt chuông',
  min_temperature  = 15,
  max_temperature  = 27,
  min_humidity     = 65,
  max_humidity     = 75,
  min_soil_moisture = 70,
  max_soil_moisture = 85,
  min_light        = NULL,
  max_light        = NULL,
  watering_note    = NULL,
  care_note        = NULL,
  aliases          = ARRAY['ớt chuông', 'ot chuong', 'capsicum annuum', 'bell pepper'],
  active           = TRUE;

-- Dâu tây (Fragaria × ananassa)
-- Nhiệt độ: Ngày 15-25, Đêm 10-15 → min=10, max=25
-- Độ ẩm KK: 60-80 | Độ ẩm đất: 60-75
INSERT INTO plant_profiles (code, name, min_temperature, max_temperature, min_humidity, max_humidity, min_soil_moisture, max_soil_moisture, min_light, max_light, watering_note, care_note, aliases)
VALUES ('strawberry', 'Dâu tây', 10, 25, 60, 80, 60, 75, NULL, NULL, NULL, NULL,
  ARRAY['dâu tây', 'dau tay', 'strawberry', 'fragaria'])
ON CONFLICT (code) DO UPDATE SET
  name             = 'Dâu tây',
  min_temperature  = 10,
  max_temperature  = 25,
  min_humidity     = 60,
  max_humidity     = 80,
  min_soil_moisture = 60,
  max_soil_moisture = 75,
  min_light        = NULL,
  max_light        = NULL,
  watering_note    = NULL,
  care_note        = NULL,
  aliases          = ARRAY['dâu tây', 'dau tay', 'strawberry', 'fragaria'],
  active           = TRUE;

-- Xà lách (Lactuca sativa)
-- Nhiệt độ: Ngày 15-20, Đêm 7-12 → min=7, max=20
-- Độ ẩm KK: 60-70 | Độ ẩm đất: 60-70
INSERT INTO plant_profiles (code, name, min_temperature, max_temperature, min_humidity, max_humidity, min_soil_moisture, max_soil_moisture, min_light, max_light, watering_note, care_note, aliases)
VALUES ('lettuce', 'Xà lách', 7, 20, 60, 70, 60, 70, NULL, NULL, NULL, NULL,
  ARRAY['xà lách', 'xa lach', 'lettuce', 'lactuca sativa'])
ON CONFLICT (code) DO UPDATE SET
  name             = 'Xà lách',
  min_temperature  = 7,
  max_temperature  = 20,
  min_humidity     = 60,
  max_humidity     = 70,
  min_soil_moisture = 60,
  max_soil_moisture = 70,
  min_light        = NULL,
  max_light        = NULL,
  watering_note    = NULL,
  care_note        = NULL,
  aliases          = ARRAY['xà lách', 'xa lach', 'lettuce', 'lactuca sativa'],
  active           = TRUE;
