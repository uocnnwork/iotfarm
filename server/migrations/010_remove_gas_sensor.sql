DELETE FROM alert_thresholds
WHERE sensor_type = 'gas';

DELETE FROM alerts
WHERE sensor_type = 'gas';

DELETE FROM automation_rules
WHERE sensor_type = 'gas';

ALTER TABLE sensor_readings
DROP COLUMN IF EXISTS gas;
