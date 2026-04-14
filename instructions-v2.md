# INSTRUCTIONS V2 — Migration Prisma + Nouvelles fonctionnalités

## ÉTAT ACTUEL
- Monorepo TypeScript (packages/backend + packages/frontend)
- Backend: Express + pg (SQL brut) + PostgreSQL Neon
- Frontend: React + Vite + design Carbon/OpenMRS
- 30+ tables, 25+ routes API, 20+ pages frontend
- Déployé sur Railway (service unique backend sert le frontend)

---

## TÂCHE 1 : MIGRATION VERS PRISMA

### 1.1 Installation
```bash
cd packages/backend
npm install prisma @prisma/client
npx prisma init
```

### 1.2 Créer le schéma Prisma
Fichier `packages/backend/prisma/schema.prisma` — reprendre toutes les tables existantes de `init.ts`.

Points clés :
- Utiliser `@id @default(autoincrement())` pour les IDs
- Définir toutes les relations (Patient hasMany Consultations, etc.)
- Utiliser des enums pour les statuts et rôles
- Ajouter `@@map("nom_table")` pour garder les noms de tables existants

### 1.3 Générer la première migration
```bash
npx prisma db pull  # introspect existing DB
npx prisma migrate dev --name init
npx prisma generate
```

### 1.4 Refactorer les routes
Remplacer `import { query } from '../config/db.js'` par `import { PrismaClient } from '@prisma/client'`.
Chaque route passe de SQL brut à Prisma Client.

Exemple avant:
```typescript
const result = await query('SELECT * FROM patients WHERE archived = $1', [false]);
```

Exemple après:
```typescript
const patients = await prisma.patient.findMany({ where: { archived: false } });
```

### 1.5 Supprimer les anciens fichiers
- `src/config/db.ts` → remplacé par Prisma Client
- `src/config/init.ts` → remplacé par migrations Prisma
- `src/config/reset-db.ts` → remplacé par `npx prisma migrate reset`

---

## TÂCHE 2 : RÉFÉRENCE SUR 4 POSITIONS

### Format
`CONS-XXXX` pour consultations, `FAC-XXXX` pour factures, `PAT-XXXX` pour patients, etc.

### Implémentation
Ajouter un champ `reference VARCHAR(20) UNIQUE` sur les tables :
- `consultations` → `CONS-0001`, `CONS-0002`...
- `examens` → `EXAM-0001`
- `rendez_vous` → `RDV-0001`
- `hospitalisations` → `HOSP-0001`
- `ordonnances` → `ORD-0001`
- `prescriptions` → `PRESC-0001`

Générer automatiquement à la création :
```typescript
const count = await prisma.consultation.count();
const reference = `CONS-${String(count + 1).padStart(4, '0')}`;
```

Afficher la référence dans les tables et les détails.

---

## TÂCHE 3 : CHANGEMENT DE MOT DE PASSE OBLIGATOIRE

### Backend
Ajouter un champ `must_change_password BOOLEAN DEFAULT TRUE` à la table `users`.

Route `PUT /api/auth/change-password` :
- Vérifie l'ancien mot de passe
- Valide le nouveau (politique OWASP)
- Met `must_change_password = false`

Modifier la route `POST /api/auth/login` :
- Retourner `must_change_password` dans la réponse

### Frontend
Après login, si `must_change_password === true` :
- Rediriger vers `/app/change-password`
- Page avec formulaire : ancien mot de passe, nouveau, confirmation
- Bloquer l'accès aux autres pages tant que non changé

---

## TÂCHE 4 : RECHERCHE PATIENT GLOBALE + AVANCÉE

### 4.1 Recherche globale (header)
Le champ de recherche dans le header doit être fonctionnel.

Backend `GET /api/patients/search?q=xxx` :
- Recherche sur : nom, prénom, téléphone, email, numéro identité, ID, ville
- Retourne max 10 résultats
- Recherche insensible à la casse et aux accents

Frontend :
- Input dans le header avec debounce 300ms
- Dropdown de résultats sous le champ
- Clic sur un résultat → `/app/patients/:id`
- Touche Entrée → page de recherche avancée

### 4.2 Recherche avancée
Nouvelle page `/app/recherche` avec filtres :
- Nom / Prénom
- Numéro de téléphone
- Ville
- Âge (min/max)
- Sexe
- Médecin traitant
- Numéro de billet (référence consultation)
- Contact d'urgence (nom/téléphone)
- Date d'inscription (période)

Backend `GET /api/patients/advanced-search` avec tous les filtres en query params.

---

## TÂCHE 5 : PAGINATION CÔTÉ SERVEUR

### Backend
Toutes les routes GET qui retournent des listes doivent supporter :
- `?page=1&limit=20` (défaut: page 1, 20 items)
- Retourner : `{ data: [...], total: 150, page: 1, limit: 20, totalPages: 8 }`

Routes à paginer :
- `/api/patients`
- `/api/consultations`
- `/api/finances/recettes`
- `/api/finances/depenses`
- `/api/facturation/factures`
- `/api/laboratoire`
- `/api/rendezvous`
- `/api/file-attente`
- `/api/lits/hospitalisations`

### Frontend
Composant `Pagination.tsx` réutilisable :
- Affiche : "Page 1 sur 8 — 150 résultats"
- Boutons : Précédent, numéros de pages, Suivant
- Design Carbon (style OpenMRS)

Intégrer dans toutes les pages avec tables.

---

## TÂCHE 6 : PAIEMENT MOBILE (VISUEL)

### Pages frontend
Créer `/app/paiement-mobile` avec :

**Onglet Orange Money :**
- Formulaire : numéro de téléphone, montant, référence facture
- Bouton "Payer via Orange Money"
- Simulation du flow : envoi → en attente → confirmé
- Afficher un QR code fictif
- Message : "Intégration API en cours — simulation uniquement"

