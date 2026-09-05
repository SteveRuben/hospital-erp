# Plan: Remove Modals + Full Cashier Integration

## Goal
1. Replace all modals/popups with route pages or inline components + snackbar for feedback
2. Every payment-requiring workflow creates financial records visible in the cashier

---

## Phase 1: Replace all `alert()` and native `confirm()` (quick wins)

### 1A. Replace 43 `alert()` calls with `showSnackbar()` (16 files)

| File | alert() calls | Action |
|------|--------------|--------|
| `Concepts.tsx` | 2 | → `showSnackbar(msg, 'error')` |
| `Facturation.tsx` | 4 | → `showSnackbar(msg, 'error')` |
| `FileAttente.tsx` | 2 | → `showSnackbar(msg, 'error')` |
| `Finances.tsx` | 2 | → `showSnackbar(msg, 'error')` |
| `Habilitations.tsx` | 4 | → `showSnackbar(msg, 'error')` |
| `Imagerie.tsx` | 2 | → `showSnackbar(msg, 'error')` |
| `Lits.tsx` | 3 | → `showSnackbar(msg, 'error')` |
| `ListesPatients.tsx` | 4 | → `showSnackbar(msg, 'error')` |
| `Orders.tsx` | 2 | → `showSnackbar(msg, 'error')` |
| `PatientDetail.tsx` | 4 | → `showSnackbar(msg, 'error')` |
| `PatientMerge.tsx` | 2 | → `showSnackbar(msg, 'success'/'error')` |
| `Programmes.tsx` | 2 | → `showSnackbar(msg, 'error')` |
| `RendezVous.tsx` | 5 | → `showSnackbar(msg, 'warning'/'error')` |
| `Visites.tsx` | 2 | → `showSnackbar(msg, 'error')` |
| `PrintButton.tsx` | 2 | → `showSnackbar(msg, 'warning')` |

Each file needs `import { useSnackbar } from '../components/Snackbar';` and `const { showSnackbar } = useSnackbar();` if not already present.

### 1B. Replace 12 native `confirm()` calls with `useConfirm()` (8 files)

| File | confirm() calls | Action |
|------|----------------|--------|
| `ExamenFichiers.tsx` | 1 | Add `useConfirm`, replace `confirm('...')` → `await confirm({ message: '...', variant: 'danger' })` |
| `Chat.tsx` | 1 | Same pattern |
| `Finances.tsx` | 2 | Same pattern |
| `Laboratoire.tsx` | 1 | Same pattern |
| `ListesPatients.tsx` | 1 | Same pattern |
| `PatientMerge.tsx` | 1 | Same pattern |
| `Programmes.tsx` | 1 | Same pattern |
| `RendezVous.tsx` | 1 | Same pattern |

---

## Phase 2: Modal → Route Pages

**Existing pattern**: `/entity` (list), `/entity/nouveau` (create), `/entity/:id/modifier` (edit), `/entity/:id` (detail)

### New pages to create (6 new page components):

| # | Current Modal in | New Route Page | File to Create |
|---|-----------------|----------------|----------------|
| 1 | `Utilisateurs.tsx` create/edit | `/utilisateurs/nouveau`, `/utilisateurs/:id/modifier` | `UtilisateurForm.tsx` |
| 2 | `Facilities.tsx` create/edit/detail | `/etablissements/nouveau`, `/etablissements/:id`, `/etablissements/:id/modifier` | Already `Facilities.tsx` — refactor to list-only, add `FacilityForm.tsx` + `FacilityDetail.tsx` |
| 3 | `Pharmacie.tsx` create/edit/detail med | `/pharmacie/nouveau`, `/pharmacie/:id`, `/pharmacie/:id/modifier` | `PharmacieMedicamentForm.tsx` |
| 4 | `Facturation.tsx` create tarif/facture | `/facturation/tarifs/nouveau`, `/facturation/factures/nouvelle` | `TarifForm.tsx`, `FactureForm.tsx` |
| 5 | `Assurances.tsx` create/edit | `/assurances/nouvelle`, `/assurances/:id/modifier` | `AssuranceForm.tsx` |
| 6 | `RendezVous.tsx` create | `/rendezvous/nouveau` | `RendezVousForm.tsx` |

### Modals to keep inline (quick-add, context-bound):

These are lightweight forms tightly bound to a parent context. Converting to routes would lose context.

