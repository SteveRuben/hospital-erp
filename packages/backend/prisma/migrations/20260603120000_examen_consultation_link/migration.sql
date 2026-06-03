-- Lien examen -> consultation (prescription depuis une consultation).
-- Idempotent : init.ts pose aussi la colonne via ALTER ... IF NOT EXISTS,
-- donc on évite tout conflit quel que soit l'ordre d'exécution au boot.
ALTER TABLE "examens" ADD COLUMN IF NOT EXISTS "consultation_id" INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'examens_consultation_id_fkey') THEN
    ALTER TABLE "examens"
      ADD CONSTRAINT "examens_consultation_id_fkey"
      FOREIGN KEY ("consultation_id") REFERENCES "consultations"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "idx_examens_consultation_id" ON "examens"("consultation_id");
