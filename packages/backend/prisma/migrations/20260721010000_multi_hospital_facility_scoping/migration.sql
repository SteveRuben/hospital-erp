-- Multi-hospital architecture: add facility_id to users, patients, services.
-- Update facilities table with parent_id for hospital → branch hierarchy.

-- Step 1: Add parent_id to facilities for hospital → branch hierarchy.
ALTER TABLE facilities ADD COLUMN IF NOT EXISTS parent_id INTEGER;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'facilities_parent_id_fkey') THEN
    ALTER TABLE facilities ADD CONSTRAINT facilities_parent_id_fkey
      FOREIGN KEY (parent_id) REFERENCES facilities(id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_facilities_parent_id ON facilities(parent_id);

-- Step 2: Add facility_id to users.
ALTER TABLE users ADD COLUMN IF NOT EXISTS facility_id INTEGER;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_facility_id_fkey') THEN
    ALTER TABLE users ADD CONSTRAINT users_facility_id_fkey
      FOREIGN KEY (facility_id) REFERENCES facilities(id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_users_facility_id ON users(facility_id);

-- Step 3: Add facility_id to patients.
ALTER TABLE patients ADD COLUMN IF NOT EXISTS facility_id INTEGER;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'patients_facility_id_fkey') THEN
    ALTER TABLE patients ADD CONSTRAINT patients_facility_id_fkey
      FOREIGN KEY (facility_id) REFERENCES facilities(id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_patients_facility_id ON patients(facility_id);

-- Step 4: Add facility_id to services.
ALTER TABLE services ADD COLUMN IF NOT EXISTS facility_id INTEGER;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'services_facility_id_fkey') THEN
    ALTER TABLE services ADD CONSTRAINT services_facility_id_fkey
      FOREIGN KEY (facility_id) REFERENCES facilities(id) ON DELETE SET NULL;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_services_facility_id ON services(facility_id);

-- Step 5: Seed a default facility if none exists, and assign all existing data to it.
DO $$
DECLARE
  default_facility_id INTEGER;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM facilities LIMIT 1) THEN
    INSERT INTO facilities (nom, type_facility, actif, created_at)
    VALUES ('Hôpital Principal', 'hopital', TRUE, NOW())
    RETURNING id INTO default_facility_id;

    -- Assign all existing users to the default facility.
    UPDATE users SET facility_id = default_facility_id WHERE facility_id IS NULL;
    -- Assign all existing patients to the default facility.
    UPDATE patients SET facility_id = default_facility_id WHERE facility_id IS NULL;
    -- Assign all existing services to the default facility.
    UPDATE services SET facility_id = default_facility_id WHERE facility_id IS NULL;
  ELSE
    -- If facilities exist but some records have no facility, assign them to the first facility.
    SELECT id INTO default_facility_id FROM facilities ORDER BY id LIMIT 1;
    UPDATE users SET facility_id = default_facility_id WHERE facility_id IS NULL;
    UPDATE patients SET facility_id = default_facility_id WHERE facility_id IS NULL;
    UPDATE services SET facility_id = default_facility_id WHERE facility_id IS NULL;
  END IF;
END $$;