| Page | Modals to Keep Inline | Reason |
|------|----------------------|--------|
| `PatientDetail.tsx` | vitaux, allergies, pathologies, prescriptions, vaccinations, notes, alertes | Context-bound to patient |
| `Lits.tsx` | pavillon, lit create | Simple 2-field forms |
| `FileAttente.tsx` | add patient to queue | Quick action |
| `Visites.tsx` | start visit | Quick action |
| `Orders.tsx` | create order | Quick action |
| `Imagerie.tsx` | upload, viewer | Transactional |
| `Chat.tsx` | new channel | Quick action |
| `ListesPatients.tsx` | create list, add patient | Quick action |
| `Programmes.tsx` | create, enroll patient | Quick action |
| `Pharmacie.tsx` | stock entry, stock movement | Transactional |
| `Concepts.tsx` | create concept | Simple form |
| `Finances.tsx` | new recette/depense | Simple form |
| `Facturation.tsx` | record paiement | Transactional |

### Pages to refactor (remove modals, extract to routes):

**`Utilisateurs.tsx`** → Remove create/edit modals, keep list page with "Nouvel utilisateur" button that navigates to `/utilisateurs/nouveau`. Detail view (activity log) → route `/utilisateurs/:id/activite`.

**`Facilities.tsx`** → Remove create/edit/detail modals. List page links to routes.

**`Pharmacie.tsx`** → Remove create/edit/detail medicament modals. Keep stock/movement modals inline. List page links to routes.

**`Facturation.tsx`** → Remove create tarif/facture modals. Keep paiement modal inline (transactional). Extract tariff and invoice creation to routes.

**`Assurances.tsx`** → Remove create/edit insurance modals. Keep PEC status change inline (lightweight).

**`RendezVous.tsx`** → Remove create modal. Button navigates to `/rendezvous/nouveau`.

### Route additions to `App.tsx`:

```tsx
// Utilisateurs
<Route path="/utilisateurs/nouveau" element={<RoleGuard roles={['admin','super_admin']}><UtilisateurForm /></RoleGuard>} />
<Route path="/utilisateurs/:id/modifier" element={<RoleGuard roles={['admin','super_admin']}><UtilisateurForm /></RoleGuard>} />

// Etablissements (rename /facilities)
<Route path="/etablissements" element={<RoleGuard roles={['super_admin']}><Facilities /></RoleGuard>} />
<Route path="/etablissements/nouveau" element={<RoleGuard roles={['super_admin']}><FacilityForm /></RoleGuard>} />
<Route path="/etablissements/:id" element={<RoleGuard roles={['super_admin']}><FacilityDetail /></RoleGuard>} />
<Route path="/etablissements/:id/modifier" element={<RoleGuard roles={['super_admin']}><FacilityForm /></RoleGuard>} />

// Pharmacie medicaments
<Route path="/pharmacie/nouveau" element={<RoleGuard roles={['admin','pharmacien']}><PharmacieMedicamentForm /></RoleGuard>} />
<Route path="/pharmacie/:id" element={<RoleGuard roles={['admin','pharmacien']}><PharmacieMedicamentDetail /></RoleGuard>} />
<Route path="/pharmacie/:id/modifier" element={<RoleGuard roles={['admin','pharmacien']}><PharmacieMedicamentForm /></RoleGuard>} />

// Facturation
<Route path="/facturation/tarifs/nouveau" element={<RoleGuard roles={['admin','comptable']}><TarifForm /></RoleGuard>} />
<Route path="/facturation/tarifs/:id/modifier" element={<RoleGuard roles={['admin','comptable']}><TarifForm /></RoleGuard>} />
<Route path="/facturation/factures/nouvelle" element={<RoleGuard roles={['admin','comptable']}><FactureForm /></RoleGuard>} />

// Assurances
<Route path="/assurances/nouvelle" element={<RoleGuard roles={['admin','comptable']}><AssuranceForm /></RoleGuard>} />
<Route path="/assurances/:id/modifier" element={<RoleGuard roles={['admin','comptable']}><AssuranceForm /></RoleGuard>} />

// Rendez-vous
<Route path="/rendezvous/nouveau" element={<RoleGuard roles={['admin','medecin','reception']}><RendezVousForm /></RoleGuard>} />
```

---

## Phase 3: Full Cashier Integration

### Current State (broken)

```
System A: Simple Ledger (Finances page)
  recettes ← manual + billConsultation + marquer-paye
  depenses ← manual only

System B: Invoicing (Facturation page)
  factures → paiements (NO recettes bridge)

System C: PaymentModal
  payment_intents → confirm → examen.paye (NO recette)

System D: Insurance
  prises_en_charge (NO financial record)
```

### Target State (unified)

```
ALL payment workflows → create recettes
  + facture paiements → also create recettes
  → Dashboard, Caisse, Bilan see EVERYTHING
```

### 3A. Pharmacy Sales → Recette

**File**: `packages/backend/src/routes/pharmacie.ts` (line ~360-439, `POST /vente`)
**Action**: After stock mouvement creation, call `recordActeRevenue` with `kind: 'pharmacie'`
**Amount**: Sum of `prix_unitaire * quantite` for all items sold
**Also**: Add `facilityId` from scope

### 3B. PaymentModal Confirmation → Recette

