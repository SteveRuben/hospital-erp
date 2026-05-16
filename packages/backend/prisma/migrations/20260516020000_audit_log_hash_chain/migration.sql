-- OWASP A09 (tamper detection): hash-chain audit_log so deletion or
-- modification of any historical row breaks the chain and is detectable
-- by the verifier script (scripts/verify-audit-log.ts).
--
-- The existing audit_log_immutable trigger blocks UPDATE/DELETE; this chain
-- adds defense-in-depth against direct DB tampering by someone bypassing
-- the trigger (e.g. via DROP TRIGGER then UPDATE).

CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS hash      CHAR(64);
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS prev_hash CHAR(64);

CREATE OR REPLACE FUNCTION compute_audit_hash()
RETURNS TRIGGER AS $$
DECLARE
  last_hash CHAR(64);
BEGIN
  -- Transaction-scoped advisory lock serializes the chain calculation across
  -- concurrent INSERTs so the prev_hash lookup is consistent.
  PERFORM pg_advisory_xact_lock(hashtext('audit_log_chain'));

  SELECT hash INTO last_hash
    FROM audit_log
    WHERE hash IS NOT NULL
    ORDER BY id DESC
    LIMIT 1;

  NEW.prev_hash := last_hash;
  NEW.hash := encode(
    digest(
      COALESCE(NEW.user_id::text, '')    || '|' ||
      COALESCE(NEW.action, '')           || '|' ||
      COALESCE(NEW.table_name, '')       || '|' ||
      COALESCE(NEW.record_id::text, '')  || '|' ||
      COALESCE(NEW.details, '')          || '|' ||
      COALESCE(NEW.created_at::text, '') || '|' ||
      COALESCE(NEW.prev_hash, ''),
      'sha256'
    ),
    'hex'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_log_hash_chain ON audit_log;
CREATE TRIGGER audit_log_hash_chain
  BEFORE INSERT ON audit_log
  FOR EACH ROW EXECUTE FUNCTION compute_audit_hash();
