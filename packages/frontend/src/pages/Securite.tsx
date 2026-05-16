import { useState, useEffect } from 'react';
import api from '../services/api';

interface Posture {
  encryption: { enabled: boolean; keyConfigured: boolean };
  mfa: { totalUsers: number; mfaEnabled: number; mfaRate: number; compliant: boolean };
  sessions: { redisConfigured: boolean; activeSessions: number; timeoutMinutes: number };
  auth: { failedLogins24h: number; passwordPolicy: Record<string, unknown>; hashAlgorithm: string; tokenExpiry: string };
  audit: { recentEntries: Array<{ id: number; action: string; tableName: string; recordId: number; details: string; username: string; role: string; createdAt: string }>; immutable: boolean };
  compliance: { owasp: { score: number; max: number; details: string }; dataProtection: Record<string, boolean>; patients: { total: number; withReferenceId: number } };
}

export default function Securite() {
  const [posture, setPosture] = useState<Posture | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/admin/posture').then(({ data }) => setPosture(data)).catch(console.error).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="loading"><div className="spinner"></div></div>;
  if (!posture) return <div className="notification notification-error">Erreur de chargement</div>;

  const StatusBadge = ({ ok, label }: { ok: boolean; label: string }) => (
    <span className={`tag ${ok ? 'tag-green' : 'tag-red'}`} style={{ fontSize: '0.6875rem' }}>{ok ? '✓' : '✗'} {label}</span>
  );

  return (
    <div>
      <nav className="breadcrumb"><a href="/app">Accueil</a><span className="breadcrumb-separator">/</span><span>Sécurité</span></nav>
      <div className="page-header"><h1 className="page-title">Sécurité & Conformité</h1></div>

      {/* Score global */}
      <div className="tile mb-2" style={{ padding: '1.5rem', textAlign: 'center', background: 'linear-gradient(135deg, #0f62fe 0%, #001d6c 100%)', color: '#fff' }}>
        <div style={{ fontSize: '3rem', fontWeight: 700 }}>{posture.compliance.owasp.score}/{posture.compliance.owasp.max}</div>
        <div style={{ fontSize: '1rem', opacity: 0.8 }}>Score OWASP</div>
        <div style={{ marginTop: '1rem', display: 'flex', justifyContent: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <StatusBadge ok={posture.encryption.enabled} label="Chiffrement PHI" />
          <StatusBadge ok={posture.mfa.compliant} label={`MFA ${posture.mfa.mfaRate}%`} />
          <StatusBadge ok={posture.sessions.redisConfigured} label="Redis sessions" />
          <StatusBadge ok={posture.audit.immutable} label="Audit WORM" />
          <StatusBadge ok={posture.auth.failedLogins24h < 20} label={`${posture.auth.failedLogins24h} échecs/24h`} />
        </div>
      </div>

      <div className="grid-3 mb-2">
        {/* Chiffrement */}
        <div className="tile" style={{ padding: '1.25rem' }}>
          <div className="d-flex align-center gap-1 mb-1">
            <i className="bi bi-shield-lock" style={{ fontSize: '1.25rem', color: posture.encryption.enabled ? 'var(--cds-support-success)' : 'var(--cds-support-error)' }}></i>
            <h3 style={{ fontSize: '0.875rem', fontWeight: 600 }}>Chiffrement</h3>
          </div>
          <table style={{ width: '100%', fontSize: '0.75rem' }}>
            <tbody>
              <tr><td>PHI au repos (AES-256-GCM)</td><td style={{ textAlign: 'right' }}>{posture.encryption.enabled ? '✓ Actif' : '✗ Inactif'}</td></tr>
              <tr><td>Clé configurée</td><td style={{ textAlign: 'right' }}>{posture.encryption.keyConfigured ? '✓' : '✗ Manquante'}</td></tr>
              <tr><td>Transit (TLS/HTTPS)</td><td style={{ textAlign: 'right' }}>✓ Actif</td></tr>
              <tr><td>Mots de passe</td><td style={{ textAlign: 'right' }}>Argon2id</td></tr>
            </tbody>
          </table>
        </div>

        {/* MFA */}
        <div className="tile" style={{ padding: '1.25rem' }}>
          <div className="d-flex align-center gap-1 mb-1">
            <i className="bi bi-phone" style={{ fontSize: '1.25rem', color: posture.mfa.compliant ? 'var(--cds-support-success)' : 'var(--cds-support-warning)' }}></i>
            <h3 style={{ fontSize: '0.875rem', fontWeight: 600 }}>MFA (2FA)</h3>
          </div>
          <div style={{ textAlign: 'center', margin: '0.75rem 0' }}>
            <div style={{ fontSize: '2rem', fontWeight: 700, color: posture.mfa.compliant ? 'var(--cds-support-success)' : 'var(--cds-support-warning)' }}>{posture.mfa.mfaRate}%</div>
            <div style={{ fontSize: '0.6875rem', color: 'var(--cds-text-secondary)' }}>Taux d'adoption</div>
          </div>
          <div style={{ fontSize: '0.75rem' }}>
            <div className="d-flex justify-between"><span>Utilisateurs total</span><span>{posture.mfa.totalUsers}</span></div>
            <div className="d-flex justify-between"><span>MFA activé</span><span className="text-success">{posture.mfa.mfaEnabled}</span></div>
            <div className="d-flex justify-between"><span>Objectif</span><span>≥ 80%</span></div>
          </div>
        </div>

        {/* Sessions */}
        <div className="tile" style={{ padding: '1.25rem' }}>
          <div className="d-flex align-center gap-1 mb-1">
            <i className="bi bi-clock-history" style={{ fontSize: '1.25rem', color: 'var(--cds-interactive)' }}></i>
            <h3 style={{ fontSize: '0.875rem', fontWeight: 600 }}>Sessions</h3>
          </div>
          <table style={{ width: '100%', fontSize: '0.75rem' }}>
            <tbody>
              <tr><td>Timeout inactivité</td><td style={{ textAlign: 'right' }}>{posture.sessions.timeoutMinutes} min</td></tr>
              <tr><td>Redis distribué</td><td style={{ textAlign: 'right' }}>{posture.sessions.redisConfigured ? '✓ Actif' : '✗ Mémoire'}</td></tr>
              <tr><td>Token JWT</td><td style={{ textAlign: 'right' }}>{posture.auth.tokenExpiry}</td></tr>
              <tr><td>Algorithme hash</td><td style={{ textAlign: 'right' }}>{posture.auth.hashAlgorithm}</td></tr>
              <tr><td>Échecs login (24h)</td><td style={{ textAlign: 'right', color: posture.auth.failedLogins24h > 10 ? 'var(--cds-support-error)' : 'inherit' }}>{posture.auth.failedLogins24h}</td></tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Protection des données */}
      <div className="tile mb-2" style={{ padding: '1.25rem' }}>
        <h3 style={{ fontSize: '0.875rem', fontWeight: 600, marginBottom: '0.75rem' }}>Protection des données</h3>
        <div className="grid-4" style={{ gap: '0.75rem' }}>
          {Object.entries(posture.compliance.dataProtection).map(([key, value]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem' }}>
              <span style={{ color: value ? 'var(--cds-support-success)' : 'var(--cds-support-error)', fontSize: '1rem' }}>{value ? '✓' : '✗'}</span>
              <span>{key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Journal d'audit récent */}
      <div className="tile" style={{ padding: '1.25rem' }}>
        <div className="d-flex justify-between align-center mb-1">
          <h3 style={{ fontSize: '0.875rem', fontWeight: 600 }}>Journal d'audit (50 dernières entrées)</h3>
          <span className="tag tag-green" style={{ fontSize: '0.625rem' }}>WORM — Immutable</span>
        </div>
        <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
          <table className="data-table" style={{ fontSize: '0.75rem' }}>
            <thead><tr><th>Date</th><th>Utilisateur</th><th>Action</th><th>Table</th><th>Détails</th></tr></thead>
            <tbody>
              {posture.audit.recentEntries.map(entry => (
                <tr key={entry.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{new Date(entry.createdAt).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</td>
                  <td>{entry.username || '-'}</td>
                  <td><span className={`tag ${entry.action === 'login' ? 'tag-blue' : entry.action === 'delete' ? 'tag-red' : entry.action === 'create' ? 'tag-green' : 'tag-gray'}`} style={{ fontSize: '0.5625rem' }}>{entry.action}</span></td>
                  <td className="text-muted">{entry.tableName || '-'}</td>
                  <td style={{ maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={entry.details}>{entry.details || '-'}</td>
                </tr>
              ))}
              {posture.audit.recentEntries.length === 0 && <tr><td colSpan={5} className="table-empty">Aucune entrée</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
