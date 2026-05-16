# Railway deployment guide

Deploys this monorepo as a single Railway service. The repo root has
`nixpacks.toml` + `Procfile` already wired:
- `npm run build` runs frontend (vite) → backend (prisma generate + tsc)
- Start command: `node packages/backend/dist/index.js`
- The Express server serves the built frontend from `packages/frontend/dist`,
  so one service hosts both API and UI.

## First-time setup

### 1. Create the project + Postgres

```bash
railway init                      # or use the dashboard
railway add postgresql            # or attach an external Neon DB
```

If you use Railway's managed Postgres, `DATABASE_URL` is set automatically.
For Neon, copy the pooled connection string from the Neon dashboard
(format: `postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/db?sslmode=require`).

### 2. Generate the required secrets locally

```bash
# JWT signing key (one per environment; do NOT reuse across dev/staging/prod)
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# PHI encryption key — 32 bytes hex = 64 chars
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Store both in a password manager. Losing PHI_ENCRYPTION_KEY = losing
access to encrypted patient PII (numeroIdentite, contact_urgence_*).

### 3. Set Railway variables

In the Railway dashboard → Settings → Variables, add at minimum:

| Variable | Value | Why |
|----------|-------|-----|
| `NODE_ENV` | `production` | Enables HTTPS redirect; suppresses demo users; hides stack traces |
| `JWT_SECRET` | 64-char hex you just generated | Server refuses to start without this in production |
| `PHI_ENCRYPTION_KEY` | 64-char hex you just generated | PHI encryption is passthrough without this (OWASP A02) |
| `FRONTEND_URL` | `https://<your-app>.up.railway.app` | CORS allowlist. Comma-separated for multiple. |
| `DATABASE_URL` | (auto-set by Railway Postgres) | |
| `DB_POOL_MAX` | `10` (Neon free) or higher for paid | Default is 10; raise if your plan allows |

Optional but recommended:

| Variable | Value | Why |
|----------|-------|-----|
| `REDIS_URL` | `redis://...` | Without it, session blacklist is single-instance only |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | your SMTP provider | Email notifications (RDV reminders, lab results) — falls back to console log |
| `SMS_PROVIDER` / `SMS_API_KEY` / `SMS_API_URL` / `SMS_SENDER_ID` | your SMS provider | SMS notifications — falls back to console log |

CLI alternative:

```bash
railway variables set NODE_ENV=production
railway variables set JWT_SECRET="$(node -e 'console.log(require(\"crypto\").randomBytes(64).toString(\"hex\"))')"
railway variables set PHI_ENCRYPTION_KEY="$(node -e 'console.log(require(\"crypto\").randomBytes(32).toString(\"hex\"))')"
railway variables set FRONTEND_URL="https://your-app.up.railway.app"
railway variables set DB_POOL_MAX=10
```

### 4. First deploy

```bash
railway up                        # or push to your linked GitHub branch
```

`config/init.ts` runs at boot and creates all tables (idempotent
`CREATE TABLE IF NOT EXISTS` + seeds default admin user). The first
deploy may take 30–60s as init runs.

Default admin credentials on a fresh database:
- Username: `admin`
- Password: `admin123`
- The login flow forces a password change on first login (`must_change_password` is `TRUE` by default).

### 5. One-time Prisma baseline (per environment)

The repo has a Prisma migrations folder now (Lane B). Since `init.ts` already
applied the schema before migrations existed, mark the baseline as applied
without re-running it:

```bash
railway run npx prisma migrate resolve --applied 20260516000000_baseline
```

This writes to the `_prisma_migrations` table only — no schema change.
Repeat per environment (dev, staging, prod). Run **once**.

### 6. Apply post-baseline migrations

The trigram patient-search indexes and audit-log hash chain are
post-baseline migrations:

```bash
railway run npx prisma migrate deploy
```

Both are forward-only and additive (no breaking changes). Run after step 5.

### 7. Backfill PHI encryption (only if you set `PHI_ENCRYPTION_KEY` AFTER existing patient data)

```bash
railway run --service backend "cd packages/backend && npx tsx scripts/encrypt-patient-phi.ts --dry-run"
railway run --service backend "cd packages/backend && npx tsx scripts/encrypt-patient-phi.ts"
```

