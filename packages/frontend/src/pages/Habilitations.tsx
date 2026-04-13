import { menuConfig } from '../config/permissions';
import type { UserRole } from '../types';

const allRoles: { role: UserRole; label: string; tag: string }[] = [
  { role: 'admin', label: 'Admin', tag: 'tag-red' },
  { role: 'medecin', label: 'Médecin', tag: 'tag-blue' },
  { role: 'comptable', label: 'Comptable', tag: 'tag-green' },
  { role: 'laborantin', label: 'Laborantin', tag: 'tag-purple' },
  { role: 'reception', label: 'Réception', tag: 'tag-orange' },
];

export default function Habilitations() {
  return (
    <div>
      <nav className="breadcrumb"><a href="/app">Accueil</a><span className="breadcrumb-separator">/</span><span>Habilitations</span></nav>
      <div className="page-header"><h1 className="page-title">Matrice des habilitations</h1></div>

      <div className="notification notification-info mb-2">
        <i className="bi bi-info-circle"></i>
        <span>Cette matrice montre les accès de chaque rôle aux modules de l'application. Les habilitations sont appliquées côté serveur (API) et côté client (menu).</span>
      </div>

      <table className="data-table">
        <thead>
          <tr>
            <th style={{ width: '200px' }}>Module</th>
            {allRoles.map(r => (
              <th key={r.role} style={{ textAlign: 'center' }}>
                <span className={`tag ${r.tag}`}>{r.label}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {menuConfig.map(group => (
            <>
              <tr key={group.label} style={{ background: 'var(--cds-ui-01)' }}>
                <td colSpan={6} style={{ fontWeight: 600, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.16px', color: 'var(--cds-text-secondary)' }}>
                  {group.label}
                </td>
              </tr>
              {group.items.map(item => (
                <tr key={item.path}>
                  <td>
                    <div className="d-flex align-center gap-1">
                      <i className={`bi ${item.icon}`} style={{ color: 'var(--cds-text-secondary)' }}></i>
                      {item.label}
                    </div>
                  </td>
                  {allRoles.map(r => (
                    <td key={r.role} style={{ textAlign: 'center' }}>
                      {item.roles.includes(r.role) ? (
                        <span style={{ color: 'var(--cds-support-success)', fontSize: '1.25rem' }}>✓</span>
                      ) : (
                        <span style={{ color: 'var(--cds-ui-04)', fontSize: '1.25rem' }}>—</span>
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </>
          ))}
        </tbody>
      </table>

      <div className="mt-2">
        <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Détail des accès par rôle</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '1rem' }}>
          {allRoles.map(r => {
            const modules = menuConfig.flatMap(g => g.items).filter(i => i.roles.includes(r.role));
            return (
              <div className="tile" key={r.role} style={{ padding: '1.25rem' }}>
                <div className="d-flex align-center gap-1 mb-1">
                  <span className={`tag ${r.tag}`}>{r.label}</span>
                  <span className="text-muted" style={{ fontSize: '0.75rem' }}>{modules.length} modules</span>
                </div>
                <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.8125rem' }}>
                  {modules.map(m => <li key={m.path} style={{ marginBottom: '0.25rem' }}>{m.label}</li>)}
                </ul>
                <div style={{ marginTop: '0.75rem', fontSize: '0.75rem', color: 'var(--cds-text-secondary)', borderTop: '1px solid var(--cds-ui-03)', paddingTop: '0.5rem' }}>
                  <strong>API :</strong> {r.role === 'admin' ? 'Toutes les routes' :
                    r.role === 'medecin' ? 'CRUD patients, consultations, prescriptions, vitaux, RDV' :
                    r.role === 'comptable' ? 'Recettes, dépenses, factures, tarifs, paiements' :
                    r.role === 'laborantin' ? 'CRUD examens, résultats labo' :
                    'Création patients, RDV, file d\'attente'}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}