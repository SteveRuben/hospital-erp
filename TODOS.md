# TODOS

Status as of 2026-05-16 EOD. **12 commits** landed in this session:

```
6f0ad00 feat(test):           Lane E — supertest harness + real auth/patients tests
b454724 refactor:             asyncHandler batch 2 — visites, settings, planning
3c68546 feat(security,perf):  pg_trgm indexes + audit_log hash chain
f2e43da feat(security):       OWASP A01 residual — resource-level access on PUT/DELETE
e338a9b fix(security):        token-in-URL → fetch+Blob+objectURL
723b8dd feat:                 strategic surface cuts + Sécurité posture page
9f4fcb0 docs:                 TODOS.md remaining work + deploy checklist
a3eed4e feat(security,perf):  Lane D — A08 magic-byte uploads + transactional fixes
866d8fb feat(security):       Lane C — A05 cleanup + asyncHandler sample
f168901 feat(security):       Lane B — A02 PHI encryption + Prisma migrations baseline
0f595bc feat(security):       Lane A — A01 IDOR middleware + A09 access-denied audit
6cd956a chore(security):      Lane F — A03/A04/A06/A07/A08 posture fixes
```

**Backend test suite: 131/131 passing.**

## Pre-deployment checklist

Run these once per environment (dev → staging → prod) BEFORE shipping:

1. **Generate `PHI_ENCRYPTION_KEY`** (64 hex chars):
   ```bash
   openssl rand -hex 32
   ```
   Set as a Railway/Render secret. Without it, PHI encryption is passthrough.

2. **Mark the Prisma baseline migration as applied** (one-time per env):
   ```bash
   DATABASE_URL=... npx prisma migrate resolve --applied 20260516000000_baseline
   ```
   No schema change — just writes to `_prisma_migrations`. Environments already
   have the schema via init.ts.

3. **Apply the new migrations** (trigram indexes + audit hash chain):
   ```bash
   DATABASE_URL=... npx prisma migrate deploy
   ```

4. **Backfill encryption** for existing patient rows (after PHI_ENCRYPTION_KEY is set):
   ```bash
   cd packages/backend && npx tsx scripts/encrypt-patient-phi.ts --dry-run
   cd packages/backend && npx tsx scripts/encrypt-patient-phi.ts
   ```

5. **Set `DB_POOL_MAX=10`** (or your Neon plan limit) — was hardcoded 20 pre-Lane B.

6. **Verify the audit chain** is intact (sanity check):
   ```bash
   cd packages/backend && npx tsx scripts/verify-audit-log.ts
   ```

## Remaining engineering work

### A — init.ts → prisma seed (full pg.Pool retirement)

**What:**
1. Confirm baseline migration is applied on every environment (deploy checklist #2).
2. Extract `init.ts` seed inserts (admin user, habilitations, menu_config,
   encounter_types, starter concepts, default settings, services, pavillons,
   reference lists) → `prisma/seed.ts`.
3. Wire `npx prisma db seed` into the boot script. Replace the boot-time
   `initDB()` call with `prisma migrate deploy && prisma db seed`.
4. Delete the DDL block from `init.ts`. Delete `config/reset-db.ts` (use
   `npx prisma migrate reset` instead).
5. Delete `pool` + `query` + `getClient` exports from `config/db.ts`.

**Blocker:** Cannot land until every environment has run `prisma migrate
resolve --applied 20260516000000_baseline`. Otherwise the first deploy
after init.ts is gutted would try to apply the baseline DDL and fail.

### B — asyncHandler migration remaining (30 files)

**What:** Apply the asyncHandler pattern to the route files not yet converted.

**Pattern established** in commits `866d8fb`, `b454724` (dashboard, notifications,
print, visites, settings, planning) + all 9 PHI routes from Lane A and the
remaining files migrated to use the pattern elsewhere.

**Remaining files (alphabetical):**
auth, concepts, consultations, encounters, export, facturation, file-attente,
finances, habilitations, import, laboratoire, listes-patients, lits, orders,
patient-merge, patients, portail, prescriptions, programmes, reference-lists,
rendezvous, reports, pharmacie.

**Sequencing:** 4-6 files per commit + `npm test` + `npx tsc --noEmit` after each.
Estimated 2-3 hours of mechanical work.

### C — Lane E completion: per-route test suites + frontend tests

**What:**
- Per-route supertest suites (happy/sad/auth) for the remaining 35+ routes.
  Each test file ~50 lines, ~5-10 assertions, follows the pattern from
  `__tests__/auth.test.ts` and `__tests__/patients.test.ts`.
- `facturation` transactional create test (asserts rollback on failure).
- `patient-merge` rollback test (after wrapping merge in `$transaction` —
  separate work).
- Install Vitest + React Testing Library in `packages/frontend`. Smoke-test
  `Login.tsx`, `PatientForm.tsx`, `Securite.tsx`.
- Replace `e2e/screenshots.spec.ts` with a behavioral E2E spec covering:
  login → MFA → patient create → consultation → ordonnance → facture → paiement.

### D — Schema cleanup (after surface cuts have shipped a few deploys)

**What:** Remove the now-unused Prisma models from `schema.prisma` and add a
migration to DROP the underlying tables:
- `Formulaire` / `formulaires`
- `FormulaireReponse` / `formulaire_reponses`
- `Facility` / `facilities`

Currently the schema still has these (harmless but adds clutter). Leave them
until you're certain no environment references them.

### E — Documentation update

**What:** Update the in-app Documentation page and `docs/PSSI_POLITIQUE_SECURITE.md`,
`docs/RGPD_REGISTRE_TRAITEMENTS.md`, `docs/PIA_ANALYSE_IMPACT.md` to reflect the
actual OWASP controls now in place. Pre-Lane-A those docs were aspirational; the
controls now exist and are testable. The Sécurité page already surfaces the
runtime state; the regulatory docs should describe the static guarantees.

Specifically:
- Mention IDOR middleware (Lane A) + resource-level access (residual fix).
- PHI encryption at rest (Lane B) with the field list.
- Audit logging including access_denied + WORM trigger + hash chain.
- Magic-byte upload validation (Lane D).
- npm audit CI gate (Lane F).
- Per-user random passwords on CSV import (Lane F).

### F — Stretch (not committed)

- **Frontend axios interceptor**: replace the `localStorage.getItem('token')`
  pattern in `services/api.ts` with a top-level `getToken()` helper, so any
  future token-storage refactor (sessionStorage? HttpOnly cookie?) is a
  single-line change.
- **Browser-side AES-GCM for portal session data**: the `sessionStorage`
  blob written by the session-timeout handler (path + form data) is plaintext.
  Encrypt with a key derived from the JWT before storing.
- **Per-route rate limit overrides**: the global 500/15min is generous but
  treating /facturation/paiements the same as /api/dashboard is sloppy.
  Tighter limits on the money-touching endpoints.
