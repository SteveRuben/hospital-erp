-- Mouvements 'perime' passent par une approbation admin avant de toucher le
-- stock. Mirrors the idempotent ALTER in src/config/init.ts.
ALTER TABLE stock_mouvements ADD COLUMN IF NOT EXISTS statut VARCHAR(20) NOT NULL DEFAULT 'valide';
