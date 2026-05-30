# ROADMAP — Hospital ERP

**Mise à jour : 2026-05-30**
**Branche : master | Tag interne : v2-comms-interop**

---

## 1. État réel (qu'a-t-on aujourd'hui ?)

Le projet est passé d'un ERP hospitalier basique (avril 2026) à une plateforme
clinico-administrative avec interopérabilité et conformité HIPAA. Synthèse :

### 1.1 Clinique (parité OpenMRS atteinte sur le cœur)
- Patients, médecins, services, consultations, RDV, file d'attente, visites
- Encounters / Observations / Orders / Concepts (modèle OpenMRS adopté)
- Vitaux, allergies, pathologies, prescriptions, ordonnances, vaccinations
- Notes (avec mentions @user), alertes patient (avec notification automatique)
- Hospitalisation : pavillons, lits, admissions, sorties
- Programmes de soins (diabète, VIH, TB…)
- Formulaires dynamiques (builder + remplissage par patient)
- Laboratoire (Kanban) + rapport activité par période (jour/semaine/mois)
- Imagerie (upload sécurisé magic-byte, multi-formats incl. DICOM)
- Fusion patients (patient-merge)

### 1.2 Gestion (avantage net vs OpenMRS)
- Facturation : tarifs, factures multi-lignes, paiements multi-modes
- Caisse, recettes, dépenses, bilan financier
- Pharmacie : médicaments, stock, dispensations, mouvements, alertes stock bas
- Rapports : finances, activité, patients×service, labo×période — avec heatmaps

### 1.3 Communication interne (différenciation vs OpenMRS)
- Notifications in-app : modèle Notification + cloche header live (Socket.IO)
- Chat staff : canaux (service auto / garde / custom / DM), mentions, @tous
- Workflow notifs : alerte critique → admin+médecin, admission → service,
  stock bas (dédupé 1h), résultat labo prêt → demandeur

### 1.4 Conformité & sécurité
- HIPAA Security Rule : RBAC granulaire (5+1 rôles : admin/médecin/comptable/
  laborantin/réception/pharmacien), patient attribution, IDOR middleware,
  resource-access middleware, audit log avec hash-chain anti-tampering
- Chiffrement PHI au repos (AES-256-GCM, fail-fast si clé manquante en prod)
- Auth : Argon2id, MFA TOTP, session timeout 30 min, JWT blacklist Redis,
  password policy + dictionnaire des 40 mots de passe courants
- Forced first-login password change (frontend + backend gate)
- Suspension de compte (admin) avec invalidation sessions
- Reset password admin avec audit
- Audit trail par utilisateur (actions BY/ON)
- CSP durcie (suppression de unsafe-inline scripts), HSTS, HTTPS forcé
- Retention cron : 6 ans chat (HIPAA §164.530(j)), 90 jours notifs lues
- Droit à l'effacement chat : POST /chat/redact-patient/:id
- Docs réglementaires : PSSI, PIA, RGPD registre, PCA, consentement portail

### 1.5 Interopérabilité (FHIR R4 read-only)
- GET /fhir/metadata (CapabilityStatement)
- GET /fhir/Patient/:id, /fhir/Patient?name= (Bundle searchset)
- GET /fhir/Observation?patient= — clinique + vitaux **LOINC-codés**
- GET /fhir/Encounter?patient=, /fhir/MedicationRequest?patient=
- Contrôle d'accès patient appliqué (canAccessPatient + accessiblePatientIds)
- OperationOutcome pour les erreurs

### 1.6 Personnalisation par hôpital
- Logo, nom, thème (6 thèmes prédéfinis CSS variables)
- Coordonnées + mentions légales + code pays (libphonenumber)
- Devise (XOF/XAF/EUR/USD/…) → impressions + rapports
- Templates d'impression personnalisables (en-tête / pied de facture, ordonnance,
  labo) + endpoint preview
- Wizard onboarding 5 étapes à la première connexion admin
- @-handle personnalisable par utilisateur

### 1.7 i18n (scaffolding solide, couverture partielle)
- 4 locales : fr, en, es, pt
- Hook React useTranslation() réactif (pas de rechargement)
- Interpolation {{name}} + auto-détection locale système
- Dictionnaires : ~100 clés par locale (common, auth, menu, module, patient,
  appointment, notif, chat, form)
