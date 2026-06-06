-- Six devices: zone pumps/misters per node + global fan/led.

ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'global';

ALTER TABLE devices
  ADD COLUMN IF NOT EXISTS node_id TEXT NULL;

UPDATE automation_rules
SET device_name = 'pump_1'
WHERE device_name = 'pump';

UPDATE automation_rules
SET device_name = 'led'
WHERE device_name = 'light';

DELETE FROM device_command_logs
WHERE device_name IN ('pump', 'light', 'mist');

DELETE FROM devices
WHERE name IN ('pump', 'light', 'mist');

INSERT INTO devices (name, type, scope, node_id, is_on, mode, online, last_seen_at)
VALUES
  ('pump_1', 'pump', 'zone', 'node-1', false, 'manual', false, NULL),
  ('mist_1', 'mist', 'zone', 'node-1', false, 'manual', false, NULL),
  ('pump_2', 'pump', 'zone', 'node-2', false, 'manual', false, NULL),
  ('mist_2', 'mist', 'zone', 'node-2', false, 'manual', false, NULL),
  ('fan', 'fan', 'global', NULL, false, 'manual', false, NULL),
  ('led', 'light', 'global', NULL, false, 'manual', false, NULL)
ON CONFLICT (name) DO UPDATE SET
  type = EXCLUDED.type,
  scope = EXCLUDED.scope,
  node_id = EXCLUDED.node_id;
