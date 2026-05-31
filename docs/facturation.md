# Hospital-ERP — Guide de facturation

Document à destination du **caissier (rôle réception / comptable)** et de
**l'administrateur** qui configure le module. Couvre le flux d'examens de
labo (le plus fréquent), les paiements multi-modes (Mobile Money via
Remita, carte, espèces, virement, assurance), et la gestion des prises
en charge (PEC).

---

## 1. Comprendre le flux

Un examen passe par un Kanban en 7 statuts. Le caissier intervient à
deux endroits :

```
┌──────────┐    ┌─────────┐    ┌──────────────┐    ┌────────┐    ┌──────────┐    ┌────────┐    ┌──────────┐
│ demande  │ →  │ a_payer │ →  │ prelevement  │ →  │analyse │ →  │ resultat │ →  │valide  │ →  │ transmis │
└──────────┘    └─────────┘    └──────────────┘    └────────┘    └──────────┘    └────────┘    └──────────┘
                  ▲                  ▲
                  │                  │
            caissier              labo
            (encaisse)            (prélève)
```

- **demande** : le médecin a prescrit. Si l'examen est **gratuit**
  (montant = 0), il passe directement à `prelevement`. Sinon il bascule
  en `a_payer` et apparaît dans la file de la caisse.
- **a_payer** : le caissier voit la ligne dans `Facturation > Caisse`. Au
  clic sur un mode de paiement, le PaymentModal s'ouvre, le caissier
  confirme, l'examen avance à `prelevement`.
- **prelevement → analyse → resultat → valide → transmis** : géré par
  le laboratoire.

Transition guards : les sauts illégaux (ex `transmis → demande`) sont
refusés par l'API. Voir `services/workflow.ts`.

---

## 2. Configuration initiale

Avant d'encaisser, vérifier que :

1. **Catalogue d'examens** rempli (`/app/catalogue-examens`) — chaque
   examen a un libellé + montant. Le montant pré-remplit automatiquement
   le formulaire « Nouvel examen ».
2. **Modes de paiement** dans `/app/listes-reference` → catégorie
   `mode_paiement`. Par défaut : Espèces, Mobile Money, Carte, Virement,
   Assurance. Ajustable par l'admin.
3. **Assurances acceptées** dans `/app/assurances > Registre`. Pour
   chaque assurance : nom, code court, taux de couverture par défaut
   (ex 80 %), contact. Par défaut : Mutuelle Nationale, Assurance Privée
   Cameroun, IPRES.
4. **Coordonnées bancaires** (pour les virements) dans `/app/configuration >
   Coordonnées`. À compléter avant que la modal Virement soit utilisable
   en clientèle.

---

## 3. Le tableau de bord caissier — `/app/facturation > Caisse`

Trois zones :

```
┌──────────────────────────────────────────────────────────────────┐
│  ✓ Paiement enregistré — Glycémie - Pierre Diop                  │
│    2 500 XOF par Mobile Money    14:23     [×]                   │  ← bandeau persistant
└──────────────────────────────────────────────────────────────────┘

┌────────────────┬──────────┬───────────┬──────────┬──────────┬──────────────────────────┐
│ Patient        │ Tel.     │ Examen    │ Date     │ Montant  │ Encaisser                │
├────────────────┼──────────┼───────────┼──────────┼──────────┼──────────────────────────┤
│ Diop Pierre    │ +221…    │ Glycémie  │ 31/05    │ 2 500    │ [Esp.][MM][Carte][Assur.][Vir.] │
│ Mbengue Aïssa  │ +221…    │ NFS       │ 31/05    │ 4 500    │ [Esp.][MM][Carte][Assur.][Vir.] │
└────────────────┴──────────┴───────────┴──────────┴──────────┴──────────────────────────┘
```

- **Bandeau** : reste affiché jusqu'à clic sur `×` ou nouveau paiement.
  Pas de toast qui disparaît en 5 s.
- **5 chips de paiement** par ligne.

---

## 4. Les 5 flows de paiement

### 4.1 Espèces

1. Clic sur `Esp.` → PaymentModal s'ouvre, mode `especes`.
2. Caissier saisit le **montant reçu** (pré-rempli avec le total dû).
3. Si reçu > total : encadré jaune `Monnaie à rendre : 500 XOF`.
4. Le bouton « Encaissé — Confirmer » est **désactivé** tant que
   `reçu < total`.
5. Confirmation → examen passe à `prelevement`, paiement enregistré.

### 4.2 Mobile Money via Remita

1. Clic sur `MM` → PaymentModal demande le **numéro Mobile Money** du
   patient (pré-rempli avec `patient.telephone`).
