# INSTRUCTIONS V3 — Fonctionnalités OpenMRS manquantes

## PRIORITÉ 1 : Pharmacie / Stock médicaments

### Tables
```sql
-- Médicaments (catalogue)
CREATE TABLE IF NOT EXISTS medicaments (
  id SERIAL PRIMARY KEY,
  nom VARCHAR(200) NOT NULL,
  dci VARCHAR(200), -- Dénomination Commune Internationale
  forme VARCHAR(50), -- comprimé, sirop, injectable, pommade
  dosage_standard VARCHAR(100),
  code_barre VARCHAR(50),
  categorie VARCHAR(100),
  prix_unitaire DECIMAL(12,2),
  actif BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Stock
CREATE TABLE IF NOT EXISTS stock (
  id SERIAL PRIMARY KEY,
  medicament_id INTEGER REFERENCES medicaments(id),
  lot VARCHAR(100),
  date_expiration DATE,
  quantite INTEGER DEFAULT 0,
  quantite_min INTEGER DEFAULT 10, -- seuil alerte
  prix_achat DECIMAL(12,2),
  fournisseur VARCHAR(200),
  date_entree DATE DEFAULT CURRENT_DATE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Mouvements de stock
CREATE TABLE IF NOT EXISTS stock_mouvements (
  id SERIAL PRIMARY KEY,
  medicament_id INTEGER REFERENCES medicaments(id),
  type_mouvement VARCHAR(20) CHECK (type_mouvement IN ('entree', 'sortie', 'ajustement', 'perime')),
  quantite INTEGER NOT NULL,
  lot VARCHAR(100),
  motif TEXT,
  user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Dispensations (délivrance au patient)
CREATE TABLE IF NOT EXISTS dispensations (
  id SERIAL PRIMARY KEY,
  patient_id INTEGER REFERENCES patients(id),
  prescription_id INTEGER REFERENCES prescriptions(id),
  medicament_id INTEGER REFERENCES medicaments(id),
  quantite_delivree INTEGER,
  dispenseur_id INTEGER REFERENCES users(id),
  date_dispensation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  notes TEXT
);
```

### Routes
- GET/POST /api/pharmacie/medicaments
- GET/POST /api/pharmacie/stock
- POST /api/pharmacie/mouvements
- POST /api/pharmacie/dispensations
- GET /api/pharmacie/alertes (stock bas, périmés)
- GET /api/pharmacie/stats

### Frontend
- Page `/app/pharmacie` avec onglets : Catalogue, Stock, Mouvements, Dispensations, Alertes

---

## PRIORITÉ 2 : Mode Offline (PWA)

### Implémentation
1. Créer `public/manifest.json` pour PWA
2. Créer `public/sw.js` (Service Worker) avec stratégie cache-first pour assets, network-first pour API
3. Ajouter `<link rel="manifest">` dans index.html
4. Implémenter IndexedDB pour stocker les données en local
5. Queue de synchronisation : les actions offline sont mises en file et envoyées quand la connexion revient
6. Indicateur online/offline dans le header

### Données à cacher offline
- Liste des patients (derniers 100)
- Concepts dictionary
- Médecins, services
- Formulaires

### Actions possibles offline
- Consulter un patient
- Créer une consultation (sync au retour)
- Saisir des signes vitaux (sync au retour)

---

## PRIORITÉ 3 : FHIR API

### Routes FHIR R4
- GET /fhir/Patient/:id → FHIR Patient resource
- GET /fhir/Patient?name=xxx → Search
- GET /fhir/Encounter/:id → FHIR Encounter
- GET /fhir/Observation?patient=xxx → Observations
- GET /fhir/MedicationRequest?patient=xxx → Prescriptions
- GET /fhir/Appointment?patient=xxx → RDV
- GET /fhir/metadata → CapabilityStatement

### Mapping
- Patient → FHIR Patient (identifier, name, gender, birthDate, address, telecom)
- Consultation → FHIR Encounter (status, class, type, subject, participant, period)
- Observation → FHIR Observation (status, code, value, effectiveDateTime)
- Prescription → FHIR MedicationRequest (status, intent, medication, dosageInstruction)

---

## PRIORITÉ 4 : Multi-site / Multi-facility

### Tables
```sql
CREATE TABLE IF NOT EXISTS facilities (
  id SERIAL PRIMARY KEY,
  nom VARCHAR(200) NOT NULL,
  code VARCHAR(50) UNIQUE,
  type VARCHAR(50), -- hopital, centre_sante, clinique, dispensaire
  adresse TEXT,
  ville VARCHAR(100),
  telephone VARCHAR(20),
  email VARCHAR(150),
  actif BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Ajouter facility_id à : users, patients, consultations, recettes, etc.
ALTER TABLE users ADD COLUMN IF NOT EXISTS facility_id INTEGER REFERENCES facilities(id);
ALTER TABLE patients ADD COLUMN IF NOT EXISTS facility_id INTEGER REFERENCES facilities(id);
```