- **Couverture UI réelle : ~15%** — la plupart des chaînes restent codées en
  français dans les composants

### 1.8 Terminologies
- Structure : Concept, ConceptDatatype, ConceptClasse, ConceptMapping
- Seed CIM-10 : ~30 codes (présentations courantes WHO primary care)
- Endpoint typeahead /api/concepts/cim-10/search
- Typeahead intégré dans formulaire pathologie

### 1.9 Architecture déploiement
- Décision : **Option B = un déploiement Railway + Neon par hôpital**
- Doc : `docs/ARCHITECTURE_MULTI_HOPITAL.md`
- Vite proxy /socket.io pour le dev
- Migrations Prisma + ALTER idempotent dans init.ts (compat double schéma
  enum/varchar suite au bug UserRole de production)

### 1.10 Dette technique connue
- `init.ts` : ~1100 lignes, fait CREATE TABLE + ALTER + seeds + migrations
  idempotentes. Croît de ~50 lignes par session.
- `asyncHandler` : ~23 fichiers de routes non migrés (sur ~45)
- Tests : 131/131 passent côté backend, **0 tests frontend** (config Vitest
  pas même installée)
- Schéma : modèles potentiellement morts non droppés (`Formulaire` était
  inutilisé jusqu'à hier, maintenant réactivé)
- i18n : 85% des chaînes UI hardcodées en français
- 10 fichiers contiennent TODO/FIXME

---

## 2. Diagnostic stratégique

### 2.1 Ce qui va bien
- **Vélocité** : sur 2 sessions (28-30 mai), 8 features majeures livrées avec
  131/131 tests verts. Régression : zéro. Type-check : clean.
- **Couverture fonctionnelle** : on dépasse OpenMRS sur gestion (factu/pharmacie/
  lits/comms) et on atteint la parité sur clinique (modèle Concept/Observation).
- **Posture sécurité** : on est devant l'industrie EMR open-source moyenne
  (audit hash-chain, encryption fail-fast, RBAC à 4 couches).
- **Différenciation** : chat staff + notifications workflow + @-mentions est
  unique vs OpenMRS/Cerner/Epic open-source.

### 2.2 Ce qui inquiète
- **Pas un seul hôpital en prod** (à confirmer). Tout est shippé sur master
  mais aucune validation terrain. Risque : on construit une solution sans
  utilisateur réel pour challenger les choix.
- **init.ts en mode god-script** : 1100 lignes, mélange schéma+seed+migration.
  Casse à venir si on ajoute encore 200 lignes.
- **0 test frontend** alors qu'on a 35+ pages React avec logique métier
  (formulaires, RBAC, chat, FHIR rendering). Une régression UI passe.
- **i18n half-done** : marketing « multilingue » mais 85% de FR hardcodé.
  Un hôpital anglophone aurait une UI bancale.
- **Pas de FHIR write** : on expose seulement read. Pour un vrai écosystème
  national (registre, labo externe), il faut au moins POST /fhir/Patient et
  POST /fhir/Observation.
- **Notifications/chat scalabilité non testée** : Socket.IO en in-memory,
  retention cron jamais exécuté en prod.
- **Pas de modèle économique** : open-source ? SaaS ? per-seat ? per-hospital ?
- **Coût mental d'init.ts/Prisma divergence** : ALTER idempotent qui rattrape
  les variantes enum vs varchar. Reproductible mais fragile.

### 2.3 Question stratégique centrale
**Hypothèse marché : déjà validée — un hôpital pilote est identifié et attend.**
L'incertitude n'est plus commerciale (PMF) mais opérationnelle : est-ce que la
plateforme tient à un usage quotidien réel ? La séquence est donc :

```
ÉTAT ACTUEL ──► STABILISER ──► ONBOARDER ──► ÉVOLUER
v2-comms-interop   ~3-4 sem      ~2-4 sem    selon feedback
                   pré-deploy    le pilote
```

Le risque #1 n'est pas « trouver un client » mais « casser la confiance du
premier client à cause d'un bug évitable ». Donc stabiliser d'abord, même si
ça reporte le go-live de 4 semaines.

---

## 3. Plan forward — 3 itérations (ordre : STABILISER → ONBOARDER → ÉVOLUER)

### Itération 1 (semaines 1-4) — STABILISATION PRÉ-DÉPLOIEMENT
**Objectif** : rendre la plateforme prête pour un usage quotidien réel sans
régression silencieuse.

1. **init.ts → prisma seed** (dette A des TODOS) — sortir le god-script avant
   qu'il casse en prod. Bloquant pour confiance migrations.
2. **Tests frontend** : Vitest + RTL, smoke tests Login/PatientForm/Chat/
   FormRenderer + RBAC guards + Profil + Utilisateurs admin actions
3. **i18n full coverage** : passer de 15% à 80%+ des chaînes externalisées.
   Le pilote francophone peut tolérer FR-only mais on évite le mix
   « 90% FR + 10% strings i18n cassantes »
4. **Monitoring prod** : Sentry + log structuré + dashboard santé
   (uptime, latence p95, erreurs/h, sessions actives, notifs/min)
5. **Backup + restore drill** : tester pg_dump + restore sur env staging
   avec données pilote-shape. Mesurer RTO réel.
6. **Retention cron** : vérifier qu'il tourne en prod, mesurer volumes
   sur données pilote-shape, ajuster seuils
7. **asyncHandler batch 3** : les 23 routes restantes (mécanique, 2-3h)
8. **Smoke E2E full flow** : login → patient create → consultation →
   ordonnance → facture → paiement → impression. Doit passer 100%.

**Livrables :**
- init.ts < 200 lignes
- ≥30 tests frontend qui passent
- Monitoring déployé et visible
- Backup drill effectué et documenté
- Smoke E2E qui couvre le flow happy path complet

**Métriques de sortie (gate de sortie itération 1) :**
- 0 régression backend (131+ tests verts)
- ≥30 tests frontend verts
- Smoke E2E vert
- p95 latence < 500ms sur env staging chargé à 2× pilote attendu
- Backup restore mesuré (RTO observé)

### Itération 2 (semaines 5-8) — ONBOARDING PILOTE
**Objectif** : un hôpital francophone en production avec usage quotidien réel.

1. **Setup deploy isolé** Railway+Neon pour l'hôpital pilote (Option B,
   doc déjà écrite : `docs/ARCHITECTURE_MULTI_HOPITAL.md`)