2. Clic « Initier le paiement » → l'API crée un `PaymentIntent` côté
   serveur et renvoie un **code USSD** + instruction à montrer au
   patient.

   ```
   ┌──────────────────────────────────────────────────────────┐
   │ Instructions au patient :                                │
   │ Composez *789*4321# sur le téléphone du patient          │
   │ (+221 77 123 45 67) et validez avec son PIN.            │
   │                                                          │
   │            ┌─────────────────────┐                       │
   │            │  *789*4321#         │  ← lisible de loin    │
   │            └─────────────────────┘                       │
   │                                                          │
   │ Référence : PAY-1KX9V-A3F7                              │
   └──────────────────────────────────────────────────────────┘
   ```

3. **Polling automatique** : l'app interroge le statut toutes les 2 s
   pendant 1 min, attendant la confirmation Remita.
4. Si la confirmation auto échoue (patient retardé) : un bouton « J'ai
   vu le SMS — Valider » apparaît. Le caissier clique après avoir vu
   le SMS de confirmation côté patient.
5. Confirmation → examen avance, paiement enregistré.

> **Mode actuel : stub Remita.** Le code USSD est généré aléatoirement.
> Pour brancher la vraie API Remita, modifier `routes/payments.ts`
> méthode `/initiate` et configurer le webhook
> `/payments/webhook/remita` côté merchant.

### 4.3 Carte bancaire

1. Clic sur `Carte` → modal initialisé.
2. Affichage : « Insérez la carte dans le TPE, faites composer le PIN,
   confirmez quand l'écran affiche « Approuvé ». »
3. Champ optionnel : **référence du TPE** (ex `002345`).
4. Clic « Approuvé — Confirmer le paiement ».
5. Examen avance.

### 4.4 Virement

1. Clic sur `Vir.` → modal affiche un placeholder pour les coordonnées
   bancaires (à compléter dans Configuration).
2. Caissier saisit la **référence du virement** reçu (obligatoire).
3. Clic « Virement reçu — Confirmer ». Examen avance.

### 4.5 Assurance (tiers payant)

C'est le flux le plus structuré :

1. Clic sur `Assur.` → modal liste les assurances acceptées.
2. Caissier choisit l'assurance → le **taux par défaut** hydrate
   automatiquement :
   - « Part assurance » = taux × montant total (ex 80 % de 5 000 = 4 000)
   - « Ticket modérateur (patient) » = montant restant (1 000)
3. Caissier ajuste si nécessaire (les deux champs se re-synchronisent
   pour rester égaux au total).
4. Saisie obligatoire du **n° de police** de l'assuré (ex `AP/2026/00123`).
5. Clic « Enregistrer la prise en charge ».

Comportement après création :

- Une `PriseEnCharge` est créée en statut **`en_attente`** (en attente
  de validation par l'assureur).
- Si `montant_patient = 0` (couverture 100 %) : **l'examen avance
  automatiquement à `prelevement`**. Le labo peut commencer pendant
  que la facturation côté assureur se fait en async.
- Si `montant_patient > 0` : le **co-paiement** reste à régler par le
  patient. Le caissier doit refaire un paiement sur le montant restant
  (généralement Espèces ou Mobile Money). **L'examen ne progresse pas
  tant que le co-paiement n'est pas encaissé.**

---

## 5. Suivi des prises en charge — `/app/assurances`

Page disponible pour `admin` et `comptable`.

### 5.1 Onglet « Prises en charge »

Liste filtrable de toutes les PEC :

```
┌──────────┬────────────────┬────────────┬────────────────┬───────────┬─────────┬───────────┬─────────┬──────────────┬─────┐
│ Date     │ Patient        │ Assurance  │ N° police      │ Examen    │ Total   │ Assurance │ Patient │ Statut       │     │
├──────────┼────────────────┼────────────┼────────────────┼───────────┼─────────┼───────────┼─────────┼──────────────┼─────┤
│ 31/05    │ Diop P. PAT-…  │ MN         │ MN/2026/01122  │ NFS       │ 4 500   │ 3 600     │ 900     │ En attente   │ ✓ ✗ │
│ 30/05    │ Sarr O. PAT-…  │ APC        │ APC/2026/0789  │ Échographie│ 12 000 │ 8 400     │ 3 600   │ Accordée     │  💰 │
│ 28/05    │ Ndoye M. PAT-… │ IPRES      │ IPRES-A12345   │ Scanner   │ 35 000  │ 35 000    │     0   │ Payée        │     │
└──────────┴────────────────┴────────────┴────────────────┴───────────┴─────────┴───────────┴─────────┴──────────────┴─────┘
```

Workflow statut :
- **`en_attente`** → clic ✓ pour passer à `accordee` ou ✗ pour `refusee`
  (avec champ « motif du refus »).
- **`accordee`** → clic 💰 pour passer à `payee` quand le virement de
  l'assureur arrive (champ « référence virement assureur »).
- **`refusee`** / **`payee`** : terminales, plus d'action possible.

Chaque changement de statut est **audit-loggé**.

### 5.2 Onglet « Registre des assurances »

Admin uniquement (lecture pour comptable). Permet :

- Voir les **stats par assurance** : nb PEC en attente / accordées /
  payées / refusées, montants à recouvrer et déjà recouvrés.
- Ajouter une **nouvelle assurance** (nom, code, contact, taux par
  défaut).
- Modifier une assurance existante : changer le taux, désactiver
  (`actif = false`) pour la retirer du picker sans perdre l'historique.

### 5.3 Tableau de bord en tête

Quatre tuiles :

| Tuile | Calcul |
|---|---|
| PEC en attente | nb total `statut = en_attente` |
| PEC accordées | nb total `statut = accordee` |
| À recouvrer | Σ `montant_assurance` des PEC `en_attente` + `accordee` |
| Recouvré | Σ `montant_assurance` des PEC `payee` |

Le « à recouvrer » est l'indicateur clé pour la trésorerie. Comparé au
« recouvré » sur la même période, il donne le **délai moyen
assureurs** (DSO insurance).

---

## 6. Cas particuliers

### 6.1 Le patient veut payer en plusieurs fois

Aujourd'hui : non supporté nativement sur les **examens** (cycle 1
examen = 1 paiement). Sur les **factures multi-lignes**, plusieurs
`Paiement` peuvent s'accumuler sur la même facture (statut passe de
`en_attente → partielle → payee`).

