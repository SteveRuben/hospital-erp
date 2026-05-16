# TODOS

Tracked follow-ups from the 2026-05-16 review pass (`/plan-eng-review` + `/plan-ceo-review`
+ OWASP-framed eng review). Items below were explicitly accepted but deferred from the
initial 2-day implementation window (Lane F + A + B + C-partial + D-partial).

## Lane C — asyncHandler migration (remaining)

**What:** Convert the remaining 31 route files from hand-rolled `try { ... } catch (err) { res.status(500)... }`
to the `asyncHandler` wrapper. Errors flow to the global `errorHandler` middleware in
`packages/backend/src/middleware/security.ts:100` instead of duplicating 186 generic 500-JSON
responses across the codebase.

**Why:** DRY — 186 instances of identical boilerplate collapse to ~0 (matches the project's
DRY-aggressive preference). Also fixes 12 silent `catch { /* ignore */ }` blocks that
currently hide partial failures.

**Pattern (already established in `medecins.ts`, `services.ts`, `dashboard.ts`, `print.ts`,
`notifications.ts`, and the 9 PHI routes from Lane A):**
```ts
// before
router.get('/x', mw, async (req, res) => {
  try { ... } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});
// after
router.get('/x', mw, asyncHandler(async (req, res) => {
  ...
}));
```

**Remaining files (31):**
auth, concepts, consultations, content-packages, encounters, export, facilities, facturation,
fhir, file-attente, finances, formulaires, habilitations, import, laboratoire, listes-patients,
lits, orders, paiement-remita, patient-merge, patients, planning, portail, prescriptions,
programmes, reference-lists, rendezvous, reports, settings, visites, pharmacie.

**Sequencing:** Best done in small batches (4–6 files per commit) so a single bad refactor
is easy to revert. Always re-run `npm test` and `npx tsc --noEmit` after each batch.

## Lane B finish — retire pg.Pool entirely

**What:** Replace `config/init.ts` (1087 lines of CREATE TABLE IF NOT EXISTS + ALTER TABLE
IF NOT EXISTS + seed inserts) with:
1. `prisma migrate deploy` for DDL (the baseline migration already exists at
   `prisma/migrations/20260516000000_baseline/migration.sql`)
2. A new `prisma/seed.ts` that holds only the inserts (default admin user, habilitations,
   menu config, reference lists, starter concepts)

Then delete `pool`, `query`, `getClient` from `config/db.ts` and `config/reset-db.ts`.

**Why:** Schema becomes versioned and reviewable. Single connection pool (drops the
~20 extra pg.Pool connections against Neon). No more boot-time DDL surprises.

**Sequencing:**
1. Run `npx prisma migrate resolve --applied 20260516000000_baseline` on each existing
   environment (writes to `_prisma_migrations` only, no schema change).
2. Extract `init.ts` DDL block → confirm baseline migration covers everything.
3. Extract `init.ts` seed inserts → `prisma/seed.ts`.
4. Delete the DDL block from `init.ts`. Wire `prisma db seed` into the boot script.
5. Delete `pool` / `query` / `getClient` from `config/db.ts`. Delete `config/reset-db.ts`
   (use `prisma migrate reset` instead).

## Lane D — performance + A08 file uploads (remaining)

**What:**
- **pharmacie.ts `/vente`**: wrap the loop body in `prisma.$transaction`. Currently makes
  3-4 sequential DB round-trips per cart item and partial failures leave stock decremented
  without a movement log entry. Cash-register integrity hazard.
- **pharmacie.ts `/import`**: drop the dead `prisma.medicament.upsert({ where: { id: -1 }})`
  call (always throws) and batch the raw INSERTs via `prisma.medicament.createMany({ skipDuplicates: true })`.
- **patients.ts `/historique`**: add `take: 100` default to each of the 4 child queries
  (consultations, examens, recettes, documents); add `?page=` support for pagination.
- **reports.ts**: add LIMIT/pagination to `consultations-medecin`, `recettes-service`,
  `recettes-mensuelles`, `depenses-mensuelles`. `top-diagnostics` already has LIMIT 10.
- **habilitations.ts `/menu-order`**: wrap the N sequential `prisma.menuConfig.update`
  calls in `prisma.$transaction([...])`.
