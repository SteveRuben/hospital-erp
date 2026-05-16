# TODOS

Status as of 2026-05-16 EOD. Lanes F, A, B, C, D landed in commits
`6cd956a`, `0f595bc`, `f168901`, `866d8fb`, `a3eed4e`. Backend test suite: 126/126.

## Pre-deployment checklist (do these before pushing to production)

1. **Generate and set `PHI_ENCRYPTION_KEY`** in each environment:
   ```bash
   openssl rand -hex 32
   ```
   Set as a Railway/Render secret. Without it, PHI encryption is passthrough (Lane B is no-op).

2. **Mark the baseline migration as applied** on each existing environment:
   ```bash
   DATABASE_URL=... npx prisma migrate resolve --applied 20260516000000_baseline
   ```
   No schema change — just writes to `_prisma_migrations`. One-time per env.

3. **Backfill encryption on existing rows** (after PHI_ENCRYPTION_KEY is set):
   ```bash
   cd packages/backend && npx tsx scripts/encrypt-patient-phi.ts --dry-run
   cd packages/backend && npx tsx scripts/encrypt-patient-phi.ts
   ```

4. **Set `DB_POOL_MAX=10`** (or your Neon plan limit) — was hardcoded 20 pre-Lane B.

## Remaining engineering work (post-Lane D)

### A — Surface cuts (strategic, per /plan-ceo-review commitment)

**What:** Delete routes and frontend pages for product surfaces with no real customer.

| Cut | Backend | Frontend |
|-----|---------|----------|
| FHIR interop | `routes/fhir.ts`, mount in `index.ts:48,159` | none |
| DICOM viewer | keep `routes/imagerie.ts` (upload), keep `pages/Imagerie.tsx` (list/upload) | `components/DicomViewer.tsx` |
| Remita mobile money | `routes/paiement-remita.ts`, `services/remita.ts`, mount `index.ts:54,165` | `pages/PaiementMobile.tsx` |
| Content packages | `routes/content-packages.ts`, mount `index.ts:53,164` | `pages/ContentPackages.tsx` |
| Cohort builder | (uses listes-patients API, no separate backend) | `pages/CohortBuilder.tsx` |
| Form builder | `routes/formulaires.ts`, schema `Formulaire` + `FormulaireReponse` | `pages/FormBuilder.tsx` |
| Multi-site facilities | `routes/facilities.ts`, `Facility` model, mount `index.ts:52,163` | none mounted |

**Also:**
- `config/init.ts:720` `modules` array — drop `formulaires`, `cohort-builder`, `paiement-mobile`, `content-packages`
- `config/init.ts:754,761,762` `menuItems` — drop the matching rows
- `services/api.ts` — drop client helpers referencing the cut endpoints (search for fetchContentPackages, etc.)
- `App.tsx:42,49,50,51,181,188,189,190` — drop lazy imports + routes

### B — Frontend `?token=` URL fix

**What:** Replace the 9 `window.open(...?token=${localStorage.getItem('token')}...)` calls in `services/api.ts` with `fetch(Authorization: Bearer) → Blob → URL.createObjectURL` pattern.

**Files:** `services/api.ts:186-188` (print), `:200` (downloadTemplate), `:218-220` (export), `:223` (etiquette), `:264` (carte).

**Why:** Backend `authenticate` middleware only reads `Authorization: Bearer`. Today these requests 401 — print/export features are broken. Plus JWTs in URLs is OWASP-discouraged (logs, referrers, history).

### C — Resource-level access control on PUT/DELETE `/:id`

**What:** The `requirePatientAccess` middleware from Lane A only gates GET `/:patientId` and POST routes (where patient_id is in the body). PUT and DELETE on the 9 PHI routes use `:id` (the resource id, e.g. allergieId), which is **not** the patient id. A medecin without attribution can still PUT/DELETE another patient's allergie/note/etc.

**Pattern:**
```ts
// new middleware: requireResourceAccess(modelName, patientIdField)
// loads the row, reads its patient_id, calls canAccessPatient.
router.put('/:id', authenticate, requireResourceAccess('allergie'), handler);
router.delete('/:id', authenticate, requireResourceAccess('allergie'), handler);
```

Apply to PUT/DELETE on: allergies, pathologies, prescriptions, ordonnances, vaccinations, notes, alertes, vitaux, imagerie.

### D — Sécurité & Conformité posture page

**What:**
- Backend: `GET /api/admin/posture` returning encryption status, MFA adoption %, recent audit (last 50), active sessions, failed login attempts in last 24h.
- Frontend: `pages/Securite.tsx` mounted at `/app/securite`, admin-only via `RoleGuard`.