2. **DNS custom domain** + TLS Let's Encrypt
3. **Wizard onboarding test** sur cas réel — itérer si friction (le wizard
   a été testé en dev, jamais avec un vrai admin)
4. **Import patients existants** via `/import` CSV — figer le format
   attendu, ajouter validations, prévoir les patients dupliqués
5. **Configuration établissement** : nom, logo, coordonnées, thème,
   devise (XOF probable), code pays, templates impressions
6. **Création utilisateurs** : admin, médecins, comptable, laborantin,
   pharmacien, réception — vérifier flux must_change_password
7. **Formation staff** 2-3 sessions (admin technique, médecins, finance)
   — produire un guide imprimé par rôle
8. **Logs de friction** : tout ce que le staff ne comprend pas / refuse →
   backlog priorisé pour itération 3
9. **Support direct** semaines 5-8 (Slack ou WhatsApp dédié)
10. **Bug bash semaine 8** : tout ce qui est sorti du pilote est P0/P1

**Livrables :**
- 1 hôpital live avec usage quotidien
- Backlog issu du terrain
- Runbook ops (procédures incidents, backups manuels, escalade)
- Guide utilisateur par rôle (PDF)

**Métriques succès :**
- 7 jours consécutifs d'usage par ≥3 utilisateurs
- 0 incidents P0 (perte de données, login impossible >1h)
- Score satisfaction admin ≥ 7/10
- ≥50 patients enregistrés en données réelles

### Itération 3 (semaines 9-12) — ÉVOLUTION SUR SIGNAL TERRAIN
**Objectif** : les 4 features ci-dessous sont des **candidats**, la priorisation
réelle vient du backlog issu du pilote (itération 2). Ce qui suit est mon
hypothèse de probables ; à confirmer après semaine 8.

