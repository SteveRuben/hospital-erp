import { useState } from 'react';

const sections = [
  {
    id: 'demarrage', title: 'Démarrage rapide', icon: 'bi-rocket-takeoff',
    content: `<h3>Premiers pas</h3>
<ol><li>Connectez-vous avec vos identifiants (compte par défaut: admin / Admin1234)</li>
<li>Allez dans <strong>Configuration</strong> pour paramétrer vos listes de référence (pays, villes, spécialités...)</li>
<li>Créez les <strong>services</strong> avec leurs prix et sous-services dans la page Services</li>
<li>Ajoutez les <strong>médecins</strong> avec leurs spécialités</li>
<li>Configurez la <strong>grille tarifaire</strong> dans Facturation → Tarifs</li>
<li>Commencez à enregistrer des <strong>patients</strong></li></ol>
<h3>ID Patient</h3>
<p>Chaque patient reçoit un identifiant unique auto-généré au format configurable :</p>
<p><code>PAT-2605-MJ-0015</code> (préfixe-année/mois-initiales-séquentiel)</p>
<p>Le format est modifiable dans <strong>Configuration → Paramètres → patient_id_format</strong>.</p>`
  },
  {
    id: 'configuration', title: 'Configuration', icon: 'bi-gear',
    content: `<h3>Accès</h3>
<p>Menu : <strong>Administration → Configuration</strong> (admin uniquement)</p>
<h3>Paramètres généraux</h3>
<p>Modifiez les paramètres système :</p>
<ul><li><code>patient_id_format</code> — Format de l'ID patient. Variables : {YYYY}, {YY}, {MM}, {DD}, {YYMM}, {NP} (initiales), {SEQ:N} (séquentiel)</li>
<li><code>patient_id_prefix</code> — Préfixe (PAT par défaut)</li>
<li><code>devise</code> — Devise (XAF)</li>
<li><code>nom_etablissement</code> — Nom de l'hôpital</li>
<li><code>session_timeout_minutes</code> — Timeout de session</li></ul>
<h3>Listes de référence</h3>
<p>Gérez toutes les listes déroulantes de l'application :</p>
<table><tr><th>Catégorie</th><th>Usage</th></tr>
<tr><td>Pays</td><td>Formulaire patient (adresse)</td></tr>
<tr><td>Villes</td><td>Formulaire patient (adresse)</td></tr>
<tr><td>Pavillons</td><td>Gestion des lits</td></tr>
<tr><td>Spécialités</td><td>Formulaire médecin</td></tr>
<tr><td>Modes de paiement</td><td>Facturation, finances</td></tr>
<tr><td>Types d'examen</td><td>Laboratoire (avec sous-types)</td></tr>
<tr><td>Types de programme</td><td>Programmes de soins</td></tr>
<tr><td>Classes de concept</td><td>Dictionnaire de concepts</td></tr></table>
<h3>Hiérarchie (sous-types)</h3>
<p>Cliquez sur un type parent pour voir/ajouter ses sous-types. Exemple :</p>
<ul><li><strong>Laboratoire</strong> → Analyse de sang, Glycémie, NFS, Sérologie...</li>
<li><strong>Imagerie</strong> → Échographie, Radio, Scanner, IRM...</li></ul>
<p>Dans les formulaires, ce sont les <strong>sous-types</strong> qui apparaissent dans les listes déroulantes.</p>
<h3>Import CSV</h3>
<p>Chaque catégorie peut être importée via un fichier CSV :</p>
<p><code>code;libelle;parent_code;ordre</code></p>
<h3>Services (avec prix)</h3>
<p>Les services sont gérés dans une page dédiée : <strong>Administration → Services</strong></p>
<p>Chaque service peut avoir :</p>
<ul><li>Un <strong>prix</strong> (XAF)</li>
<li>Un <strong>poids</strong> (priorité d'affichage)</li>
<li>Des <strong>sous-services</strong> (hiérarchie parent/enfant)</li>
<li>Un <strong>code</strong> interne</li>
<li>Un statut <strong>actif/inactif</strong></li></ul>`
  },
  {
    id: 'patients', title: 'Gestion des patients', icon: 'bi-people',
    content: `<h3>Enregistrement</h3>
<p>Page dédiée avec formulaire en 4 étapes :</p>
<ol><li><strong>Identité</strong> : nom, prénom, sexe, date de naissance (ou âge estimé), groupe sanguin, N° identité</li>
<li><strong>Démographie</strong> : lieu de naissance, nationalité, profession, statut matrimonial</li>
<li><strong>Adresse</strong> : pays, province, ville, commune, quartier</li>
<li><strong>Contact</strong> : téléphone (formaté), email, contact d'urgence</li></ol>
<h3>ID Patient</h3>
<p>Généré automatiquement selon le format configuré. Exemple : <code>PAT-2605-MJ-0015</code></p>
<p>Non modifiable, unique, affiché dans la liste des patients.</p>
<h3>Dossier patient</h3>
<p>Cliquez sur un patient pour accéder à son dossier complet :</p>
<ul><li>Résumé, Signes vitaux, Allergies, Pathologies</li>
<li>Prescriptions, Vaccinations, Notes, Alertes</li>
<li>Consultations, Examens, Finances, RDV, Timeline</li></ul>
<h3>Archivage</h3>
<p>Les patients ne sont jamais supprimés. Ils sont archivés et peuvent être restaurés. Une confirmation est demandée avant l'archivage.</p>`
  },
  {
    id: 'consultations', title: 'Consultations', icon: 'bi-clipboard-pulse',
    content: `<h3>Workflow</h3>
<p>Arrivée → File d'attente → Consultation → Examens → Traitement → Paiement</p>
<h3>Créer une consultation</h3>
<p>Page dédiée (<strong>Consultations → Nouvelle consultation</strong>) :</p>
<ol><li>Sélectionner le patient, le médecin et le service</li>
<li>Saisir le motif, le diagnostic et le traitement</li>
<li>Ajouter des notes</li></ol>
<h3>Modification</h3>
<p>Cliquez sur le crayon pour modifier une consultation existante.</p>`
  },
  {
    id: 'laboratoire', title: 'Laboratoire', icon: 'bi-flask',
    content: `<h3>Workflow des examens</h3>
<p>Demandé → Prélèvement → Analyse → Résultat → Validé → Transmis</p>
<h3>Vue Kanban</h3>
<p>Les examens sont affichés en colonnes par statut. Cliquez sur l'action pour faire avancer l'examen.</p>
<h3>Types d'examens</h3>
<p>Configurables dans <strong>Configuration → Types d'examen labo</strong>. Supportent les sous-types (ex: Sang → NFS, Glycémie...).</p>
<h3>Création</h3>
<p>Page dédiée : <strong>Laboratoire → Nouvel examen</strong></p>`
  },
  {
    id: 'pharmacie', title: 'Pharmacie', icon: 'bi-capsule',
    content: `<h3>Médicaments</h3>
<p>Gérez le catalogue de médicaments : nom, DCI, forme, dosage, catégorie, prix, code-barre.</p>
<h3>Import CSV</h3>
<p>Importez en masse depuis <strong>Configuration → Médicaments (import)</strong> ou directement dans la Pharmacie.</p>
<p>Format : <code>nom;dci;forme;dosage;categorie;prix;code_barre</code></p>
<h3>Stock</h3>
<p>Gérez les entrées de stock : lot, date d'expiration, quantité, quantité minimum, prix d'achat, fournisseur.</p>
<h3>Alertes stock bas</h3>
<p>Quand un médicament passe sous le seuil minimum (<code>quantite_min</code>), une notification snackbar s'affiche à la connexion.</p>
<h3>Point de vente</h3>
<p>Vente directe sans ordonnance : sélectionnez les médicaments, quantités, et validez. Le stock est décrémenté en FIFO (lot le plus ancien en premier).</p>
<h3>Dispensation</h3>
<p>Dispensation liée à une ordonnance : sélectionnez le patient, la prescription, et la quantité délivrée.</p>`
  },
  {
    id: 'facturation', title: 'Facturation & Paiements', icon: 'bi-receipt',
    content: `<h3>Grille tarifaire</h3>
<p>Définissez vos tarifs : code, libellé, catégorie, montant, service associé.</p>
<h3>Créer une facture</h3>
<ol><li>Sélectionner le patient</li>
<li>Ajouter les lignes (depuis la grille ou manuellement)</li>
<li>Numérotation automatique : FAC-YYYYMMDD-XXXX</li></ol>
<h3>Paiements</h3>
<p>Modes : Espèces, Mobile Money (Remita), Carte, Virement, Assurance</p>
<p>Paiements fractionnés supportés. Le statut se met à jour automatiquement (en attente → partielle → payée).</p>
<h3>Historique des paiements</h3>
<p>Cliquez sur une facture pour voir l'historique complet : date, montant, mode, référence, qui a encaissé.</p>
<h3>Réimpression</h3>
<p>Chaque paiement peut être réimprimé individuellement (reçu de paiement partiel ou total).</p>
<h3>Paiement mobile (Remita)</h3>
<p>Orange Money et MTN MoMo via l'API Remita. Le client reçoit une demande USSD et confirme avec son PIN.</p>`
  },
  {
    id: 'services', title: 'Services', icon: 'bi-building',
    content: `<h3>Accès</h3>
<p>Menu : <strong>Administration → Services</strong></p>
<h3>Structure hiérarchique</h3>
<p>Les services supportent une hiérarchie parent/enfant :</p>
<ul><li><strong>Consultation</strong> (parent) → Consultation générale, Consultation spécialisée (sous-services)</li>
<li><strong>Chirurgie</strong> (parent) → Chirurgie générale, Chirurgie orthopédique</li></ul>
<h3>Prix</h3>
<p>Chaque service (ou sous-service) peut avoir un <strong>prix en XAF</strong>. Ce prix est utilisé pour la facturation automatique.</p>
<h3>Poids</h3>
<p>Le poids détermine l'ordre d'affichage dans les listes déroulantes (plus le poids est élevé, plus le service apparaît en haut).</p>
<h3>Création</h3>
<p>Page dédiée : <strong>Services → Nouveau service</strong></p>
<ul><li>Nom, description, code</li>
<li>Service parent (pour créer un sous-service)</li>
<li>Prix (XAF)</li>
<li>Poids (priorité)</li>
<li>Actif/Inactif</li></ul>`
  },
  {
    id: 'hospitalisation', title: 'Hospitalisation & Lits', icon: 'bi-hospital',
    content: `<h3>Pavillons</h3>
<p>Configurés par défaut : Médecine Générale, Chirurgie, Maternité, Pédiatrie, Urgences, VIP, Réanimation.</p>
<p>Modifiables dans <strong>Configuration → Pavillons</strong>.</p>
<h3>Lits</h3>
<p>Chaque lit a : numéro, pavillon, type (Standard, Soins intensifs, Pédiatrique, Maternité, Isolement).</p>
<h3>Admission</h3>
<p>Page dédiée : <strong>Lits → Admission</strong></p>
<ol><li>Sélectionner le patient et un lit disponible</li>
<li>Le lit passe automatiquement en "occupé"</li>
<li>À la sortie, le lit redevient "disponible"</li></ol>`
  },
  {
    id: 'securite', title: 'Sécurité & MFA', icon: 'bi-shield-check',
    content: `<h3>Authentification</h3>
<ul><li>Mot de passe : min 8 caractères, majuscule, minuscule, chiffre, caractère spécial</li>
<li>Mots de passe courants bloqués</li>
<li>Hachage : Argon2id (standard OWASP 2024)</li>
<li>Session : timeout 30 min d'inactivité (côté serveur)</li>
<li>Rate-limit : 10 tentatives / 15 min</li></ul>
<h3>MFA (Authentification à deux facteurs)</h3>
<p>Obligatoire pour les rôles <strong>admin</strong> et <strong>médecin</strong>.</p>
<ol><li>Allez dans votre profil → Activer MFA</li>
<li>Scannez le QR code avec une app TOTP (Google Authenticator, Authy...)</li>
<li>Entrez le code à 6 chiffres pour confirmer</li></ol>
<h3>Rôles</h3>
<table><tr><th>Rôle</th><th>Accès</th></tr>
<tr><td>Admin</td><td>Tous les modules + Configuration</td></tr>
<tr><td>Médecin</td><td>Patients (attribués), consultations, prescriptions, labo, imagerie</td></tr>
<tr><td>Comptable</td><td>Finances, facturation, paiements, rapports</td></tr>
<tr><td>Laborantin</td><td>Laboratoire, résultats</td></tr>
<tr><td>Réception</td><td>Patients, RDV, file d'attente</td></tr></table>
<h3>Audit</h3>
<p>Toutes les opérations (création, modification, suppression) sont tracées dans un journal immutable.</p>`
  },
  {
    id: 'impression', title: 'Impression', icon: 'bi-printer',
    content: `<h3>Documents imprimables</h3>
<ul><li><strong>Factures</strong> : depuis Facturation, icône imprimante</li>
<li><strong>Reçus de paiement</strong> : depuis le détail d'une facture, icône imprimante sur chaque paiement</li>
<li><strong>Ordonnances</strong> : depuis le dossier patient → Prescriptions</li>
<li><strong>Résultats labo</strong> : depuis le dossier patient → Examens</li>
<li><strong>Étiquettes patient</strong> : depuis Export → Étiquette</li>
<li><strong>Cartes patient</strong> : depuis Export → Carte (format CR-80)</li></ul>
<p>Les documents s'ouvrent dans un nouvel onglet. Utilisez Ctrl+P pour imprimer ou enregistrer en PDF.</p>`
  },
  {
    id: 'paiement-mobile', title: 'Paiement mobile (Remita)', icon: 'bi-phone',
    content: `<h3>Opérateurs supportés</h3>
<table><tr><th>Code</th><th>Opérateur</th><th>Pays</th></tr>
<tr><td>OMCM</td><td>Orange Money</td><td>Cameroun</td></tr>
<tr><td>MOMOCM</td><td>MTN MoMo</td><td>Cameroun</td></tr></table>
<h3>Flux</h3>
<ol><li>Saisir le numéro de téléphone et le montant</li>
<li>Optionnel : lier à une facture (tapez # pour rechercher)</li>
<li>Cliquer "Envoyer la demande de paiement"</li>
<li>Le client reçoit une notification USSD et confirme avec son PIN</li>
<li>Vérifier le statut avec le bouton 🔄</li></ol>
<h3>Webhook</h3>
<p>Remita appelle automatiquement notre webhook pour confirmer le paiement. La facture est mise à jour automatiquement.</p>
<h3>Configuration</h3>
<p>Variables d'environnement (Railway) :</p>
<pre>REMITA_API_URL=https://api.remita.finance
REMITA_API_ID=votre_api_id
REMITA_API_KEY=votre_api_key
REMITA_USERNAME=votre_email
REMITA_PASSWORD=votre_mot_de_passe
REMITA_WEBHOOK_URL=https://votre-domaine/api/paiement-remita/webhook</pre>`
  },
];

