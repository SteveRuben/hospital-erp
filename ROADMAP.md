# ROADMAP - Hospital ERP

## ✅ Implémenté

### Modules de base
- Dashboard, Patients (formulaire OpenMRS complet), Médecins, Services
- Consultations, Finances (recettes, dépenses, caisse, bilan)
- Laboratoire (Kanban), Rendez-vous

### Modules cliniques (dossier patient)
- Signes vitaux, Allergies, Pathologies, Prescriptions, Ordonnances
- Vaccinations, Notes/commentaires, Alertes patient, Formulaires dynamiques

### Gestion des flux
- Visites actives, File d'attente (Kanban), Listes de patients (cohortes)

### Hospitalisation
- Pavillons, Gestion des lits (disponibilité, occupation)
- Hospitalisations (admission, sortie, transfert)

### Programmes de soins
- Création de programmes (diabète, VIH, tuberculose, maternité...)
- Inscription/sortie de patients

### Facturation avancée
- Grille tarifaire configurable (codes, catégories, montants)
- Factures avec lignes détaillées et numérotation automatique
- Paiements multiples (espèces, mobile money, carte, virement, assurance)
- Statut automatique (en attente, partielle, payée)

### Infrastructure
- Auth JWT + rôles, OWASP Top 10, Monorepo TypeScript
- CI/CD GitHub Actions, PostgreSQL Neon, Railway
- Landing page, session timeout 3min
- Design Carbon/OpenMRS

## 🔜 À faire

### Itération 1 — Documents & Impression
- [ ] Génération PDF (factures, ordonnances, résultats labo)
- [ ] Impression d'étiquettes patient
- [ ] Export Excel des rapports financiers

### Itération 2 — Communication
- [ ] SMS aux patients (rappels RDV, résultats)
- [ ] Prise de rendez-vous en ligne (portail patient)
- [ ] Paiement mobile intégré (API Orange Money / M-Pesa)

### Itération 3 — Avancé
- [ ] Interconnexion assurance maladie
- [ ] Dossier médical partagé inter-établissements
- [ ] Imagerie médicale (DICOM viewer)
- [ ] Pharmacie / Stock médicaments
- [ ] Tableau de bord BI avancé (graphiques, tendances)