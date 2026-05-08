# Plan de Continuité d'Activité (PCA) et Plan de Reprise d'Activité (PRA)

**Application** : Hospital ERP  
**Version** : 1.0  
**Date** : 2026-05-08  
**Classification** : Confidentiel

---

## 1. Objectifs

Ce document définit les procédures pour assurer la continuité du service Hospital ERP en cas d'incident majeur et la reprise d'activité dans les délais définis.

### 1.1 Métriques cibles

| Métrique | Valeur | Justification |
|---|---|---|
| **RPO** (perte de données max) | 1 heure | Neon PITR (point-in-time recovery) |
| **RTO** (temps de reprise max) | 4 heures | Redéploiement complet |
| **Disponibilité cible** | 99.5% | ~44h d'indisponibilité max/an |

---

## 2. Architecture et dépendances

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Client    │────▶│   Railway    │────▶│    Neon     │
│  (Browser)  │     │  (Node.js)   │     │ (PostgreSQL)│
└─────────────┘     └──────────────┘     └─────────────┘
                           │                      │
                           ▼                      ▼
                    ┌──────────────┐     ┌─────────────┐
                    │    Redis     │     │   Backups   │
                    │  (Sessions)  │     │  (Neon WAL) │
                    └──────────────┘     └─────────────┘
                           │
                           ▼
                    ┌──────────────┐
                    │   Remita     │
                    │  (Paiement)  │
                    └──────────────┘
```

### 2.1 Composants critiques

| Composant | Criticité | Fournisseur | SLA |
|---|---|---|---|
| Application (backend + frontend) | Critique | Railway | 99.9% |
| Base de données | Critique | Neon | 99.95% |
| Redis (sessions) | Important | Railway | 99.9% |
| Paiement mobile | Important | Remita | Variable |
| GitHub (code source) | Normal | GitHub | 99.9% |

---

## 3. Scénarios d'incident

### 3.1 Panne de l'application (Railway)

| Étape | Action | Responsable | Délai |
|---|---|---|---|
| Détection | Alerte monitoring (health check échoue) | Automatique | < 1 min |
| Auto-recovery | Railway redéploie automatiquement | Railway | < 5 min |
| Si échec | Vérifier les logs, rollback au dernier commit stable | Admin | < 30 min |
| Escalade | Contacter Railway support | Admin | < 1h |

**Commande de rollback** :
```bash
git revert HEAD
git push origin master
```

### 3.2 Panne de la base de données (Neon)

| Étape | Action | Responsable | Délai |
|---|---|---|---|
| Détection | Erreurs de connexion dans les logs | Automatique | < 1 min |
| Vérification | Consulter status.neon.tech | Admin | < 5 min |
| Si panne Neon | Attendre la résolution (SLA 99.95%) | — | Variable |
| Si corruption | Restauration PITR via console Neon | Admin | < 1h |

**Procédure de restauration Neon** :
1. Aller sur console.neon.tech → projet → Branches
2. Créer une branche à partir d'un point dans le temps (avant l'incident)
3. Mettre à jour `DATABASE_URL` dans Railway avec la nouvelle branche
4. Redéployer

### 3.3 Compromission de sécurité

| Étape | Action | Responsable | Délai |
|---|---|---|---|
| Détection | Alerte audit_log, comportement anormal | RSSI | Variable |
| Confinement | Roter JWT_SECRET (invalide tous les tokens) | Admin | < 15 min |
| Investigation | Analyser audit_log, identifier l'étendue | RSSI | < 4h |
| Remédiation | Corriger la faille, roter les secrets compromis | Dev | < 24h |
| Notification | Informer les patients si données exposées | DPO | < 72h |

**Commandes d'urgence** :
```bash
# Invalider tous les tokens (changer JWT_SECRET dans Railway)
# Tous les utilisateurs seront déconnectés immédiatement

# Roter les credentials Neon
# Console Neon → Settings → Reset password

# Roter Remita credentials
# Contacter support Remita
```

### 3.4 Perte totale (catastrophe)

| Étape | Action | Responsable | Délai |
|---|---|---|---|
| 1 | Créer un nouveau projet Railway | Admin | 15 min |
| 2 | Connecter le repo GitHub | Admin | 5 min |
| 3 | Configurer les variables d'environnement | Admin | 15 min |
| 4 | Restaurer la DB depuis Neon PITR | Admin | 30 min |
| 5 | Vérifier le fonctionnement | Admin | 30 min |
| 6 | Mettre à jour le DNS si nécessaire | Admin | Variable |

**RTO total** : ~2h

---

## 4. Sauvegardes

### 4.1 Stratégie

| Donnée | Méthode | Fréquence | Rétention | Localisation |
|---|---|---|---|---|
| Base de données | Neon WAL (PITR) | Continue | 7 jours | AWS eu-west-2 |
| Code source | Git (GitHub) | À chaque commit | Illimité | GitHub |
| Variables d'env | Railway Secrets | — | — | Railway |
| Documentation | Git (dans /docs) | À chaque commit | Illimité | GitHub |

### 4.2 Test de restauration

| Test | Fréquence | Dernière exécution | Résultat |
|---|---|---|---|
| Restauration DB (PITR) | Trimestriel | [À planifier] | — |
| Redéploiement complet | Semestriel | [À planifier] | — |
| Rollback applicatif | À chaque release | Continu | OK |

---

## 5. Communication de crise

### 5.1 Matrice d'escalade

| Niveau | Critère | Qui informer | Délai |
|---|---|---|---|
| 1 - Mineur | Service dégradé < 30 min | Équipe technique | Immédiat |
| 2 - Majeur | Indisponibilité > 30 min | Direction + technique | < 1h |
| 3 - Critique | Perte de données ou compromission | Direction + DPO + autorités | < 4h |

### 5.2 Messages types

**Indisponibilité planifiée** :
> Le système Hospital ERP sera indisponible le [date] de [heure] à [heure] pour maintenance. Veuillez sauvegarder vos travaux en cours.

**Incident en cours** :
> Le système Hospital ERP rencontre actuellement des difficultés. Nos équipes travaillent à la résolution. Nous vous tiendrons informés.

**Résolution** :
> L'incident affectant Hospital ERP est résolu. Le service est rétabli. Nous nous excusons pour la gêne occasionnée.

---

## 6. Mode dégradé

En cas d'indisponibilité prolongée du système :

| Fonction | Mode dégradé | Support |
|---|---|---|
| Admission patient | Formulaire papier | Secrétariat |
| Consultations | Dossier papier | Médecin |
| Prescriptions | Ordonnance manuscrite | Médecin |
| Facturation | Facturier papier | Comptabilité |
| Laboratoire | Registre papier | Laborantin |

**Procédure de rattrapage** : à la reprise du système, saisir les données papier dans Hospital ERP (priorité : patients admis, résultats labo critiques).

---

## 7. Révision

| Date | Version | Modification | Auteur |
|---|---|---|---|
| 2026-05-08 | 1.0 | Création initiale | [Auteur] |

---

*Ce document est classifié CONFIDENTIEL et ne doit pas être diffusé en dehors de l'équipe technique et de la direction.*
