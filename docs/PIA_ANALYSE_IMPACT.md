# Analyse d'Impact relative à la Protection des Données (PIA/AIPD)

**Application** : Hospital ERP  
**Responsable** : [Nom de l'établissement]  
**Date** : 2026-05-08  
**Référence** : RGPD Art. 35 — Traitement à grande échelle de données de santé

---

## 1. Description du traitement

### 1.1 Contexte

Hospital ERP est un système d'information hospitalier (SIH) qui gère l'ensemble du parcours patient : admission, consultations, prescriptions, laboratoire, imagerie, facturation et paiements mobiles.

### 1.2 Nature du traitement

- Collecte de données d'identité et de santé lors de l'admission
- Enregistrement des actes médicaux (consultations, prescriptions, résultats)
- Facturation et encaissement (espèces, mobile money via Remita)
- Accès patient via portail web (OTP)

### 1.3 Portée

- **Volume** : jusqu'à 10 000 patients, 50 utilisateurs
- **Géographie** : Cameroun (possibilité d'extension)
- **Durée** : traitement continu

### 1.4 Finalités

1. Prise en charge médicale des patients
2. Gestion administrative et financière de l'hôpital
3. Traçabilité des actes pour la qualité des soins
4. Facturation et recouvrement

---

## 2. Nécessité et proportionnalité

| Principe | Évaluation |
|---|---|
| **Finalité déterminée** | ✅ Chaque traitement a une finalité claire et documentée |
| **Minimisation** | ⚠️ Certains champs optionnels (profession, lieu de naissance) pourraient être supprimés |
| **Exactitude** | ✅ Modification possible par le personnel autorisé |
| **Limitation de conservation** | ✅ 20 ans (obligation légale médicale) |
| **Base légale** | ✅ Contrat de soins (Art. 6.1.b) + exception santé (Art. 9.2.h) |

---

## 3. Évaluation des risques

### 3.1 Sources de menaces

| Source | Motivation | Capacité |
|---|---|---|
| Cybercriminel externe | Vol de données de santé (revente) | Élevée |
| Personnel malveillant | Curiosité, chantage | Moyenne |
| Erreur humaine | Mauvaise manipulation | Élevée |
| Défaillance technique | Perte de données | Moyenne |

### 3.2 Événements redoutés

| Événement | Impact | Vraisemblance | Gravité |
|---|---|---|---|
| Accès illégitime aux dossiers patients | Atteinte à la vie privée, discrimination | Moyenne | Élevée |
| Modification non autorisée d'un dossier | Erreur médicale potentielle | Faible | Critique |
| Perte de données médicales | Rupture de continuité des soins | Faible | Élevée |
| Fuite de la base de données | Exposition massive de PHI | Faible | Critique |

### 3.3 Mesures existantes

| Mesure | Risque couvert | Efficacité |
|---|---|---|
| Authentification JWT + MFA TOTP | Accès illégitime | Élevée |
| Contrôle d'accès par rôle (RBAC) | Accès non autorisé | Élevée |
| Attribution patient-médecin | IDOR horizontal | Élevée |
| Chiffrement AES-256-GCM au repos | Fuite DB | Élevée |
| TLS en transit | Interception | Élevée |
| Audit trail immutable (WORM) | Modification non tracée | Élevée |
| Argon2id pour mots de passe | Brute-force | Élevée |
| Rate-limiting | DoS, brute-force | Moyenne |
| Soft-delete (pas de suppression physique) | Perte de données | Élevée |
| Sauvegarde Neon (point-in-time recovery) | Perte de données | Élevée |
| Session timeout 30min | Session abandonnée | Moyenne |
| Blacklist JWT (Redis) | Token volé | Élevée |
| Validation Zod | Injection, données corrompues | Moyenne |
| CSP + Helmet | XSS, clickjacking | Moyenne |

---

## 4. Risques résiduels

| Risque | Niveau résiduel | Plan d'action |
|---|---|---|
| Hébergeur non certifié HDS | Moyen | Migrer vers OVHcloud HDS ou Scaleway HDS si cible France |
| Pas de chiffrement du secret MFA | Faible | Chiffrer avec PHI_ENCRYPTION_KEY (prévu) |
| Session en mémoire (sans Redis) | Faible | Configurer Redis en production |
| Personnel avec accès DB direct | Faible | Restreindre les accès DB aux seuls admins infra |

---

## 5. Plan d'action

| # | Action | Responsable | Échéance | Statut |
|---|---|---|---|---|
| 1 | Désigner un DPO | Direction | T3 2026 | À faire |
| 2 | Configurer PHI_ENCRYPTION_KEY en prod | DevOps | Immédiat | À faire |
| 3 | Ajouter Redis pour sessions distribuées | DevOps | T3 2026 | À faire |
| 4 | Rédiger mentions légales portail patient | Juridique | T3 2026 | À faire |
| 5 | Former le personnel à la protection des données | DPO | T3 2026 | À faire |
| 6 | Audit de pénétration externe | Prestataire sécurité | T4 2026 | À faire |
| 7 | Évaluer migration hébergeur HDS | Direction + DSI | T4 2026 | À faire |

---

## 6. Avis du DPO

*[À compléter une fois le DPO désigné]*

---

## 7. Décision

☐ Le traitement peut être mis en œuvre (risques acceptables)  
☐ Le traitement nécessite des mesures complémentaires avant mise en œuvre  
☐ Consultation de l'autorité de contrôle nécessaire (Art. 36)

**Signature du responsable de traitement** : _______________  
**Date** : _______________

---

*Ce document doit être révisé annuellement ou lors de toute modification significative du traitement.*
