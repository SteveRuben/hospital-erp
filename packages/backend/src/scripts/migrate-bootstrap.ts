/**
 * Migration bootstrap — bridges the gap between "init.ts brought up the
 * schema" (current prod path) and "prisma migrate deploy is the source
 * of truth" (target state).
 *
 * Why this exists (CEO Review §M1): production deploys today run only
 * init.ts at boot — Prisma migrations sit dormant in prisma/migrations/.
 * Each schema change has to be applied in both places, and a forgotten
 * mirror lands as a 500 in prod (Sexe / examens_statut_check this week).
 *
 * What this script does, once per environment, on first boot after the
 * migrate-deploy wiring lands:
 *   1. Connect to the configured DATABASE_URL.
 *   2. Create the _prisma_migrations table if missing (standard Prisma
 *      shape — copied from the Prisma source so subsequent `migrate
 *      deploy` recognises it).
 *   3. Detect whether init.ts has already bootstrapped the schema
 *      (heuristic: `patients` table exists). If yes AND
 *      _prisma_migrations is empty, mark every existing migration
 *      directory as applied — this prevents `migrate deploy` from
 *      trying to re-run the baseline migration (CREATE TABLE without
 *      IF NOT EXISTS) against the already-populated schema.
 *   4. On a truly fresh DB (no patients table), do nothing — let
 *      `prisma migrate deploy` apply migrations normally.
 *
 * Idempotent: re-runs do nothing once _prisma_migrations is populated.
 *
 * Foot-gun: if a developer manually created the `patients` table
 * without running migrations, this script will mark all migrations as
 * "applied" and future `migrate deploy` will skip them. Document this
 * in README.
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// In the built dist tree this file lives at dist/scripts/, so the
// migrations directory is three levels up. In dev (tsx) it's the same
// relative path (src/scripts/ ↔ prisma/migrations/).
const MIGRATIONS_DIR = path.resolve(__dirname, '..', '..', 'prisma', 'migrations');

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('[MIGRATE_BOOTSTRAP] DATABASE_URL is required');
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    // 1. Standard Prisma migrations table — mirrors the schema Prisma
    // creates on first `migrate deploy`. Safe to pre-create; Prisma's
    // own deploy logic only inserts rows into it.
    await client.query(`
      CREATE TABLE IF NOT EXISTS _prisma_migrations (
        id                     varchar(36) PRIMARY KEY NOT NULL,
        checksum               varchar(64) NOT NULL,
        finished_at            timestamptz,
        migration_name         varchar(255) NOT NULL,
        logs                   text,
        rolled_back_at         timestamptz,
        started_at             timestamptz NOT NULL DEFAULT now(),
        applied_steps_count    integer NOT NULL DEFAULT 0
      );
    `);

    // 2. Detection: is this DB already bootstrapped by init.ts?
    const tables = await client.query<{ exists: boolean }>(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'patients'
      ) AS exists;
    `);
    const patientsTableExists = tables.rows[0]?.exists === true;

    const existingMigrations = await client.query<{ migration_name: string }>(
      'SELECT migration_name FROM _prisma_migrations',
    );
    const applied = new Set(existingMigrations.rows.map(r => r.migration_name));

    if (!patientsTableExists) {
      // Truly fresh DB — leave it to `prisma migrate deploy` to apply
      // migrations in order. Bootstrap is a no-op here.
      console.log('[MIGRATE_BOOTSTRAP] Fresh database detected — deferring to prisma migrate deploy');
      return;
    }

    // 3. init.ts has already shaped the schema. Mark every migration in
    // the directory as applied so prisma migrate deploy does nothing on
    // pre-existing rows but will pick up future ones.
    if (!fs.existsSync(MIGRATIONS_DIR)) {
      console.warn(`[MIGRATE_BOOTSTRAP] Migrations dir not found at ${MIGRATIONS_DIR} — skipping`);
      return;
    }

    const dirs = fs.readdirSync(MIGRATIONS_DIR)
      .filter(d => /^\d{14}_/.test(d))
      .sort();

    let marked = 0;
    for (const dir of dirs) {
      if (applied.has(dir)) continue;
      const sqlPath = path.join(MIGRATIONS_DIR, dir, 'migration.sql');
      if (!fs.existsSync(sqlPath)) continue;
      const sql = fs.readFileSync(sqlPath, 'utf8');
      const checksum = crypto.createHash('sha256').update(sql).digest('hex');
      await client.query(
        `INSERT INTO _prisma_migrations
           (id, checksum, migration_name, started_at, finished_at, applied_steps_count)
         VALUES ($1, $2, $3, now(), now(), 1)
         ON CONFLICT (id) DO NOTHING`,
        [crypto.randomUUID(), checksum, dir],
      );
      marked += 1;
    }

    if (marked > 0) {
      console.log(`[MIGRATE_BOOTSTRAP] Marked ${marked} migration(s) as applied on existing schema`);
    } else {
      console.log('[MIGRATE_BOOTSTRAP] All migrations already tracked — nothing to do');
    }
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error('[MIGRATE_BOOTSTRAP] failed:', err);
  process.exit(1);
});
