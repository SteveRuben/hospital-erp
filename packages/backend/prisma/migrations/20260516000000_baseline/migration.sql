-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('admin', 'medecin', 'comptable', 'laborantin', 'reception');

-- CreateEnum
CREATE TYPE "Sexe" AS ENUM ('M', 'F', 'autre');

-- CreateEnum
CREATE TYPE "StatutMatrimonial" AS ENUM ('celibataire', 'marie', 'divorce', 'veuf');

-- CreateEnum
CREATE TYPE "GroupeSanguin" AS ENUM ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-');

-- CreateEnum
CREATE TYPE "ConceptDatatype" AS ENUM ('numeric', 'coded', 'text', 'date', 'boolean', 'datetime', 'document');

-- CreateEnum
CREATE TYPE "ConceptClasse" AS ENUM ('diagnostic', 'symptome', 'test', 'medicament', 'procedure', 'finding', 'question', 'reponse', 'misc');

-- CreateTable
CREATE TABLE "users" (
    "id" SERIAL NOT NULL,
    "username" VARCHAR(100) NOT NULL,
    "password" VARCHAR(255) NOT NULL,
    "role" "UserRole" NOT NULL,
    "nom" VARCHAR(100),
    "prenom" VARCHAR(100),
    "telephone" VARCHAR(20),
    "must_change_password" BOOLEAN NOT NULL DEFAULT true,
    "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
    "mfa_secret" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patients" (
    "id" SERIAL NOT NULL,
    "nom" VARCHAR(100) NOT NULL,
    "prenom" VARCHAR(100) NOT NULL,
    "deuxieme_prenom" VARCHAR(100),
    "sexe" "Sexe",
    "date_naissance" DATE,
    "age_estime" INTEGER,
    "lieu_naissance" VARCHAR(100),
    "nationalite" VARCHAR(100),
    "numero_identite" VARCHAR(50),
    "statut_matrimonial" "StatutMatrimonial",
    "groupe_sanguin" "GroupeSanguin",
    "pays" VARCHAR(100),
    "province" VARCHAR(100),
    "ville" VARCHAR(100),
    "commune" VARCHAR(100),
    "quartier" VARCHAR(100),
    "adresse" TEXT,
    "profession" VARCHAR(100),
    "telephone" VARCHAR(20),
    "email" VARCHAR(150),
    "contact_urgence_nom" VARCHAR(100),
    "contact_urgence_relation" VARCHAR(50),
    "contact_urgence_telephone" VARCHAR(20),
    "photo_url" TEXT,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "reference_id" VARCHAR(30),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medecins" (
    "id" SERIAL NOT NULL,
    "nom" VARCHAR(100) NOT NULL,
    "prenom" VARCHAR(100) NOT NULL,
    "specialite" VARCHAR(100),
    "telephone" VARCHAR(20),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medecins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "services" (
    "id" SERIAL NOT NULL,
    "nom" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "parent_id" INTEGER,
    "prix" DECIMAL(12,2) DEFAULT 0,
    "poids" INTEGER DEFAULT 0,
    "code" VARCHAR(50),
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "services_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "consultations" (
    "id" SERIAL NOT NULL,
    "reference" VARCHAR(20),
    "patient_id" INTEGER NOT NULL,
    "medecin_id" INTEGER,
    "service_id" INTEGER,
    "date_consultation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "diagnostic" TEXT,
    "traitement" TEXT,
    "notes" TEXT,
    "statut" VARCHAR(50) DEFAULT 'en_cours',
    "motif" TEXT,
    "gravite" VARCHAR(20),

    CONSTRAINT "consultations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "concepts" (
    "id" SERIAL NOT NULL,
    "nom" VARCHAR(200) NOT NULL,
    "code" VARCHAR(50),
    "datatype" "ConceptDatatype" NOT NULL,
    "classe" "ConceptClasse" NOT NULL,
    "description" TEXT,
    "unite" VARCHAR(50),
    "valeur_min" DECIMAL(10,2),
    "valeur_max" DECIMAL(10,2),
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "concepts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "encounter_types" (
    "id" SERIAL NOT NULL,
    "nom" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "encounter_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "encounters" (
    "id" SERIAL NOT NULL,
    "reference" VARCHAR(20),
    "patient_id" INTEGER NOT NULL,
    "encounter_type_id" INTEGER NOT NULL,
    "visite_id" INTEGER,
    "provider_id" INTEGER,
    "service_id" INTEGER,
    "date_encounter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "encounters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "observations" (
    "id" SERIAL NOT NULL,
    "encounter_id" INTEGER NOT NULL,
    "patient_id" INTEGER NOT NULL,
    "concept_id" INTEGER NOT NULL,
    "valeur_numerique" DECIMAL(12,4),
    "valeur_texte" TEXT,
    "valeur_date" TIMESTAMP(3),
    "valeur_coded" INTEGER,
    "valeur_boolean" BOOLEAN,
    "commentaire" TEXT,
    "provider_id" INTEGER,
    "date_obs" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voided" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" SERIAL NOT NULL,
    "reference" VARCHAR(20),
    "patient_id" INTEGER NOT NULL,
    "encounter_id" INTEGER,
    "concept_id" INTEGER,
    "type_order" VARCHAR(30) NOT NULL,
    "orderer_id" INTEGER,
    "urgence" VARCHAR(20) NOT NULL DEFAULT 'routine',
    "instructions" TEXT,
    "date_debut" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date_fin" TIMESTAMP(3),
    "statut" VARCHAR(30) NOT NULL DEFAULT 'actif',
    "dosage" VARCHAR(100),
    "frequence" VARCHAR(100),
    "duree" VARCHAR(100),
    "voie" VARCHAR(50),
    "quantite" INTEGER,
    "resultat" TEXT,
    "date_resultat" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recettes" (
    "id" SERIAL NOT NULL,
    "patient_id" INTEGER,
    "service_id" INTEGER,
    "type_acte" VARCHAR(100) NOT NULL,
    "montant" DECIMAL(12,2) NOT NULL,
    "mode_paiement" VARCHAR(50),
    "date_recette" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "description" TEXT,
    "annulee" BOOLEAN DEFAULT false,
    "date_annulation" TIMESTAMP(3),
    "annulee_par" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recettes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "examens" (
    "id" SERIAL NOT NULL,
    "reference" VARCHAR(20),
    "patient_id" INTEGER NOT NULL,
    "type_examen" VARCHAR(100) NOT NULL,
    "resultat" TEXT,
    "date_examen" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "montant" DECIMAL(10,2),
    "statut" VARCHAR(50) DEFAULT 'demande',
    "demandeur_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "examens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rendez_vous" (
    "id" SERIAL NOT NULL,
    "patient_id" INTEGER NOT NULL,
    "medecin_id" INTEGER,
    "service_id" INTEGER,
    "date_rdv" TIMESTAMP(3) NOT NULL,
    "motif" TEXT,
    "statut" VARCHAR(50) NOT NULL DEFAULT 'planifie',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "rendez_vous_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vitaux" (
    "id" SERIAL NOT NULL,
    "patient_id" INTEGER NOT NULL,
    "medecin_id" INTEGER,
    "temperature" DECIMAL(4,1),
    "tension_systolique" INTEGER,
    "tension_diastolique" INTEGER,
    "pouls" INTEGER,
    "frequence_respiratoire" INTEGER,
    "saturation_o2" INTEGER,
    "poids" DECIMAL(5,1),
    "taille" DECIMAL(5,1),
    "glycemie" DECIMAL(5,2),
    "notes" TEXT,
    "date_mesure" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vitaux_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "allergies" (
    "id" SERIAL NOT NULL,
    "patient_id" INTEGER NOT NULL,
    "allergene" VARCHAR(200) NOT NULL,
    "type_allergie" VARCHAR(50),
    "severite" VARCHAR(20),
    "reaction" TEXT,
    "date_debut" DATE,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "allergies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pathologies" (
    "id" SERIAL NOT NULL,
    "patient_id" INTEGER NOT NULL,
    "nom" VARCHAR(200) NOT NULL,
    "code_cim" VARCHAR(20),
    "statut" VARCHAR(50) NOT NULL DEFAULT 'active',
    "date_debut" DATE,
    "date_fin" DATE,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pathologies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "prescriptions" (
    "id" SERIAL NOT NULL,
    "patient_id" INTEGER NOT NULL,
    "medecin_id" INTEGER,
    "consultation_id" INTEGER,
    "medicament" VARCHAR(200) NOT NULL,
    "dosage" VARCHAR(100),
    "frequence" VARCHAR(100),
    "duree" VARCHAR(100),
    "voie" VARCHAR(50),
    "instructions" TEXT,
    "statut" VARCHAR(50) NOT NULL DEFAULT 'active',
    "date_debut" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date_fin" DATE,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "prescriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ordonnances" (
    "id" SERIAL NOT NULL,
    "patient_id" INTEGER NOT NULL,
    "medecin_id" INTEGER,
    "consultation_id" INTEGER,
    "date_ordonnance" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "statut" VARCHAR(50) NOT NULL DEFAULT 'emise',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ordonnances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vaccinations" (
    "id" SERIAL NOT NULL,
    "patient_id" INTEGER NOT NULL,
    "medecin_id" INTEGER,
    "vaccin" VARCHAR(200) NOT NULL,
    "lot" VARCHAR(100),
    "dose" VARCHAR(50),
    "site_injection" VARCHAR(100),
    "date_vaccination" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date_rappel" DATE,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vaccinations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notes" (
    "id" SERIAL NOT NULL,
    "patient_id" INTEGER NOT NULL,
    "auteur_id" INTEGER NOT NULL,
    "titre" VARCHAR(200),
    "contenu" TEXT NOT NULL,
    "type_note" VARCHAR(50) NOT NULL DEFAULT 'general',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "alertes" (
    "id" SERIAL NOT NULL,
    "patient_id" INTEGER NOT NULL,
    "type_alerte" VARCHAR(50),
    "message" TEXT NOT NULL,
    "severite" VARCHAR(20) NOT NULL DEFAULT 'info',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "alertes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visites" (
    "id" SERIAL NOT NULL,
    "patient_id" INTEGER NOT NULL,
    "service_id" INTEGER,
    "type_visite" VARCHAR(50) NOT NULL DEFAULT 'ambulatoire',
    "date_debut" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date_fin" TIMESTAMP(3),
    "statut" VARCHAR(50) NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visites_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hospitalisations" (
    "id" SERIAL NOT NULL,
    "patient_id" INTEGER NOT NULL,
    "lit_id" INTEGER,
    "medecin_id" INTEGER,
    "service_id" INTEGER,
    "date_admission" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date_sortie" TIMESTAMP(3),
    "motif" TEXT,
    "statut" VARCHAR(50) NOT NULL DEFAULT 'active',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "hospitalisations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" SERIAL NOT NULL,
    "user_id" INTEGER,
    "action" VARCHAR(100),
    "table_name" VARCHAR(50),
    "record_id" INTEGER,
    "details" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "depenses" (
    "id" SERIAL NOT NULL,
    "type_depense" VARCHAR(100) NOT NULL,
    "nature" VARCHAR(100),
    "montant" DECIMAL(12,2) NOT NULL,
    "fournisseur" VARCHAR(100),
    "description" TEXT,
    "date_depense" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "annulee" BOOLEAN DEFAULT false,
    "date_annulation" TIMESTAMP(3),
    "annulee_par" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "depenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "documents" (
    "id" SERIAL NOT NULL,
    "patient_id" INTEGER,
    "type_document" VARCHAR(50),
    "fichier_url" TEXT,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "formulaires" (
    "id" SERIAL NOT NULL,
    "nom" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "schema_json" TEXT NOT NULL,
    "service_id" INTEGER,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "formulaires_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "formulaire_reponses" (
    "id" SERIAL NOT NULL,
    "formulaire_id" INTEGER,
    "patient_id" INTEGER,
    "rempli_par" INTEGER,
    "donnees_json" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "formulaire_reponses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "file_attente" (
    "id" SERIAL NOT NULL,
    "patient_id" INTEGER,
    "service_id" INTEGER,
    "priorite" VARCHAR(20) NOT NULL DEFAULT 'normal',
    "statut" VARCHAR(50) NOT NULL DEFAULT 'en_attente',
    "numero_ordre" INTEGER,
    "date_arrivee" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date_prise_en_charge" TIMESTAMP(3),
    "notes" TEXT,

    CONSTRAINT "file_attente_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "listes_patients" (
    "id" SERIAL NOT NULL,
    "nom" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "listes_patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "liste_patient_membres" (
    "id" SERIAL NOT NULL,
    "liste_id" INTEGER,
    "patient_id" INTEGER,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "liste_patient_membres_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pavillons" (
    "id" SERIAL NOT NULL,
    "nom" VARCHAR(100) NOT NULL,
    "etage" VARCHAR(50),
    "service_id" INTEGER,
    "capacite" INTEGER DEFAULT 0,
    "description" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pavillons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lits" (
    "id" SERIAL NOT NULL,
    "pavillon_id" INTEGER,
    "numero" VARCHAR(20) NOT NULL,
    "type_lit" VARCHAR(50) NOT NULL DEFAULT 'standard',
    "statut" VARCHAR(50) NOT NULL DEFAULT 'disponible',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "programmes" (
    "id" SERIAL NOT NULL,
    "nom" VARCHAR(200) NOT NULL,
    "description" TEXT,
    "type_programme" VARCHAR(100),
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "programmes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "programme_patients" (
    "id" SERIAL NOT NULL,
    "programme_id" INTEGER,
    "patient_id" INTEGER,
    "date_inscription" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "date_sortie" DATE,
    "statut" VARCHAR(50) NOT NULL DEFAULT 'actif',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "programme_patients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tarifs" (
    "id" SERIAL NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "libelle" VARCHAR(200) NOT NULL,
    "categorie" VARCHAR(100) NOT NULL,
    "montant" DECIMAL(12,2) NOT NULL,
    "service_id" INTEGER,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tarifs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "factures" (
    "id" SERIAL NOT NULL,
    "numero" VARCHAR(50) NOT NULL,
    "patient_id" INTEGER,
    "date_facture" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "montant_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "montant_paye" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "statut" VARCHAR(50) NOT NULL DEFAULT 'en_attente',
    "notes" TEXT,
    "created_by" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "factures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facture_lignes" (
    "id" SERIAL NOT NULL,
    "facture_id" INTEGER,
    "tarif_id" INTEGER,
    "libelle" VARCHAR(200) NOT NULL,
    "quantite" INTEGER NOT NULL DEFAULT 1,
    "prix_unitaire" DECIMAL(12,2) NOT NULL,
    "montant" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "facture_lignes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "paiements" (
    "id" SERIAL NOT NULL,
    "facture_id" INTEGER,
    "montant" DECIMAL(12,2) NOT NULL,
    "mode_paiement" VARCHAR(50),
    "reference" VARCHAR(100),
    "date_paiement" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recu_par" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "paiements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "habilitations" (
    "id" SERIAL NOT NULL,
    "role" VARCHAR(50) NOT NULL,
    "module" VARCHAR(100) NOT NULL,
    "acces" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "habilitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_config" (
    "id" SERIAL NOT NULL,
    "groupe" VARCHAR(100) NOT NULL,
    "groupe_ordre" INTEGER NOT NULL DEFAULT 0,
    "module" VARCHAR(100) NOT NULL,
    "label" VARCHAR(100) NOT NULL,
    "icon" VARCHAR(50) NOT NULL,
    "path" VARCHAR(200) NOT NULL,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "actif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "menu_config_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "medicaments" (
    "id" SERIAL NOT NULL,
    "nom" VARCHAR(200) NOT NULL,
    "dci" VARCHAR(200),
    "forme" VARCHAR(50),
    "dosage_standard" VARCHAR(100),
    "code_barre" VARCHAR(50),
    "categorie" VARCHAR(100),
    "prix_unitaire" DECIMAL(12,2),
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "medicaments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock" (
    "id" SERIAL NOT NULL,
    "medicament_id" INTEGER,
    "lot" VARCHAR(100),
    "date_expiration" DATE,
    "quantite" INTEGER NOT NULL DEFAULT 0,
    "quantite_min" INTEGER NOT NULL DEFAULT 10,
    "prix_achat" DECIMAL(12,2),
    "fournisseur" VARCHAR(200),
    "date_entree" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_mouvements" (
    "id" SERIAL NOT NULL,
    "medicament_id" INTEGER,
    "type_mouvement" VARCHAR(20) NOT NULL,
    "quantite" INTEGER NOT NULL,
    "lot" VARCHAR(100),
    "motif" TEXT,
    "user_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_mouvements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dispensations" (
    "id" SERIAL NOT NULL,
    "patient_id" INTEGER,
    "prescription_id" INTEGER,
    "medicament_id" INTEGER,
    "quantite_delivree" INTEGER,
    "dispenseur_id" INTEGER,
    "date_dispensation" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,

    CONSTRAINT "dispensations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facilities" (
    "id" SERIAL NOT NULL,
    "nom" VARCHAR(200) NOT NULL,
    "code" VARCHAR(50),
    "type_facility" VARCHAR(50),
    "adresse" TEXT,
    "ville" VARCHAR(100),
    "telephone" VARCHAR(20),
    "email" VARCHAR(150),
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "facilities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning_medecins" (
    "id" SERIAL NOT NULL,
    "medecin_id" INTEGER,
    "service_id" INTEGER,
    "jour_semaine" INTEGER NOT NULL,
    "heure_debut" TIME NOT NULL,
    "heure_fin" TIME NOT NULL,
    "duree_creneau" INTEGER NOT NULL DEFAULT 30,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "planning_medecins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "planning_blocages" (
    "id" SERIAL NOT NULL,
    "medecin_id" INTEGER,
    "date_debut" TIMESTAMP(3) NOT NULL,
    "date_fin" TIMESTAMP(3) NOT NULL,
    "motif" VARCHAR(200),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "planning_blocages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "imagerie" (
    "id" SERIAL NOT NULL,
    "patient_id" INTEGER,
    "type_examen" VARCHAR(100),
    "description" TEXT,
    "fichier_url" TEXT,
    "fichier_nom" VARCHAR(200),
    "fichier_type" VARCHAR(50),
    "date_examen" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "medecin_id" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "imagerie_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "concept_noms" (
    "id" SERIAL NOT NULL,
    "concept_id" INTEGER,
    "nom" VARCHAR(200) NOT NULL,
    "langue" VARCHAR(10) NOT NULL DEFAULT 'fr',
    "type_nom" VARCHAR(20) NOT NULL DEFAULT 'complet',

    CONSTRAINT "concept_noms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "concept_reponses" (
    "id" SERIAL NOT NULL,
    "concept_id" INTEGER,
    "reponse_concept_id" INTEGER,
    "ordre" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "concept_reponses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "concept_mappings" (
    "id" SERIAL NOT NULL,
    "concept_id" INTEGER,
    "source" VARCHAR(50) NOT NULL,
    "code_externe" VARCHAR(50) NOT NULL,

    CONSTRAINT "concept_mappings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications_log" (
    "id" SERIAL NOT NULL,
    "patient_id" INTEGER,
    "channel" VARCHAR(20) NOT NULL,
    "subject" VARCHAR(200),
    "message" TEXT,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_log_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "patient_attributions" (
    "id" SERIAL NOT NULL,
    "patient_id" INTEGER,
    "medecin_user_id" INTEGER,
    "date_attribution" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "patient_attributions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "webhook_events" (
    "id" SERIAL NOT NULL,
    "event_id" VARCHAR(100) NOT NULL,
    "source" VARCHAR(50) NOT NULL,
    "payload" TEXT,
    "processed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webhook_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "id" SERIAL NOT NULL,
    "cle" VARCHAR(100) NOT NULL,
    "valeur" TEXT NOT NULL,
    "description" TEXT,
    "categorie" VARCHAR(50) DEFAULT 'general',
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reference_lists" (
    "id" SERIAL NOT NULL,
    "categorie" VARCHAR(50) NOT NULL,
    "code" VARCHAR(100) NOT NULL,
    "libelle" VARCHAR(200) NOT NULL,
    "actif" BOOLEAN NOT NULL DEFAULT true,
    "par_defaut" BOOLEAN NOT NULL DEFAULT false,
    "ordre" INTEGER NOT NULL DEFAULT 0,
    "parent_code" VARCHAR(100),
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reference_lists_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE UNIQUE INDEX "patients_reference_id_key" ON "patients"("reference_id");

-- CreateIndex
CREATE UNIQUE INDEX "consultations_reference_key" ON "consultations"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "concepts_code_key" ON "concepts"("code");

-- CreateIndex
CREATE UNIQUE INDEX "encounters_reference_key" ON "encounters"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "orders_reference_key" ON "orders"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "examens_reference_key" ON "examens"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "liste_patient_membres_liste_id_patient_id_key" ON "liste_patient_membres"("liste_id", "patient_id");

-- CreateIndex
CREATE UNIQUE INDEX "tarifs_code_key" ON "tarifs"("code");

-- CreateIndex
CREATE UNIQUE INDEX "factures_numero_key" ON "factures"("numero");

-- CreateIndex
CREATE UNIQUE INDEX "habilitations_role_module_key" ON "habilitations"("role", "module");

-- CreateIndex
CREATE UNIQUE INDEX "facilities_code_key" ON "facilities"("code");

-- CreateIndex
CREATE UNIQUE INDEX "concept_noms_concept_id_nom_langue_key" ON "concept_noms"("concept_id", "nom", "langue");

-- CreateIndex
CREATE UNIQUE INDEX "concept_mappings_concept_id_source_code_externe_key" ON "concept_mappings"("concept_id", "source", "code_externe");

-- CreateIndex
CREATE UNIQUE INDEX "patient_attributions_patient_id_medecin_user_id_key" ON "patient_attributions"("patient_id", "medecin_user_id");

-- CreateIndex
CREATE UNIQUE INDEX "webhook_events_event_id_key" ON "webhook_events"("event_id");

-- CreateIndex
CREATE UNIQUE INDEX "settings_cle_key" ON "settings"("cle");

-- CreateIndex
CREATE UNIQUE INDEX "reference_lists_categorie_code_key" ON "reference_lists"("categorie", "code");

-- AddForeignKey
ALTER TABLE "services" ADD CONSTRAINT "services_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_medecin_id_fkey" FOREIGN KEY ("medecin_id") REFERENCES "medecins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "consultations" ADD CONSTRAINT "consultations_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_encounter_type_id_fkey" FOREIGN KEY ("encounter_type_id") REFERENCES "encounter_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_visite_id_fkey" FOREIGN KEY ("visite_id") REFERENCES "visites"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "encounters" ADD CONSTRAINT "encounters_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observations" ADD CONSTRAINT "observations_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observations" ADD CONSTRAINT "observations_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observations" ADD CONSTRAINT "observations_concept_id_fkey" FOREIGN KEY ("concept_id") REFERENCES "concepts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observations" ADD CONSTRAINT "observations_valeur_coded_fkey" FOREIGN KEY ("valeur_coded") REFERENCES "concepts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "observations" ADD CONSTRAINT "observations_provider_id_fkey" FOREIGN KEY ("provider_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_encounter_id_fkey" FOREIGN KEY ("encounter_id") REFERENCES "encounters"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_concept_id_fkey" FOREIGN KEY ("concept_id") REFERENCES "concepts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_orderer_id_fkey" FOREIGN KEY ("orderer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recettes" ADD CONSTRAINT "recettes_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recettes" ADD CONSTRAINT "recettes_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "examens" ADD CONSTRAINT "examens_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rendez_vous" ADD CONSTRAINT "rendez_vous_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rendez_vous" ADD CONSTRAINT "rendez_vous_medecin_id_fkey" FOREIGN KEY ("medecin_id") REFERENCES "medecins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rendez_vous" ADD CONSTRAINT "rendez_vous_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vitaux" ADD CONSTRAINT "vitaux_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vitaux" ADD CONSTRAINT "vitaux_medecin_id_fkey" FOREIGN KEY ("medecin_id") REFERENCES "medecins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "allergies" ADD CONSTRAINT "allergies_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pathologies" ADD CONSTRAINT "pathologies_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "prescriptions" ADD CONSTRAINT "prescriptions_medecin_id_fkey" FOREIGN KEY ("medecin_id") REFERENCES "medecins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordonnances" ADD CONSTRAINT "ordonnances_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ordonnances" ADD CONSTRAINT "ordonnances_medecin_id_fkey" FOREIGN KEY ("medecin_id") REFERENCES "medecins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vaccinations" ADD CONSTRAINT "vaccinations_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vaccinations" ADD CONSTRAINT "vaccinations_medecin_id_fkey" FOREIGN KEY ("medecin_id") REFERENCES "medecins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notes" ADD CONSTRAINT "notes_auteur_id_fkey" FOREIGN KEY ("auteur_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alertes" ADD CONSTRAINT "alertes_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "alertes" ADD CONSTRAINT "alertes_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visites" ADD CONSTRAINT "visites_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "visites" ADD CONSTRAINT "visites_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospitalisations" ADD CONSTRAINT "hospitalisations_patient_id_fkey" FOREIGN KEY ("patient_id") REFERENCES "patients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospitalisations" ADD CONSTRAINT "hospitalisations_medecin_id_fkey" FOREIGN KEY ("medecin_id") REFERENCES "medecins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hospitalisations" ADD CONSTRAINT "hospitalisations_service_id_fkey" FOREIGN KEY ("service_id") REFERENCES "services"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