### Logique
- Chaque utilisateur est rattaché à un établissement
- Les données sont filtrées par facility_id
- Un admin global peut voir tous les établissements
- Un admin local ne voit que son établissement

---

## PRIORITÉ 5 : Patient Merge / Deduplication

### Routes
- GET /api/patients/duplicates → détecte les doublons potentiels (même nom+prénom+date_naissance)
- POST /api/patients/merge → fusionne deux patients (garde un, transfère les données de l'autre)

### Logique de merge
1. Choisir le patient "principal" (celui qu'on garde)
2. Transférer toutes les données du patient "secondaire" vers le principal :
   - consultations, examens, recettes, RDV, vitaux, allergies, pathologies, prescriptions, etc.
3. Archiver le patient secondaire
4. Log dans audit_log

---

## PRIORITÉ 6 : Carte patient imprimable

### Format CR-80 (85.6mm x 54mm)
- Recto : Logo hôpital, Nom, Prénom, ID, Photo, QR code (encode l'ID patient)
- Verso : Groupe sanguin, Allergies connues, Contact urgence, Date d'émission

### Route
- GET /api/print/carte/:patientId → HTML format carte

---

## PRIORITÉ 7 : Internationalisation (i18n)

### Implémentation
- Installer react-i18next
- Créer fichiers de traduction : fr.json, en.json, sw.json (swahili), ln.json (lingala)
- Wrapper l'app avec I18nextProvider
- Sélecteur de langue dans le header

---

## PRIORITÉ 8 : Reporting avancé

### Routes
- GET /api/reports/patients-par-periode
- GET /api/reports/consultations-par-medecin
- GET /api/reports/recettes-par-service
- GET /api/reports/top-diagnostics
- GET /api/reports/occupation-lits
- GET /api/reports/activite-labo

### Frontend
- Page `/app/rapports` avec graphiques (utiliser recharts ou chart.js)
- Filtres par période, service, médecin
- Export PDF/CSV

---

## PRIORITÉ 9 : Provider management

### Modification
- Renommer/étendre la table `medecins` en `providers`
- Ajouter un champ `type_provider` : medecin, infirmier, pharmacien, technicien_labo, sage_femme
- Associer les providers aux encounters au lieu des médecins seuls

---

## PRIORITÉ 10 : Appointment scheduling avancé

### Fonctionnalités
- Créneaux récurrents (ex: Dr. Martin consulte lundi/mercredi/vendredi 8h-12h)
- Durée par type de consultation
- Blocage de créneaux (congés, réunions)
- Vue calendrier semaine/mois

---

## PRIORITÉ 11 : Form Engine avancé

### Implémentation
- Éditeur de formulaires drag-and-drop
- Types de champs : texte, nombre, date, select, checkbox, radio, section, répétition
- Conditions d'affichage (si champ X = Y, afficher champ Z)
- Validation (requis, min/max, regex)
- Lié aux concepts du dictionnaire

---

## PRIORITÉ 12 : Cohort Builder

### Fonctionnalités
- Requêtes complexes : "Patients diabétiques de plus de 50 ans avec HTA"
- Combinaison de critères : pathologie + âge + sexe + ville + médecin
- Sauvegarde des requêtes
- Export des résultats

---

## PRIORITÉ 13 : Data export (FHIR/CSV/HL7)

### Routes
- GET /api/export/fhir/patients → Bundle FHIR de tous les patients
- GET /api/export/fhir/patient/:id → Tout le dossier d'un patient en FHIR
- GET /api/export/hl7/:patientId → Message HL7 ADT

---

## PRIORITÉ 14 : Audit trail complet

### Amélioration
- Stocker le diff (avant/après) pour chaque modification
- Interface de consultation des logs avec filtres
- Export des logs

---

## PRIORITÉ 15 : Content Packages

### Implémentation
- Packs JSON contenant : concepts, formulaires, workflows, tarifs
- Import/export de packs
- Packs pré-faits : VIH, Maternité, Diabète, Pédiatrie

---

## ORDRE D'EXÉCUTION

1. Pharmacie (impact immédiat)
2. Carte patient (rapide)
3. FHIR API (interopérabilité)
4. Multi-site (scalabilité)
5. Patient merge (qualité données)
6. Mode offline PWA (accessibilité)
7. Reporting avancé (décision)
8. Provider management
9. i18n
10. Appointment avancé
11. Form Engine
12. Cohort Builder
13. Data export
14. Audit trail
15. Content Packages