**Onglet MTN Mobile Money :**
- Même formulaire
- Même simulation
- Logo MTN MoMo

**Configuration (pour l'intégration future) :**
Variables d'env prévues :
```
ORANGE_MONEY_API_URL=
ORANGE_MONEY_API_KEY=
ORANGE_MONEY_MERCHANT_ID=
MTN_MOMO_API_URL=
MTN_MOMO_API_KEY=
MTN_MOMO_SUBSCRIPTION_KEY=
```

Backend route `POST /api/paiements/mobile` :
- Pour l'instant, simule le paiement (statut "simulé")
- Crée un paiement dans la table `paiements` avec mode "mobile_money"
- Log dans `notifications_log`

---

## TÂCHE 7 : IMPRESSION D'ÉTIQUETTES PATIENT

### Backend
Route `GET /api/print/etiquette/:patientId` :
- Retourne du HTML optimisé pour impression d'étiquettes
- Format : 89mm x 36mm (standard étiquette)
- Contenu : Nom, Prénom, ID, Date naissance, Sexe, Téléphone, QR code (data URI)

### Frontend
Bouton "Imprimer étiquette" dans :
- Page Patients (action par patient)
- Page PatientDetail (header)

Ouvre un nouvel onglet avec le HTML d'étiquette, prêt à imprimer.

---

## TÂCHE 8 : EXPORT EXCEL

### Backend
Installer `exceljs` :
```bash
npm install exceljs
```

Routes :
- `GET /api/export/recettes?debut=2026-01-01&fin=2026-12-31` → Excel des recettes
- `GET /api/export/depenses?debut=...&fin=...` → Excel des dépenses
- `GET /api/export/bilan?annee=2026&mois=4` → Excel du bilan mensuel
- `GET /api/export/patients` → Excel de tous les patients

Chaque export :
- En-têtes en gras, colonnes auto-dimensionnées
- Ligne de total en bas pour les montants
- Nom du fichier : `recettes_2026-04.xlsx`

### Frontend
Boutons "Exporter Excel" dans :
- Page Finances (chaque onglet)
- Page Patients (toolbar)
- Page Facturation

---

## TÂCHE 9 : PORTAIL PATIENT (RDV EN LIGNE)

### Architecture
Nouvelle app frontend légère (ou section publique de l'app existante) accessible sans login.

### Pages publiques
`/portail` — page d'accueil du portail patient
`/portail/rdv` — prise de rendez-vous

### Flow
1. Patient entre son numéro de téléphone ou email
2. Reçoit un code OTP par SMS/email
3. Vérifie le code
4. Voit ses prochains RDV
5. Peut prendre un nouveau RDV :
   - Choisir un service
   - Choisir un médecin (optionnel)
   - Choisir une date/heure parmi les créneaux disponibles
   - Confirmer

### Backend
- `POST /api/portail/request-otp` — envoie OTP
- `POST /api/portail/verify-otp` — vérifie OTP, retourne token patient
- `GET /api/portail/mes-rdv` — RDV du patient (auth par token patient)
- `GET /api/portail/creneaux?service_id=X&date=2026-04-15` — créneaux disponibles
- `POST /api/portail/rdv` — créer un RDV

Table `patient_tokens` pour les sessions portail (séparées des sessions staff).

---

## TÂCHE 10 : IMAGERIE MÉDICALE (DICOM VIEWER)

### Approche
Intégrer un viewer DICOM open source (Cornerstone.js ou OHIF Viewer) en iframe ou composant React.

### Backend
Table `imagerie` :
```sql
CREATE TABLE imagerie (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER REFERENCES patients(id),
  type_examen VARCHAR(100), -- IRM, Scanner, Radio, Echo
  description TEXT,
  fichier_url TEXT, -- URL du fichier DICOM ou image
  date_examen DATE DEFAULT CURRENT_DATE,
  medecin_id INTEGER REFERENCES medecins(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

Routes :
- `GET /api/imagerie/:patientId` — liste des examens d'imagerie
- `POST /api/imagerie` — upload d'image (multer)
- `GET /api/imagerie/view/:id` — retourne le fichier

### Frontend
Page `/app/imagerie` :
- Liste des examens d'imagerie par patient
- Upload de fichiers (DICOM, JPEG, PNG)
- Viewer intégré (Cornerstone.js pour DICOM, img pour JPEG/PNG)
- Onglet dans PatientDetail

---

## TÂCHE 11 : TESTS

### Tests unitaires (Jest)
Fichier `packages/backend/src/__tests__/` :
- `auth.test.ts` — login, création user, password policy
- `patients.test.ts` — CRUD patients, recherche, archivage
- `finances.test.ts` — recettes, dépenses, caisse
- `facturation.test.ts` — tarifs, factures, paiements

### Tests E2E (Playwright)
Fichier `e2e/` :
- `login.spec.ts` — login, session timeout, changement mot de passe
- `patient-flow.spec.ts` — créer patient → consultation → examen → paiement
- `facturation.spec.ts` — créer tarif → facture → paiement

---

## ORDRE D'EXÉCUTION RECOMMANDÉ

1. **Tâche 1** — Migration Prisma (fondation pour tout le reste)
2. **Tâche 3** — Changement mot de passe (sécurité)
3. **Tâche 2** — Références 4 positions
4. **Tâche 4** — Recherche globale + avancée
5. **Tâche 5** — Pagination serveur
6. **Tâche 8** — Export Excel
7. **Tâche 7** — Étiquettes patient
8. **Tâche 6** — Paiement mobile (visuel)
9. **Tâche 9** — Portail patient
10. **Tâche 10** — Imagerie DICOM
11. **Tâche 11** — Tests