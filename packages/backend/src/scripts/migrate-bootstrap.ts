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
 *      (heuristic: `patients` table exists). If yes, mark only the
 *      migrations UP TO AND INCLUDING the baseline (see
 *      BASELINE_MIGRATION) as applied — preventing `migrate deploy`
 *      from re-running the baseline DDL against the populated schema.
 *      Migrations AFTER the baseline are left untouched so
 *      `migrate deploy` actually runs them (that's the whole point of
 *      moving to Prisma migrations).
 *   4. On a truly fresh DB (no patients table), do nothing — let
 *      `prisma migrate deploy` apply every migration normally.
 *
 * Idempotent: re-runs skip already-tracked migrations and never mark
 * post-baseline ones, so new migrations always reach migrate deploy.
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

// Baseline : nom de la dernière migration dont les effets sont déjà présents
// dans tout schéma bootstrappé par init.ts (ou déployé avant ce correctif).
// Sur une base EXISTANTE, on ne marque comme « appliquées » que les migrations
// <= baseline ; tout ce qui est POSTÉRIEUR est laissé à `prisma migrate deploy`
// pour exécution réelle. Sans ce garde, chaque nouvelle migration était
// auto-marquée à chaque boot et n'était jamais jouée en prod.
//
// IMPORTANT : les migrations postérieures à la baseline DOIVENT être
// rejouables (CREATE TABLE IF NOT EXISTS, DO $$ ... EXCEPTION WHEN
// duplicate_object) tant qu'init.ts duplique encore le DDL, pour ne pas
// entrer en conflit sur une base existante.
const BASELINE_MIGRATION = '20260603120000_examen_consultation_link';

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
    let deferred = 0;
    for (const dir of dirs) {
      if (applied.has(dir)) continue;
      // Migrations postérieures à la baseline : NE PAS auto-marquer. On les
      // laisse à `prisma migrate deploy` qui les jouera réellement.
      if (dir > BASELINE_MIGRATION) { deferred += 1; continue; }
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
      console.log(`[MIGRATE_BOOTSTRAP] Marked ${marked} baseline migration(s) (<= ${BASELINE_MIGRATION}) as applied on existing schema`);
    } else {
      console.log('[MIGRATE_BOOTSTRAP] No baseline migration to mark — already tracked');
    }
    if (deferred > 0) {
      console.log(`[MIGRATE_BOOTSTRAP] ${deferred} post-baseline migration(s) left for prisma migrate deploy to run`);
    }
  } finally {
    await client.end();
  }
}

main().catch(err => {
  console.error('[MIGRATE_BOOTSTRAP] failed:', err);
  process.exit(1);
});