- **pg_trgm GIN indexes** on `patients(nom, prenom, telephone, email, numero_identite)`
  for the quick-search `contains: { mode: 'insensitive' }` filter. Requires a Prisma
  migration; depends on Lane B baseline being applied first.
- **Magic-byte file validation middleware**: create `middleware/upload-validation.ts`
  using the `file-type` npm package (~30KB). Apply to `imagerie.ts`, `import.ts`,
  `pharmacie.ts` (CSV import), `reference-lists.ts` (CSV import). Rejects polyglots
  and content-type mismatches (the current multer fileFilters check extension only).

## Lane E — test scaffolding + full coverage push

**What:**
- Set up a supertest harness with a seeded test DB (or testcontainers-postgres) and
  a `beforeAll` login helper that mints a real JWT.
- Replace `__tests__/auth.test.ts` and `__tests__/patients.test.ts` placeholder
  `expect(true).toBe(true)` blocks with real supertest assertions.
- Add per-route happy/sad/auth tests for all 44 routes.
- Add a `facturation` transactional test asserting rollback on failure.
- Add a `patient-merge` transaction rollback test (after Lane D's `$transaction` fix).
- Install Vitest + React Testing Library in `packages/frontend`, smoke-test `Login.tsx`
  + `PatientForm.tsx`.
- Replace `e2e/screenshots.spec.ts` screenshot-only suite with behavioral E2E:
  login → MFA → patient create → consultation → ordonnance → facture → paiement.

## Sécurité & Conformité posture page (UI)

**What:** Customer-facing admin UI page at `/app/securite` showing:
- Encryption status (`isEncryptionEnabled()` from `services/encryption.ts`)
- MFA adoption rate across users (% of users with `mfa_enabled = true`)
- Recent audit_log entries (last 50 of `action: 'access_denied' | 'login' | ...`)
- Active sessions count (Redis `KEYS sess:*` or memSessions size)
- Failed login attempts in the last 24h (audit_log `action: 'login'` with details
  containing "Failed")

**Why:** Sales asset. Daily ops check. Makes OWASP controls visible to the hospital
director who is the buyer. Maps the strategic positioning ("Sécurité par défaut")
agreed in the 2026-05-16 CEO review.

**Where:** New page `packages/frontend/src/pages/Securite.tsx`, route at
`/app/securite` gated by `RoleGuard roles=['admin']`. New backend endpoint
`GET /api/admin/posture` returning the above as JSON.

## OWASP residual gaps

**Resource-level access control on PUT/DELETE `/:id` routes** — the `requirePatientAccess`
middleware from Lane A deliberately does NOT read `params.id` (which is the resource id,
not the patient id). PUT /allergies/:id and similar still don't enforce per-patient access
on the underlying allergie row. Fix pattern: load the row, look up its `patient_id`, then
call `canAccessPatient`. Apply to PUT/DELETE on all 9 PHI routes.

**Audit-log integrity signing** — `audit_log` has a WORM trigger preventing UPDATE/DELETE,
but rows can still be INSERTed by anyone with DB access. For HDS/RGPD-grade audit:
hash-chain each row (`row.hash = sha256(row.id || row.action || row.user_id || row.details
|| previousRow.hash)`) so tampering is detectable.

**CSV export auth contract** — `routes/export.ts` and `routes/print.ts` are no longer
called with `?token=` from the frontend (Lane F fixed the bug indirectly by reverting,
but the frontend still uses `window.open(...?token=...)`). Replace those calls in
`packages/frontend/src/services/api.ts` with `fetch(Authorization: Bearer) + Blob +
URL.createObjectURL` pattern. Frontend-only change, ~9 functions.

## Strategy / product

**Surface-area triage execution** — the 2026-05-16 CEO review committed to cutting
`/fhir`, DICOM viewer, `/paiement-remita`, `/content-packages`, `/cohort-builder`,
`/formulaires`, multi-site `/facilities`. Each cut is its own commit (`git rm` the
route file, remove the mount from `index.ts`, remove the frontend page, remove the
menu_config row from `init.ts`/seed).

**First-customer onboarding playbook** — Month 4 task. Captures: SSO integration
requirements, on-prem deploy doc, IP allowlist support, customer-specific Itération 2
selection process.
