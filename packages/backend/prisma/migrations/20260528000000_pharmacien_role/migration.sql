-- Add the 'pharmacien' role and align the column with the native "UserRole"
-- enum the Prisma schema expects. Two schema variants exist in production:
--   - native PG enum "UserRole" (databases provisioned via prisma migrate)
--   - VARCHAR + CHECK column (databases bootstrapped via src/config/init.ts)
-- The VARCHAR variant makes prisma.user.create() fail with
-- `type "public.UserRole" does not exist`, so we create the type and convert.

-- Step 1: ensure the enum type exists with every label (separate statement so
-- ALTER TYPE ADD VALUE commits before the column conversion below).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UserRole') THEN
    CREATE TYPE "UserRole" AS ENUM ('admin','medecin','comptable','laborantin','reception','pharmacien');
  ELSIF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'UserRole' AND e.enumlabel = 'pharmacien'
  ) THEN
    ALTER TYPE "UserRole" ADD VALUE 'pharmacien';
  END IF;
END $$;

-- Step 2: convert a VARCHAR role column to the enum type (no-op if already enum).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'users' AND column_name = 'role' AND data_type = 'character varying'
  ) THEN
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
    ALTER TABLE users ALTER COLUMN role TYPE "UserRole" USING role::"UserRole";
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