1. **Mobile Money intégration** (Orange Money + MTN MoMo + Wave) : paiement
   facture direct depuis l'app, webhook callback, réconciliation auto.
   *Note : code Remita / PaiementMobile déjà touché récemment hors-session,
   à intégrer plutôt que recommencer.*
2. **Portail patient lite** : login patient (otp SMS), voir ses RDV +
   ordonnances + résultats labo, paiement mobile
3. **SMS rappels RDV** automatiques (déjà partiellement câblé via
   Africastalking adapter)
4. **Tableau de bord BI** : tendances 12 mois, comparaison année N vs N-1,
   alertes anomalies (chute consultations, hausse rejets paiement)
5. **Pilote #2** : si itération 2 valide la maintenabilité Option B,
   2e hôpital onboardé fin de semaine 12

**Livrables :** prioritisés post-pilote — pas de promesse ferme aujourd'hui.

---

## 4. Décisions stratégiques à acter

| # | Question | Position recommandée | Pourquoi |
|---|---|---|---|
| 1 | Modèle économique | SaaS per-hôpital, prix à définir avec pilote | Évite la complexité multi-tenant, monétise la valeur réelle |
| 2 | Open-source ? | Non, propriétaire — au moins jusqu'à v3 | Trop tôt pour gérer une communauté ; consolider d'abord |
| 3 | Architecture multi-tenant à long terme ? | Reste Option B jusqu'à 30 hôpitaux | Sécurité > coût infra à cette échelle |
| 4 | FHIR write ou continuer read-only ? | Write minimum en itération 2 | Sans write, l'interop est une vitrine |
| 5 | Mobile vs web ? | Web responsive seulement v1 | PWA si demande pilote, app native uniquement v3+ |
| 6 | OpenMRS upstream contribution ? | Non | Code-base trop divergente, pas de bénéfice clair |

---

## 5. Ce qui est explicitement HORS scope

- App mobile native (iOS/Android) jusqu'à v3
- Multi-tenant Option A (DB partagée) — risque HIPAA trop élevé
- DICOM viewer avancé (visualisation imagerie) — DICOM upload OK, viewer non
- Téléconsultation vidéo
- IA / aide au diagnostic
- Intégration assurance maladie nationale (sauf si pilote l'exige)
- Dossier médical partagé inter-établissements (DMP) — exige standard national

---

## 6. Risques et mitigations

| Risque | Probabilité | Impact | Mitigation |
|---|---|---|---|
| Pilote refuse / délai trouvé | Moyen | Élevé | Approcher 3 cibles en parallèle, accepter clinique privée |
| init.ts casse à la prochaine migration | Moyen | Élevé | Itération 2 priorité 1 (extraction seed) |
| Chat scalabilité (Socket.IO in-mem) | Faible (≤30 users) | Moyen | Brancher Redis adapter quand >50 users simul. |
| HIPAA audit échoue car logs corrompus | Faible | Critique | Verify-audit-log script dans cron + monitoring |
| Données pilote perdues | Faible | Catastrophique | Backup manuel quotidien + Neon PITR vérifié |
| Concurrent (OpenMRS distribution locale) | Moyen | Moyen | Push différenciation (chat, paiement Mobile Money) |

---

## 7. TODOS techniques (engineering debt)

Voir `TODOS.md` pour les dettes héritées des sessions précédentes :
- **A** : init.ts → prisma seed (priorité **itération 2**)
- **B** : asyncHandler migration 23 routes restantes (itération 2)
- **C** : tests par route + tests frontend (itération 2)
- **D** : schema cleanup (après itération 1 valide les modèles)
- **E** : sync docs PSSI/RGPD/PIA avec les contrôles réels (itération 2)
- **F** : stretch — rate limit per-route, axios getToken() helper, AES-GCM
  sessionStorage

---

## 8. Méta : ce ROADMAP est vivant

Mis à jour à la fin de chaque itération avec :
- Ce qui a été livré (✓)
- Ce qui a glissé (→)
- Ce qui a été appris du pilote
- Re-priorisation des 2 itérations suivantes
