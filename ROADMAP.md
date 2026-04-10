# ROADMAP - Hospital ERP

## ✅ Implémenté

### Modules de base
- Dashboard avec statistiques
- Gestion des patients (CRUD, recherche, archivage, historique)
- Gestion des médecins
- Gestion des services hospitaliers
- Consultations
- Gestion financière (recettes, dépenses, caisse, bilan)
- Laboratoire (examens avec workflow Kanban)
- Rendez-vous (planification, statuts)

### Modules cliniques (dossier patient)
- Signes vitaux (température, tension, pouls, SpO2, poids, taille, glycémie)
- Allergies (type, sévérité, réaction)
- Pathologies / Conditions (code CIM, statut)
- Prescriptions / Médicaments (dosage, fréquence, voie d'administration)
- Ordonnances
- Vaccinations (carnet vaccinal, rappels)
- Notes et commentaires (général, clinique, infirmier, administratif)
- Alertes patient (sévérité, type, activation/désactivation)
- Formulaires dynamiques (définition JSON, réponses)

### Infrastructure
- Authentification JWT avec rôles (admin, médecin, comptable, laborantin, réception)
- Monorepo TypeScript (Turbo)
- CI/CD GitHub Actions
- Design Carbon/OpenMRS
- Base de données PostgreSQL (Neon)

## 🔜 À faire (prochaines itérations)

### Itération 1 — Gestion des flux
- [ ] Visites actives (suivi des patients présents dans l'hôpital)
- [ ] File d'attente par service (priorité, numéro d'ordre, temps d'attente)
- [ ] Gestion des lits / Bed management (occupation, disponibilité, affectation)

### Itération 2 — Hospitalisation
- [ ] Ward / Pavillon (vue par étage/pavillon, patients hospitalisés)
- [ ] Transferts entre services
- [ ] Suivi des séjours (date entrée/sortie, durée)

### Itération 3 — Listes et cohortes
- [ ] Listes de patients personnalisées (cohortes)
- [ ] Filtres avancés (par pathologie, service, médecin, période)
- [ ] Export des listes (CSV, PDF)

### Itération 4 — Programmes de soins
- [ ] Programmes de suivi (diabète, VIH, tuberculose, maternité)
- [ ] Protocoles de soins standardisés
- [ ] Suivi des indicateurs par programme

### Itération 5 — Impression et documents
- [ ] Impression d'étiquettes patient (Label printing)
- [ ] Génération PDF (ordonnances, résultats labo, factures)
- [ ] Export Excel des rapports financiers

### Itération 6 — Communication
- [ ] SMS aux patients (rappels RDV, résultats)
- [ ] Prise de rendez-vous en ligne
- [ ] Paiement mobile intégré

### Itération 7 — Avancé
- [ ] Interconnexion assurance maladie
- [ ] Dossier médical partagé inter-établissements
- [ ] Imagerie médicale (DICOM viewer)
- [ ] Pharmacie / Stock médicaments
- [ ] Tableau de bord BI avancé