-- OWASP A04 / perf: enable pg_trgm + GIN trigram indexes on patient search
-- columns so the `contains: { mode: 'insensitive' }` quick-search query
-- can use an index instead of a sequential scan at 10K+ patients.
--
-- numeroIdentite is excluded: it's encrypted at rest post-Lane B, so a
-- trigram match on ciphertext is useless. Quick-search no longer reads it.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_patients_nom_trgm        ON patients USING gin (nom        gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_patients_prenom_trgm     ON patients USING gin (prenom     gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_patients_telephone_trgm  ON patients USING gin (telephone  gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_patients_email_trgm      ON patients USING gin (email      gin_trgm_ops);
