-- "Où" : IP client + route HTTP sur chaque entrée d'audit. Mirrors the
-- idempotent ALTER in src/config/init.ts (Railway boots via init.ts, not
-- `prisma migrate deploy` — kept here so local `prisma migrate dev`/CI stay
-- in sync with schema.prisma).
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS ip_address VARCHAR(45);
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS route VARCHAR(255);
