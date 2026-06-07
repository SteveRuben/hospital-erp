-- Agenda médecin : disponibilités récurrentes + exceptions datées.
-- Migration POST-baseline (cf. migrations/README.md) → jouée par
-- prisma migrate deploy. Idempotente car init.ts duplique encore le DDL.
CREATE TABLE IF NOT EXISTS "medecin_disponibilites" (
  "id"              SERIAL PRIMARY KEY,
  "medecin_user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "jour_semaine"    INTEGER NOT NULL,
  "heure_debut"     VARCHAR(5) NOT NULL,
  "heure_fin"       VARCHAR(5) NOT NULL,
  "created_at"      TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_medecin_disponibilites_medecin" ON "medecin_disponibilites"("medecin_user_id");

CREATE TABLE IF NOT EXISTS "medecin_exceptions" (
  "id"              SERIAL PRIMARY KEY,
  "medecin_user_id" INTEGER NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "date"            DATE NOT NULL,
  "type"            VARCHAR(10) NOT NULL,
  "heure_debut"     VARCHAR(5),
  "heure_fin"       VARCHAR(5),
  "motif"           VARCHAR(255),
  "created_at"      TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "idx_medecin_exceptions_medecin_date" ON "medecin_exceptions"("medecin_user_id", "date");
