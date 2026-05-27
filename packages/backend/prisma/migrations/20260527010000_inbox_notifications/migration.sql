-- In-app staff notifications. Distinct from notifications_log (outbound
-- SMS/email to patients). Feeds the bell-icon dropdown and is populated by
-- @user mentions in notes, workflow events (lab requested, admission, etc.)
-- and chat events (Phase 2).

CREATE TABLE IF NOT EXISTS notifications (
  id          SERIAL PRIMARY KEY,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type        VARCHAR(40) NOT NULL,
  title       VARCHAR(200) NOT NULL,
  body        TEXT,
  link        VARCHAR(500),
  read        BOOLEAN NOT NULL DEFAULT FALSE,
  read_at     TIMESTAMP,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Optimizes the "unread count" + "recent notifs" queries on the bell.
CREATE INDEX IF NOT EXISTS idx_notifications_user_read_created
  ON notifications (user_id, read, created_at DESC);
