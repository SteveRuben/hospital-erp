# INSTRUCTIONS - Migration Hospital ERP vers design OpenMRS + Workflows cliniques

## CONTEXTE

Ce projet est un ERP hospitalier (monorepo TypeScript). Le backend est complet dans `packages/backend/`.
Le frontend dans `packages/frontend/` est partiellement fait. Il faut :

1. Compléter les fichiers manquants
2. Migrer le design vers un style inspiré d'OpenMRS (Carbon Design System)
3. Ajouter les workflows du cycle de vie patient

## ÉTAT ACTUEL DU PROJET

### Backend (COMPLET - ne pas toucher sauf pour les nouvelles routes)
```
packages/backend/src/
├── config/db.ts, init.ts
├── middleware/auth.ts
├── routes/auth.ts, patients.ts, medecins.ts, services.ts, consultations.ts, finances.ts, laboratoire.ts, dashboard.ts
├── types/index.ts
└── index.ts
```

### Frontend (À COMPLÉTER)
```
packages/frontend/src/
├── components/Layout.tsx  ✅ (à refaire avec design OpenMRS)
├── pages/
│   ├── Login.tsx          ✅ (à refaire avec design OpenMRS)
│   ├── Dashboard.tsx      ✅ (à refaire avec design OpenMRS)
│   ├── Patients.tsx       ✅ (à refaire avec design OpenMRS)
│   ├── Medecins.tsx       ✅ (à refaire avec design OpenMRS)
│   ├── Services.tsx       ✅ (à refaire avec design OpenMRS)
│   ├── Consultations.tsx  ✅ (à refaire avec design OpenMRS)
│   ├── Finances.tsx       ❌ MANQUANT - À CRÉER
│   └── Laboratoire.tsx    ❌ MANQUANT - À CRÉER
├── services/api.ts        ✅
├── types/index.ts         ✅
├── App.tsx                ✅ (à mettre à jour avec nouvelles routes)
├── main.tsx               ✅
└── index.css              ❌ MANQUANT - À CRÉER
```

---

## TÂCHE 1 : CRÉER LES FICHIERS MANQUANTS

### 1.1 Créer `packages/frontend/src/index.css`

Style global inspiré d'OpenMRS/Carbon Design System :
- Palette : bleu primaire `#0f62fe`, gris foncé `#161616`, gris clair `#f4f4f4`, blanc `#ffffff`
- Typographie : IBM Plex Sans (comme Carbon)
- Header fixe en haut avec fond `#161616` et texte blanc
- Sidebar gauche blanche avec bordure droite grise
- Contenu principal sur fond `#f4f4f4`
- Tables avec header gris `#e0e0e0`, lignes alternées
- Boutons primaires bleu `#0f62fe`, danger rouge `#da1e28`
- Cards avec bordure `1px solid #e0e0e0`, pas de shadow
- Formulaires avec labels au-dessus des champs, style Carbon
- Badges/tags arrondis style Carbon
- Page login : fond blanc centré, logo en haut
- Responsive : sidebar collapse en mobile

### 1.2 Créer `packages/frontend/src/pages/Finances.tsx`

Page avec 3 onglets (tabs style Carbon) :
- **Recettes** : table avec colonnes Date, Patient, Type acte, Montant, Mode paiement, Actions
- **Dépenses** : table avec colonnes Date, Type, Nature, Fournisseur, Montant, Actions
- **Bilan** : 3 cards (Total Recettes vert, Total Dépenses rouge, Résultat Net)

En haut : résumé caisse du jour (recettes espèces - dépenses = solde)
Bouton "Nouvelle recette" / "Nouvelle dépense" selon l'onglet actif
Modals pour création avec les champs du cahier des charges :
- Recette : patient (select), service (select), type acte (select parmi: Consultation, Examen, Hospitalisation, Soins, Médicaments, Chirurgie, Accouchement, Soins dentaires), montant, mode paiement (espèces/mobile_money/carte)
- Dépense : type (select parmi: Achat médicaments, Consommables, Salaires, Factures, Loyer, Prestataires), nature, montant, fournisseur, date, description

API : utiliser les fonctions de `services/api.ts` (getRecettes, createRecette, deleteRecette, getDepenses, createDepense, deleteDepense, getCaisse, getBilan)

