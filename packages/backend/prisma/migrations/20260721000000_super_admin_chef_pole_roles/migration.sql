-- Add 'super_admin' and 'chef_pole' roles to the UserRole enum.
-- Also seed habilitations for both new roles.

-- Step 1: add enum values (safe to run multiple times via IF NOT EXISTS).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'UserRole' AND e.enumlabel = 'super_admin'
  ) THEN
    ALTER TYPE "UserRole" ADD VALUE 'super_admin';
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
    WHERE t.typname = 'UserRole' AND e.enumlabel = 'chef_pole'
  ) THEN
    ALTER TYPE "UserRole" ADD VALUE 'chef_pole';
  END IF;
END $$;

-- Step 2: seed habilitations for super_admin (all modules).
INSERT INTO habilitations (role, module, acces)
SELECT 'super_admin', m.module, TRUE
FROM (
  SELECT unnest(ARRAY[
    'dashboard','patients','medecins','consultations','rendezvous','laboratoire','visites',
    'file-attente','finances','services','listes-patients','documentation','utilisateurs',
    'habilitations','import','lits','programmes','facturation','imagerie','orders','concepts',
    'pharmacie','patient-merge','rapports','configuration','securite','formulaires',
    'catalogue-examens','impressions','parametres-generaux','listes-reference','garde',
    'assurances','parcours'
  ]) AS module
) m
ON CONFLICT (role, module) DO NOTHING;

-- Step 3: seed habilitations for chef_pole (broad clinical + admin access).
INSERT INTO habilitations (role, module, acces)
SELECT 'chef_pole', m.module, m.module IN (
  'dashboard','patients','medecins','consultations','rendezvous','laboratoire','visites',
  'file-attente','finances','services','listes-patients','documentation','lits','programmes',
  'facturation','imagerie','orders','pharmacie','rapports','garde','assurances','parcours'
)
FROM (
  SELECT unnest(ARRAY[
    'dashboard','patients','medecins','consultations','rendezvous','laboratoire','visites',
    'file-attente','finances','services','listes-patients','documentation','utilisateurs',
    'habilitations','import','lits','programmes','facturation','imagerie','orders','concepts',
    'pharmacie','patient-merge','rapports','configuration','securite','formulaires',
    'catalogue-examens','impressions','parametres-generaux','listes-reference','garde',
    'assurances','parcours'
  ]) AS module
) m
ON CONFLICT (role, module) DO NOTHING;
