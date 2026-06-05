-- Provenance des recettes auto-générées (facturation automatique).
-- Remplace le marqueur fragile `description LIKE '[auto:...]'` par des colonnes
-- dédiées + un index UNIQUE PARTIEL : une seule recette auto VIVANTE par source
-- (kind, id). Une recette annulée ne bloque pas une re-facturation.
--
-- Migration POST-baseline (cf. migrations/README.md) → jouée par
-- prisma migrate deploy. Écrite en idempotent car init.ts duplique encore le
-- DDL.
ALTER TABLE "recettes" ADD COLUMN IF NOT EXISTS "source_kind" VARCHAR(20);
ALTER TABLE "recettes" ADD COLUMN IF NOT EXISTS "source_id" INTEGER;

CREATE UNIQUE INDEX IF NOT EXISTS "uniq_recette_source_live"
  ON "recettes" ("source_kind", "source_id")
  WHERE "source_kind" IS NOT NULL AND ("annulee" = false OR "annulee" IS NULL);
