-- Remove the misting relay from databases that already ran older demo seeds.

DELETE FROM automation_rules
WHERE device_name = 'mist';

DELETE FROM devices
WHERE name = 'mist';
