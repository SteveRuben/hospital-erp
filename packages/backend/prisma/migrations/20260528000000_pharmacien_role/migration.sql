-- Add the 'pharmacien' role. Two schema variants exist in production:
--   - native PG enum "UserRole" (databases provisioned via prisma migrate)
--   - VARCHAR + CHECK column (databases bootstrapped via src/config/init.ts)
-- Handle both so the migration is safe regardless of how the DB was created.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UserRole') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
      WHERE t.typname = 'UserRole' AND e.enumlabel = 'pharmacien'
    ) THEN
      ALTER TYPE "UserRole" ADD VALUE 'pharmacien';
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'role' AND data_type = 'character varying'
  ) THEN
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
    ALTER TABLE users ADD CONSTRAINT users_role_check
      CHECK (role IN ('admin','medecin','comptable','laborantin','reception','pharmacien'));
  END IF;
END $$;

-- Seed pharmacien habilitations (idempotent). The module list mirrors
-- roleAccess.pharmacien in src/config/init.ts.
INSERT INTO habilitations (role, module, acces)
SELECT 'pharmacien', m.module, m.module IN ('dashboard','pharmacie','patients','documentation','orders')
FROM (
  SELECT unnest(ARRAY[
    'dashboard','patients','medecins','consultations','rendezvous','laboratoire','visites',
    'file-attente','finances','services','listes-patients','documentation','utilisateurs',
    'habilitations','import','lits','programmes','facturation','imagerie','orders','concepts',
    'pharmacie','patient-merge','rapports','configuration','securite'
  ]) AS module
) m
ON CONFLICT (role, module) DO NOTHING;
