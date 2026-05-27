-- Staff chat (Phase 2). Four channel types coexist in chat_channels.type:
--   service | garde | custom | dm
-- Messages may contain PHI; retention is 6 years (HIPAA §164.530(j)).
-- The right-to-erasure flow uses a redaction admin endpoint that
-- soft-deletes messages mentioning a given patient by full name match.

CREATE TABLE IF NOT EXISTS chat_channels (
  id           SERIAL PRIMARY KEY,
  type         VARCHAR(20) NOT NULL,
  name         VARCHAR(200) NOT NULL,
  description  TEXT,
  service_id   INTEGER,
  created_by   INTEGER,
  archived     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_chat_channels_type_archived ON chat_channels (type, archived);

CREATE TABLE IF NOT EXISTS chat_channel_members (
  channel_id    INTEGER NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
  user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_read_at  TIMESTAMP,
  PRIMARY KEY (channel_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_chat_members_user_last_read ON chat_channel_members (user_id, last_read_at);

CREATE TABLE IF NOT EXISTS chat_messages (
  id          SERIAL PRIMARY KEY,
  channel_id  INTEGER NOT NULL REFERENCES chat_channels(id) ON DELETE CASCADE,
  author_id   INTEGER NOT NULL REFERENCES users(id),
  content     TEXT NOT NULL,
  edited_at   TIMESTAMP,
  deleted_at  TIMESTAMP,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_chat_messages_channel_created ON chat_messages (channel_id, created_at DESC);
