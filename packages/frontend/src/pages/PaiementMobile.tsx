import { useState } from 'react';
import api from '../services/api';

export default function PaiementMobile() {
  const [tab, setTab] = useState<'orange' | 'mtn'>('orange');
  const [phone, setPhone] = useState('');
  const [montant, setMontant] = useState('');
  const [factureId, setFactureId] = useState('');
  const [status, setStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  const handlePay = async () => {
    if (!phone || !montant) return;
    setStatus('pending'); setError('');
    try {
      const { data } = await api.post('/paiement-remita/collect', {
        phoneNumber: phone,
        amount: Number(montant),
        provider: tab === 'orange' ? 'orange_money' : 'mtn_momo',
        facture_id: factureId ? Number(factureId) : null,
        description: `Paiement Hospital ERP via ${tab === 'orange' ? 'Orange Money' : 'MTN MoMo'}`,
      });
      if (data.success) { setStatus('success'); setResult(data); }
      else { setStatus('error'); setError(data.error || 'Paiement échoué'); }
    } catch (err: any) {
      setStatus('error'); setError(err.response?.data?.error || 'Erreur de connexion');
    }
  };

  const reset = () => { setStatus('idle'); setPhone(''); setMontant(''); setFactureId(''); setResult(null); setError(''); };

  return (
    <div>
      <nav className="breadcrumb"><a href="/app">Accueil</a><span className="breadcrumb-separator">/</span><span>Paiement mobile</span></nav>
      <div className="page-header"><h1 className="page-title">Paiement mobile — Remita</h1></div>

      <div className="notification notification-info mb-2"><i className="bi bi-info-circle"></i><span>Paiement via <strong>Remita API</strong> — Supporte Orange Money et MTN Mobile Money. {!process.env.REMITA_API_KEY ? 'Mode simulation actif (configurez REMITA_API_KEY pour les paiements réels).' : ''}</span></div>

      <div className="tabs mb-2">
        <button className={`tab-item ${tab === 'orange' ? 'active' : ''}`} onClick={() => { setTab('orange'); reset(); }}>
          <span style={{ color: '#ff6600', fontWeight: 600 }}>● </span>Orange Money
        </button>
        <button className={`tab-item ${tab === 'mtn' ? 'active' : ''}`} onClick={() => { setTab('mtn'); reset(); }}>
          <span style={{ color: '#ffcc00', fontWeight: 600 }}>● </span>MTN Mobile Money
        </button>
      </div>

      <div className="grid-2">
        <div className="tile" style={{ padding: '2rem' }}>
          <div style={{ textAlign: 'center', marginBottom: '1.5rem' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: tab === 'orange' ? '#ff6600' : '#ffcc00', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.75rem', fontSize: '1.5rem', color: tab === 'orange' ? '#fff' : '#000' }}>
              <i className="bi bi-phone"></i>
            </div>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 600 }}>{tab === 'orange' ? 'Orange Money' : 'MTN Mobile Money'}</h3>
            <p className="text-muted" style={{ fontSize: '0.8125rem' }}>Paiement via Remita API</p>
          </div>

          {status === 'idle' && (
            <div>
              <div className="form-group"><label className="form-label">Numéro de téléphone *</label><input type="tel" className="form-input" value={phone} onChange={e => setPhone(e.target.value)} placeholder={tab === 'orange' ? '+237 6XX XXX XXX' : '+237 6XX XXX XXX'} /></div>
              <div className="form-group"><label className="form-label">Montant (XAF) *</label><input type="number" className="form-input" value={montant} onChange={e => setMontant(e.target.value)} placeholder="ex: 5000" /></div>
              <div className="form-group"><label className="form-label">ID Facture (optionnel)</label><input type="text" className="form-input" value={factureId} onChange={e => setFactureId(e.target.value)} placeholder="Lier à une facture existante" /></div>
              <button className="btn-primary" style={{ width: '100%', marginTop: '1rem', background: tab === 'orange' ? '#ff6600' : '#ffcc00', color: tab === 'orange' ? '#fff' : '#000' }} onClick={handlePay}>
                <i className="bi bi-send"></i> Envoyer la demande de paiement
              </button>
            </div>
          )}

          {status === 'pending' && (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <div className="spinner" style={{ margin: '0 auto 1rem' }}></div>
              <h4 style={{ fontWeight: 400 }}>Demande envoyée...</h4>
              <p className="text-muted" style={{ fontSize: '0.8125rem' }}>Le client doit confirmer le paiement sur son téléphone</p>
              <p className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.5rem' }}>Numéro: {phone} — Montant: {new Intl.NumberFormat('fr-FR').format(Number(montant))} XAF</p>
            </div>
          )}

          {status === 'success' && (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--cds-support-success)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', fontSize: '2rem', color: '#fff' }}>✓</div>
              <h4 style={{ fontWeight: 400, color: 'var(--cds-support-success)' }}>Paiement {result?.simulated ? 'simulé' : 'initié'} avec succès</h4>
              <p className="text-muted" style={{ fontSize: '0.8125rem', marginTop: '0.5rem' }}>{new Intl.NumberFormat('fr-FR').format(Number(montant))} XAF depuis {phone}</p>
              <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', marginTop: '0.5rem' }}>Transaction: {result?.transactionId}</p>
              <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>Statut: {result?.status}</p>
              {result?.simulated && <p style={{ fontSize: '0.6875rem', color: 'var(--cds-support-warning)', marginTop: '0.5rem' }}>⚠️ Mode simulation — Configurez les clés Remita pour les paiements réels</p>}
              <button className="btn-ghost mt-2" onClick={reset}>Nouveau paiement</button>
            </div>
          )}

          {status === 'error' && (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--cds-support-error)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', fontSize: '2rem', color: '#fff' }}>✗</div>
              <h4 style={{ fontWeight: 400, color: 'var(--cds-support-error)' }}>Paiement échoué</h4>
              <p className="text-muted" style={{ fontSize: '0.8125rem', marginTop: '0.5rem' }}>{error}</p>
              <button className="btn-ghost mt-2" onClick={reset}>Réessayer</button>
            </div>
          )}
        </div>

        <div className="tile" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>API Remita</h3>
          <div className="notification notification-info mb-2"><i className="bi bi-info-circle"></i><span style={{ fontSize: '0.75rem' }}>Documentation: <a href="https://mansar-1.gitbook.io/mansar-remita" target="_blank" style={{ color: 'var(--cds-interactive)' }}>mansar-1.gitbook.io/mansar-remita</a></span></div>

          <h4 style={{ fontSize: '0.8125rem', fontWeight: 600, marginTop: '1rem', marginBottom: '0.5rem' }}>Variables d'environnement</h4>
          <div style={{ background: 'var(--cds-field-01)', padding: '0.75rem', fontFamily: 'monospace', fontSize: '0.7rem', marginBottom: '1rem', lineHeight: 1.8 }}>
            REMITA_API_URL=https://api.remita.cm<br/>
            REMITA_API_KEY=votre_api_key<br/>
            REMITA_API_ID=votre_api_id<br/>
            REMITA_USERNAME=votre_username<br/>
            REMITA_PASSWORD=votre_password
          </div>

          <h4 style={{ fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.5rem' }}>Méthodes supportées</h4>
          <div className="d-flex gap-1 mb-2">
            <span className="tag tag-orange">Orange Money</span>
            <span className="tag tag-yellow">MTN MoMo</span>
          </div>

          <h4 style={{ fontSize: '0.8125rem', fontWeight: 600, marginTop: '1rem', marginBottom: '0.5rem' }}>Workflow</h4>
          <ol style={{ fontSize: '0.8125rem', paddingLeft: '1.25rem', lineHeight: 1.8 }}>
            <li>L'agent saisit le numéro et le montant</li>
            <li>L'API Remita envoie une demande USSD au client</li>
            <li>Le client confirme avec son code PIN</li>
            <li>Remita confirme la transaction</li>
            <li>La facture est automatiquement mise à jour</li>
          </ol>

          <h4 style={{ fontSize: '0.8125rem', fontWeight: 600, marginTop: '1rem', marginBottom: '0.5rem' }}>Sécurité</h4>
          <ul style={{ fontSize: '0.8125rem', paddingLeft: '1.25rem', lineHeight: 1.8 }}>
            <li>Authentification JWT + apiKey + apiId</li>
            <li>IP Whitelisting configurable</li>
            <li>Toutes les transactions sont loggées</li>
          </ul>
        </div>
      </div>
    </div>
  );
}