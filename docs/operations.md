# Hospital-ERP — Runbook opérationnel

Document court à destination de l'admin sys ou du dev d'astreinte.
Couvre : sauvegardes, restauration, vérification audit, observabilité
minimum.

## 1. Sauvegarde quotidienne

### Quoi sauvegarder

| Composant | Méthode | Fréquence recommandée |
|---|---|---|
| **Base Postgres** | `scripts/backup.sh` (pg_dump custom format) | toutes les 6 h |
| **Uploads** (logo, imagerie) | `rsync` du dossier `packages/backend/uploads/` | quotidien |
| **Variables d'env** (`.env` Railway / secrets) | export manuel chiffré | à chaque modification |

### Lancer un backup

```bash
DATABASE_URL='postgres://user:pw@host:port/dbname' \
  ./scripts/backup.sh /var/backups/hospital
```

Sortie : `/var/backups/hospital/hospital-erp-<UTC>.dump` + un fichier
sentinelle `.ok` qui marque que le dump est complet (un job de copie
externe doit attendre la présence du `.ok`).

Le script garde 14 jours de dumps et supprime les plus vieux.

### Cron suggéré

```
0 */6 * * * cd /app && ./scripts/backup.sh /var/backups/hospital >> /var/log/hospital-backup.log 2>&1
```

## 2. Restauration

### Procédure

1. Identifier le dump à restaurer (toujours préférer un `.ok`).
2. Idéalement, restaurer dans une base **vide** d'un environnement de
   test d'abord pour confirmer.
3. Sur la cible finale :

```bash
I_UNDERSTAND_THIS_DROPS_THE_DB=YES \
DATABASE_URL='postgres://…' \
  ./scripts/restore.sh /var/backups/hospital/hospital-erp-20260530T1200Z.dump
```

Le script :
- exige le sentinelle `.ok` (refuse un dump partiel) ;
- exige la variable `I_UNDERSTAND_THIS_DROPS_THE_DB=YES` (anti
  fat-finger) ;
- DROP + CREATE le schema `public`, puis `pg_restore` ;
- affiche un sanity check (`patients`, `users`, `audit_log` counts).

### Après restauration

- Redémarrer le process app (init.ts re-aligne les enums si besoin).
- Vérifier le posture admin : `/app/securite` doit afficher la chaîne
  d'audit intacte.

## 3. Drill (exercice de restauration)

À faire **au moins une fois par trimestre** sur un environnement
intermédiaire pour valider que la procédure marche encore. À chaque
fois consigner :

- date du drill ;
- taille du dump ;
- temps de pg_restore (proxy de SLA RTO) ;
- count rows comparé avant/après ;
- problème(s) rencontré(s).

Tableau suggéré dans `docs/drills.md`.

## 4. Vérification de la chaîne d'audit

La chaîne SHA-256 du `audit_log` est vérifiée :

- **Au boot** : 30 s après le démarrage du process ;
- **Périodiquement** : toutes les 6 h ;
- **À la demande** : `GET /api/admin/audit-verify` (admin only).

Une rupture déclenche :
1. Log `[AUDIT_VERIFY] CHAIN BROKEN` ;
2. Insertion d'une ligne `audit_log` documentant la rupture ;
3. Notification in-app à tous les admins actifs.

Si une rupture est détectée :
- ne pas modifier la base ;
- pull-er le dump le plus récent qui inclut la ligne corrompue ;
- comparer avec un dump précédent ;
- investiguer (généralement = un `DELETE` direct sur `audit_log`
  ou une rotation Postgres point-in-time).

## 5. Variables d'environnement critiques

À ne PAS perdre — sans elles l'app refuse de démarrer en prod :

| Variable | Effet |
|---|---|
| `DATABASE_URL` | Connexion Postgres |
| `JWT_SECRET` | Signature des tokens (perte = invalide TOUTES les sessions) |
| `PHI_ENCRYPTION_KEY` | Clé AES pour `numeroIdentite` / `contactUrgenceNom` / `contactUrgenceTelephone` (perte = les valeurs chiffrées deviennent illisibles ; le reste tourne) |
| `REDIS_URL` | Optionnel : sessions distribuées multi-replica |
| `FRONTEND_URL` | CORS allowlist |

## 6. Test de charge

```bash
# Installer k6 : https://k6.io/docs/get-started/installation/
# Puis :
k6 run \
  -e BASE_URL=https://hospital-erp-production.up.railway.app \
  -e USERNAME=admin -e PASSWORD=admin123 \
  scripts/loadtest.k6.js
```

Baselines suggérées (à ajuster après la première vraie passe) :

| Métrique | p95 cible | Action si dépassé |
|---|---|---|
| `login_duration` | < 500 ms | profile argon2 + DB pool |
| `patients_list_duration` | < 400 ms | check index sur (`archived`, `created_at`) + accessiblePatientIds UNION |
| `laboratoire_duration` | < 600 ms | check JOIN patient + ORDER BY priorité |
| `errors` | < 1 % | regarder logs côté serveur, souvent un 500 sur edge case |

À refaire après chaque release majeure ET avant chaque déploiement
chez un client à plus de 10 utilisateurs simultanés.

## 7. Récupération minimale en cas de désastre total

Procédure d'urgence si on perd à la fois Railway et la sauvegarde :

1. Reprovisionner une base Postgres vierge.
2. Restaurer le dump le plus récent.
3. Reprovisionner l'app Railway (commit master).
4. Restaurer les uploads/ depuis la copie rsync.
5. Forcer un reset des mots de passe admin (`/api/auth/users/:id/reset-password`).
6. Communiquer aux médecins/réception leur nouvel identifiant + flag
   `must_change_password=true`.
