-- Attribution lifecycle — adds an enum statut and the audit columns
-- needed by the four-actor workflow (réception, chef, médecin self,
-- mixte propose+valider). Idempotent.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AttributionStatut') THEN
    CREATE TYPE "AttributionStatut" AS ENUM ('propose','actif','cloture');
  END IF;
END $$;

ALTER TABLE patient_attributions ADD COLUMN IF NOT EXISTS statut "AttributionStatut" DEFAULT 'actif'::"AttributionStatut";
ALTER TABLE patient_attributions ALTER COLUMN statut SET DEFAULT 'actif'::"AttributionStatut";

ALTER TABLE patient_attributions ADD COLUMN IF NOT EXISTS created_by_user_id   INTEGER;
ALTER TABLE patient_attributions ADD COLUMN IF NOT EXISTS validated_by_user_id INTEGER;
ALTER TABLE patient_attributions ADD COLUMN IF NOT EXISTS date_validation     TIMESTAMP;
ALTER TABLE patient_attributions ADD COLUMN IF NOT EXISTS date_cloture        TIMESTAMP;
ALTER TABLE patient_attributions ADD COLUMN IF NOT EXISTS motif_cloture       VARCHAR(500);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'patient_attributions_created_by_fkey') THEN
    ALTER TABLE patient_attributions
      ADD CONSTRAINT patient_attributions_created_by_fkey
      FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'patient_attributions_validated_by_fkey') THEN
    ALTER TABLE patient_attributions
      ADD CONSTRAINT patient_attributions_validated_by_fkey
      FOREIGN KEY (validated_by_user_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Backfill: pre-existing rows had only (patient_id, medecin_user_id,
-- actif=TRUE). Their lifecycle slot becomes 'actif' so the new queries
-- find them.
UPDATE patient_attributions
  SET statut = 'actif'::"AttributionStatut"
  WHERE statut IS NULL AND actif = TRUE;
UPDATE patient_attributions
  SET statut = 'cloture'::"AttributionStatut"
  WHERE statut IS NULL AND actif = FALSE;

CREATE INDEX IF NOT EXISTS idx_patient_attributions_medecin_statut
  ON patient_attributions(medecin_user_id, statut);
CREATE INDEX IF NOT EXISTS idx_patient_attributions_statut
  ON patient_attributions(statut);
