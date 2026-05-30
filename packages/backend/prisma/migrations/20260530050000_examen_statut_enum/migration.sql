-- Promote examens.statut from VARCHAR(50) + CHECK to a Prisma native
-- enum (ExamenStatut). Same shape as the Sexe / StatutMatrimonial
-- migration shipped in 20260530040000. Idempotent.
--
-- Why: the workflow vocabulary lived in 3 places (init.ts CHECK list,
-- laboratoire.ts ALLOWED_STATUTS Set, frontend Kanban switch). Today's
-- 'a_payer' rollout took 3 file changes and still missed prod until a
-- hotfix migration patched the CHECK. Move the source of truth to the
-- DB type system: changing the enum is one schema edit + one migration.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ExamenStatut') THEN
    CREATE TYPE "ExamenStatut" AS ENUM (
      'demande', 'a_payer', 'prelevement', 'analyse',
      'resultat', 'valide', 'transmis'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'examens' AND column_name = 'statut' AND data_type = 'character varying'
  ) THEN
    -- Drop the auto-named CHECK constraint and the VARCHAR default before
    -- the column type changes; reinstate the default as the enum value
    -- after the cast succeeds.
    ALTER TABLE examens DROP CONSTRAINT IF EXISTS examens_statut_check;
    ALTER TABLE examens ALTER COLUMN statut DROP DEFAULT;
    ALTER TABLE examens ALTER COLUMN statut TYPE "ExamenStatut" USING statut::"ExamenStatut";
    ALTER TABLE examens ALTER COLUMN statut SET DEFAULT 'demande'::"ExamenStatut";
  END IF;
END $$;
