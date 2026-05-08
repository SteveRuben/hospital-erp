import { useState, useEffect } from 'react';
import api from '../services/api';
import { getFactures } from '../services/api';

// Format phone: groups digits for display, accepts +237 or 237 or just 6XXXXXXXX
const formatPhone = (value: string): string => {
  let digits = value.replace(/[^\d+]/g, '');
  // If starts with +, keep it
  if (digits.startsWith('+')) {
    const nums = digits.slice(1);
    if (nums.length <= 3) return `+${nums}`;
    if (nums.length <= 6) return `+${nums.slice(0, 3)} ${nums.slice(3)}`;
    if (nums.length <= 9) return `+${nums.slice(0, 3)} ${nums.slice(3, 6)} ${nums.slice(6)}`;
    return `+${nums.slice(0, 3)} ${nums.slice(3, 6)} ${nums.slice(6, 9)} ${nums.slice(9, 12)}`;
  }
  // If starts with 237
  if (digits.startsWith('237')) {
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
    if (digits.length <= 9) return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6)}`;
    return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)} ${digits.slice(9, 12)}`;
  }
  // Local number (6XXXXXXXX)
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `${digits.slice(0, 3)} ${digits.slice(3)}`;
  return `${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 9)}`;
};

// Format amount: 1 000 000
const formatAmount = (value: string): string => {
  const num = value.replace(/\D/g, '');
  return num.replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
};

const getRawAmount = (formatted: string): number => {
  return parseInt(formatted.replace(/\s/g, '')) || 0;
};

const getRawPhone = (formatted: string): string => {
  return formatted.replace(/\s/g, '');
};