Idempotent — skips rows that already look encrypted. Safe to run multiple times.

## Day-to-day deploys

Just push to your Railway-linked branch. The build runs:
1. `npm install --include=dev && npm install @rollup/rollup-linux-x64-gnu --no-save`
2. `npm run build` → frontend vite build → `prisma generate` → `tsc`
3. `node packages/backend/dist/index.js`

If a deploy introduces a new schema change (a new file in
`packages/backend/prisma/migrations/`), apply it after the deploy:

```bash
railway run npx prisma migrate deploy
```

Or wire migrations into the start command (see "Auto-migrate on deploy" below).

## Health check + dashboards

- **Health endpoint:** `GET /api/health` → `{ status: "ok", timestamp: "..." }`
- **Sécurité posture page:** log in as admin → `/app/securite`
  → shows encryption status, MFA adoption, recent audit, failed-login count
- **Audit verifier** (cron candidate):
  ```bash
  railway run --service backend "cd packages/backend && npx tsx scripts/verify-audit-log.ts"
  ```
  Exit 0 = chain intact. Exit 1 = tampering detected (lists rows on stderr).

## Auto-migrate on deploy (optional)

To run `prisma migrate deploy` automatically on every Railway deploy, edit
`nixpacks.toml`:

```toml
[start]
cmd = "cd packages/backend && npx prisma migrate deploy && cd ../.. && node packages/backend/dist/index.js"
```

Only do this AFTER step 5 has been run on each environment, otherwise the
first auto-deploy will try to apply the baseline DDL that already exists
and fail with `relation "users" already exists`.

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Service exits with `CRITICAL: JWT_SECRET must be set in production` | NODE_ENV=production but JWT_SECRET is the default | Set a real JWT_SECRET (step 2) |
| `[ENCRYPTION] WARNING: PHI_ENCRYPTION_KEY not configured` in logs | PHI_ENCRYPTION_KEY not set | Set it (step 2). Existing rows stay plaintext until backfill (step 7) |
| `[SESSION] No REDIS_URL — using in-memory session store (single instance only)` | Expected for single-instance | Add a Redis service if you scale beyond one replica |
| `Trop de requêtes, réessayez plus tard` on every request | Rate limit + reverse-proxy IP confusion | Confirm `app.set('trust proxy', 1)` is in effect (it is — app.ts:60). If Railway adds extra proxies, raise to 2 |
| Login works locally but `Identifiants invalides` on Railway | Bcrypt-shaped admin password from old init.ts pre-Lane-C | `[INIT]` log will say `auto-rehashed to argon2 on the next successful login` — try logging in once; the next attempt should work. If it doesn't, manually reset via DB |
| New high-severity npm advisory blocks PR | `npm audit --omit=dev --audit-level=high` failed in CI | Run `npm audit fix` locally; for breaking bumps see the security-audit.yml workflow |

## What changed in the 2026-05-16 OWASP refactor

If you were already deploying this app and are returning after the refactor:

1. **New required env var: `PHI_ENCRYPTION_KEY`.** Without it, the encryption
   service runs in passthrough mode (NOT a hard failure, but the Sécurité page
   will show `encryption.enabled: false`).
2. **Default DB_POOL_MAX changed**: 20 → 10. Set explicitly if you need more.
3. **CORS `credentials: false`.** If you have a cookie-based auth integration,
   it stops working. Hospital ERP uses Bearer tokens, so this is fine for the
   default deployment.
4. **5 routes deleted**: `/fhir`, `/api/facilities`, `/api/content-packages`,
   `/api/paiement-remita`, `/api/formulaires`. If you had clients of those,
   they will 404.
5. **9 PHI routes now enforce per-patient access control on every endpoint.**
   A medecin without an attribution in `patient_attributions` cannot read or
   modify another medecin's patients. Old behavior was: medecin could read
   every patient.
6. **CSV import (POST /api/import/users) returns generated passwords once.**
   The previous `Changeme1` shared default is gone. Admin must download and
   distribute the credentials_csv response immediately.

See `TODOS.md` for follow-up work that wasn't shipped in this refactor.
