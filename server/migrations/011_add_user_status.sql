ALTER TABLE users
ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'active';

ALTER TABLE users
ALTER COLUMN status SET DEFAULT 'active';

ALTER TABLE users
DROP CONSTRAINT IF EXISTS users_status_check;

ALTER TABLE users
ADD CONSTRAINT users_status_check
CHECK (status IN ('pending', 'active', 'rejected', 'disabled'));

UPDATE users
SET status = 'active'
WHERE status IS NULL;

ALTER TABLE users
ALTER COLUMN status SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_users_status
  ON users(status);
