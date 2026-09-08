-- Close the schema drift found in prod: three columns declared in
-- schema.prisma and referenced by backend routes, but never created by any
-- migration (nor by config/init.ts on init-managed databases):
--
--   vaccinations.montant   — prisma.vaccination.findMany() P2022 (500 on
--                            GET /api/vaccinations/:patientId, which breaks
--                            the whole PatientDetail page via Promise.all)
--   consultations.reference — used by the advanced patient search
--                            (patients.ts:195) and the patient history
--   examens.reference       — same, selected in the historique payload

-- Idempotent guards, same style as 20260721010000 / 20260908000000.

ALTER TABLE vaccinations ADD COLUMN IF NOT EXISTS montant DECIMAL(12, 2);

ALTER TABLE consultations ADD COLUMN IF NOT EXISTS reference VARCHAR(20);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'consultations_reference_key'
  ) THEN
    ALTER TABLE consultations ADD CONSTRAINT consultations_reference_key UNIQUE (reference);
  END IF;
END $$;

ALTER TABLE examens ADD COLUMN IF NOT EXISTS reference VARCHAR(20);
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'examens_reference_key'
  ) THEN
    ALTER TABLE examens ADD CONSTRAINT examens_reference_key UNIQUE (reference);
  END IF;
END $$;

-- Backfill: give existing consultations/examens a short unique reference so
-- the UNIQUE constraint above has no NULL-conflict semantics to worry about
-- (NULLs are allowed multiple times, but filling them makes the column
-- actually usable by the search). Keep it within VarChar(20).
DO $$
DECLARE
  r RECORD;
  seq INTEGER := 0;
BEGIN
  FOR r IN SELECT id FROM consultations WHERE reference IS NULL ORDER BY id
  LOOP
    seq := seq + 1;
    UPDATE consultations SET reference = 'CONS-' || LPAD(seq::text, 6, '0') WHERE id = r.id;
  END LOOP;
  seq := 0;
  FOR r IN SELECT id FROM examens WHERE reference IS NULL ORDER BY id
  LOOP
    seq := seq + 1;
    UPDATE examens SET reference = 'EXA-' || LPAD(seq::text, 6, '0') WHERE id = r.id;
  END LOOP;
END $$;
