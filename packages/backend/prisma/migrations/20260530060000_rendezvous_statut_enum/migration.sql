-- Promote rendez_vous.statut from VARCHAR(50) + CHECK to a Prisma
-- native enum (RendezVousStatut). Same shape as the ExamenStatut
-- migration. Idempotent.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RendezVousStatut') THEN
    CREATE TYPE "RendezVousStatut" AS ENUM (
      'planifie', 'confirme', 'en_cours', 'termine', 'annule', 'absent'
    );
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'rendez_vous' AND column_name = 'statut' AND data_type = 'character varying'
  ) THEN
    ALTER TABLE rendez_vous DROP CONSTRAINT IF EXISTS rendez_vous_statut_check;
    ALTER TABLE rendez_vous ALTER COLUMN statut DROP DEFAULT;
    ALTER TABLE rendez_vous ALTER COLUMN statut TYPE "RendezVousStatut" USING statut::"RendezVousStatut";
    ALTER TABLE rendez_vous ALTER COLUMN statut SET DEFAULT 'planifie'::"RendezVousStatut";
  END IF;
END $$;
