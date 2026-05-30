-- Allow the new 'a_payer' Kanban statut on examens. The original CHECK
-- constraint (created in the baseline) listed only the six pre-payment
-- statuts, so creating an exam with statut='a_payer' fails with
-- examens_statut_check on prod. Drop + recreate the constraint with the
-- 'a_payer' value included. Idempotent: DROP IF EXISTS.
ALTER TABLE examens DROP CONSTRAINT IF EXISTS examens_statut_check;
ALTER TABLE examens ADD CONSTRAINT examens_statut_check
  CHECK (statut IN ('demande', 'a_payer', 'prelevement', 'analyse', 'resultat', 'valide', 'transmis'));