**File**: `packages/backend/src/routes/payments.ts` (line ~173-185, `POST /payments/confirm/:reference`)
**Action**: When confirming examen payment, call `recordActeRevenue` with `kind: 'examen'`
**Amount**: `examen.montant`
**Note**: `marquer-paye` already does this — PaymentModal confirm must do the same

### 3C. Facture Paiements → Recette Bridge

**File**: `packages/backend/src/routes/facturation.ts` (line ~174-210, `POST /paiements`)
**Action**: After creating the `paiements` row, also create a `recette` via `recordActeRevenue`
**Amount**: `montant` from the paiement
**Idempotency**: Use `sourceKind: 'paiement', sourceId: paiement.id`

### 3D. Hospitalisation → Recette

**File**: `packages/backend/src/services/billing.ts` — implement `billHospitalisation()`
**File**: `packages/backend/src/routes/lits.ts` — trigger on discharge (`POST /:id/sortie`)
**Amount**: `service.prix * number_of_nights` (or flat tarif)
**Source**: `kind: 'hospitalisation'`

### 3E. Dispensation (Prescription Fulfillment) → Recette

**File**: `packages/backend/src/routes/pharmacie.ts` (dispensation endpoint)
**Action**: When medications are dispensed, create a recette for the total
**Amount**: Sum of `prix_unitaire * quantite` for dispensed medications
**Source**: `kind: 'dispensation'`

### 3F. Imagerie → Recette

**File**: `packages/backend/src/routes/imagerie.ts` (POST create)
**Action**: Add `montant` field to imagerie schema, create recette on completion
**Amount**: From catalogue tarif or manual entry
**Source**: `kind: 'imagerie'`

### 3G. Vaccination → Recette

**File**: `packages/backend/src/routes/vaccinations.ts` (POST create)
**Action**: Create recette when vaccination is recorded
**Amount**: From service tarif
**Source**: `kind: 'vaccination'`

### 3H. Update billing.ts

Add new `ActeKind` values:
```typescript
type ActeKind = 'consultation' | 'examen' | 'hospitalisation' | 'pharmacie' | 'dispensation' | 'imagerie' | 'vaccination' | 'paiement';
```

Add `billPharmacie()`, `billDispensation()`, `billImagerie()`, `billVaccination()`, `billHospitalisation()` functions.

### 3I. Update Finances/Facturation UI

**`Finances.tsx`**: The Caisse summary and Bilan already aggregate from `recettes` — once all workflows create recettes, they'll automatically appear.

**`Facturation.tsx` Caisse tab**: Currently only shows examens with `a_payer` status. Should also show:
- Pharmacy sales pending payment
- Hospitalisation pending discharge
- Imagerie exams pending payment
- Vaccinations pending payment

This requires adding a unified "pending payments" query that unions across all payment-requiring entities.

### 3J. Facility-scoping for new recettes

All new `recordActeRevenue` calls must pass `facilityId` from the scope middleware so the cashier works correctly in multi-hospital mode.

---

## Execution Order

| Step | Description | Files Changed | Est. Complexity |
|------|------------|---------------|-----------------|
| 1 | Replace alert() → showSnackbar | 16 frontend files | Low (mechanical) |
| 2 | Replace native confirm() → useConfirm | 8 frontend files | Low (mechanical) |
| 3 | Create UtilisateurForm.tsx | 1 new + 2 edited | Medium |
| 4 | Create FacilityForm.tsx + FacilityDetail.tsx | 2 new + 2 edited | Medium |
| 5 | Create PharmacieMedicamentForm.tsx | 1 new + 1 edited | Medium |
| 6 | Create TarifForm.tsx + FactureForm.tsx | 2 new + 1 edited | Medium |
| 7 | Create AssuranceForm.tsx | 1 new + 1 edited | Medium |
| 8 | Create RendezVousForm.tsx | 1 new + 1 edited | Medium |
| 9 | Add routes to App.tsx | 1 edited | Low |
| 10 | billing.ts: add new ActeKind + bill functions | 1 edited | Medium |
| 11 | pharmacie.ts: vente → recette | 1 edited | Low |
| 12 | payments.ts: confirm → recette | 1 edited | Low |
| 13 | facturation.ts: paiement → recette bridge | 1 edited | Low |
| 14 | lits.ts: hospitalisation → recette on discharge | 1 edited | Medium |
| 15 | pharmacie.ts: dispensation → recette | 1 edited | Medium |
| 16 | imagerie.ts: montant + recette | 2 edited | Medium |
| 17 | vaccinations.ts: recette | 1 edited | Low |
| 18 | Facturation Caisse tab: unified pending payments | 1 edited | High |
| 19 | Update permissions.ts menu labels | 1 edited | Low |
| 20 | Regenerate Prisma if schema changes needed | - | Low |
