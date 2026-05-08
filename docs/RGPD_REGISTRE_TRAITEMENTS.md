# Registre des traitements — Hospital ERP

**Responsable de traitement** : [Nom de l'établissement hospitalier]  
**DPO (Délégué à la Protection des Données)** : [À désigner]  
**Date de création** : 2026-05-08  
**Dernière mise à jour** : 2026-05-08

---

## 1. Gestion des dossiers patients

| Champ | Détail |
|---|---|
| **Finalité** | Prise en charge médicale, suivi des soins, facturation |
| **Base légale** | Art. 6(1)(b) RGPD — exécution d'un contrat de soins ; Art. 9(2)(h) — médecine préventive, diagnostics médicaux |
| **Catégories de personnes** | Patients |
| **Catégories de données** | Identité (nom, prénom, date naissance, sexe), coordonnées (téléphone, email, adresse), données de santé (groupe sanguin, pathologies, allergies, observations cliniques, prescriptions, vaccinations, résultats labo, imagerie) |
| **Destinataires** | Personnel médical autorisé, personnel administratif (facturation), laboratoire |
| **Transferts hors UE** | Hébergement Neon (AWS eu-west-2, Irlande) — pas de transfert hors UE |
| **Durée de conservation** | 20 ans après le dernier passage (réglementation médicale française) ; archivage au-delà |
| **Mesures de sécurité** | Chiffrement AES-256-GCM au repos, TLS en transit, authentification JWT, contrôle d'accès par rôle, audit trail immutable |

---

## 2. Gestion des rendez-vous

| Champ | Détail |
|---|---|
| **Finalité** | Planification et suivi des consultations |
| **Base légale** | Art. 6(1)(b) — exécution du contrat de soins |
| **Catégories de personnes** | Patients, médecins |
| **Catégories de données** | Identité patient, date/heure RDV, motif, service, médecin |
| **Destinataires** | Personnel médical, réception |
| **Durée de conservation** | 5 ans après le RDV |
| **Mesures de sécurité** | Authentification requise, accès par rôle |

---

## 3. Portail patient (accès en ligne)

| Champ | Détail |
|---|---|
| **Finalité** | Permettre au patient de consulter ses RDV et en prendre de nouveaux |
| **Base légale** | Art. 6(1)(a) — consentement explicite du patient |
| **Catégories de personnes** | Patients |
| **Catégories de données** | Identité, téléphone/email (pour OTP), historique RDV |
| **Destinataires** | Le patient lui-même uniquement |
| **Durée de conservation** | Durée du compte actif + 1 an après dernière connexion |
| **Mesures de sécurité** | OTP cryptographique, rate-limit, token JWT 1h, algorithme épinglé |

---

## 4. Facturation et paiements

| Champ | Détail |
|---|---|
| **Finalité** | Facturation des actes médicaux, suivi des paiements |
| **Base légale** | Art. 6(1)(b) — exécution du contrat ; Art. 6(1)(c) — obligation légale (comptabilité) |
| **Catégories de personnes** | Patients |
| **Catégories de données** | Identité patient, actes facturés, montants, mode de paiement, numéro de téléphone (mobile money) |
| **Destinataires** | Comptabilité, Remita (prestataire paiement mobile) |
| **Transferts** | Remita API (Cameroun) — données minimales : téléphone, montant |
| **Durée de conservation** | 10 ans (obligation comptable) |
| **Mesures de sécurité** | Soft-delete (contre-passation), audit trail, validation Zod |

---

## 5. Gestion des utilisateurs et authentification

| Champ | Détail |
|---|---|
| **Finalité** | Contrôle d'accès, traçabilité des actions |
| **Base légale** | Art. 6(1)(f) — intérêt légitime (sécurité du SI) |
| **Catégories de personnes** | Personnel hospitalier (médecins, comptables, laborantins, réception, admin) |
| **Catégories de données** | Nom, prénom, identifiant, mot de passe hashé (argon2), rôle, MFA secret (chiffré), logs de connexion |
| **Destinataires** | Administrateurs système |
| **Durée de conservation** | Durée du contrat de travail + 5 ans |
| **Mesures de sécurité** | Argon2id, MFA TOTP, blacklist JWT, session timeout 30min, audit immutable |

---

## 6. Journal d'audit

| Champ | Détail |
|---|---|
| **Finalité** | Traçabilité des accès et modifications aux données de santé |
| **Base légale** | Art. 6(1)(c) — obligation légale (traçabilité HDS) ; Art. 6(1)(f) — intérêt légitime |
| **Catégories de personnes** | Tous les utilisateurs du système |
| **Catégories de données** | ID utilisateur, action, table concernée, ID enregistrement, détails (diff before/after), horodatage |
| **Destinataires** | Administrateurs, auditeurs |
| **Durée de conservation** | 10 ans (immutable — trigger PostgreSQL empêche modification/suppression) |
| **Mesures de sécurité** | Table WORM, pas de DELETE/UPDATE possible |

---

## 7. Notifications et communications

| Champ | Détail |
|---|---|
| **Finalité** | Rappels de RDV, notifications de résultats |
| **Base légale** | Art. 6(1)(b) — exécution du contrat de soins |
| **Catégories de personnes** | Patients |
| **Catégories de données** | Téléphone, email, contenu du message |
| **Destinataires** | Prestataire SMS/email (à configurer) |
| **Durée de conservation** | 1 an |
| **Mesures de sécurité** | Logs de notification, pas de données médicales dans le contenu |

---

## Droits des personnes concernées

| Droit | Mise en œuvre |
|---|---|
| **Accès (Art. 15)** | Portail patient + export CSV sur demande |
| **Rectification (Art. 16)** | Modification via le personnel autorisé |
| **Effacement (Art. 17)** | Soft-delete (archivage) — conservation obligatoire 20 ans pour données médicales |
| **Portabilité (Art. 20)** | Export CSV/FHIR des données patient |
| **Opposition (Art. 21)** | Demande écrite au DPO |
| **Limitation (Art. 18)** | Archivage du dossier sans suppression |

---

## Sous-traitants

| Sous-traitant | Rôle | Localisation | Garanties |
|---|---|---|---|
| Neon | Hébergement base de données | AWS eu-west-2 (Irlande) | Chiffrement disque AES-256, SOC 2 |
| Railway | Hébergement applicatif | GCP (variable) | SOC 2, chiffrement en transit |
| Remita | Paiement mobile money | Cameroun | API sécurisée, token JWT |

---

*Ce registre doit être mis à jour à chaque nouveau traitement ou modification significative.*
