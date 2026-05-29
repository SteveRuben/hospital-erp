-- Suspend an account without deleting it. Suspended users are refused at
-- login and any existing JWT is rejected via the session invalidation that
-- happens at suspend time. `suspended_at` is informational (admin UI shows
-- "suspended on …" so the action is traceable beyond the audit log).
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMP;
