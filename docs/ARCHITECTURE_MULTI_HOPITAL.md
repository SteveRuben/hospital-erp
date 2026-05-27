# Architecture multi-hôpital — choix de déploiement

**Application** : Hospital ERP
**Version** : 1.0
**Date** : 2026-05-27
**Statut** : Décision adoptée — Option B (deploy isolé par hôpital)

---

## 1. Contexte

Le système doit pouvoir desservir plusieurs établissements de santé, chacun avec :
- Son propre nom de domaine (ex : `app.hopital-cocody.ci`, `app.clinique-bouake.ci`)
- Son identité visuelle (logo, nom, couleurs, en-têtes d'impression)
- Ses propres données patients, strictement isolées des autres établissements
- Sa propre devise et ses paramètres financiers

Cette isolation est exigée par HIPAA §164.502(b) (minimum necessary) et par
le RGPD (principe de finalité). Une fuite de PHI d'un hôpital vers un autre
constitue un incident à notifier sous 60 jours (HIPAA) ou 72 heures (RGPD).

## 2. Architectures évaluées

### 2.1 Option A — Multi-tenant pur (1 deploy, 1 DB partagée, N domaines)

Une seule base de données héberge les données de tous les hôpitaux.
Chaque table PHI porte une colonne `facility_id`. Chaque requête filtre
explicitement sur `facility_id`. Le domaine HTTP détermine le tenant.

| Critère | Évaluation |
|---|---|
| Coût d'infra | Très faible (1 × Railway + 1 × Neon, ~$15/mois total) |
| Effort initial | 3–5 jours (refactor ~25 tables + ~30 routes) |
| Effort par feature future | Élevé — chaque nouvelle query doit penser au `facility_id` |
| Risque HIPAA cross-tenant | **Élevé en permanence** — un seul oubli de filtre = fuite |
| Onboarding nouveau hôpital | 1 minute (insert row + custom domain) |
| Backup/restore par hôpital | Complexe (export filtré) |

**Mitigations possibles** : Row Level Security (RLS) Postgres + Prisma
client extension pour injection automatique du filtre. Réduit le risque
mais ne l'élimine pas (la session DB doit toujours porter le bon
`current_setting('app.facility_id')`).

**Rejeté** car le risque résiduel de fuite cross-tenant est incompatible
avec la nature des données médicales hébergées.

### 2.2 Option C — App partagée, DBs séparées (1 app, N DBs, N domaines)

Une seule instance applicative choisit la `DATABASE_URL` selon le `Host`
header de la requête. Les données sont physiquement séparées (1 base par
hôpital) mais le code et les ressources serveur sont mutualisés.

| Critère | Évaluation |
|---|---|
| Coût d'infra | Faible (1 × Railway + N × Neon free tier) |
| Effort initial | 1–2 jours (middleware tenant + pool de PrismaClient) |
| Effort par feature future | Faible — l'isolation est implicite |
| Risque HIPAA cross-tenant | Faible — isolation au niveau DB |
| Onboarding nouveau hôpital | 5 minutes (ajouter env var + Custom Domain Railway) |
| Backup/restore par hôpital | Simple (chaque DB est indépendante) |

**Risque résiduel** : un bug dans le middleware de routing tenant
pourrait servir des données du mauvais hôpital. Mitigable par tests E2E
qui valident l'isolation à chaque déploiement.

**Conservé en réserve** pour le jour où le nombre d'hôpitaux dépasse ~30
et où l'overhead de gestion de l'Option B devient lourd.

### 2.3 Option B — Deploy isolé par hôpital (N deploys, N DBs, N domaines) ✅

Chaque hôpital obtient son propre service Railway + sa propre base Neon +
son propre domaine. Tous les services sont liés au même repository GitHub
et reçoivent les mises à jour de code en même temps.

| Critère | Évaluation |
|---|---|
| Coût d'infra | Modéré ($15–25/mois × N hôpitaux) |
| Effort initial | **Zéro** — fonctionne avec le code actuel |
| Effort par feature future | Zéro — pas de notion de tenant dans le code |
| Risque HIPAA cross-tenant | **Nul** — isolation par infrastructure |
| Onboarding nouveau hôpital | 10 minutes (cloner service Railway + DNS) |
| Backup/restore par hôpital | Trivial (chaque service est autonome) |
| Mises à jour | `git push` → Railway auto-déploie tous les services liés |

**Trade-off accepté** : coût d'infra plus élevé en échange d'une posture
de sécurité maximale et de zéro effort de développement.

## 3. Décision : Option B

Pour un ERP hospitalier hébergeant des données médicales réelles dans un
contexte de marché émergent (faible tolérance aux incidents, équipe IT
limitée pour répondre à un breach), l'isolation par infrastructure est le
seul choix qui garantit qu'**aucun bug applicatif futur** ne pourra
provoquer une fuite cross-tenant.

C'est l'architecture utilisée par les grands ERP médicaux (Epic, Cerner,
Athenahealth) malgré son coût plus élevé.

## 4. Mise en œuvre

### 4.1 Onboarding d'un nouvel hôpital

1. **Provisionner la base Neon**
   - Créer un nouveau projet Neon (ou une nouvelle base dans le projet existant)
   - Récupérer la connection string pooled (`?pgbouncer=true`)

