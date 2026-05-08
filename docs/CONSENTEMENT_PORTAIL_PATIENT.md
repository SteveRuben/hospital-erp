# Consentement et Mentions Légales — Portail Patient

**Application** : Hospital ERP — Portail Patient  
**Date** : 2026-05-08

---

## 1. Mentions légales (à afficher sur le portail)

### 1.1 Éditeur

**[Nom de l'établissement hospitalier]**  
[Adresse complète]  
Téléphone : [Numéro]  
Email : [Email de contact]  
Directeur de la publication : [Nom du directeur]

### 1.2 Hébergement

- Application : Railway Inc., San Francisco, CA, USA
- Base de données : Neon Inc. (AWS eu-west-2, Irlande, UE)

### 1.3 Délégué à la Protection des Données (DPO)

[Nom du DPO]  
Email : [dpo@etablissement.cm]  
Téléphone : [Numéro]

---

## 2. Politique de confidentialité

### 2.1 Données collectées

Lorsque vous utilisez le portail patient, nous collectons :

- **Données d'identification** : nom, prénom (déjà dans votre dossier médical)
- **Données de contact** : numéro de téléphone ou email (pour l'envoi du code OTP)
- **Données de connexion** : adresse IP, date/heure de connexion, navigateur utilisé

### 2.2 Finalités du traitement

| Finalité | Base légale |
|---|---|
| Authentification par OTP | Consentement (Art. 6.1.a RGPD) |
| Consultation de vos rendez-vous | Exécution du contrat de soins (Art. 6.1.b) |
| Prise de rendez-vous en ligne | Exécution du contrat de soins (Art. 6.1.b) |
| Sécurité et traçabilité | Intérêt légitime (Art. 6.1.f) |

### 2.3 Destinataires

Vos données sont accessibles uniquement :
- À vous-même (via le portail)
- Au personnel médical autorisé de l'établissement
- Au personnel technique (maintenance du système, accès restreint)

Aucune donnée n'est vendue ou partagée avec des tiers à des fins commerciales.

### 2.4 Durée de conservation

- Données de connexion : 1 an
- Données médicales : 20 ans après le dernier passage (obligation légale)
- Codes OTP : 5 minutes (supprimés après utilisation)

### 2.5 Sécurité

Vos données sont protégées par :
- Chiffrement en transit (HTTPS/TLS)
- Chiffrement au repos (AES-256)
- Authentification par code à usage unique (OTP)
- Session limitée à 1 heure
- Aucun mot de passe stocké (authentification par OTP uniquement)

### 2.6 Vos droits

Conformément au RGPD, vous disposez des droits suivants :

| Droit | Comment l'exercer |
|---|---|
| **Accès** | Demande écrite au DPO ou via le portail |
| **Rectification** | Demande au secrétariat médical |
| **Effacement** | Demande au DPO (limité par l'obligation de conservation médicale) |
| **Portabilité** | Export de vos données sur demande |
| **Opposition** | Demande écrite au DPO |
| **Retrait du consentement** | À tout moment, sans affecter la licéité du traitement antérieur |

**Contact** : [dpo@etablissement.cm]  
**Autorité de contrôle** : [Autorité nationale de protection des données du Cameroun / CNIL si applicable]

---

## 3. Formulaire de consentement (à afficher avant première connexion)

### Texte à afficher :

---

> **Consentement à l'utilisation du Portail Patient**
>
> En accédant au portail patient de [Nom de l'établissement], vous consentez à :
>
> ✅ L'envoi d'un code de vérification (OTP) à votre numéro de téléphone ou email enregistré dans votre dossier médical
>
> ✅ La consultation de vos rendez-vous médicaux via ce portail
>
> ✅ La prise de rendez-vous en ligne
>
> ✅ L'enregistrement de vos données de connexion (IP, date/heure) à des fins de sécurité
>
> **Vos données de santé ne sont PAS accessibles via ce portail.** Seuls vos rendez-vous (date, service, médecin) sont visibles.
>
> Vous pouvez retirer votre consentement à tout moment en contactant le DPO à [dpo@etablissement.cm]. Le retrait du consentement n'affecte pas la licéité du traitement effectué avant le retrait.
>
> ☐ **J'ai lu et j'accepte les conditions d'utilisation et la politique de confidentialité**
>
> [Bouton : Accepter et continuer]

---

## 4. Implémentation technique

### 4.1 Stockage du consentement

Ajouter une table ou un champ pour tracer le consentement :

```sql
ALTER TABLE patients ADD COLUMN IF NOT EXISTS portail_consent_date TIMESTAMP;
ALTER TABLE patients ADD COLUMN IF NOT EXISTS portail_consent_ip VARCHAR(50);
```

### 4.2 Vérification avant accès

Lors de la première connexion au portail (après vérification OTP) :
1. Vérifier si `portail_consent_date` est NULL
2. Si oui → afficher le formulaire de consentement
3. Enregistrer la date + IP du consentement
4. Permettre l'accès

### 4.3 Retrait du consentement

Sur demande du patient :
1. Mettre `portail_consent_date = NULL`
2. Le patient ne pourra plus accéder au portail
3. Ses données médicales restent dans le système (obligation légale)

---

## 5. Cookies

Le portail patient utilise uniquement :

| Cookie/Storage | Finalité | Durée | Consentement requis |
|---|---|---|---|
| `token` (localStorage) | Authentification de session | 1h | Non (strictement nécessaire) |
| `user` (localStorage) | Informations de session | 1h | Non (strictement nécessaire) |

**Aucun cookie de tracking, analytics ou publicitaire n'est utilisé.**

Conformément à la directive ePrivacy, les cookies strictement nécessaires au fonctionnement du service ne requièrent pas de consentement.

---

*Ce document doit être validé par le service juridique avant mise en production du portail patient.*