**Why:** Sales asset for hospital directors. Daily ops check. Makes the Month 1 OWASP work visible.

### E — Lane E test scaffolding

**What:**
1. Real supertest harness (`__tests__/_harness.ts`) — seeded test DB + login helper minting JWTs.
2. Replace `__tests__/auth.test.ts` placeholder `expect(true).toBe(true)` blocks with real supertest assertions.
3. Replace `__tests__/patients.test.ts` placeholders.
4. New: per-route happy/sad/auth tests for the 9 PHI routes (proves the IDOR middleware works in the real request pipeline, not just unit-mock).
5. New: `facturation` transactional create test.
6. New: `patient-merge` rollback test (after wrapping merge in `$transaction` — separate work).
7. Install Vitest + RTL in `packages/frontend`. Smoke test `Login.tsx` and `PatientForm.tsx`.
8. Replace `e2e/screenshots.spec.ts` with behavioral E2E: login → MFA → patient create → consultation → ordonnance → facture → paiement.

### F — Init.ts → prisma seed (full pg.Pool retirement)

**What:**
1. Audit baseline migration against `init.ts` DDL to confirm 100% coverage. Note any drift.
2. Extract `init.ts` seed inserts (default admin, habilitations, menu_config, encounter_types, starter_concepts, settings, services, pavillons, reference_lists) → `prisma/seed.ts`.
3. Wire `prisma db seed` into the boot script. Replace boot-time `initDB()` call with `prisma migrate deploy && prisma db seed` (or skip seed in production after initial run).
4. Delete the DDL block from `init.ts`. Delete `config/reset-db.ts` (use `npx prisma migrate reset` instead).
5. Delete `pool`, `query`, `getClient` exports from `config/db.ts`. Delete `import pg`, `Pool` instantiation.

### G — pg_trgm GIN indexes

**What:** New Prisma migration enabling the `pg_trgm` extension + creating GIN trigram indexes:
```sql
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX IF NOT EXISTS idx_patients_nom_trgm ON patients USING gin (nom gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_patients_prenom_trgm ON patients USING gin (prenom gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_patients_telephone_trgm ON patients USING gin (telephone gin_trgm_ops);
-- email + numero_identite skip: numero_identite is encrypted post-Lane B (trigram match would be useless)
```

**Why:** Quick search uses `{ contains: s, mode: 'insensitive' }` — B-tree can't help with `%X%`. At 10K+ patients this becomes a sequential scan per request.

**Depends on:** Lane B baseline migration applied first.

### H — asyncHandler migration (remaining 31 files)

**What:** Convert hand-rolled try/catch to `asyncHandler(async (req, res) => { ... })` on the 31 remaining route files. Pattern established in `medecins.ts`, `services.ts`, `dashboard.ts`, `notifications.ts`, `print.ts`, and the 9 PHI routes.

**Files remaining (alphabetical):**
auth, concepts, consultations, content-packages*, encounters, export, facilities*, facturation, fhir*, file-attente, finances, formulaires*, habilitations, import, laboratoire, listes-patients, lits, orders, paiement-remita*, patient-merge, patients, planning, portail, prescriptions, programmes, reference-lists, rendezvous, reports, settings, visites, pharmacie.

(* will be deleted by surface cuts above — skip those when they're gone)

**Sequencing:** Small batches (4-6 files per commit) + `npm test` + `npx tsc --noEmit` after each batch.

### I — Audit-log hash chain (tamper detection)

**What:** Add a `hash` column to `audit_log`. On insert, compute `sha256(row.id || row.user_id || row.action || row.table_name || row.record_id || row.details || row.created_at || previousRow.hash)`. Plus a `verify-audit-log.ts` script that walks the chain and reports any tampered row.

**Why:** `audit_log` has a WORM trigger preventing UPDATE/DELETE, but rows can be INSERTed by anyone with DB access. For HDS/RGPD-grade audit trails, the chain proves the log hasn't been edited.

**Sequencing:** Schema migration (add column), insert hook (Prisma middleware or trigger), backfill script for existing rows (chain the existing history), verifier script.

### J — Documentation update

**What:** Update `docs/PSSI_POLITIQUE_SECURITE.md`, `docs/RGPD_REGISTRE_TRAITEMENTS.md`, and the in-app Documentation page to reflect the actual OWASP controls now in place. The docs were aspirational; post-Lane-A-through-D they can be made factual.

**Specifically:** mention IDOR middleware, PHI encryption, audit logging including access_denied, magic-byte upload validation, npm audit CI gate.
