-- Promote 9 more workflow statut columns from VARCHAR + CHECK to Prisma
-- native enums. Same shape as the ExamenStatut / RendezVousStatut
-- migrations shipped in 050000 / 060000. Idempotent.
--
-- Models covered (mapping → table → enum name):
--   Consultation     → consultations         → ConsultationStatut
--   Order            → orders                → OrderStatut
--   Pathologie       → pathologies           → PathologieStatut
--   Prescription     → prescriptions         → PrescriptionStatut
--   Ordonnance       → ordonnances           → OrdonnanceStatut
--   Visite           → visites               → VisiteStatut
--   Hospitalisation  → hospitalisations      → HospitalisationStatut
--   FileAttente      → file_attente          → FileAttenteStatut
--   Lit              → lits                  → LitStatut
--   ProgrammePatient → programme_patients    → ProgrammePatientStatut
--   Facture          → factures              → FactureStatut

-- Step 1: create all enum types.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ConsultationStatut') THEN
    CREATE TYPE "ConsultationStatut" AS ENUM ('en_cours','terminee','annulee');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OrderStatut') THEN
    CREATE TYPE "OrderStatut" AS ENUM ('nouveau','actif','complete','annule','expire');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PathologieStatut') THEN
    CREATE TYPE "PathologieStatut" AS ENUM ('active','inactive','resolue');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'PrescriptionStatut') THEN
    CREATE TYPE "PrescriptionStatut" AS ENUM ('active','terminee','annulee');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OrdonnanceStatut') THEN
    CREATE TYPE "OrdonnanceStatut" AS ENUM ('emise','delivree','annulee');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'VisiteStatut') THEN
    CREATE TYPE "VisiteStatut" AS ENUM ('active','terminee');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'HospitalisationStatut') THEN
    CREATE TYPE "HospitalisationStatut" AS ENUM ('active','sortie','transfere','deces');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FileAttenteStatut') THEN
    CREATE TYPE "FileAttenteStatut" AS ENUM ('en_attente','en_cours','termine','absent');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'LitStatut') THEN
    CREATE TYPE "LitStatut" AS ENUM ('disponible','occupe','maintenance','reserve');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProgrammePatientStatut') THEN
    CREATE TYPE "ProgrammePatientStatut" AS ENUM ('actif','termine','abandonne');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'FactureStatut') THEN
    CREATE TYPE "FactureStatut" AS ENUM ('en_attente','partielle','payee','annulee');
  END IF;
END $$;

