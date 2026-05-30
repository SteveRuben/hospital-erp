-- P0-6 Phase 2 bis: organisational hooks layered on top of the
-- Medecin → User fusion.
--
-- New columns:
--   services.chef_medecin_user_id INT? → users(id)
--     The unit's chief doctor. Grants HIPAA-scope access to every
--     patient with a consultation in this service.
--   users.suppleant_user_id INT? → users(id)
--     Backup user who inherits the medecin's access scope while the
--     medecin is suspended (vacation, sick leave, …).
--   users.service_id INT? → services(id)
--     The unit the user belongs to. Used by access-control to grant
--     infirmier and other unit-scoped roles access to patients with
--     an active visite/hospitalisation in that service.
--
-- New role:
--   UserRole gains 'infirmier'. ALTER TYPE ADD VALUE is its own
--   transaction in Postgres so it goes in its own DO block.
--
-- Idempotent.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UserRole')
     AND NOT EXISTS (
       SELECT 1 FROM pg_enum e
       JOIN pg_type t ON e.enumtypid = t.oid
       WHERE t.typname = 'UserRole' AND e.enumlabel = 'infirmier'
     ) THEN
    ALTER TYPE "UserRole" ADD VALUE 'infirmier';
  END IF;
END $$;

ALTER TABLE services ADD COLUMN IF NOT EXISTS chef_medecin_user_id INTEGER;
ALTER TABLE users    ADD COLUMN IF NOT EXISTS suppleant_user_id   INTEGER;
ALTER TABLE users    ADD COLUMN IF NOT EXISTS service_id          INTEGER;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'services_chef_medecin_user_id_fkey') THEN
    ALTER TABLE services
      ADD CONSTRAINT services_chef_medecin_user_id_fkey
      FOREIGN KEY (chef_medecin_user_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_suppleant_user_id_fkey') THEN
    ALTER TABLE users
      ADD CONSTRAINT users_suppleant_user_id_fkey
      FOREIGN KEY (suppleant_user_id) REFERENCES users(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'users_service_id_fkey') THEN
    ALTER TABLE users
      ADD CONSTRAINT users_service_id_fkey
      FOREIGN KEY (service_id) REFERENCES services(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Indexes — access-control queries hit each of these columns on every
-- patient-list request, so the filters need to be cheap.
CREATE INDEX IF NOT EXISTS idx_services_chef_medecin ON services(chef_medecin_user_id);
CREATE INDEX IF NOT EXISTS idx_users_suppleant       ON users(suppleant_user_id);
CREATE INDEX IF NOT EXISTS idx_users_service         ON users(service_id);
