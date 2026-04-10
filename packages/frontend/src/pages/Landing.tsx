import { useNavigate } from 'react-router-dom';

export default function Landing() {
  const navigate = useNavigate();

  return (
    <div style={{ minHeight: '100vh', background: '#161616', color: '#fff', fontFamily: "'IBM Plex Sans', sans-serif" }}>
      {/* Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 3rem', borderBottom: '1px solid #333' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <i className="bi bi-hospital" style={{ fontSize: '1.5rem', color: '#0f62fe' }}></i>
          <span style={{ fontSize: '1rem', fontWeight: 600 }}>Hospital ERP</span>
        </div>
        <button onClick={() => navigate('/login')} style={{ background: '#0f62fe', color: '#fff', border: 'none', padding: '0.625rem 1.5rem', fontSize: '0.875rem', cursor: 'pointer' }}>
          Se connecter
        </button>
      </header>

      {/* Hero */}
      <section style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '6rem 2rem 4rem' }}>
        <div style={{ background: 'rgba(15,98,254,0.1)', border: '1px solid rgba(15,98,254,0.3)', padding: '0.375rem 1rem', borderRadius: '1rem', fontSize: '0.75rem', color: '#78a9ff', marginBottom: '1.5rem' }}>
          Plateforme de gestion hospitalière
        </div>
        <h1 style={{ fontSize: '3.5rem', fontWeight: 300, lineHeight: 1.2, maxWidth: '800px', marginBottom: '1.5rem' }}>
          Gérez votre hôpital avec <span style={{ color: '#0f62fe', fontWeight: 600 }}>simplicité</span> et <span style={{ color: '#0f62fe', fontWeight: 600 }}>efficacité</span>
        </h1>
        <p style={{ fontSize: '1.125rem', color: '#a8a8a8', maxWidth: '600px', marginBottom: '2.5rem', lineHeight: 1.6 }}>
          Une solution complète pour la gestion des patients, consultations, laboratoire, finances et rendez-vous. Sécurisée, accessible en cloud.
        </p>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <button onClick={() => navigate('/login')} style={{ background: '#0f62fe', color: '#fff', border: 'none', padding: '0.875rem 2rem', fontSize: '1rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            Accéder à la plateforme <i className="bi bi-arrow-right"></i>
          </button>
        </div>
      </section>

      {/* Features */}
      <section style={{ padding: '4rem 3rem', background: '#1c1c1c' }}>
        <h2 style={{ textAlign: 'center', fontSize: '1.75rem', fontWeight: 300, marginBottom: '3rem' }}>Modules intégrés</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1.5rem', maxWidth: '1200px', margin: '0 auto' }}>
          {[
            { icon: 'bi-people', title: 'Gestion des patients', desc: 'Dossiers complets, historique médical, recherche multicritère' },
            { icon: 'bi-clipboard-pulse', title: 'Consultations', desc: 'Workflow complet du diagnostic au traitement' },
            { icon: 'bi-flask', title: 'Laboratoire', desc: 'Suivi des examens avec vue Kanban par statut' },
            { icon: 'bi-cash-coin', title: 'Finances', desc: 'Recettes, dépenses, caisse et bilan mensuel' },
            { icon: 'bi-calendar-event', title: 'Rendez-vous', desc: 'Planification, confirmation et suivi des RDV' },
            { icon: 'bi-heart-pulse', title: 'Signes vitaux', desc: 'Température, tension, pouls, SpO2, poids' },
            { icon: 'bi-capsule', title: 'Prescriptions', desc: 'Médicaments, dosage, fréquence, ordonnances' },
            { icon: 'bi-shield-check', title: 'Sécurité OWASP', desc: 'Authentification JWT, rôles, audit, chiffrement' },
          ].map((f, i) => (
            <div key={i} style={{ background: '#262626', border: '1px solid #393939', padding: '1.5rem' }}>
              <i className={`bi ${f.icon}`} style={{ fontSize: '1.5rem', color: '#0f62fe', marginBottom: '0.75rem', display: 'block' }}></i>
              <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.5rem' }}>{f.title}</h3>
              <p style={{ fontSize: '0.875rem', color: '#a8a8a8', lineHeight: 1.5 }}>{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Roles */}
      <section style={{ padding: '4rem 3rem' }}>
        <h2 style={{ textAlign: 'center', fontSize: '1.75rem', fontWeight: 300, marginBottom: '3rem' }}>Accès par rôle</h2>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '2rem', flexWrap: 'wrap' }}>
          {[
            { role: 'Admin', color: '#da1e28', desc: 'Accès complet' },
            { role: 'Médecin', color: '#0f62fe', desc: 'Patients, consultations' },
            { role: 'Comptable', color: '#198038', desc: 'Module finances' },
            { role: 'Laborantin', color: '#6929c4', desc: 'Module laboratoire' },
            { role: 'Réception', color: '#f1c21b', desc: 'Enregistrement patients' },
          ].map((r, i) => (
            <div key={i} style={{ textAlign: 'center', padding: '1.5rem 2rem', background: '#1c1c1c', border: '1px solid #393939', minWidth: '160px' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: r.color, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.75rem', fontSize: '1.25rem' }}>
                <i className="bi bi-person"></i>
              </div>
              <h4 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.25rem' }}>{r.role}</h4>
              <p style={{ fontSize: '0.75rem', color: '#a8a8a8' }}>{r.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '4rem 3rem', background: '#0f62fe', textAlign: 'center' }}>
        <h2 style={{ fontSize: '2rem', fontWeight: 300, marginBottom: '1rem' }}>Prêt à commencer ?</h2>
        <p style={{ fontSize: '1rem', opacity: 0.8, marginBottom: '2rem' }}>Connectez-vous pour accéder à votre espace de travail</p>
        <button onClick={() => navigate('/login')} style={{ background: '#fff', color: '#0f62fe', border: 'none', padding: '0.875rem 2.5rem', fontSize: '1rem', fontWeight: 600, cursor: 'pointer' }}>
          Se connecter
        </button>
      </section>

      {/* Footer */}
      <footer style={{ padding: '2rem 3rem', borderTop: '1px solid #333', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: '#6f6f6f' }}>
        <span>Hospital ERP v1.0.0</span>
        <span>Données protégées — Accès réservé au personnel autorisé</span>
      </footer>
    </div>
  );
}