-- Step 2: convert each column if it is still VARCHAR. Each block drops
-- the auto-named CHECK constraint and the VARCHAR default, casts the
-- column to the enum type, and restores the default as the enum value.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'consultations' AND column_name = 'statut' AND data_type = 'character varying') THEN
    ALTER TABLE consultations DROP CONSTRAINT IF EXISTS consultations_statut_check;
    ALTER TABLE consultations ALTER COLUMN statut DROP DEFAULT;
    ALTER TABLE consultations ALTER COLUMN statut TYPE "ConsultationStatut" USING statut::"ConsultationStatut";
    ALTER TABLE consultations ALTER COLUMN statut SET DEFAULT 'en_cours'::"ConsultationStatut";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'orders' AND column_name = 'statut' AND data_type = 'character varying') THEN
    ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_statut_check;
    ALTER TABLE orders ALTER COLUMN statut DROP DEFAULT;
    ALTER TABLE orders ALTER COLUMN statut TYPE "OrderStatut" USING statut::"OrderStatut";
    ALTER TABLE orders ALTER COLUMN statut SET DEFAULT 'actif'::"OrderStatut";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'pathologies' AND column_name = 'statut' AND data_type = 'character varying') THEN
    ALTER TABLE pathologies DROP CONSTRAINT IF EXISTS pathologies_statut_check;
    ALTER TABLE pathologies ALTER COLUMN statut DROP DEFAULT;
    ALTER TABLE pathologies ALTER COLUMN statut TYPE "PathologieStatut" USING statut::"PathologieStatut";
    ALTER TABLE pathologies ALTER COLUMN statut SET DEFAULT 'active'::"PathologieStatut";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'prescriptions' AND column_name = 'statut' AND data_type = 'character varying') THEN
    ALTER TABLE prescriptions DROP CONSTRAINT IF EXISTS prescriptions_statut_check;
    ALTER TABLE prescriptions ALTER COLUMN statut DROP DEFAULT;
    ALTER TABLE prescriptions ALTER COLUMN statut TYPE "PrescriptionStatut" USING statut::"PrescriptionStatut";
    ALTER TABLE prescriptions ALTER COLUMN statut SET DEFAULT 'active'::"PrescriptionStatut";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'ordonnances' AND column_name = 'statut' AND data_type = 'character varying') THEN
    ALTER TABLE ordonnances DROP CONSTRAINT IF EXISTS ordonnances_statut_check;
    ALTER TABLE ordonnances ALTER COLUMN statut DROP DEFAULT;
    ALTER TABLE ordonnances ALTER COLUMN statut TYPE "OrdonnanceStatut" USING statut::"OrdonnanceStatut";
    ALTER TABLE ordonnances ALTER COLUMN statut SET DEFAULT 'emise'::"OrdonnanceStatut";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'visites' AND column_name = 'statut' AND data_type = 'character varying') THEN
    ALTER TABLE visites DROP CONSTRAINT IF EXISTS visites_statut_check;
    ALTER TABLE visites ALTER COLUMN statut DROP DEFAULT;
    ALTER TABLE visites ALTER COLUMN statut TYPE "VisiteStatut" USING statut::"VisiteStatut";
    ALTER TABLE visites ALTER COLUMN statut SET DEFAULT 'active'::"VisiteStatut";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'hospitalisations' AND column_name = 'statut' AND data_type = 'character varying') THEN
    ALTER TABLE hospitalisations DROP CONSTRAINT IF EXISTS hospitalisations_statut_check;
    ALTER TABLE hospitalisations ALTER COLUMN statut DROP DEFAULT;
    ALTER TABLE hospitalisations ALTER COLUMN statut TYPE "HospitalisationStatut" USING statut::"HospitalisationStatut";
    ALTER TABLE hospitalisations ALTER COLUMN statut SET DEFAULT 'active'::"HospitalisationStatut";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'file_attente' AND column_name = 'statut' AND data_type = 'character varying') THEN
    ALTER TABLE file_attente DROP CONSTRAINT IF EXISTS file_attente_statut_check;
    ALTER TABLE file_attente ALTER COLUMN statut DROP DEFAULT;
    ALTER TABLE file_attente ALTER COLUMN statut TYPE "FileAttenteStatut" USING statut::"FileAttenteStatut";
    ALTER TABLE file_attente ALTER COLUMN statut SET DEFAULT 'en_attente'::"FileAttenteStatut";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'lits' AND column_name = 'statut' AND data_type = 'character varying') THEN
    ALTER TABLE lits DROP CONSTRAINT IF EXISTS lits_statut_check;
    ALTER TABLE lits ALTER COLUMN statut DROP DEFAULT;
    ALTER TABLE lits ALTER COLUMN statut TYPE "LitStatut" USING statut::"LitStatut";
    ALTER TABLE lits ALTER COLUMN statut SET DEFAULT 'disponible'::"LitStatut";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'programme_patients' AND column_name = 'statut' AND data_type = 'character varying') THEN
    ALTER TABLE programme_patients DROP CONSTRAINT IF EXISTS programme_patients_statut_check;
    ALTER TABLE programme_patients ALTER COLUMN statut DROP DEFAULT;
    ALTER TABLE programme_patients ALTER COLUMN statut TYPE "ProgrammePatientStatut" USING statut::"ProgrammePatientStatut";
    ALTER TABLE programme_patients ALTER COLUMN statut SET DEFAULT 'actif'::"ProgrammePatientStatut";
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'factures' AND column_name = 'statut' AND data_type = 'character varying') THEN
    ALTER TABLE factures DROP CONSTRAINT IF EXISTS factures_statut_check;
    ALTER TABLE factures ALTER COLUMN statut DROP DEFAULT;
    ALTER TABLE factures ALTER COLUMN statut TYPE "FactureStatut" USING statut::"FactureStatut";
    ALTER TABLE factures ALTER COLUMN statut SET DEFAULT 'en_attente'::"FactureStatut";
  END IF;
END $$;

-- factures has a partial-index on statut; recreate it as the column
-- type changed (Postgres allows comparing the enum to a literal, but
-- the index expression may need re-planning).
DROP INDEX IF EXISTS idx_factures_statut;
CREATE INDEX idx_factures_statut ON factures(statut);
DROP INDEX IF EXISTS idx_orders_statut;
CREATE INDEX idx_orders_statut ON orders(statut) WHERE statut = 'actif';
DROP INDEX IF EXISTS idx_visites_service_statut;
CREATE INDEX idx_visites_service_statut ON visites(service_id, statut) WHERE statut = 'active';
