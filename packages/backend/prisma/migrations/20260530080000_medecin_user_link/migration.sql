-- P0-6 Phase 1: link Medecin to User.
--
-- Before this change, access-control.ts joined users to medecins by
-- (nom, prenom) string match — a typo or rename desynced clinical
-- records from the signed-in user. Now a Medecin row carries an
-- explicit user_id FK; the name-match join survives as a fallback for
-- rows that haven't been backfilled.
--
-- Idempotent. The backfill is best-effort: only links medecins where
-- exactly one User with role='medecin' shares the same (nom, prenom).
-- Ambiguous matches stay null so an admin can resolve them manually.

ALTER TABLE medecins ADD COLUMN IF NOT EXISTS user_id INTEGER;

-- Unique FK so a User can hold at most one Medecin profile. Wrap in DO
-- so re-running doesn't error on the already-created constraint.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'medecins_user_id_fkey'
  ) THEN
    ALTER TABLE medecins
      ADD CONSTRAINT medecins_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'medecins_user_id_key'
  ) THEN
    ALTER TABLE medecins ADD CONSTRAINT medecins_user_id_key UNIQUE (user_id);
  END IF;
END $$;

-- Backfill: link each unmatched Medecin to the unique User with the
-- same (nom, prenom) and role='medecin'. The subquery's HAVING clause
-- skips ambiguous (>1 user) matches so we never silently mislink.
UPDATE medecins m
SET user_id = u.id
FROM (
  SELECT nom, prenom, MIN(id) AS id
  FROM users
  WHERE role = 'medecin'
  GROUP BY nom, prenom
  HAVING COUNT(*) = 1
) u
WHERE m.user_id IS NULL
  AND m.nom = u.nom
  AND m.prenom = u.prenom;
