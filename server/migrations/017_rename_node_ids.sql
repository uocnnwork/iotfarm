-- Rename node-1/node-2 → node1/node2 to match ESP32 topic structure
-- (ngocUoC/iotfarm/node1 and ngocUoC/iotfarm/node2)

UPDATE devices
SET node_id = REPLACE(node_id, 'node-', 'node')
WHERE node_id IN ('node-1', 'node-2');

UPDATE sensor_readings
SET node_id = REPLACE(node_id, 'node-', 'node')
WHERE node_id IN ('node-1', 'node-2');

UPDATE alerts
SET node_id = REPLACE(node_id, 'node-', 'node')
WHERE node_id IN ('node-1', 'node-2');

UPDATE alert_thresholds
SET node_id = REPLACE(node_id, 'node-', 'node')
WHERE node_id IN ('node-1', 'node-2');

UPDATE automation_rules
SET node_id = REPLACE(node_id, 'node-', 'node')
WHERE node_id IN ('node-1', 'node-2');

UPDATE user_plants
SET node_id = REPLACE(node_id, 'node-', 'node')
WHERE node_id IN ('node-1', 'node-2');
