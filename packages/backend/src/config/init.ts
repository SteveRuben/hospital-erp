import { pool, query } from './db.js';
import bcrypt from 'bcryptjs';

export const initDB = async (): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query(`
      -- Users & Auth
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(100) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL CHECK (role IN ('admin', 'medecin', 'comptable', 'laborantin', 'reception')),
        nom VARCHAR(100),
        prenom VARCHAR(100),
        telephone VARCHAR(20),
        must_change_password BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Patients
      CREATE TABLE IF NOT EXISTS patients (
        id SERIAL PRIMARY KEY,
        nom VARCHAR(100) NOT NULL,
        prenom VARCHAR(100) NOT NULL,
        deuxieme_prenom VARCHAR(100),
        sexe VARCHAR(10) CHECK (sexe IN ('M', 'F', 'autre')),
        date_naissance DATE,
        age_estime INTEGER,
        lieu_naissance VARCHAR(100),
        nationalite VARCHAR(100),
        numero_identite VARCHAR(50),
        statut_matrimonial VARCHAR(30) CHECK (statut_matrimonial IN ('celibataire', 'marie', 'divorce', 'veuf')),
        groupe_sanguin VARCHAR(5) CHECK (groupe_sanguin IN ('A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-')),
        pays VARCHAR(100),
        province VARCHAR(100),
        ville VARCHAR(100),
        commune VARCHAR(100),
        quartier VARCHAR(100),
        adresse TEXT,
        profession VARCHAR(100),
        telephone VARCHAR(20),
        email VARCHAR(150),
        contact_urgence_nom VARCHAR(100),
        contact_urgence_relation VARCHAR(50),
        contact_urgence_telephone VARCHAR(20),
        photo_url TEXT,
        archived BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Médecins
      CREATE TABLE IF NOT EXISTS medecins (
        id SERIAL PRIMARY KEY,
        nom VARCHAR(100) NOT NULL,
        prenom VARCHAR(100) NOT NULL,
        specialite VARCHAR(100),
        telephone VARCHAR(20),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Services
      CREATE TABLE IF NOT EXISTS services (
        id SERIAL PRIMARY KEY,
        nom VARCHAR(100) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Consultations
      CREATE TABLE IF NOT EXISTS consultations (
        id SERIAL PRIMARY KEY,
        reference VARCHAR(20) UNIQUE,
        patient_id INTEGER REFERENCES patients(id),
        medecin_id INTEGER REFERENCES medecins(id),
        service_id INTEGER REFERENCES services(id),
        date_consultation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        diagnostic TEXT,
        traitement TEXT,
        notes TEXT,
        statut VARCHAR(50) DEFAULT 'en_cours' CHECK (statut IN ('en_cours', 'terminee', 'annulee')),
        motif TEXT,
        gravite VARCHAR(20)
      );

      -- Recettes
      CREATE TABLE IF NOT EXISTS recettes (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER REFERENCES patients(id),
        service_id INTEGER REFERENCES services(id),
        type_acte VARCHAR(100) NOT NULL,
        montant DECIMAL(12,2) NOT NULL,
        mode_paiement VARCHAR(50) CHECK (mode_paiement IN ('especes', 'mobile_money', 'carte')),
        date_recette DATE DEFAULT CURRENT_DATE,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Dépenses
      CREATE TABLE IF NOT EXISTS depenses (
        id SERIAL PRIMARY KEY,
        type_depense VARCHAR(100) NOT NULL,
        nature VARCHAR(100),
        montant DECIMAL(12,2) NOT NULL,
        fournisseur VARCHAR(100),
        description TEXT,
        date_depense DATE DEFAULT CURRENT_DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Laboratoire
      CREATE TABLE IF NOT EXISTS examens (
        id SERIAL PRIMARY KEY,
        reference VARCHAR(20) UNIQUE,
        patient_id INTEGER REFERENCES patients(id),
        type_examen VARCHAR(100) NOT NULL,
        resultat TEXT,
        date_examen DATE DEFAULT CURRENT_DATE,
        montant DECIMAL(10,2),
        statut VARCHAR(50) DEFAULT 'demande' CHECK (statut IN ('demande', 'prelevement', 'analyse', 'resultat', 'valide', 'transmis')),
        demandeur_id INTEGER REFERENCES medecins(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Rendez-vous
      CREATE TABLE IF NOT EXISTS rendez_vous (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER REFERENCES patients(id),
        medecin_id INTEGER REFERENCES medecins(id),
        service_id INTEGER REFERENCES services(id),
        date_rdv TIMESTAMP NOT NULL,
        motif TEXT,
        statut VARCHAR(50) DEFAULT 'planifie' CHECK (statut IN ('planifie', 'confirme', 'en_cours', 'termine', 'annule', 'absent')),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Documents patients
      CREATE TABLE IF NOT EXISTS documents (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER REFERENCES patients(id),
        type_document VARCHAR(50) CHECK (type_document IN ('ordonnance', 'resultat', 'imagerie')),
        fichier_url TEXT,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Signes vitaux
      CREATE TABLE IF NOT EXISTS vitaux (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER REFERENCES patients(id),
        medecin_id INTEGER REFERENCES medecins(id),
        temperature DECIMAL(4,1),
        tension_systolique INTEGER,
        tension_diastolique INTEGER,
        pouls INTEGER,
        frequence_respiratoire INTEGER,
        saturation_o2 INTEGER,
        poids DECIMAL(5,1),
        taille DECIMAL(5,1),
        glycemie DECIMAL(5,2),
        notes TEXT,
        date_mesure TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Allergies
      CREATE TABLE IF NOT EXISTS allergies (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER REFERENCES patients(id),
        allergene VARCHAR(200) NOT NULL,
        type_allergie VARCHAR(50) CHECK (type_allergie IN ('medicament', 'alimentaire', 'environnement', 'autre')),
        severite VARCHAR(20) CHECK (severite IN ('legere', 'moderee', 'severe', 'fatale')),
        reaction TEXT,
        date_debut DATE,
        active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Pathologies / Conditions
      CREATE TABLE IF NOT EXISTS pathologies (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER REFERENCES patients(id),
        nom VARCHAR(200) NOT NULL,
        code_cim VARCHAR(20),
        statut VARCHAR(50) DEFAULT 'active' CHECK (statut IN ('active', 'inactive', 'resolue')),
        date_debut DATE,
        date_fin DATE,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Prescriptions / Médicaments
      CREATE TABLE IF NOT EXISTS prescriptions (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER REFERENCES patients(id),
        medecin_id INTEGER REFERENCES medecins(id),
        consultation_id INTEGER REFERENCES consultations(id),
        medicament VARCHAR(200) NOT NULL,
        dosage VARCHAR(100),
        frequence VARCHAR(100),
        duree VARCHAR(100),
        voie VARCHAR(50),
        instructions TEXT,
        statut VARCHAR(50) DEFAULT 'active' CHECK (statut IN ('active', 'terminee', 'annulee')),
        date_debut DATE DEFAULT CURRENT_DATE,
        date_fin DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Ordonnances
      CREATE TABLE IF NOT EXISTS ordonnances (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER REFERENCES patients(id),
        medecin_id INTEGER REFERENCES medecins(id),
        consultation_id INTEGER REFERENCES consultations(id),
        date_ordonnance DATE DEFAULT CURRENT_DATE,
        notes TEXT,
        statut VARCHAR(50) DEFAULT 'emise' CHECK (statut IN ('emise', 'delivree', 'annulee')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Vaccinations
      CREATE TABLE IF NOT EXISTS vaccinations (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER REFERENCES patients(id),
        medecin_id INTEGER REFERENCES medecins(id),
        vaccin VARCHAR(200) NOT NULL,
        lot VARCHAR(100),
        dose VARCHAR(50),
        site_injection VARCHAR(100),
        date_vaccination DATE DEFAULT CURRENT_DATE,
        date_rappel DATE,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Notes et commentaires
      CREATE TABLE IF NOT EXISTS notes (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER REFERENCES patients(id),
        auteur_id INTEGER REFERENCES users(id),
        titre VARCHAR(200),
        contenu TEXT NOT NULL,
        type_note VARCHAR(50) DEFAULT 'general' CHECK (type_note IN ('general', 'clinique', 'infirmier', 'administratif')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Alertes patient
      CREATE TABLE IF NOT EXISTS alertes (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER REFERENCES patients(id),
        type_alerte VARCHAR(50) CHECK (type_alerte IN ('allergie', 'pathologie', 'medicament', 'administratif', 'urgent', 'autre')),
        message TEXT NOT NULL,
        severite VARCHAR(20) DEFAULT 'info' CHECK (severite IN ('info', 'warning', 'danger', 'critical')),
        active BOOLEAN DEFAULT TRUE,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Formulaires dynamiques (définitions)
      CREATE TABLE IF NOT EXISTS formulaires (
        id SERIAL PRIMARY KEY,
        nom VARCHAR(200) NOT NULL,
        description TEXT,
        schema_json TEXT NOT NULL,
        service_id INTEGER REFERENCES services(id),
        actif BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Réponses formulaires
      CREATE TABLE IF NOT EXISTS formulaire_reponses (
        id SERIAL PRIMARY KEY,
        formulaire_id INTEGER REFERENCES formulaires(id),
        patient_id INTEGER REFERENCES patients(id),
        rempli_par INTEGER REFERENCES users(id),
        donnees_json TEXT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Visites actives
      CREATE TABLE IF NOT EXISTS visites (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER REFERENCES patients(id),
        service_id INTEGER REFERENCES services(id),
        type_visite VARCHAR(50) DEFAULT 'ambulatoire' CHECK (type_visite IN ('ambulatoire', 'hospitalisation', 'urgence')),
        date_debut TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        date_fin TIMESTAMP,
        statut VARCHAR(50) DEFAULT 'active' CHECK (statut IN ('active', 'terminee')),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- File d'attente
      CREATE TABLE IF NOT EXISTS file_attente (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER REFERENCES patients(id),
        service_id INTEGER REFERENCES services(id),
        priorite VARCHAR(20) DEFAULT 'normal' CHECK (priorite IN ('urgent', 'prioritaire', 'normal')),
        statut VARCHAR(50) DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'en_cours', 'termine', 'absent')),
        numero_ordre INTEGER,
        date_arrivee TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        date_prise_en_charge TIMESTAMP,
        notes TEXT
      );

      -- Listes de patients (cohortes)
      CREATE TABLE IF NOT EXISTS listes_patients (
        id SERIAL PRIMARY KEY,
        nom VARCHAR(200) NOT NULL,
        description TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS liste_patient_membres (
        id SERIAL PRIMARY KEY,
        liste_id INTEGER REFERENCES listes_patients(id) ON DELETE CASCADE,
        patient_id INTEGER REFERENCES patients(id),
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE(liste_id, patient_id)
      );

      -- Lits / Bed management
      CREATE TABLE IF NOT EXISTS pavillons (
        id SERIAL PRIMARY KEY,
        nom VARCHAR(100) NOT NULL,
        etage VARCHAR(50),
        service_id INTEGER REFERENCES services(id),
        capacite INTEGER DEFAULT 0,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS lits (
        id SERIAL PRIMARY KEY,
        pavillon_id INTEGER REFERENCES pavillons(id),
        numero VARCHAR(20) NOT NULL,
        type_lit VARCHAR(50) DEFAULT 'standard' CHECK (type_lit IN ('standard', 'soins_intensifs', 'pediatrique', 'maternite', 'isolement')),
        statut VARCHAR(50) DEFAULT 'disponible' CHECK (statut IN ('disponible', 'occupe', 'maintenance', 'reserve')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS hospitalisations (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER REFERENCES patients(id),
        lit_id INTEGER REFERENCES lits(id),
        medecin_id INTEGER REFERENCES medecins(id),
        service_id INTEGER REFERENCES services(id),
        date_admission TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        date_sortie TIMESTAMP,
        motif TEXT,
        statut VARCHAR(50) DEFAULT 'active' CHECK (statut IN ('active', 'sortie', 'transfere', 'deces')),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Programmes de soins
      CREATE TABLE IF NOT EXISTS programmes (
        id SERIAL PRIMARY KEY,
        nom VARCHAR(200) NOT NULL,
        description TEXT,
        type_programme VARCHAR(100),
        actif BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS programme_patients (
        id SERIAL PRIMARY KEY,
        programme_id INTEGER REFERENCES programmes(id) ON DELETE CASCADE,
        patient_id INTEGER REFERENCES patients(id),
        date_inscription DATE DEFAULT CURRENT_DATE,
        date_sortie DATE,
        statut VARCHAR(50) DEFAULT 'actif' CHECK (statut IN ('actif', 'termine', 'abandonne')),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Tarification / Grille tarifaire
      CREATE TABLE IF NOT EXISTS tarifs (
        id SERIAL PRIMARY KEY,
        code VARCHAR(50) UNIQUE NOT NULL,
        libelle VARCHAR(200) NOT NULL,
        categorie VARCHAR(100) NOT NULL,
        montant DECIMAL(12,2) NOT NULL,
        service_id INTEGER REFERENCES services(id),
        actif BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Factures
      CREATE TABLE IF NOT EXISTS factures (
        id SERIAL PRIMARY KEY,
        numero VARCHAR(50) UNIQUE NOT NULL,
        patient_id INTEGER REFERENCES patients(id),
        date_facture DATE DEFAULT CURRENT_DATE,
        montant_total DECIMAL(12,2) DEFAULT 0,
        montant_paye DECIMAL(12,2) DEFAULT 0,
        statut VARCHAR(50) DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'partielle', 'payee', 'annulee')),
        notes TEXT,
        created_by INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS facture_lignes (
        id SERIAL PRIMARY KEY,
        facture_id INTEGER REFERENCES factures(id) ON DELETE CASCADE,
        tarif_id INTEGER REFERENCES tarifs(id),
        libelle VARCHAR(200) NOT NULL,
        quantite INTEGER DEFAULT 1,
        prix_unitaire DECIMAL(12,2) NOT NULL,
        montant DECIMAL(12,2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS paiements (
        id SERIAL PRIMARY KEY,
        facture_id INTEGER REFERENCES factures(id),
        montant DECIMAL(12,2) NOT NULL,
        mode_paiement VARCHAR(50) CHECK (mode_paiement IN ('especes', 'mobile_money', 'carte', 'virement', 'assurance')),
        reference VARCHAR(100),
        date_paiement TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        recu_par INTEGER REFERENCES users(id),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Habilitations (permissions par rôle)
      CREATE TABLE IF NOT EXISTS habilitations (
        id SERIAL PRIMARY KEY,
        role VARCHAR(50) NOT NULL,
        module VARCHAR(100) NOT NULL,
        acces BOOLEAN DEFAULT TRUE,
        UNIQUE(role, module)
      );

      -- Menu configuration
      CREATE TABLE IF NOT EXISTS menu_config (
        id SERIAL PRIMARY KEY,
        groupe VARCHAR(100) NOT NULL,
        groupe_ordre INTEGER DEFAULT 0,
        module VARCHAR(100) NOT NULL,
        label VARCHAR(100) NOT NULL,
        icon VARCHAR(50) NOT NULL,
        path VARCHAR(200) NOT NULL,
        ordre INTEGER DEFAULT 0,
        actif BOOLEAN DEFAULT TRUE
      );

      -- Pharmacie
      CREATE TABLE IF NOT EXISTS medicaments (
        id SERIAL PRIMARY KEY,
        nom VARCHAR(200) NOT NULL,
        dci VARCHAR(200),
        forme VARCHAR(50),
        dosage_standard VARCHAR(100),
        code_barre VARCHAR(50),
        categorie VARCHAR(100),
        prix_unitaire DECIMAL(12,2),
        actif BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS stock (
        id SERIAL PRIMARY KEY,
        medicament_id INTEGER REFERENCES medicaments(id),
        lot VARCHAR(100),
        date_expiration DATE,
        quantite INTEGER DEFAULT 0,
        quantite_min INTEGER DEFAULT 10,
        prix_achat DECIMAL(12,2),
        fournisseur VARCHAR(200),
        date_entree DATE DEFAULT CURRENT_DATE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS stock_mouvements (
        id SERIAL PRIMARY KEY,
        medicament_id INTEGER REFERENCES medicaments(id),
        type_mouvement VARCHAR(20) CHECK (type_mouvement IN ('entree', 'sortie', 'ajustement', 'perime')),
        quantite INTEGER NOT NULL,
        lot VARCHAR(100),
        motif TEXT,
        user_id INTEGER REFERENCES users(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS dispensations (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER REFERENCES patients(id),
        prescription_id INTEGER,
        medicament_id INTEGER REFERENCES medicaments(id),
        quantite_delivree INTEGER,
        dispenseur_id INTEGER REFERENCES users(id),
        date_dispensation TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        notes TEXT
      );

      -- Facilities (multi-site)
      CREATE TABLE IF NOT EXISTS facilities (
        id SERIAL PRIMARY KEY,
        nom VARCHAR(200) NOT NULL,
        code VARCHAR(50) UNIQUE,
        type_facility VARCHAR(50),
        adresse TEXT,
        ville VARCHAR(100),
        telephone VARCHAR(20),
        email VARCHAR(150),
        actif BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Planning médecins (créneaux récurrents)
      CREATE TABLE IF NOT EXISTS planning_medecins (
        id SERIAL PRIMARY KEY,
        medecin_id INTEGER REFERENCES medecins(id),
        service_id INTEGER REFERENCES services(id),
        jour_semaine INTEGER NOT NULL CHECK (jour_semaine BETWEEN 0 AND 6),
        heure_debut TIME NOT NULL,
        heure_fin TIME NOT NULL,
        duree_creneau INTEGER DEFAULT 30,
        actif BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Blocages de créneaux (congés, réunions)
      CREATE TABLE IF NOT EXISTS planning_blocages (
        id SERIAL PRIMARY KEY,
        medecin_id INTEGER REFERENCES medecins(id),
        date_debut TIMESTAMP NOT NULL,
        date_fin TIMESTAMP NOT NULL,
        motif VARCHAR(200),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Imagerie médicale
      CREATE TABLE IF NOT EXISTS imagerie (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER REFERENCES patients(id),
        type_examen VARCHAR(100),
        description TEXT,
        fichier_url TEXT,
        fichier_nom VARCHAR(200),
        fichier_type VARCHAR(50),
        date_examen DATE DEFAULT CURRENT_DATE,
        medecin_id INTEGER REFERENCES medecins(id),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- ===== OPENMRS CORE CONCEPTS =====

      -- Concept Dictionary
      CREATE TABLE IF NOT EXISTS concepts (
        id SERIAL PRIMARY KEY,
        nom VARCHAR(200) NOT NULL,
        code VARCHAR(50) UNIQUE,
        datatype VARCHAR(30) NOT NULL CHECK (datatype IN ('numeric', 'coded', 'text', 'date', 'boolean', 'datetime', 'document')),
        classe VARCHAR(50) NOT NULL CHECK (classe IN ('diagnostic', 'symptome', 'test', 'medicament', 'procedure', 'finding', 'question', 'reponse', 'misc')),
        description TEXT,
        unite VARCHAR(50),
        valeur_min DECIMAL(10,2),
        valeur_max DECIMAL(10,2),
        actif BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Concept names (multilingual)
      CREATE TABLE IF NOT EXISTS concept_noms (
        id SERIAL PRIMARY KEY,
        concept_id INTEGER REFERENCES concepts(id) ON DELETE CASCADE,
        nom VARCHAR(200) NOT NULL,
        langue VARCHAR(10) DEFAULT 'fr',
        type_nom VARCHAR(20) DEFAULT 'complet' CHECK (type_nom IN ('complet', 'court', 'synonyme')),
        UNIQUE(concept_id, nom, langue)
      );

      -- Concept answers (for coded concepts)
      CREATE TABLE IF NOT EXISTS concept_reponses (
        id SERIAL PRIMARY KEY,
        concept_id INTEGER REFERENCES concepts(id) ON DELETE CASCADE,
        reponse_concept_id INTEGER REFERENCES concepts(id),
        ordre INTEGER DEFAULT 0
      );

      -- Concept mappings to external terminologies
      CREATE TABLE IF NOT EXISTS concept_mappings (
        id SERIAL PRIMARY KEY,
        concept_id INTEGER REFERENCES concepts(id) ON DELETE CASCADE,
        source VARCHAR(50) NOT NULL,
        code_externe VARCHAR(50) NOT NULL,
        UNIQUE(concept_id, source, code_externe)
      );

      -- Encounter types
      CREATE TABLE IF NOT EXISTS encounter_types (
        id SERIAL PRIMARY KEY,
        nom VARCHAR(100) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Encounters (clinical visits/interactions)
      CREATE TABLE IF NOT EXISTS encounters (
        id SERIAL PRIMARY KEY,
        reference VARCHAR(20) UNIQUE,
        patient_id INTEGER REFERENCES patients(id),
        encounter_type_id INTEGER REFERENCES encounter_types(id),
        visite_id INTEGER REFERENCES visites(id),
        provider_id INTEGER REFERENCES users(id),
        service_id INTEGER REFERENCES services(id),
        date_encounter TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Observations (EAV clinical data)
      CREATE TABLE IF NOT EXISTS observations (
        id SERIAL PRIMARY KEY,
        encounter_id INTEGER REFERENCES encounters(id) ON DELETE CASCADE,
        patient_id INTEGER REFERENCES patients(id),
        concept_id INTEGER REFERENCES concepts(id),
        valeur_numerique DECIMAL(12,4),
        valeur_texte TEXT,
        valeur_date TIMESTAMP,
        valeur_coded INTEGER REFERENCES concepts(id),
        valeur_boolean BOOLEAN,
        commentaire TEXT,
        provider_id INTEGER REFERENCES users(id),
        date_obs TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        voided BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Orders (unified medical orders)
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        reference VARCHAR(20) UNIQUE,
        patient_id INTEGER REFERENCES patients(id),
        encounter_id INTEGER REFERENCES encounters(id),
        concept_id INTEGER REFERENCES concepts(id),
        type_order VARCHAR(30) NOT NULL CHECK (type_order IN ('prescription', 'test_labo', 'imagerie', 'procedure', 'referral')),
        orderer_id INTEGER REFERENCES users(id),
        urgence VARCHAR(20) DEFAULT 'routine' CHECK (urgence IN ('routine', 'urgent', 'stat')),
        instructions TEXT,
        date_debut TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        date_fin TIMESTAMP,
        statut VARCHAR(30) DEFAULT 'actif' CHECK (statut IN ('nouveau', 'actif', 'complete', 'annule', 'expire')),
        -- Prescription fields
        dosage VARCHAR(100),
        frequence VARCHAR(100),
        duree VARCHAR(100),
        voie VARCHAR(50),
        quantite INTEGER,
        -- Lab/Imaging fields
        resultat TEXT,
        date_resultat TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Notifications log
      CREATE TABLE IF NOT EXISTS notifications_log (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER REFERENCES patients(id),
        channel VARCHAR(20) NOT NULL,
        subject VARCHAR(200),
        message TEXT,
        success BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      -- Journal d'audit
      CREATE TABLE IF NOT EXISTS audit_log (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        action VARCHAR(100),
        table_name VARCHAR(50),
        record_id INTEGER,
        details TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Insert default users (one per role)
    const hashedPassword = await bcrypt.hash('admin123', 10);
    const defaultUsers = [
      ['admin', hashedPassword, 'admin', 'Administrateur', 'Système'],
      ['dr.martin', hashedPassword, 'medecin', 'Martin', 'Jean'],
      ['comptable1', hashedPassword, 'comptable', 'Dubois', 'Marie'],
      ['labo1', hashedPassword, 'laborantin', 'Petit', 'Paul'],
      ['reception1', hashedPassword, 'reception', 'Leroy', 'Sophie'],
    ];
    for (const [username, pwd, role, nom, prenom] of defaultUsers) {
      await client.query(
        `INSERT INTO users (username, password, role, nom, prenom) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (username) DO NOTHING`,
        [username, pwd, role, nom, prenom]
      );
    }

    // Seed default habilitations
    const modules = ['dashboard','patients','medecins','consultations','rendezvous','laboratoire','visites','file-attente','finances','services','listes-patients','documentation','utilisateurs','habilitations','import','lits','programmes','facturation','paiement-mobile','imagerie','orders','concepts','pharmacie','patient-merge','rapports','formulaires','cohort-builder'];
    const roleAccess: Record<string, string[]> = {
      admin: modules,
      medecin: ['dashboard','patients','medecins','consultations','rendezvous','visites','file-attente','listes-patients','documentation','lits','programmes','imagerie','orders','pharmacie','cohort-builder'],
      comptable: ['dashboard','finances','documentation','facturation','paiement-mobile','rapports'],
      laborantin: ['dashboard','laboratoire','documentation','orders'],
      reception: ['dashboard','patients','rendezvous','visites','file-attente','documentation'],
    };
    for (const [role, mods] of Object.entries(roleAccess)) {
      for (const mod of modules) {
        await client.query('INSERT INTO habilitations (role, module, acces) VALUES ($1::varchar, $2::varchar, $3::boolean) ON CONFLICT (role, module) DO NOTHING', [role, mod, mods.includes(mod)]);
      }
    }

    // Seed default menu config
    const menuItems = [
      ['Accueil', 0, 'dashboard', 'Dashboard', 'bi-speedometer2', '/app', 0],
      ['Clinique', 1, 'patients', 'Patients', 'bi-people', '/app/patients', 0],
      ['Clinique', 1, 'medecins', 'Médecins', 'bi-person-badge', '/app/medecins', 1],
      ['Clinique', 1, 'consultations', 'Consultations', 'bi-clipboard-pulse', '/app/consultations', 2],
      ['Clinique', 1, 'rendezvous', 'Rendez-vous', 'bi-calendar-event', '/app/rendezvous', 3],
      ['Clinique', 1, 'laboratoire', 'Laboratoire', 'bi-flask', '/app/laboratoire', 4],
      ['Clinique', 1, 'visites', 'Visites actives', 'bi-door-open', '/app/visites', 5],
      ['Clinique', 1, 'file-attente', "File d'attente", 'bi-hourglass-split', '/app/file-attente', 6],
      ['Administration', 2, 'finances', 'Finances', 'bi-cash-coin', '/app/finances', 0],
      ['Administration', 2, 'services', 'Services', 'bi-building', '/app/services', 1],
      ['Administration', 2, 'listes-patients', 'Listes patients', 'bi-list-ul', '/app/listes-patients', 2],
      ['Administration', 2, 'documentation', 'Documentation', 'bi-book', '/app/documentation', 3],
      ['Administration', 2, 'utilisateurs', 'Utilisateurs', 'bi-person-gear', '/app/utilisateurs', 4],
      ['Administration', 2, 'habilitations', 'Habilitations', 'bi-shield-lock', '/app/habilitations', 5],
      ['Administration', 2, 'import', 'Import données', 'bi-cloud-upload', '/app/import', 6],
      ['Clinique', 1, 'lits', 'Lits & Hospitalisation', 'bi-hospital', '/app/lits', 7],
      ['Clinique', 1, 'programmes', 'Programmes de soins', 'bi-heart-pulse', '/app/programmes', 8],
      ['Administration', 2, 'facturation', 'Facturation', 'bi-receipt', '/app/facturation', 7],
      ['Administration', 2, 'paiement-mobile', 'Paiement mobile', 'bi-phone', '/app/paiement-mobile', 8],
      ['Clinique', 1, 'imagerie', 'Imagerie médicale', 'bi-image', '/app/imagerie', 9],
      ['Clinique', 1, 'orders', 'Ordres médicaux', 'bi-clipboard2-data', '/app/orders', 10],
      ['Administration', 2, 'concepts', 'Dictionnaire concepts', 'bi-book-half', '/app/concepts', 9],
      ['Clinique', 1, 'pharmacie', 'Pharmacie', 'bi-capsule', '/app/pharmacie', 11],
      ['Administration', 2, 'patient-merge', 'Fusion patients', 'bi-people-fill', '/app/patient-merge', 10],
      ['Administration', 2, 'rapports', 'Rapports', 'bi-graph-up', '/app/rapports', 11],
      ['Administration', 2, 'formulaires', 'Formulaires', 'bi-ui-checks-grid', '/app/formulaires', 12],
      ['Clinique', 1, 'cohort-builder', 'Cohort Builder', 'bi-funnel', '/app/cohort-builder', 12],
    ];
    for (const [groupe, groupe_ordre, module, label, icon, path, ordre] of menuItems) {
      await client.query('INSERT INTO menu_config (groupe, groupe_ordre, module, label, icon, path, ordre) SELECT $1::varchar, $2::int, $3::varchar, $4::varchar, $5::varchar, $6::varchar, $7::int WHERE NOT EXISTS (SELECT 1 FROM menu_config WHERE module = $3::varchar)', [groupe, groupe_ordre, module, label, icon, path, ordre]);
    }

    // Seed default encounter types
    const encounterTypes = ['Triage', 'Consultation', 'Laboratoire', 'Pharmacie', 'Imagerie', 'Hospitalisation', 'Urgence', 'Suivi'];
    for (const et of encounterTypes) {
      await client.query('INSERT INTO encounter_types (nom) SELECT $1::varchar WHERE NOT EXISTS (SELECT 1 FROM encounter_types WHERE nom = $1::varchar)', [et]);
    }

    // Seed starter concepts
    const starterConcepts = [
      ['TEMP', 'Température', 'numeric', 'finding', '°C', 35, 42],
      ['TA_SYS', 'Tension artérielle systolique', 'numeric', 'finding', 'mmHg', 60, 250],
      ['TA_DIA', 'Tension artérielle diastolique', 'numeric', 'finding', 'mmHg', 30, 150],
      ['POULS', 'Pouls', 'numeric', 'finding', 'bpm', 30, 200],
      ['SPO2', 'Saturation en oxygène', 'numeric', 'finding', '%', 50, 100],
      ['POIDS', 'Poids', 'numeric', 'finding', 'kg', 0.5, 300],
      ['TAILLE', 'Taille', 'numeric', 'finding', 'cm', 20, 250],
      ['GLYC', 'Glycémie', 'numeric', 'test', 'g/L', 0.3, 5],
      ['DIAG', 'Diagnostic', 'text', 'diagnostic', null, null, null],
      ['MOTIF', 'Motif de consultation', 'text', 'question', null, null, null],
      ['PALUDISME', 'Paludisme', 'boolean', 'diagnostic', null, null, null],
      ['RESULTAT_POS', 'Positif', 'text', 'reponse', null, null, null],
      ['RESULTAT_NEG', 'Négatif', 'text', 'reponse', null, null, null],
    ];
    for (const [code, nom, datatype, classe, unite, vmin, vmax] of starterConcepts) {
      await client.query('INSERT INTO concepts (code, nom, datatype, classe, unite, valeur_min, valeur_max) SELECT $1::varchar,$2::varchar,$3::varchar,$4::varchar,$5::varchar,$6::decimal,$7::decimal WHERE NOT EXISTS (SELECT 1 FROM concepts WHERE code = $1::varchar)', [code, nom, datatype, classe, unite, vmin, vmax]);
    }

    // Migrations: add soft-delete columns to recettes and depenses
    await client.query(`
      ALTER TABLE recettes ADD COLUMN IF NOT EXISTS annulee BOOLEAN DEFAULT FALSE;
      ALTER TABLE recettes ADD COLUMN IF NOT EXISTS date_annulation TIMESTAMP;
      ALTER TABLE recettes ADD COLUMN IF NOT EXISTS annulee_par INTEGER REFERENCES users(id);
      ALTER TABLE depenses ADD COLUMN IF NOT EXISTS annulee BOOLEAN DEFAULT FALSE;
      ALTER TABLE depenses ADD COLUMN IF NOT EXISTS date_annulation TIMESTAMP;
      ALTER TABLE depenses ADD COLUMN IF NOT EXISTS annulee_par INTEGER REFERENCES users(id);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT FALSE;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS mfa_secret VARCHAR(255);
    `);

    // Patient-medecin attribution (need-to-know access control)
    await client.query(`
      CREATE TABLE IF NOT EXISTS patient_attributions (
        id SERIAL PRIMARY KEY,
        patient_id INTEGER REFERENCES patients(id) ON DELETE CASCADE,
        medecin_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        date_attribution TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        actif BOOLEAN DEFAULT TRUE,
        UNIQUE(patient_id, medecin_user_id)
      );
    `);

    // Webhook idempotence tracking
    await client.query(`
      CREATE TABLE IF NOT EXISTS webhook_events (
        id SERIAL PRIMARY KEY,
        event_id VARCHAR(100) UNIQUE NOT NULL,
        source VARCHAR(50) NOT NULL,
        payload TEXT,
        processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Protect audit_log from modification (WORM - write-once-read-many)
    await client.query(`
      CREATE OR REPLACE FUNCTION prevent_audit_modification()
      RETURNS TRIGGER AS $$
      BEGIN
        RAISE EXCEPTION 'audit_log is immutable: UPDATE and DELETE are not allowed';
        RETURN NULL;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS audit_log_immutable ON audit_log;
      CREATE TRIGGER audit_log_immutable
        BEFORE UPDATE OR DELETE ON audit_log
        FOR EACH ROW EXECUTE FUNCTION prevent_audit_modification();
    `);

    console.log('Database initialized successfully');
  } catch (err) {
    console.error('Error initializing database:', err);
    throw err;
  } finally {
    client.release();
  }
};

export default initDB;