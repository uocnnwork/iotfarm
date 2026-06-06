-- Add node_id to user_plants table
ALTER TABLE user_plants
ADD COLUMN IF NOT EXISTS node_id TEXT;

-- Map existing location data to node_id
-- Currently in seed data: Khay 1 (node-1), Khay 2 (node-2)
UPDATE user_plants
SET node_id = 'node-1'
WHERE location ILIKE '%khay 1%' OR location ILIKE '%khu 1%';

UPDATE user_plants
SET node_id = 'node-2'
WHERE location ILIKE '%khay 2%' OR location ILIKE '%khu 2%';

-- Also add index for node_id
CREATE INDEX IF NOT EXISTS idx_user_plants_node_id ON user_plants(node_id);
