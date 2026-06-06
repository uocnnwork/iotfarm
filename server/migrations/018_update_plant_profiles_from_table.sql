-- Cập nhật thông số theo bảng dữ liệu thực tế từ người dùng.
-- Nhiệt độ dùng giá trị ban ngày (range rộng hơn).

-- Cà chua: Ngày 22-26, Đêm 15-20 → min=15, max=26 | ẩm KK 65-75 | ẩm đất 70-80
INSERT INTO plant_profiles (code, name, min_temperature, max_temperature, min_humidity, max_humidity, min_soil_moisture, max_soil_moisture, min_light, max_light, watering_note, care_note, aliases)
VALUES ('tomato', 'Cà chua', 15, 26, 65, 75, 70, 80, 600, 900,
  'Tưới đều, tránh để đất quá khô hoặc úng nước.',
  'Cà chua (Solanum lycopersicum) thích môi trường ấm, nhiều ánh sáng, đất thoát nước tốt.',
  ARRAY['cà chua', 'ca chua', 'tomato', 'solanum lycopersicum'])
ON CONFLICT (code) DO UPDATE SET
  min_temperature = 15, max_temperature = 26,
  min_humidity = 65, max_humidity = 75,
  min_soil_moisture = 70, max_soil_moisture = 80,
  care_note = 'Cà chua (Solanum lycopersicum) thích môi trường ấm, nhiều ánh sáng, đất thoát nước tốt.',
  aliases = ARRAY['cà chua', 'ca chua', 'tomato', 'solanum lycopersicum'];

-- Dưa chuột: Ngày 24-30, Đêm 18-22 → min=18, max=30 | ẩm KK 75-85 | ẩm đất 75-85
INSERT INTO plant_profiles (code, name, min_temperature, max_temperature, min_humidity, max_humidity, min_soil_moisture, max_soil_moisture, min_light, max_light, watering_note, care_note, aliases)
VALUES ('cucumber_bitter', 'Dưa chuột', 18, 30, 75, 85, 75, 85, 600, 900,
  'Dưa chuột cần đất ẩm đều, tưới thường xuyên nhưng thoát nước tốt.',
  'Dưa chuột (Cucumis sativus) thích ấm, ánh sáng mạnh, cần giàn leo.',
  ARRAY['dưa chuột', 'dua chuot', 'cucumis sativus'])
ON CONFLICT (code) DO UPDATE SET
  min_temperature = 18, max_temperature = 30,
  min_humidity = 75, max_humidity = 85,
  min_soil_moisture = 75, max_soil_moisture = 85,
  care_note = 'Dưa chuột (Cucumis sativus) thích ấm, ánh sáng mạnh, cần giàn leo.',
  aliases = ARRAY['dưa chuột', 'dua chuot', 'cucumis sativus'];

-- Ớt chuông: Ngày 21-27, Đêm 15-20 → min=15, max=27 | ẩm KK 65-75 | ẩm đất 70-85
INSERT INTO plant_profiles (code, name, min_temperature, max_temperature, min_humidity, max_humidity, min_soil_moisture, max_soil_moisture, min_light, max_light, watering_note, care_note, aliases)
VALUES ('bell_pepper', 'Ớt chuông', 15, 27, 65, 75, 70, 85, 600, 900,
  'Tưới đều, tránh úng rễ, để đất thoát nước tốt.',
  'Ớt chuông (Capsicum annuum) thích nắng và ấm, cần nhiều ánh sáng.',
  ARRAY['ớt chuông', 'ot chuong', 'capsicum annuum', 'bell pepper'])
ON CONFLICT (code) DO UPDATE SET
  min_temperature = 15, max_temperature = 27,
  min_humidity = 65, max_humidity = 75,
  min_soil_moisture = 70, max_soil_moisture = 85,
  care_note = 'Ớt chuông (Capsicum annuum) thích nắng và ấm, cần nhiều ánh sáng.',
  aliases = ARRAY['ớt chuông', 'ot chuong', 'capsicum annuum', 'bell pepper'];

-- Dâu tây: Ngày 15-25, Đêm 10-15 → min=10, max=25 | ẩm KK 60-80 | ẩm đất 60-75
INSERT INTO plant_profiles (code, name, min_temperature, max_temperature, min_humidity, max_humidity, min_soil_moisture, max_soil_moisture, min_light, max_light, watering_note, care_note, aliases)
VALUES ('strawberry', 'Dâu tây', 10, 25, 60, 80, 60, 75, 500, 800,
  'Dâu tây cần đất ẩm vừa, thoát nước tốt, tránh úng rễ.',
  'Dâu tây (Fragaria × ananassa) thích khí hậu mát, ánh sáng đầy đủ.',
  ARRAY['dâu tây', 'dau tay', 'strawberry', 'fragaria'])
ON CONFLICT (code) DO UPDATE SET
  min_temperature = 10, max_temperature = 25,
  min_humidity = 60, max_humidity = 80,
  min_soil_moisture = 60, max_soil_moisture = 75,
  care_note = 'Dâu tây (Fragaria × ananassa) thích khí hậu mát, ánh sáng đầy đủ.',
  aliases = ARRAY['dâu tây', 'dau tay', 'strawberry', 'fragaria'];

-- Xà lách: Ngày 15-20, Đêm 7-12 → min=7, max=20 | ẩm KK 60-70 | ẩm đất 60-70
INSERT INTO plant_profiles (code, name, min_temperature, max_temperature, min_humidity, max_humidity, min_soil_moisture, max_soil_moisture, min_light, max_light, watering_note, care_note, aliases)
VALUES ('lettuce', 'Xà lách', 7, 20, 60, 70, 60, 70, 400, 700,
  'Tưới nhẹ và thường xuyên, giữ đất ẩm đều.',
  'Xà lách (Lactuca sativa) thích mát, tránh nắng gắt và nhiệt độ cao.',
  ARRAY['xà lách', 'xa lach', 'lettuce', 'lactuca sativa'])
ON CONFLICT (code) DO UPDATE SET
  min_temperature = 7, max_temperature = 20,
  min_humidity = 60, max_humidity = 70,
  min_soil_moisture = 60, max_soil_moisture = 70,
  care_note = 'Xà lách (Lactuca sativa) thích mát, tránh nắng gắt và nhiệt độ cao.',
  aliases = ARRAY['xà lách', 'xa lach', 'lettuce', 'lactuca sativa'];
