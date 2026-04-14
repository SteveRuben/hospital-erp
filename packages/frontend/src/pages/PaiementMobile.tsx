import { useState } from 'react';

export default function PaiementMobile() {
  const [tab, setTab] = useState<'orange' | 'mtn'>('orange');
  const [phone, setPhone] = useState('');
  const [montant, setMontant] = useState('');
  const [reference, setReference] = useState('');
  const [status, setStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');

  const handlePay = () => {
    if (!phone || !montant) return;
    setStatus('pending');
    // Simulation
    setTimeout(() => setStatus('success'), 2500);
  };

  const reset = () => { setStatus('idle'); setPhone(''); setMontant(''); setReference(''); };

  return (
    <div>
      <nav className="breadcrumb"><a href="/app">Accueil</a><span className="breadcrumb-separator">/</span><span>Paiement mobile</span></nav>
      <div className="page-header"><h1 className="page-title">Paiement mobile</h1></div>

      <div className="notification notification-warning mb-2"><i className="bi bi-exclamation-triangle"></i><span>Mode simulation — L'intégration avec les API Orange Money et MTN MoMo est en cours de développement.</span></div>

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
            <p className="text-muted" style={{ fontSize: '0.8125rem' }}>Paiement par {tab === 'orange' ? 'Orange Money' : 'MTN MoMo'}</p>
          </div>

          {status === 'idle' && (
            <div>
              <div className="form-group"><label className="form-label">Numéro de téléphone *</label><input type="tel" className="form-input" value={phone} onChange={e => setPhone(e.target.value)} placeholder={tab === 'orange' ? '+243 89X XXX XXX' : '+243 81X XXX XXX'} /></div>
              <div className="form-group"><label className="form-label">Montant (XOF) *</label><input type="number" className="form-input" value={montant} onChange={e => setMontant(e.target.value)} /></div>
              <div className="form-group"><label className="form-label">Référence facture</label><input type="text" className="form-input" value={reference} onChange={e => setReference(e.target.value)} placeholder="ex: FAC-20260414-0001" /></div>
              <button className="btn-primary" style={{ width: '100%', marginTop: '1rem', background: tab === 'orange' ? '#ff6600' : '#ffcc00', color: tab === 'orange' ? '#fff' : '#000' }} onClick={handlePay}>
                <i className="bi bi-phone"></i> Payer via {tab === 'orange' ? 'Orange Money' : 'MTN MoMo'}
              </button>
            </div>
          )}

          {status === 'pending' && (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <div className="spinner" style={{ margin: '0 auto 1rem' }}></div>
              <h4 style={{ fontWeight: 400 }}>Paiement en cours...</h4>
              <p className="text-muted" style={{ fontSize: '0.8125rem' }}>Veuillez confirmer le paiement sur votre téléphone</p>
              <p className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.5rem' }}>Numéro: {phone} — Montant: {new Intl.NumberFormat('fr-FR').format(Number(montant))} XOF</p>
            </div>
          )}

          {status === 'success' && (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--cds-support-success)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', fontSize: '2rem', color: '#fff' }}>✓</div>
              <h4 style={{ fontWeight: 400, color: 'var(--cds-support-success)' }}>Paiement simulé avec succès</h4>
              <p className="text-muted" style={{ fontSize: '0.8125rem', marginTop: '0.5rem' }}>{new Intl.NumberFormat('fr-FR').format(Number(montant))} XOF envoyé depuis {phone}</p>
              <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', marginTop: '0.5rem' }}>Référence: SIM-{Date.now()}</p>
              <button className="btn-ghost mt-2" onClick={reset}>Nouveau paiement</button>
            </div>
          )}
        </div>

        <div className="tile" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Configuration API</h3>
          <div className="notification notification-info mb-2"><i className="bi bi-info-circle"></i><span style={{ fontSize: '0.75rem' }}>Variables d'environnement à configurer pour l'intégration réelle</span></div>

          <h4 style={{ fontSize: '0.8125rem', fontWeight: 600, marginTop: '1rem', marginBottom: '0.5rem' }}>Orange Money</h4>
          <div style={{ background: 'var(--cds-field-01)', padding: '0.75rem', fontFamily: 'monospace', fontSize: '0.75rem', marginBottom: '1rem' }}>
            ORANGE_MONEY_API_URL=<br/>ORANGE_MONEY_API_KEY=<br/>ORANGE_MONEY_MERCHANT_ID=
          </div>

          <h4 style={{ fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.5rem' }}>MTN Mobile Money</h4>
          <div style={{ background: 'var(--cds-field-01)', padding: '0.75rem', fontFamily: 'monospace', fontSize: '0.75rem' }}>
            MTN_MOMO_API_URL=<br/>MTN_MOMO_API_KEY=<br/>MTN_MOMO_SUBSCRIPTION_KEY=
          </div>

          <h4 style={{ fontSize: '0.8125rem', fontWeight: 600, marginTop: '1.5rem', marginBottom: '0.5rem' }}>Workflow d'intégration</h4>
          <ol style={{ fontSize: '0.8125rem', paddingLeft: '1.25rem', lineHeight: 1.8 }}>
            <li>Obtenir les clés API auprès d'Orange/MTN</li>
            <li>Configurer les variables d'environnement</li>
            <li>Le backend enverra la requête de paiement à l'API</li>
            <li>Le patient reçoit une notification USSD sur son téléphone</li>
            <li>Il confirme avec son code PIN</li>
            <li>Le callback confirme le paiement</li>
            <li>La facture est automatiquement mise à jour</li>
          </ol>
        </div>
      </div>
    </div>
  );
}