-- Track examen payment so the Kanban can insert a "à payer" step before
-- prélèvement when the examen has a non-zero amount. Newly created exams with
-- montant > 0 start at statut='a_payer'; ones marked paid jump to 'prelevement'.
ALTER TABLE examens ADD COLUMN IF NOT EXISTS paye BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE examens ADD COLUMN IF NOT EXISTS date_paiement TIMESTAMP;
ALTER TABLE examens ADD COLUMN IF NOT EXISTS mode_paiement VARCHAR(50);