export default function Documentation() {
  const [activeSection, setActiveSection] = useState('demarrage');
  const section = sections.find(s => s.id === activeSection);

  return (
    <div>
      <nav className="breadcrumb"><a href="/app">Accueil</a><span className="breadcrumb-separator">/</span><span>Documentation</span></nav>
      <div className="page-header"><h1 className="page-title">Documentation</h1></div>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '1.5rem' }}>
        <div>
          {sections.map(s => (
            <div key={s.id} className={`tile tile-clickable mb-1`} style={{ borderLeft: activeSection === s.id ? '3px solid var(--cds-interactive)' : '3px solid transparent', cursor: 'pointer' }} onClick={() => setActiveSection(s.id)}>
              <div className="d-flex align-center gap-1">
                <i className={`bi ${s.icon}`} style={{ color: activeSection === s.id ? 'var(--cds-interactive)' : 'var(--cds-text-secondary)' }}></i>
                <span style={{ fontSize: '0.875rem', fontWeight: activeSection === s.id ? 600 : 400 }}>{s.title}</span>
              </div>
            </div>
          ))}
        </div>

        <div className="tile" style={{ padding: '1.5rem' }}>
          {section && <div dangerouslySetInnerHTML={{ __html: section.content }} style={{ lineHeight: 1.7, fontSize: '0.875rem' }} />}
        </div>
      </div>
    </div>
  );
}