### 1.3 Créer `packages/frontend/src/pages/Laboratoire.tsx`

Page avec :
- En haut : 3 stat cards (Total examens, Revenus, Types d'examens)
- Table des examens : Date, Patient, Type examen, Résultat, Montant, Actions
- Bouton "Nouvel examen"
- Modal création : patient (select), type examen (select parmi: Analyse de sang, Analyse d'urine, Glycémie, Créatinine, Urée, Cholestérol, Groupe sanguin, Sérologie, Test de grossesse, Autres), résultat (textarea), date, montant

API : utiliser getExamens, createExamen, updateExamen, deleteExamen, getPatients

---

## TÂCHE 2 : MIGRER LE DESIGN VERS STYLE OPENMRS

### 2.1 Principes de design OpenMRS à appliquer

OpenMRS utilise IBM Carbon Design System. Voici les patterns à reproduire :

**Header (top bar)** :
- Fond `#161616`, hauteur 48px
- Logo "Hospital ERP" à gauche en blanc
- Icônes à droite : notifications, user menu
- Barre de recherche patient intégrée dans le header

**Sidebar (navigation gauche)** :
- Fond blanc, largeur 256px
- Items avec icône + label
- Item actif : fond `#e0e0e0`, barre bleue à gauche `3px solid #0f62fe`
- Sections séparées par des dividers

**Content area** :
- Fond `#f4f4f4`
- Padding 1rem
- Breadcrumb en haut de chaque page

**Tables (DataTable style Carbon)** :
- Header row fond `#e0e0e0`, texte `#161616`, font-weight 600, text-transform uppercase, font-size 0.75rem
- Rows alternées blanc / `#f4f4f4`
- Hover : fond `#e8e8e8`
- Toolbar au-dessus : recherche + filtres + bouton action
- Pagination en bas

**Formulaires** :
- Labels au-dessus des champs, font-size 0.75rem, color `#525252`
- Inputs avec bordure bottom `1px solid #8d8d8d`, pas de bordure complète
- Focus : bordure bottom `2px solid #0f62fe`
- Select dropdowns style Carbon
- Boutons : Primary `#0f62fe`, Secondary `#393939`, Danger `#da1e28`

**Cards/Tiles** :
- Fond blanc, bordure `1px solid #e0e0e0`
- Pas de border-radius ni shadow
- Padding 1rem

**Notifications/Snackbar** :
- Style Carbon inline notification
- Success vert, Error rouge, Warning jaune, Info bleu

**Tags/Badges** :
- Petits tags arrondis avec fond coloré léger
- Ex: rôle admin = tag bleu, médecin = tag vert

### 2.2 Refactorer `Layout.tsx`

Structure :
```
┌─────────────────────────────────────────────────┐
│ HEADER (fond #161616, 48px)                     │
│ [Logo] [Recherche patient...] [🔔] [👤 User ▼] │
├──────────┬──────────────────────────────────────┤
│ SIDEBAR  │ CONTENT                              │
│ 256px    │ fond #f4f4f4                         │
│          │                                      │
│ Dashboard│ [Breadcrumb]                         │
│ Patients │ [Page content]                       │
│ Médecins │                                      │
│ ──────── │                                      │
│ Consult. │                                      │
│ Labo     │                                      │
│ ──────── │                                      │
│ Finances │                                      │
│ Services │                                      │
│ ──────── │                                      │
│ [Logout] │                                      │
└──────────┴──────────────────────────────────────┘
```

Menu items groupés :
- Groupe "Accueil" : Dashboard
- Groupe "Clinique" : Patients, Médecins, Consultations, Laboratoire
- Groupe "Administration" : Finances, Services

### 2.3 Refactorer chaque page

Chaque page doit suivre ce pattern :
1. Breadcrumb en haut (ex: "Accueil / Patients")
2. Page header avec titre + bouton action principal
3. Toolbar avec recherche + filtres
4. Table ou contenu
5. Pagination si table

---

## TÂCHE 3 : AJOUTER LES WORKFLOWS DU CYCLE DE VIE

### 3.1 Nouveau module : Rendez-vous (Backend + Frontend)

**Backend - Nouvelle table et routes :**

Ajouter dans `packages/backend/src/config/init.ts` :
```sql
CREATE TABLE IF NOT EXISTS rendez_vous (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER REFERENCES patients(id),
  medecin_id INTEGER REFERENCES medecins(id),
  service_id INTEGER REFERENCES services(id),
  date_rdv TIMESTAMP NOT NULL,
  motif TEXT,
  statut VARCHAR(50) DEFAULT 'planifie' CHECK (statut IN ('planifie', 'confirme', 'en_cours', 'termine', 'annule', 'absent')),
  notes TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

Créer `packages/backend/src/routes/rendezvous.ts` :
- GET `/` : liste avec filtres (date, medecin, service, statut)
- GET `/:id` : détail
- POST `/` : création
- PUT `/:id` : modification
- PUT `/:id/statut` : changement de statut uniquement
- DELETE `/:id` : suppression
- GET `/today` : rendez-vous du jour
- Accès : admin, medecin, reception

Enregistrer la route dans `index.ts` : `app.use('/api/rendezvous', rendezVousRoutes);`

**Frontend :**

Ajouter dans `services/api.ts` :
```typescript
export const getRendezVous = (params?: unknown) => api.get('/rendezvous', { params });
export const getRendezVousToday = () => api.get('/rendezvous/today');
export const createRendezVous = (data: unknown) => api.post('/rendezvous', data);
export const updateRendezVous = (id: number, data: unknown) => api.put(`/rendezvous/${id}`, data);
export const updateRendezVousStatut = (id: number, statut: string) => api.put(`/rendezvous/${id}/statut`, { statut });
export const deleteRendezVous = (id: number) => api.delete(`/rendezvous/${id}`);
```

Ajouter dans `types/index.ts` :
```typescript
export type StatutRdv = 'planifie' | 'confirme' | 'en_cours' | 'termine' | 'annule' | 'absent';

export interface RendezVous {
  id: number;
  patient_id: number;
  medecin_id: number;
  service_id: number;
  date_rdv: string;
  motif?: string;
  statut: StatutRdv;
  notes?: string;
  patient_nom?: string;
  patient_prenom?: string;
  medecin_nom?: string;
  medecin_prenom?: string;
  service_nom?: string;
}
```

Créer `packages/frontend/src/pages/RendezVous.tsx` :
- Vue calendrier jour avec créneaux horaires
- Liste des RDV du jour avec statut coloré
- Bouton "Nouveau RDV"
- Modal : patient (select), médecin (select), service (select), date/heure, motif
- Actions rapides : Confirmer, Démarrer, Terminer, Annuler (changement de statut)
- Tags de statut : planifié=gris, confirmé=bleu, en_cours=jaune, terminé=vert, annulé=rouge, absent=orange

Ajouter la route dans `App.tsx` : `<Route path="/rendezvous" element={<RendezVous />} />`
Ajouter dans le menu sidebar du Layout.

### 3.2 Workflow : Cycle de vie du patient

Le parcours patient dans l'hôpital suit ce flow :

```
[Arrivée] → [Enregistrement] → [File d'attente] → [Consultation] → [Examens?] → [Traitement] → [Paiement] → [Sortie]
```

**Implémenter ce workflow dans la page Patient (détail) :**

Quand on clique sur un patient, afficher une page détail avec :

1. **En-tête patient** (style OpenMRS patient banner) :
   - Nom complet, ID, âge, sexe
   - Tags : statut actuel (En attente, En consultation, etc.)
   - Actions rapides : Nouveau RDV, Nouvelle consultation, Nouvel examen

2. **Onglets** (style Carbon tabs) :
   - **Résumé** : infos démographiques + dernière consultation + prochain RDV
   - **Consultations** : historique des consultations
   - **Examens** : historique labo
   - **Finances** : historique des paiements
   - **Documents** : ordonnances, résultats
   - **Rendez-vous** : liste des RDV passés et futurs

3. **Timeline** (côté droit ou en bas) :
   - Afficher chronologiquement toutes les interactions du patient
   - Icônes différentes par type (consultation, examen, paiement, RDV)

**Modifier la route dans App.tsx :**
```tsx
<Route path="/patients/:id" element={<PatientDetail />} />
```

**Créer `packages/frontend/src/pages/PatientDetail.tsx`**

### 3.3 Workflow : Cycle de vie du dossier médical

Chaque consultation génère un dossier. Le flow :

```
[Ouverture dossier] → [Anamnèse] → [Examen clinique] → [Diagnostic] → [Prescription] → [Clôture]
```

**Modifier la page Consultations :**

Quand on crée une consultation, afficher un formulaire multi-étapes (wizard) :
1. **Étape 1 - Patient & Médecin** : sélection patient, médecin, service
2. **Étape 2 - Anamnèse** : motif de consultation, symptômes (textarea)
3. **Étape 3 - Diagnostic** : diagnostic (textarea), gravité (select: bénin/modéré/grave)
4. **Étape 4 - Traitement** : prescription/traitement (textarea), examens complémentaires à demander
5. **Étape 5 - Récapitulatif** : résumé avant validation

Ajouter un champ `statut` aux consultations dans le backend :
```sql
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS statut VARCHAR(50) DEFAULT 'en_cours' CHECK (statut IN ('en_cours', 'terminee', 'annulee'));
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS motif TEXT;
ALTER TABLE consultations ADD COLUMN IF NOT EXISTS gravite VARCHAR(20);
```

### 3.4 Workflow : Cycle de vie des examens

```
[Demande d'examen] → [Prélèvement] → [Analyse] → [Résultat] → [Validation] → [Transmission]
```

**Modifier le module Laboratoire :**

Ajouter un champ `statut` aux examens :
```sql
ALTER TABLE examens ADD COLUMN IF NOT EXISTS statut VARCHAR(50) DEFAULT 'demande' CHECK (statut IN ('demande', 'prelevement', 'analyse', 'resultat', 'valide', 'transmis'));
ALTER TABLE examens ADD COLUMN IF NOT EXISTS demandeur_id INTEGER REFERENCES medecins(id);
```

Dans la page Laboratoire, afficher les examens groupés par statut (colonnes Kanban) :
- Colonne "Demandés" : examens en attente de prélèvement
- Colonne "En cours" : prélèvement + analyse
- Colonne "Résultats" : résultats saisis, en attente de validation
- Colonne "Validés" : prêts à transmettre

Actions par statut :
- demande → "Prélever" (passe à prelevement)
- prelevement → "Analyser" (passe à analyse)
- analyse → "Saisir résultat" (ouvre modal résultat, passe à resultat)
- resultat → "Valider" (passe à valide)
- valide → "Transmettre" (passe à transmis)

### 3.5 Workflow : Cycle de vie des rendez-vous

```
[Planifié] → [Confirmé] → [En cours] → [Terminé]
                                      → [Annulé]
                                      → [Absent]
```

Déjà décrit dans la section 3.1. S'assurer que :
- La réception peut planifier et confirmer
- Le médecin peut démarrer et terminer
- Tout le monde peut voir
- Un RDV terminé peut déclencher la création automatique d'une consultation

---

## TÂCHE 4 : GITHUB ACTIONS WORKFLOW (CI/CD)

Créer `.github/workflows/ci.yml` inspiré d'OpenMRS :

```yaml
name: Hospital ERP CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'yarn'
      - run: yarn install --frozen-lockfile
      - run: yarn typecheck
      - run: yarn lint
      - run: yarn build

  deploy:
    needs: build
    if: github.ref == 'refs/heads/main'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      - run: yarn install --frozen-lockfile
      - run: yarn build
```

---

## TÂCHE 5 : CONFIGURATION TURBO + FICHIERS RACINE

### 5.1 Créer `hospital-erp/turbo.json`
```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**"] },
    "dev": { "cache": false, "persistent": true },
    "lint": {},
    "typecheck": {},
    "test": {},
    "clean": { "cache": false }
  }
}
```

### 5.2 Créer `hospital-erp/packages/backend/.env`
```
PORT=5000
DATABASE_URL=postgresql://neondb_owner:npg_VEfdrhK0IR7B@ep-still-bar-abn0wpn8-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require
JWT_SECRET=hospital_secret_key_2024
```

### 5.3 Créer `hospital-erp/.gitignore`
```
node_modules/
dist/
.env
.turbo/
*.log
```

---

## TÂCHE 6 : CORRECTIONS BACKEND

### 6.1 Corriger `packages/backend/src/config/init.ts`

Le fichier actuel utilise `query.connect()` qui n'existe pas. Remplacer par :
```typescript
import { pool } from './db.js';

export const initDB = async (): Promise<void> => {
  const client = await pool.connect();
  // ... reste du code
```

### 6.2 Corriger `packages/backend/src/config/db.ts`

Ajouter le support SSL pour Neon :
```typescript
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('neon.tech') ? { rejectUnauthorized: false } : false,
});
```

### 6.3 Ajouter les nouvelles tables dans init.ts

Ajouter la table `rendez_vous` et les colonnes `statut`, `motif`, `gravite` aux consultations, et `statut`, `demandeur_id` aux examens (voir SQL dans tâche 3).

### 6.4 Créer `packages/backend/src/routes/rendezvous.ts`

Route complète pour les rendez-vous (voir spécification tâche 3.1).

---

## TÂCHE 7 : MISE À JOUR App.tsx ET EXPORTS

### 7.1 Mettre à jour `App.tsx`

Ajouter les imports et routes :
```tsx
import RendezVous from './pages/RendezVous';
import PatientDetail from './pages/PatientDetail';

// Dans les routes :
<Route path="/patients/:id" element={<PatientDetail />} />
<Route path="/rendezvous" element={<RendezVous />} />
```

### 7.2 Exporter AuthContext depuis App.tsx

Le Layout.tsx importe `AuthContext` depuis `../App`. S'assurer que l'export est nommé :
```tsx
export const AuthContext = createContext<AuthContextType>(...);
```

---

## RÉSUMÉ DES FICHIERS À CRÉER/MODIFIER

### Fichiers à CRÉER :
1. `packages/frontend/src/index.css` - Styles globaux Carbon/OpenMRS
2. `packages/frontend/src/pages/Finances.tsx` - Page finances complète
3. `packages/frontend/src/pages/Laboratoire.tsx` - Page labo complète
4. `packages/frontend/src/pages/RendezVous.tsx` - Page rendez-vous
5. `packages/frontend/src/pages/PatientDetail.tsx` - Détail patient avec onglets
6. `packages/backend/src/routes/rendezvous.ts` - API rendez-vous
7. `hospital-erp/turbo.json` - Config Turbo
8. `hospital-erp/.gitignore`
9. `hospital-erp/packages/backend/.env`
10. `.github/workflows/ci.yml`

### Fichiers à MODIFIER :
1. `packages/frontend/src/App.tsx` - Nouvelles routes + export AuthContext
2. `packages/frontend/src/components/Layout.tsx` - Design OpenMRS
3. `packages/frontend/src/pages/Login.tsx` - Design OpenMRS
4. `packages/frontend/src/pages/Dashboard.tsx` - Design OpenMRS + RDV du jour
5. `packages/frontend/src/pages/Patients.tsx` - Design OpenMRS + lien vers détail
6. `packages/frontend/src/pages/Medecins.tsx` - Design OpenMRS
7. `packages/frontend/src/pages/Services.tsx` - Design OpenMRS
8. `packages/frontend/src/pages/Consultations.tsx` - Design OpenMRS + wizard multi-étapes
9. `packages/frontend/src/services/api.ts` - Ajouter fonctions RDV
10. `packages/frontend/src/types/index.ts` - Ajouter types RDV + statuts
11. `packages/backend/src/config/init.ts` - Corriger + nouvelles tables
12. `packages/backend/src/config/db.ts` - Corriger SSL
13. `packages/backend/src/index.ts` - Ajouter route rendezvous

### ORDRE D'EXÉCUTION RECOMMANDÉ :
1. Tâche 5 (config turbo, .env, .gitignore)
2. Tâche 6 (corrections backend)
3. Tâche 1 (fichiers manquants frontend)
4. Tâche 2 (migration design OpenMRS)
5. Tâche 3 (workflows)
6. Tâche 7 (mise à jour App.tsx)
7. Tâche 4 (CI/CD)
