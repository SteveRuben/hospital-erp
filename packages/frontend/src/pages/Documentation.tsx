import { useState } from 'react';

const sections = [
  {
    id: 'demarrage', title: 'Démarrage rapide', icon: 'bi-rocket-takeoff',
    content: `<h3>Premiers pas</h3>
<ol><li>Connectez-vous avec vos identifiants (compte par défaut: admin / admin123)</li>
<li>Créez les <strong>services</strong> de votre hôpital (Consultation, Laboratoire, Imagerie...)</li>
<li>Ajoutez les <strong>médecins</strong> avec leurs spécialités</li>
<li>Configurez la <strong>grille tarifaire</strong> dans Facturation > Tarifs</li>
<li>Commencez à enregistrer des <strong>patients</strong></li></ol>`
  },
  {
    id: 'patients', title: 'Gestion des patients', icon: 'bi-people',
    content: `<h3>Enregistrement</h3>
<p>Le formulaire patient suit le standard OpenMRS avec 4 étapes :</p>
<ol><li><strong>Identité</strong> : nom, prénom, sexe, date de naissance (ou âge estimé), groupe sanguin</li>
<li><strong>Démographie</strong> : lieu de naissance, nationalité, profession, statut matrimonial</li>
<li><strong>Adresse</strong> : pays, province, ville, commune, quartier</li>
<li><strong>Contact</strong> : téléphone (formaté +243), email, contact d'urgence</li></ol>
<h3>Dossier patient</h3>
<p>Cliquez sur un patient pour accéder à son dossier complet avec les onglets :</p>
<ul><li>Résumé, Signes vitaux, Allergies, Pathologies</li>
<li>Prescriptions, Vaccinations, Notes, Alertes</li>
<li>Consultations, Examens, Finances, RDV, Timeline</li></ul>
<h3>Archivage</h3>
<p>Les patients ne sont jamais supprimés définitivement. Ils sont archivés (soft delete) et peuvent être restaurés.</p>`
  },
  {
    id: 'consultations', title: 'Consultations', icon: 'bi-clipboard-pulse',
    content: `<h3>Workflow</h3>
<p>Arrivée → File d'attente → Consultation → Examens → Traitement → Paiement</p>
<h3>Créer une consultation</h3>
<ol><li>Sélectionner le patient, le médecin et le service</li>
<li>Saisir le diagnostic et le traitement</li>
<li>Ajouter des prescriptions si nécessaire</li></ol>`
  },
  {
    id: 'laboratoire', title: 'Laboratoire', icon: 'bi-flask',
    content: `<h3>Workflow des examens</h3>
<p>Demandé → Prélèvement → Analyse → Résultat → Validé → Transmis</p>
<h3>Vue Kanban</h3>
<p>Les examens sont affichés en colonnes par statut. Cliquez sur l'action pour faire avancer l'examen dans le workflow.</p>
<h3>Notification</h3>
<p>Quand un résultat est validé, vous pouvez envoyer une notification SMS/email au patient.</p>`
  },
  {
    id: 'facturation', title: 'Facturation', icon: 'bi-receipt',
    content: `<h3>Configuration</h3>
<ol><li>Définir la <strong>grille tarifaire</strong> : code, libellé, catégorie, montant</li>
<li>Associer les tarifs aux services</li></ol>
<h3>Créer une facture</h3>
<ol><li>Sélectionner le patient</li>
<li>Ajouter les lignes (depuis la grille ou manuellement)</li>
<li>La numérotation est automatique (FAC-YYYYMMDD-XXXX)</li></ol>
<h3>Paiements</h3>
<p>Modes acceptés : Espèces, Mobile Money, Carte, Virement, Assurance</p>
<p>Les paiements fractionnés sont supportés. Le statut se met à jour automatiquement.</p>
<h3>Impression</h3>
<p>Cliquez sur l'icône imprimante pour générer la facture en format imprimable.</p>`
  },
  {
    id: 'rdv', title: 'Rendez-vous', icon: 'bi-calendar-event',
    content: `<h3>Statuts</h3>
<p>Planifié → Confirmé → En cours → Terminé / Annulé / Absent</p>
<h3>Rappels</h3>
<p>Envoyez un rappel SMS/email au patient directement depuis la liste des RDV.</p>`
  },
  {
    id: 'hospitalisation', title: 'Hospitalisation & Lits', icon: 'bi-building',
    content: `<h3>Configuration</h3>
<ol><li>Créer les <strong>pavillons</strong> (nom, étage, service, capacité)</li>
<li>Ajouter les <strong>lits</strong> dans chaque pavillon (numéro, type)</li></ol>
<h3>Admission</h3>
<ol><li>Sélectionner le patient et un lit disponible</li>
<li>Le lit passe automatiquement en statut "occupé"</li>
<li>À la sortie, le lit redevient "disponible"</li></ol>
<h3>Types de lits</h3>
<p>Standard, Soins intensifs, Pédiatrique, Maternité, Isolement</p>`
  },
  {
    id: 'notifications', title: 'Notifications SMS/Email', icon: 'bi-bell',
    content: `<h3>Fonctionnement</h3>
<p>Le système essaie d'abord le <strong>SMS</strong>. Si le patient n'a pas de téléphone ou si l'envoi échoue, il bascule sur l'<strong>email</strong>.</p>
<h3>Configuration</h3>
<p>Variables d'environnement à configurer :</p>
<pre>SMS_PROVIDER=africas_talking (ou twilio, log)
SMS_API_KEY=votre_clé
SMS_API_URL=https://api.provider.com/send
SMS_SENDER_ID=HospitalERP
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=votre@email.com
SMTP_PASS=votre_mot_de_passe</pre>
<h3>Types de notifications</h3>
<ul><li>Rappel de rendez-vous</li>
<li>Résultats de laboratoire disponibles</li>
<li>Message personnalisé</li></ul>`
  },
  {
    id: 'securite', title: 'Sécurité', icon: 'bi-shield-check',
    content: `<h3>OWASP Top 10</h3>
<ul><li><strong>A01</strong> - Contrôle d'accès par rôle (admin, médecin, comptable, laborantin, réception)</li>
<li><strong>A02</strong> - JWT avec algorithme HS256 fixé, bcrypt 12 rounds, HTTPS forcé</li>
<li><strong>A03</strong> - Requêtes SQL paramétrées, sanitisation des inputs</li>
<li><strong>A04</strong> - Rate limiting (500 req/15min global, 10 tentatives login/15min)</li>
<li><strong>A05</strong> - Headers Helmet, CORS restrictif</li>
<li><strong>A07</strong> - Politique de mot de passe (8 chars, majuscule, minuscule, chiffre)</li>
<li><strong>A08</strong> - Validation Content-Type, limite body 1MB, validation Zod</li>
<li><strong>A09</strong> - Audit log sur toutes les opérations sensibles</li></ul>
<h3>Session</h3>
<p>La session expire après <strong>3 minutes d'inactivité</strong>. Un avertissement s'affiche 30 secondes avant.</p>
<h3>Rôles</h3>
<table><tr><th>Rôle</th><th>Accès</th></tr>
<tr><td>Admin</td><td>Tous les modules</td></tr>
<tr><td>Médecin</td><td>Patients, consultations, prescriptions</td></tr>
<tr><td>Comptable</td><td>Finances, facturation</td></tr>
<tr><td>Laborantin</td><td>Laboratoire</td></tr>
<tr><td>Réception</td><td>Patients, RDV, file d'attente</td></tr></table>`
  },
  {
    id: 'impression', title: 'Impression', icon: 'bi-printer',
    content: `<h3>Documents imprimables</h3>
<ul><li><strong>Factures</strong> : depuis la page Facturation, cliquez sur l'icône imprimante</li>
<li><strong>Ordonnances</strong> : depuis le dossier patient, onglet Prescriptions</li>
<li><strong>Résultats labo</strong> : depuis le dossier patient, onglet Examens</li></ul>
<p>Les documents s'ouvrent dans un nouvel onglet au format HTML optimisé pour l'impression. Utilisez Ctrl+P pour imprimer ou enregistrer en PDF.</p>`
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