2. **Créer le service Railway**
   - Dashboard Railway → New Service → Deploy from GitHub repo (le même repo)
   - Settings → Service Name : `hospital-erp-<hopital>`
   - Settings → Variables : copier les variables d'env (voir `RAILWAY.md`),
     en remplaçant `DATABASE_URL` par celle du nouveau Neon

3. **Configurer le domaine custom**
   - Settings → Networking → Custom Domain → `app.<hopital>.<tld>`
   - Suivre l'instruction DNS (créer un `CNAME` chez le registrar du client
     pointant vers `<service>.up.railway.app`)
   - TLS Let's Encrypt s'active automatiquement (~5 minutes)
   - Mettre à jour `FRONTEND_URL` avec le nouveau domaine

4. **Personnaliser l'établissement**
   - Première connexion : `admin` / `admin123` (force le changement de mot de passe)
   - Paramètres → personnaliser `nom_etablissement`, `devise`, logo, en-têtes
   - Voir la section 5 ci-dessous pour la liste complète des paramètres

5. **Activer les contrôles HIPAA**
   - Générer et configurer `JWT_SECRET` et `PHI_ENCRYPTION_KEY` (voir `RAILWAY.md`)
   - Activer Redis pour les sessions (multi-replica)
   - Vérifier que `NODE_ENV=production` est bien défini

### 4.2 Mise à jour groupée des hôpitaux

Le repo GitHub est lié à tous les services Railway. Un `git push` sur la
branche `main` déclenche un rebuild de chaque service en parallèle. Une
migration de schéma Prisma s'applique au boot via `prisma migrate deploy`
(à ajouter au start command — voir section 6 ci-dessous).

Pour suspendre un hôpital lors d'une mise à jour majeure : Railway →
Service → Settings → Pause.

### 4.3 Sauvegarde

Chaque base Neon dispose d'un Point-in-Time Recovery sur 7 jours (plan
free) ou 30 jours (plan paid). Documenté dans `PCA_PLAN_CONTINUITE.md`.

Pour une sauvegarde froide externe (hors Neon), un cron job hebdomadaire
peut exécuter `pg_dump` vers un bucket S3 dédié à chaque hôpital — voir
section "Évolutions futures" du PCA.

## 5. Personnalisation par hôpital

Les éléments suivants sont configurables sans déploiement, via la table
`settings` (clé/valeur). Le seed initial est fait par `src/config/init.ts`
au premier boot.

### 5.1 Paramètres déjà disponibles

| Clé | Description | Exemple |
|---|---|---|
| `nom_etablissement` | Nom affiché en en-tête et impressions | "CHU de Cocody" |
| `devise` | Devise pour les montants | "XAF", "EUR", "USD" |
| `patient_id_format` | Format de l'ID patient | `PAT-{YYMM}-{NP}-{SEQ:4}` |
| `patient_id_prefix` | Préfixe de l'ID patient | "PAT", "CHU" |
| `session_timeout_minutes` | Timeout d'inactivité | "30" |

### 5.2 Paramètres à ajouter (roadmap personnalisation)

| Clé | Description | Module concerné |
|---|---|---|
| `logo_url` | URL du logo affiché en en-tête | Tous |
| `couleur_primaire` | Couleur d'accent CSS | Frontend |
| `adresse_etablissement` | Adresse postale complète | Impressions |
| `telephone_etablissement` | Téléphone principal | Impressions, SMS |
| `email_etablissement` | Email de contact | Emails sortants |
| `numero_agrement` | N° d'agrément ministère santé | Impressions légales |
| `directeur_etablissement` | Nom du directeur médical | Impressions |
| `pied_page_facture` | Mentions légales factures | Impressions |
| `langue_defaut` | Langue d'interface par défaut | Frontend |
| `format_date` | DD/MM/YYYY ou YYYY-MM-DD | Frontend |
| `mode_paiement_actifs` | Modes acceptés (CSV) | Finances |
| `tva_taux` | Taux de TVA applicable | Facturation |
| `numerotation_facture` | Format des numéros de facture | Facturation |

## 6. Travaux à prévoir

- [ ] **Ajout de `prisma migrate deploy` au start command** dans `nixpacks.toml`
      pour que les nouvelles migrations s'appliquent automatiquement à chaque
      hôpital lors du redéploiement
- [ ] **Onboarding wizard** dans l'admin UI pour saisir les paramètres
      ci-dessus à la première connexion
- [ ] **Upload de logo** sécurisé (validation magic-bytes + redimensionnement
      automatique)
- [ ] **Aperçu en direct** des templates d'impression (facture, ordonnance)
      avec les paramètres saisis
- [ ] **Export hôpital** : bouton "exporter toutes les données de cet
      établissement" (obligation RGPD article 20, portabilité)
- [ ] **Page "À propos de cet hôpital"** côté portail patient affichant
      les coordonnées et le N° d'agrément

## 7. Références

- `RAILWAY.md` — procédure complète de déploiement Railway
- `PCA_PLAN_CONTINUITE.md` — plan de continuité d'activité
- `PSSI_POLITIQUE_SECURITE.md` — politique de sécurité du système d'information
- `docs/RGPD_REGISTRE_TRAITEMENTS.md` — registre des traitements RGPD
