-- Align patients.sexe / statut_matrimonial / groupe_sanguin with their
-- Prisma native enum types. The baseline migration created these as
-- VARCHAR + CHECK, but the Prisma schema declares them as enums (Sexe,
-- StatutMatrimonial, GroupeSanguin). prisma.patient.update() casts to
-- ::public."Sexe" and crashes on prod with
--   type "public.Sexe" does not exist
-- Create the types and convert the columns. Idempotent.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Sexe') THEN
    CREATE TYPE "Sexe" AS ENUM ('M','F','autre');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StatutMatrimonial') THEN
    CREATE TYPE "StatutMatrimonial" AS ENUM ('celibataire','marie','divorce','veuf');
  END IF;
  -- GroupeSanguin uses @map in Prisma so labels are the human-readable
  -- forms ('A+', 'A-', …). Prisma round-trips between 'Aplus' (TS name)
  -- and 'A+' (DB label) on its own.
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'GroupeSanguin') THEN
    CREATE TYPE "GroupeSanguin" AS ENUM ('A+','A-','B+','B-','AB+','AB-','O+','O-');
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'patients' AND column_name = 'sexe' AND data_type = 'character varying'
  ) THEN
    ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_sexe_check;
    ALTER TABLE patients ALTER COLUMN sexe TYPE "Sexe" USING sexe::"Sexe";
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'patients' AND column_name = 'statut_matrimonial' AND data_type = 'character varying'
  ) THEN
    ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_statut_matrimonial_check;
    ALTER TABLE patients ALTER COLUMN statut_matrimonial TYPE "StatutMatrimonial" USING statut_matrimonial::"StatutMatrimonial";
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'patients' AND column_name = 'groupe_sanguin' AND data_type = 'character varying'
  ) THEN
    ALTER TABLE patients DROP CONSTRAINT IF EXISTS patients_groupe_sanguin_check;
    ALTER TABLE patients ALTER COLUMN groupe_sanguin TYPE "GroupeSanguin" USING groupe_sanguin::"GroupeSanguin";
  END IF;
END $$;
