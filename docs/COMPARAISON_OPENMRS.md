# Comparaison Hospital ERP ↔ OpenMRS

**Date** : 2026-05-29
**Référence** : OpenMRS "Around the World" + modèle de données OpenMRS

---

## 1. Positionnement résumé

```
hospital-erp = OpenMRS core (clinique)
             + gestion hospitalière (facturation / pharmacie / lits)   ← avantage
             + comms staff (chat / notifications)                       ← avantage
             + conformité HIPAA/RGPD avancée                            ← avantage
             − interopérabilité FHIR/HL7                                ← écart majeur
             − terminologies standardisées (contenu)                   ← écart
             − formulaires dynamiques / cohortes / offline / i18n      ← écart
```

Hospital ERP n'est pas un clone d'OpenMRS : c'est un **ERP hospitalier orienté
gestion** qui a adopté le **modèle de données clinique** d'OpenMRS (Concept,
Encounter, Observation, Order). Pour un hôpital unique, il est souvent plus
directement exploitable qu'OpenMRS. Pour s'intégrer à un écosystème de santé
national, l'interopérabilité FHIR est le chaînon manquant principal.

## 2. Écart fonctionnel (modules)

| Domaine | OpenMRS | hospital-erp | Verdict |
|---|---|---|---|
| Dossier patient / démographie | Oui | Oui | Parité |
| Visites / Encounters / Observations | Oui | Oui | Parité (modèle OpenMRS adopté) |
| Concept dictionary | Oui (CIEL) | Structure OK, dictionnaire vide | Ossature OK |
| Orders (médic./labo/imagerie) | Oui | Oui | Parité |
| Programmes de soins (VIH, TB…) | Oui | Oui (`programmes`) | Parité |
| RDV / file d'attente | Oui (module) | Oui | Parité |
| Lits / hospitalisation | Module | Oui | Avantage hospital-erp |
| Facturation / caisse / tarifs | Non natif | Oui (riche) | Avantage net hospital-erp |
| Pharmacie / stock / dispensation | Module | Oui | Avantage hospital-erp |
| Chat staff + notifications | Non | Oui | Avantage hospital-erp |
| Vaccinations / allergies / pathologies | Via concepts | Modules dédiés | Plus ergonomique |
| Formulaires dynamiques (HTML Form Entry / O3) | Oui (puissant) | Table `formulaires` peu exploitée | Écart |
| Cohortes / cohort builder | Oui | `listes-patients` basique | Écart |
| Architecture modulaire / plugins | Oui | Monolithe (bien structuré) | Écart structurel |
| Sync hors-ligne | Oui | Non | Écart |

## 3. Interopérabilité FHIR / HL7

| Capacité | OpenMRS | hospital-erp |
|---|---|---|
| FHIR R4 natif (Patient, Encounter, Observation, Medication…) | Oui | En cours (couche read-only) |
| Export / import HL7 v2 | Oui | Non |
| API REST | Standardisée | Propriétaire |

Le modèle interne (Patient / Encounter / Observation / Order) mappe presque 1:1
sur les ressources FHIR, ce qui rend une façade `/fhir/*` relativement directe.

## 4. Terminologies standard

| | OpenMRS | hospital-erp |
|---|---|---|
| Dictionnaire CIEL (50k+ concepts pré-mappés) | Oui (importable) | Non |
| Mappings CIM-10/11, LOINC, SNOMED, RxNorm | Oui | Table `concept_mappings` (vide) |
| Code CIM sur pathologies | — | Champ `code_cim` (libre, non validé) |

Les tables existent, le contenu manque. Sans terminologie standardisée, le
reporting reste local (non agrégeable au niveau national / OMS).

## 5. Multilingue / localisation

- Scaffolding présent : `LocaleSelector`, `en.json` / `fr.json`, `i18n/index.ts`
- Dictionnaire minimal (~30 clés) ; l'UI est majoritairement en français codé en dur
- Formats devise / téléphone / pays déjà paramétrables (paramètres régionaux)

Pour un déploiement multipays type OpenMRS, il faut externaliser toutes les
chaînes UI et étendre les dictionnaires.

## 6. Feuille de route priorisée

1. **FHIR R4 read-only** — débloque l'interopérabilité, mapping quasi direct
2. **Formulaires dynamiques + cohortes** — exploite les tables `formulaires` /
   `formulaire_reponses` existantes
3. **i18n complet** — externalisation des chaînes, dictionnaires étendus
4. **Seed terminologies** (CIM-10 + mappings) — reporting standardisé

(Ordre d'exécution retenu avec l'équipe : 1 → 4 → 3 → 2.)