### 6.2 Le patient se trompe de mode

Le caissier peut annuler un `PaymentIntent` en **statut `pending`** via
le bouton « Annuler » du modal. Une fois `paid`, contacter l'admin pour
créer une dépense compensatrice manuelle (pas encore d'auto-refund).

### 6.3 Le SMS Remita ne vient jamais

Le polling abandonne après 30 essais (1 min). Si le caissier est sûr
que le paiement est passé côté Remita, il peut cliquer « J'ai vu le
SMS — Valider ». Sinon il annule et recommence.

### 6.4 L'assureur refuse une PEC déjà créée

Passer le statut à `refusee` avec le motif. **Important : l'examen
n'est PAS automatiquement remis en `a_payer`** — il faut soit
encaisser le ticket entier auprès du patient (autre paiement), soit
annuler l'examen côté labo (statut `transmis` quand vide d'effets,
sinon discussion clinique).

### 6.5 Le système est hors ligne

Bandeau orange/rouge en haut de l'app. Les **paiements ne peuvent pas
être validés** (Remita, polling, etc. exigent une connexion). Les
autres mutations passent en queue IndexedDB et se rejouent au retour.

---

## 7. À configurer/brancher pour la mise en production réelle

| Domaine | État | À faire |
|---|---|---|
| **Remita API Mobile Money** | Stub | Provisionner `REMITA_MERCHANT_ID` + `REMITA_API_KEY`, remplacer la génération USSD dans `routes/payments.ts:80`, brancher le webhook signé sur `/payments/webhook/remita`. |
| **Coordonnées bancaires (virement)** | Placeholder | Configurer dans `/app/configuration > Coordonnées de l'établissement`. |
| **Reçu imprimable** | Manquant | Template `print.ts` à ajouter (`generateRecuPaiementHtml`). Endpoint `/api/print/recu/:reference`. |
| **Réconciliation automatique avec Remita** | Manuel | Aujourd'hui le caissier confirme manuellement. Le webhook signé fera la confirmation auto. |
| **Notification assureur sur PEC créée** | Manquant | Email/SMS à l'assureur quand une PEC est créée — dépend du contact configuré sur l'`Assurance`. |
| **Export comptable** | Partiel | `Finances > export CSV` existe. À étendre avec les PEC pour rapprochement assureur. |

---

## 8. Permissions par rôle

| Action | admin | comptable | réception | médecin | autres |
|---|---|---|---|---|---|
| Voir Caisse / encaisser | ✓ | ✓ | ✓ | ✗ | ✗ |
| Initier PaymentIntent | ✓ | ✓ | ✓ | ✗ | ✗ |
| Confirmer / annuler | ✓ | ✓ | ✓ | ✗ | ✗ |
| Créer une PriseEnCharge | ✓ | ✓ | ✓ | ✗ | ✗ |
| Page `/app/assurances` | ✓ | ✓ | ✗ | ✗ | ✗ |
| Changer le statut d'une PEC | ✓ | ✓ | ✗ | ✗ | ✗ |
| CRUD du registre assurances | ✓ | ✗ | ✗ | ✗ | ✗ |
