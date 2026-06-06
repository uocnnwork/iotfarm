-- Demo sensor readings for node-1 (Khu 1) and node-2 (Khu 2).
-- Skips insert if either node already has data (safe to re-run migration tracking).

INSERT INTO sensor_readings
  (node_id, temperature, humidity, soil_moisture, light, created_at)
SELECT *
FROM (
  VALUES
    ('node-1', 28.4, 72, 44, 610, NOW() - INTERVAL '55 minutes'),
    ('node-1', 28.8, 71, 43, 625, NOW() - INTERVAL '50 minutes'),
    ('node-1', 29.1, 70, 42, 640, NOW() - INTERVAL '45 minutes'),
    ('node-1', 29.5, 69, 41, 655, NOW() - INTERVAL '40 minutes'),
    ('node-1', 30.0, 68, 40, 670, NOW() - INTERVAL '35 minutes'),
    ('node-1', 30.3, 69, 39, 660, NOW() - INTERVAL '30 minutes'),
    ('node-1', 30.6, 70, 38, 645, NOW() - INTERVAL '25 minutes'),
    ('node-1', 30.2, 71, 39, 630, NOW() - INTERVAL '20 minutes'),
    ('node-1', 29.8, 72, 40, 615, NOW() - INTERVAL '15 minutes'),
    ('node-1', 29.4, 73, 41, 600, NOW() - INTERVAL '10 minutes'),

    ('node-2', 25.9, 80, 58, 470, NOW() - INTERVAL '55 minutes'),
    ('node-2', 26.1, 79, 57, 485, NOW() - INTERVAL '50 minutes'),
    ('node-2', 26.4, 78, 56, 500, NOW() - INTERVAL '45 minutes'),
    ('node-2', 26.8, 77, 55, 520, NOW() - INTERVAL '40 minutes'),
    ('node-2', 27.1, 76, 54, 540, NOW() - INTERVAL '35 minutes'),
    ('node-2', 27.4, 75, 53, 555, NOW() - INTERVAL '30 minutes'),
    ('node-2', 27.7, 74, 52, 570, NOW() - INTERVAL '25 minutes'),
    ('node-2', 27.5, 75, 53, 560, NOW() - INTERVAL '20 minutes'),
    ('node-2', 27.2, 76, 54, 545, NOW() - INTERVAL '15 minutes'),
    ('node-2', 26.9, 77, 55, 530, NOW() - INTERVAL '10 minutes')
) AS demo(node_id, temperature, humidity, soil_moisture, light, created_at)
WHERE NOT EXISTS (
  SELECT 1
  FROM sensor_readings
  WHERE node_id IN ('node-1', 'node-2')
);
