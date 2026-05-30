-- Priority-3 of the post-CEO-review priorities: add a Priorite enum
-- shared between Examen and RendezVous. The lab Kanban + RDV list
-- order by (priorite ASC, statut ASC, date) so 'urgent' floats to the
-- top regardless of insertion order. FileAttente already has its own
-- 'priorite' VARCHAR — left as-is for backward compat with the queue
-- view; convergence can come later.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'Priorite') THEN
    CREATE TYPE "Priorite" AS ENUM ('urgent', 'prioritaire', 'normal');
  END IF;
END $$;

ALTER TABLE examens     ADD COLUMN IF NOT EXISTS priorite "Priorite" DEFAULT 'normal'::"Priorite";
ALTER TABLE rendez_vous ADD COLUMN IF NOT EXISTS priorite "Priorite" DEFAULT 'normal'::"Priorite";

ALTER TABLE examens     ALTER COLUMN priorite SET DEFAULT 'normal'::"Priorite";
ALTER TABLE rendez_vous ALTER COLUMN priorite SET DEFAULT 'normal'::"Priorite";

CREATE INDEX IF NOT EXISTS idx_examens_statut_priorite
  ON examens(statut, priorite);
