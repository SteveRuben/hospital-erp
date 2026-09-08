-- Multi-hospital scoping for the finance tables. The facilityScope filter in
-- routes/finances.ts (r.facility_id = X / facility_id = X) was shipped in the
-- multi-hospital commit without its migration — every scoped GET /finances/recettes
-- and /finances/depenses threw 42703 ("column facility_id does not exist") → 500.
-- This adds the column to both tables (idempotent-style guards mirror
-- 20260721010000_multi_hospital_facility_scoping).

-- Step 1: facility_id on recettes.
ALTER TABLE recettes ADD COLUMN IF NOT EXISTS facility_id INTEGER;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recettes_facility_id_fkey') THEN
    ALTER TABLE recettes ADD CONSTRAINT recettes_facility_id_fkey
      FOREIGN KEY (facility_id) REFERENCES facilities(id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_recettes_facility_id ON recettes(facility_id);

-- Step 2: facility_id on depenses.
ALTER TABLE depenses ADD COLUMN IF NOT EXISTS facility_id INTEGER;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'depenses_facility_id_fkey') THEN
    ALTER TABLE depenses ADD CONSTRAINT depenses_facility_id_fkey
      FOREIGN KEY (facility_id) REFERENCES facilities(id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_depenses_facility_id ON depenses(facility_id);

-- Step 3: backfill existing rows from the facility of the patient the recette
-- was billed for, falling back to the first active facility (mirrors the
-- backfill strategy of 20260721010000 for patients).
DO $$
DECLARE
  default_facility_id INTEGER;
BEGIN
  SELECT id INTO default_facility_id FROM facilities WHERE actif = TRUE ORDER BY id LIMIT 1;
  IF default_facility_id IS NOT NULL THEN
    UPDATE recettes r
       SET facility_id = COALESCE(p.facility_id, default_facility_id)
      FROM patients p
     WHERE r.patient_id = p.id AND r.facility_id IS NULL;
    UPDATE recettes SET facility_id = default_facility_id WHERE facility_id IS NULL;
    UPDATE depenses SET facility_id = default_facility_id WHERE facility_id IS NULL;
  END IF;
END $$;
