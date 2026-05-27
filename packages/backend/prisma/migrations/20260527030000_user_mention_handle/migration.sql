-- Custom mention handle per user. When set, takes priority over `username`
-- for @-mentions: the typeahead matches against both, the parser resolves
-- to whichever the user typed, and the chip display shows the prenom+nom
-- (handle is only the typing shortcut).

ALTER TABLE users ADD COLUMN IF NOT EXISTS mention_handle VARCHAR(50);

-- Partial unique index — only enforce uniqueness when the column is set,
-- so existing NULL rows don't clash.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_mention_handle_unique
  ON users (LOWER(mention_handle))
  WHERE mention_handle IS NOT NULL;
