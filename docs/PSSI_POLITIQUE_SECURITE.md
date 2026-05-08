# Politique de Sécurité du Système d'Information (PSSI)

**Organisation** : [Nom de l'établissement hospitalier]  
**Application** : Hospital ERP  
**Version** : 1.0  
**Date** : 2026-05-08  
**Classification** : Interne

---

## 1. Objet et périmètre

Cette politique définit les règles de sécurité applicables au système d'information hospitalier Hospital ERP. Elle couvre :

- L'application web (frontend + backend)
- La base de données PostgreSQL
- Les services tiers (Remita, hébergement)
- Les postes de travail des utilisateurs
- Les données de santé des patients (PHI)

---

## 2. Gouvernance

### 2.1 Rôles et responsabilités

| Rôle | Responsabilité |
|---|---|
| **Direction** | Validation de la PSSI, allocation des ressources |
| **RSSI** (Responsable Sécurité SI) | Mise en œuvre et suivi de la PSSI |
| **DPO** | Conformité RGPD, registre des traitements |
| **Administrateur système** | Gestion technique, mises à jour, sauvegardes |
| **Utilisateurs** | Respect des règles, signalement des incidents |

### 2.2 Révision

Cette politique est révisée :
- Annuellement (revue complète)
- Après tout incident de sécurité
- Lors de changements majeurs du SI

---

## 3. Classification des données

| Niveau | Description | Exemples | Mesures |
|---|---|---|---|
| **Secret** | Données de santé sensibles | Pathologies, observations, prescriptions | Chiffrement au repos + transit, accès médecin uniquement |
| **Confidentiel** | Données personnelles | Identité patient, coordonnées | Chiffrement au repos, accès authentifié |
| **Interne** | Données opérationnelles | Tarifs, planning, stocks | Accès authentifié |
| **Public** | Informations générales | Horaires, services proposés | Aucune restriction |

---

## 4. Contrôle d'accès

### 4.1 Principes

- **Moindre privilège** : chaque utilisateur n'a accès qu'aux données nécessaires à sa fonction
- **Séparation des devoirs** : un même utilisateur ne peut pas créer et valider une opération critique
- **Need-to-know** : les médecins n'accèdent qu'aux patients qui leur sont attribués

### 4.2 Authentification

| Mesure | Détail |
|---|---|
| Mot de passe | Min 8 caractères, majuscule, minuscule, chiffre, caractère spécial |
| Mots de passe interdits | Liste de 40 mots de passe courants bloqués |
| Hachage | Argon2id (memoryCost=64MB, timeCost=3) |
| MFA | TOTP obligatoire pour admin et médecin |
| Session | Timeout 30 min d'inactivité (serveur) |
| Verrouillage | Rate-limit 10 tentatives / 15 min par IP |
| Token | JWT HS256, durée 8h, révocable (blacklist) |

### 4.3 Rôles applicatifs

| Rôle | Accès |
|---|---|
| Admin | Toutes les fonctionnalités |
| Médecin | Patients attribués, consultations, prescriptions, labo, imagerie |
| Comptable | Finances, facturation, paiements, rapports |
| Laborantin | Laboratoire, résultats |
| Réception | Patients, rendez-vous, file d'attente |

---

## 5. Sécurité des données

### 5.1 Chiffrement

| Couche | Algorithme | Détail |
|---|---|---|
| Transit | TLS 1.2+ | HTTPS obligatoire (HSTS) |
| Repos (disque) | AES-256 | Neon PostgreSQL encryption at rest |
| Repos (applicatif) | AES-256-GCM | Champs PHI sensibles (numéro identité, groupe sanguin, observations) |
| Mots de passe | Argon2id | Irréversible |
| MFA secrets | AES-256-GCM | Chiffré avec clé applicative |

### 5.2 Sauvegarde

| Élément | Fréquence | Rétention | Test de restauration |
|---|---|---|---|
| Base de données | Continue (Neon PITR) | 7 jours | Trimestriel |
| Code source | À chaque commit (GitHub) | Illimité | — |
| Configuration | Railway Secrets | — | — |

### 5.3 Journalisation

- Toutes les opérations CREATE/UPDATE/DELETE sur les données patient sont tracées
- Table `audit_log` immutable (trigger PostgreSQL WORM)
- Conservation : 10 ans
- Contenu : utilisateur, action, table, enregistrement, diff before/after, horodatage

---

## 6. Sécurité réseau

| Mesure | Détail |
|---|---|
| HTTPS | Obligatoire, redirection HTTP → HTTPS |
| CSP | Content-Security-Policy active (frame-src none, object-src none) |
| CORS | Origines autorisées explicitement |
| Rate-limiting | Global (500 req/15min) + auth (10/15min) + OTP (5/5min) |
| Headers | Helmet (HSTS, X-Content-Type-Options, Referrer-Policy) |
| Proxy | Trust proxy configuré pour Railway |

---

## 7. Gestion des vulnérabilités

### 7.1 Mises à jour

- Dépendances : revue mensuelle (`npm audit`)
- OS/runtime : géré par Railway (mises à jour automatiques)
- Application : déploiement continu via GitHub → Railway

### 7.2 Tests de sécurité

| Type | Fréquence | Responsable |
|---|---|---|
| Revue de code | À chaque PR | Développeur |
| Audit OWASP | Semestriel | RSSI |
| Test de pénétration | Annuel | Prestataire externe |
| Scan de dépendances | Continu (npm audit) | CI/CD |

---

## 8. Gestion des incidents

### 8.1 Définition d'un incident

Tout événement compromettant la confidentialité, l'intégrité ou la disponibilité des données :
- Accès non autorisé détecté
- Fuite de données suspectée
- Indisponibilité du service > 1h
- Tentative d'intrusion détectée

### 8.2 Procédure de réponse

| Étape | Action | Délai | Responsable |
|---|---|---|---|
| 1. Détection | Alerte via logs/monitoring | Immédiat | Système |
| 2. Qualification | Évaluer la gravité et l'impact | < 1h | RSSI |
| 3. Confinement | Isoler le composant affecté | < 2h | Admin système |
| 4. Notification | Informer la direction + DPO | < 4h | RSSI |
| 5. Notification CNIL | Si violation de données personnelles | < 72h | DPO |
| 6. Remédiation | Corriger la vulnérabilité | Variable | Équipe technique |
| 7. Post-mortem | Analyse root cause, plan d'amélioration | < 1 semaine | RSSI |

### 8.3 Contacts d'urgence

| Rôle | Contact |
|---|---|
| RSSI | [À compléter] |
| DPO | [À compléter] |
| Hébergeur (Railway) | support@railway.app |
| Hébergeur DB (Neon) | support@neon.tech |

---

## 9. Continuité d'activité

### 9.1 Objectifs

| Métrique | Objectif |
|---|---|
| **RPO** (Recovery Point Objective) | < 1h (Neon PITR) |
| **RTO** (Recovery Time Objective) | < 4h |
| **Disponibilité** | 99.5% (hors maintenance planifiée) |

### 9.2 Scénarios de reprise

| Scénario | Action | RTO |
|---|---|---|
| Panne Railway | Redéploiement automatique | < 5 min |
| Corruption DB | Restauration Neon PITR | < 1h |
| Compromission serveur | Redéploiement depuis GitHub (code propre) | < 30 min |
| Perte totale | Nouveau déploiement Railway + restauration Neon | < 4h |

---

## 10. Sensibilisation et formation

| Public | Formation | Fréquence |
|---|---|---|
| Tous les utilisateurs | Hygiène numérique, phishing, mots de passe | Annuelle |
| Personnel médical | Confidentialité des données de santé | À l'embauche + annuelle |
| Administrateurs | Sécurité technique, gestion des incidents | Semestrielle |

---

## 11. Conformité

| Référentiel | Statut | Actions |
|---|---|---|
| RGPD | Conforme (registre, PIA, droits des personnes) | Désigner DPO |
| OWASP Top 10 | ~80% conforme | Audit semestriel |
| ISO 27001 | Partiellement conforme | Certification optionnelle |
| HDS | Non conforme (hébergeur) | Migration si cible France |

---

## 12. Sanctions

Le non-respect de cette politique peut entraîner :
- Avertissement
- Suspension des accès
- Sanctions disciplinaires
- Poursuites judiciaires (en cas de violation intentionnelle)

---

**Approuvé par** : _______________  
**Fonction** : _______________  
**Date** : _______________

---

*Document classifié INTERNE — Ne pas diffuser en dehors de l'organisation.*