export default function PaiementMobile() {
  const [tab, setTab] = useState<'orange' | 'mtn'>('orange');
  const [phone, setPhone] = useState('');
  const [montant, setMontant] = useState('');
  const [factureSearch, setFactureSearch] = useState('');
  const [factureId, setFactureId] = useState<number | null>(null);
  const [factures, setFactures] = useState<any[]>([]);
  const [showFactures, setShowFactures] = useState(false);
  const [status, setStatus] = useState<'idle' | 'pending' | 'success' | 'error'>('idle');
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState('');

  // Search factures when typing #
  useEffect(() => {
    if (factureSearch.startsWith('#') || factureSearch.startsWith('FAC')) {
      loadFactures();
    } else {
      setShowFactures(false);
    }
  }, [factureSearch]);

  const loadFactures = async () => {
    try {
      const { data } = await getFactures({ statut: 'en_attente' });
      const list = data.data || data;
      const filtered = (list as any[]).filter((f: any) =>
        f.numero?.toLowerCase().includes(factureSearch.replace('#', '').toLowerCase()) ||
        `${f.patient_prenom} ${f.patient_nom}`.toLowerCase().includes(factureSearch.replace('#', '').toLowerCase())
      );
      setFactures(filtered.slice(0, 8));
      setShowFactures(true);
    } catch { setFactures([]); }
  };

  const selectFacture = (f: any) => {
    setFactureId(f.id);
    setFactureSearch(`#${f.numero} — ${f.patient_prenom} ${f.patient_nom}`);
    setMontant(formatAmount(String(Math.round(parseFloat(f.montant_total) - parseFloat(f.montant_paye)))));
    setShowFactures(false);
  };

  const handlePay = async () => {
    const rawPhone = getRawPhone(phone);
    const rawAmount = getRawAmount(montant);
    if (!rawPhone || rawPhone.length < 9 || !rawAmount) {
      setError('Numéro (min 9 chiffres) et montant requis');
      setStatus('error');
      return;
    }
    setStatus('pending'); setError('');
    try {
      const { data } = await api.post('/paiement-remita/collect', {
        phoneNumber: rawPhone,
        amount: rawAmount,
        transferMethod: tab === 'orange' ? 'OMCM' : 'MOMOCM',
        countryName: 'Cameroon',
        facture_id: factureId,
        description: `Paiement Hospital ERP via ${tab === 'orange' ? 'Orange Money' : 'MTN MoMo'}`,
      });
      if (data.success) { setStatus('success'); setResult(data); }
      else { setStatus('error'); setError(data.error || 'Paiement échoué'); }
    } catch (err: any) {
      setStatus('error'); setError(err.response?.data?.error || 'Erreur de connexion');
    }
  };

  const reset = () => { setStatus('idle'); setPhone(''); setMontant(''); setFactureSearch(''); setFactureId(null); setResult(null); setError(''); };

  return (
    <div>
      <nav className="breadcrumb"><a href="/app">Accueil</a><span className="breadcrumb-separator">/</span><span>Paiement mobile</span></nav>
      <div className="page-header"><h1 className="page-title">Paiement mobile — Remita</h1></div>

      <div className="notification notification-info mb-2"><i className="bi bi-info-circle"></i><span>Paiement via <strong>Remita API</strong> — Supporte Orange Money et MTN Mobile Money.</span></div>

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
              <div className="form-group">
                <label className="form-label">Numéro de téléphone *</label>
                <input type="tel" className="form-input" value={phone} onChange={e => setPhone(formatPhone(e.target.value))} placeholder="690010010 ou +237690010010" style={{ fontSize: '1.125rem', letterSpacing: '0.5px' }} />
              </div>
              <div className="form-group">
                <label className="form-label">Montant (XAF) *</label>
                <div style={{ position: 'relative' }}>
                  <input type="text" className="form-input" value={montant} onChange={e => setMontant(formatAmount(e.target.value))} placeholder="0" style={{ fontSize: '1.5rem', fontWeight: 600, paddingRight: '3rem' }} />
                  <span style={{ position: 'absolute', right: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--cds-text-secondary)', fontSize: '0.875rem' }}>XAF</span>
                </div>
                {getRawAmount(montant) > 0 && <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', marginTop: '0.25rem' }}>{new Intl.NumberFormat('fr-FR').format(getRawAmount(montant))} Francs CFA</p>}
              </div>
              <div className="form-group" style={{ position: 'relative' }}>
                <label className="form-label">Facture (tapez # pour rechercher)</label>
                <input type="text" className="form-input" value={factureSearch} onChange={e => { setFactureSearch(e.target.value); if (!e.target.value) { setFactureId(null); } }} placeholder="# ou numéro de facture..." />
                {showFactures && factures.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#fff', border: '1px solid var(--cds-ui-03)', zIndex: 50, maxHeight: '200px', overflowY: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                    {factures.map((f: any) => (
                      <div key={f.id} onClick={() => selectFacture(f)} style={{ padding: '0.625rem 0.75rem', cursor: 'pointer', borderBottom: '1px solid var(--cds-ui-03)', fontSize: '0.8125rem' }} onMouseEnter={e => (e.currentTarget.style.background = 'var(--cds-hover-row)')} onMouseLeave={e => (e.currentTarget.style.background = '')}>
                        <div className="d-flex justify-between">
                          <span className="fw-600">{f.numero}</span>
                          <span className="text-danger">{new Intl.NumberFormat('fr-FR').format(parseFloat(f.montant_total) - parseFloat(f.montant_paye))} XAF</span>
                        </div>
                        <div className="text-muted" style={{ fontSize: '0.75rem' }}>{f.patient_prenom} {f.patient_nom}</div>
                      </div>
                    ))}
                  </div>
                )}
                {factureId && <p style={{ fontSize: '0.75rem', color: 'var(--cds-support-success)', marginTop: '0.25rem' }}>✓ Facture liée — le paiement sera enregistré automatiquement</p>}
              </div>
              <button className="btn-primary" style={{ width: '100%', marginTop: '1rem', padding: '0.875rem', fontSize: '1rem', background: tab === 'orange' ? '#ff6600' : '#ffcc00', color: tab === 'orange' ? '#fff' : '#000' }} onClick={handlePay} disabled={!phone || !montant}>
                <i className="bi bi-send"></i> Envoyer la demande de paiement
              </button>
            </div>
          )}

          {status === 'pending' && (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <div className="spinner" style={{ margin: '0 auto 1rem' }}></div>
              <h4 style={{ fontWeight: 400 }}>Demande envoyée...</h4>
              <p className="text-muted" style={{ fontSize: '0.8125rem' }}>Le client doit confirmer le paiement sur son téléphone</p>
              <p className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.5rem' }}>Numéro: {phone} — Montant: {montant} XAF</p>
            </div>
          )}

          {status === 'success' && (
            <div style={{ textAlign: 'center', padding: '2rem' }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '50%', background: 'var(--cds-support-success)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1rem', fontSize: '2rem', color: '#fff' }}>✓</div>
              <h4 style={{ fontWeight: 400, color: 'var(--cds-support-success)' }}>Paiement {result?.simulated ? 'simulé' : 'initié'} avec succès</h4>
              <p className="text-muted" style={{ fontSize: '0.8125rem', marginTop: '0.5rem' }}>{montant} XAF depuis {phone}</p>
              <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', marginTop: '0.5rem' }}>Transaction: {result?.transactionId}</p>
              <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>Statut: {result?.status}</p>
              {result?.simulated && <p style={{ fontSize: '0.6875rem', color: 'var(--cds-support-warning)', marginTop: '0.5rem' }}>⚠️ Mode simulation</p>}
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
            REMITA_API_URL=https://api.remita.finance<br/>
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
            <li>Saisir le numéro (formaté automatiquement)</li>
            <li>Saisir le montant ou lier à une facture (#)</li>
            <li>L'API Remita envoie une demande USSD</li>
            <li>Le client confirme avec son code PIN</li>
            <li>La facture est mise à jour automatiquement</li>
          </ol>
        </div>
      </div>
    </div>
  );
}