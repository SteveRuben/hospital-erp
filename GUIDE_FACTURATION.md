# Guide de Configuration de la Facturation

## 1. Configurer la grille tarifaire

Avant de créer des factures, il faut définir les tarifs. Allez dans **Facturation > Tarifs**.

### Catégories recommandées

| Catégorie | Exemples |
|-----------|----------|
| Consultation | Consultation générale, Consultation spécialisée |
| Laboratoire | Analyse de sang, Glycémie, Sérologie, Groupe sanguin |
| Imagerie | Échographie, Radiographie, Scanner |
| Hospitalisation | Séjour journalier, Soins intensifs |
| Chirurgie | Chirurgie mineure, Chirurgie majeure, Accouchement |
| Soins | Pansement, Injection, Perfusion |
| Pharmacie | Médicaments (par ordonnance) |
| Dentaire | Détartrage, Extraction, Plombage |

### Créer un tarif

Pour chaque acte, définir :
- **Code** : identifiant unique (ex: `CONS-GEN`, `LAB-SANG`, `HOS-JOUR`)
- **Libellé** : description lisible (ex: "Consultation générale")
- **Catégorie** : une des catégories ci-dessus
- **Montant** : prix en XOF
- **Service** : associer au service hospitalier concerné

### Exemple de grille tarifaire

```
Code        | Libellé                    | Catégorie      | Montant (XOF)
------------|----------------------------|----------------|-------------
CONS-GEN    | Consultation générale      | Consultation   | 5 000
CONS-SPE    | Consultation spécialisée   | Consultation   | 10 000
LAB-SANG    | Analyse de sang complète   | Laboratoire    | 15 000
LAB-GLYC    | Glycémie                   | Laboratoire    | 3 000
LAB-SERO    | Sérologie                  | Laboratoire    | 8 000
IMG-ECHO    | Échographie                | Imagerie       | 20 000
IMG-RADIO   | Radiographie               | Imagerie       | 15 000
HOS-JOUR    | Hospitalisation / jour     | Hospitalisation| 25 000
HOS-SI      | Soins intensifs / jour     | Hospitalisation| 50 000
CHIR-MIN    | Chirurgie mineure          | Chirurgie      | 50 000
CHIR-MAJ    | Chirurgie majeure          | Chirurgie      | 200 000
CHIR-ACC    | Accouchement               | Chirurgie      | 75 000
SOIN-PANS   | Pansement                  | Soins          | 2 000
SOIN-INJ    | Injection                  | Soins          | 1 500
DENT-DETAR  | Détartrage                 | Dentaire       | 10 000
DENT-EXTR   | Extraction dentaire        | Dentaire       | 15 000
```

## 2. Créer une facture

### Workflow de facturation

```
[Acte médical] → [Création facture] → [Ajout lignes] → [Paiement] → [Reçu]
```

1. Aller dans **Facturation > Factures**
2. Cliquer **Nouvelle facture**
3. Sélectionner le patient
4. Ajouter les lignes :
   - Choisir un tarif dans la grille OU saisir manuellement
   - Ajuster la quantité si nécessaire
   - Le montant total se calcule automatiquement
5. Valider la facture

### Numérotation automatique

Les factures sont numérotées automatiquement :
- Format : `FAC-YYYYMMDD-XXXX`
- Exemple : `FAC-20260410-0001`

## 3. Enregistrer un paiement

1. Ouvrir la facture
2. Cliquer **Nouveau paiement**
3. Saisir :
   - **Montant** : montant payé
   - **Mode de paiement** : Espèces, Mobile Money, Carte, Virement, Assurance
   - **Référence** : numéro de transaction (optionnel)
4. Le statut de la facture se met à jour automatiquement :
   - **En attente** : aucun paiement
   - **Partielle** : paiement partiel
   - **Payée** : montant total atteint

### Paiements fractionnés

Un patient peut payer en plusieurs fois. Chaque paiement est enregistré séparément. Le solde restant est calculé automatiquement.

## 4. Modes de paiement

| Mode | Description |
|------|-------------|
| Espèces | Paiement cash à la caisse |
| Mobile Money | Orange Money, M-Pesa, Airtel Money |
| Carte | Carte bancaire (si terminal disponible) |
| Virement | Virement bancaire |
| Assurance | Prise en charge par l'assurance maladie |

## 5. Rapports financiers

### Journal de caisse
- Accessible dans **Finances > Caisse**
- Affiche les recettes espèces du jour vs dépenses
- Solde calculé automatiquement

### Bilan mensuel
- Accessible dans **Finances > Bilan**
- Total recettes par type d'acte
- Total dépenses par catégorie
- Résultat net

### Statistiques
- Recettes par service
- Recettes par mois (courbe)
- Répartition par mode de paiement

## 6. Bonnes pratiques

1. **Toujours créer une facture** avant d'encaisser un paiement
2. **Ne jamais supprimer** une facture payée — l'annuler à la place
3. **Vérifier la grille tarifaire** régulièrement et mettre à jour les prix
4. **Fermer la caisse** chaque soir (vérifier le solde)
5. **Archiver les factures** mensuellement pour le bilan comptable
6. Pour les **assurances**, créer le paiement avec le mode "Assurance" et la référence du bon de prise en charge