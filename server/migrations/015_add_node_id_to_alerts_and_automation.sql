-- Add node_id to alerts, alert_thresholds, and automation_rules
-- to support per-zone thresholds, alerts, and automation rules.

-- alerts: record which node triggered the alert
ALTER TABLE alerts ADD COLUMN IF NOT EXISTS node_id TEXT;
CREATE INDEX IF NOT EXISTS idx_alerts_node_id ON alerts(node_id);

-- alert_thresholds: NULL = applies to all nodes, 'node-1' = only node-1
ALTER TABLE alert_thresholds ADD COLUMN IF NOT EXISTS node_id TEXT;

-- automation_rules: NULL = applies to all nodes, 'node-1' = only node-1
ALTER TABLE automation_rules ADD COLUMN IF NOT EXISTS node_id TEXT;
