# Prisma migrations

This project uses Prisma migrations for schema changes. The 2026-05-16 commit
introduced the migration workflow; before that, schema lived in `src/config/init.ts`
as `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE IF NOT EXISTS` SQL run at boot.

## One-time baseline (production)

Production databases already have the schema applied via `init.ts`. Mark the
baseline migration as applied so Prisma doesn't try to re-run it:

```bash
DATABASE_URL=... npx prisma migrate resolve --applied 20260516000000_baseline
```

Run this once per environment (dev, staging, prod). It writes to
`_prisma_migrations` table only — no schema changes.

## One-time baseline (fresh dev DB)

For a brand-new dev DB with no tables yet:

```bash
DATABASE_URL=postgres://... npx prisma migrate deploy
```

This applies the baseline migration normally.

## Day-to-day workflow

When you change `prisma/schema.prisma`:

```bash
npx prisma migrate dev --name <descriptive_name>
```

This creates a new timestamped migration, applies it locally, and regenerates
the Prisma client.

For staging/prod:

```bash
DATABASE_URL=... npx prisma migrate deploy
```

## Bootstrap automatique au boot (`scripts/migrate-bootstrap.ts`)

Au démarrage, `migrate-bootstrap` tourne avant `prisma migrate deploy` :

- Base **fraîche** (pas de table `patients`) → ne fait rien, `migrate deploy`
  applique toutes les migrations.
- Base **existante** (init.ts a déjà construit le schéma) → marque comme
  appliquées **uniquement** les migrations jusqu'à `BASELINE_MIGRATION`
  (constante dans le script). Tout ce qui est **postérieur** à la baseline est
  laissé à `migrate deploy`, qui les joue réellement.

**Règle pour toute nouvelle migration (postérieure à la baseline) :** tant
qu'`init.ts` duplique encore le DDL, écrire la migration de façon **rejouable**
(`CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`,
`DO $$ ... EXCEPTION WHEN duplicate_object`), pour qu'elle n'entre pas en
conflit sur une base où init.ts a déjà créé l'objet. Mettre à jour
`BASELINE_MIGRATION` n'est PAS nécessaire — au contraire, le laisser figé est
ce qui permet aux nouvelles migrations d'être réellement déployées.

## Retiring init.ts

The `src/config/init.ts` script still runs on boot to seed data (default users,
habilitations, menu config, reference lists, starter concepts). The DDL inside
`init.ts` is now redundant once a baseline is applied — it's safe because of
`CREATE TABLE IF NOT EXISTS`, but the migration is the source of truth.

Phase 2 (separate commit): split `init.ts` into:
- `prisma/seed.ts` for the inserts (run via `npx prisma db seed`)
- delete the DDL block entirely

See `services/reference.ts` for the closed-enum refactor pattern.
