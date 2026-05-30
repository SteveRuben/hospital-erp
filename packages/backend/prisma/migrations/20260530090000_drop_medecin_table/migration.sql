-- P0-6 Phase 2: drop the medecins table; every medecin_id column now
-- references users(id) directly.
--
-- IMPORTANT: on existing production DBs this migration is a no-op.
-- The migrate-bootstrap.js shim (see nixpacks.toml) marks every
-- pre-existing migration as applied when the DB has already been
-- shaped by init.ts. The Phase 2 SQL therefore actually runs from
-- inside init.ts (see config/init.ts under "P0-6 Phase 2") which can
-- call argon2 to auto-create User accounts for orphan Medecin rows
-- before repointing the FKs — something a pure-SQL migration can't do.
--
-- This file exists so:
--   - fresh dev databases that run `prisma migrate deploy` get the
--     same final schema shape;
--   - the migration history is complete and signed for audit.
--
-- Fresh-DB ordering: this migration runs after baseline + all earlier
-- migrations. The medecins table will be empty (no application code
-- has written to it yet), so the FK repoint loop is a no-op and the
-- DROP TABLE succeeds immediately.

ALTER TABLE users ADD COLUMN IF NOT EXISTS specialite VARCHAR(100);

-- For every child table that previously pointed at medecins(id), the
-- column stays named medecin_id but the FK target moves to users(id).
-- Each block: drop the old FK if it still exists, rewrite values via
-- medecins.user_id when both tables still exist (no-op on a fresh DB),
-- then add the new FK.
DO $$
DECLARE
  child_tables text[] := ARRAY[
    'consultations', 'rendez_vous', 'vitaux', 'prescriptions',
    'ordonnances', 'vaccinations', 'hospitalisations',
    'planning_medecins', 'planning_blocages', 'imagerie'
  ];
  t text;
  fk_name text;
BEGIN
  FOREACH t IN ARRAY child_tables LOOP
    -- Drop any existing FK on medecin_id (regardless of name).
    FOR fk_name IN
      SELECT tc.constraint_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage k ON k.constraint_name = tc.constraint_name
      WHERE tc.table_name = t
        AND k.column_name = 'medecin_id'
        AND tc.constraint_type = 'FOREIGN KEY'
    LOOP
      EXECUTE format('ALTER TABLE %I DROP CONSTRAINT %I', t, fk_name);
    END LOOP;

    -- Translate values if the medecins table is still present.
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'medecins') THEN
      EXECUTE format(
        'UPDATE %I tbl SET medecin_id = m.user_id FROM medecins m
         WHERE tbl.medecin_id = m.id AND m.user_id IS NOT NULL AND m.user_id <> tbl.medecin_id',
        t
      );
    END IF;

    -- Add the new FK pointing at users.
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = t || '_medecin_id_users_fkey'
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I ADD CONSTRAINT %I FOREIGN KEY (medecin_id) REFERENCES users(id) ON DELETE SET NULL',
        t, t || '_medecin_id_users_fkey'
      );
    END IF;
  END LOOP;
END $$;

DROP TABLE IF EXISTS medecins CASCADE;
