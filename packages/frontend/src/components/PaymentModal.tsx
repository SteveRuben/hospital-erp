import { useEffect, useState } from 'react';
import {
  initiatePayment, getPaymentStatus, confirmPayment, cancelPayment,
  getAssurances, createPriseEnCharge,
  type AssuranceRow, type PaymentIntentInit,
} from '../services/api';

type Mode = 'mobile_money' | 'carte' | 'virement' | 'especes' | 'assurance';

interface Props {
  examenId?: number;
  factureId?: number;
  patientId: number;
  patientName: string;
  patientPhone?: string | null;
  montant: number;
  mode: Mode;
  onSuccess: (info: { mode: string; reference?: string; montant: number; assurance?: string; co_paiement?: number }) => void;
  onClose: () => void;
}

/**
 * Unified payment modal.
 *
 * Despatche sur le mode choisi par le caissier :
 *   - 'mobile_money'  : Remita-style — init un PaymentIntent, affiche
 *     le code USSD, polle le statut, propose une confirmation manuelle.
 *   - 'carte'         : init, demande la référence du TPE, confirme.
 *   - 'virement'      : montre les coordonnées (placeholder), demande
 *     la référence et confirme.
 *   - 'especes'       : calcule la monnaie à rendre puis confirme.
 *   - 'assurance'     : picker assurance + n° police + part assurance /
 *     part patient (taux par défaut hydraté depuis l'assurance choisie).
 */
export default function PaymentModal(props: Props) {
  const { mode, montant, patientName, patientPhone, onSuccess, onClose } = props;

  // États partagés
  const [error, setError] = useState<string | null>(null);
  const [working, setWorking] = useState(false);

  // PaymentIntent (mobile_money / carte / virement / especes)
  const [intent, setIntent] = useState<PaymentIntentInit | null>(null);
  const [polling, setPolling] = useState(false);

  // Champs spécifiques par mode
  const [phone, setPhone] = useState(patientPhone ?? '');
  const [terminalRef, setTerminalRef] = useState('');
  const [montantRecu, setMontantRecu] = useState(String(montant));

  // Assurance
  const [assurances, setAssurances] = useState<AssuranceRow[]>([]);
  const [assuranceId, setAssuranceId] = useState<string>('');
  const [numeroPolice, setNumeroPolice] = useState('');
  const [partAssurance, setPartAssurance] = useState(Math.round(montant * 0.8));
  const [partPatient, setPartPatient] = useState(montant - Math.round(montant * 0.8));

  useEffect(() => {
    if (mode === 'assurance') {
      getAssurances().then(r => setAssurances(r.data)).catch(() => setAssurances([]));
    }
  }, [mode]);

  // Init le PaymentIntent côté serveur pour MM/Carte/Virement/Espèces.
  // L'init est différée pour Mobile Money jusqu'à la saisie du numéro
  // — pas d'init sans phone utile.
  useEffect(() => {
    if (mode === 'assurance') return;
    if (mode === 'mobile_money') return; // déclenché manuellement après saisie phone
    void doInit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const doInit = async (overridePhone?: string) => {
    setWorking(true); setError(null);
    try {
      const r = await initiatePayment({
        mode: mode as Exclude<Mode, 'assurance'>,
        examen_id: props.examenId,
        facture_id: props.factureId,
        montant,
        phone: overridePhone ?? phone ?? undefined,
      });
      setIntent(r.data);
      if (mode === 'mobile_money') setPolling(true);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erreur initiation');
    } finally { setWorking(false); }
  };

  // Polling Mobile Money — 2 s d'intervalle, abandon après 30 tentatives.
  useEffect(() => {
    if (!polling || !intent) return;
    let alive = true;
    let tries = 0;
    const tick = async () => {
      if (!alive) return;
      try {
        const r = await getPaymentStatus(intent.reference);
        if (r.data.statut === 'paid') {
          alive = false;
          setPolling(false);
          onSuccess({ mode, reference: intent.reference, montant });
          return;
        }
        if (r.data.statut === 'failed' || r.data.statut === 'cancelled') {
          alive = false;
          setPolling(false);
          setError(`Paiement ${r.data.statut}${r.data.error_message ? ` — ${r.data.error_message}` : ''}`);
          return;
        }
      } catch { /* on continue le poll */ }
      tries += 1;
      if (tries >= 30 && alive) {
        setPolling(false);
        setError('Le SMS de confirmation tarde. Confirmez manuellement quand vous l\'avez reçu.');
        return;
      }
      setTimeout(tick, 2000);
    };
    setTimeout(tick, 1500);
    return () => { alive = false; };
  }, [polling, intent, montant, mode, onSuccess]);

  const doConfirm = async () => {
    if (!intent) return;
    setWorking(true); setError(null);
    try {
      await confirmPayment(intent.reference, terminalRef || undefined);
      onSuccess({ mode, reference: intent.reference, montant });
    } catch (err: any) {
      setError(err.response?.data?.error || 'Confirmation refusée');
    } finally { setWorking(false); }
  };

  const doCancel = async () => {
    if (intent && (intent as any).reference) {
      try { await cancelPayment(intent.reference); } catch { /* swallow */ }
    }
    onClose();
  };

  const doSubmitAssurance = async () => {
    setWorking(true); setError(null);
    try {
      if (!assuranceId || !numeroPolice.trim()) { setError('Assurance et n° de police requis'); setWorking(false); return; }
      if (Math.abs(partAssurance + partPatient - montant) > 0.01) {
        setError('Part assurance + part patient doit égaler le total'); setWorking(false); return;
      }
      const r = await createPriseEnCharge({
        assurance_id: Number(assuranceId),
        patient_id: props.patientId,
        examen_id: props.examenId,
        facture_id: props.factureId,
        numero_police: numeroPolice.trim(),
        montant_total: montant,
        montant_assurance: partAssurance,
        montant_patient: partPatient,
      });
      const aName = assurances.find(a => a.id === Number(assuranceId))?.nom ?? 'Assurance';
      onSuccess({ mode: 'assurance', reference: `PEC-${r.data.id}`, montant: partAssurance, assurance: aName, co_paiement: partPatient });
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erreur prise en charge');
    } finally { setWorking(false); }
  };

  const fmt = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF', maximumFractionDigits: 0 }).format(n);
  const monnaie = Math.max(0, Number(montantRecu) - montant);

  const title = mode === 'mobile_money' ? 'Paiement Mobile Money (Remita)'
    : mode === 'carte' ? 'Paiement par carte (TPE)'
    : mode === 'virement' ? 'Paiement par virement'
    : mode === 'especes' ? 'Paiement en espèces'
    : 'Prise en charge assurance';

  return (
    <div className="modal-overlay" onClick={doCancel}>
      <div className="modal-container" onClick={e => e.stopPropagation()} style={{ maxWidth: '520px' }}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button className="btn-icon" onClick={doCancel}><i className="bi bi-x-lg"></i></button>
        </div>
        <div className="modal-body">
          <div style={{ background: 'var(--cds-ui-01)', padding: '0.75rem 1rem', borderRadius: '4px', marginBottom: '1rem' }}>
            <div style={{ fontSize: '0.8125rem' }}>{patientName}</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--cds-interactive)' }}>{fmt(montant)}</div>
          </div>

          {error && (
            <div className="notification notification-error mb-2">
              <i className="bi bi-exclamation-triangle"></i><span>{error}</span>
            </div>
          )}

          {mode === 'mobile_money' && !intent && (
            <>
              <div className="form-group">
                <label className="form-label">Numéro Mobile Money du patient *</label>
                <input
                  type="tel"
                  className="form-input"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  placeholder="+237 6XX XXX XXX"
                  autoFocus
                />
                <p className="text-muted" style={{ fontSize: '0.6875rem', marginTop: '0.25rem' }}>
                  Une demande sera envoyée à ce numéro via Remita. Le patient validera avec son code PIN.
                </p>
              </div>
              <button className="btn-primary" onClick={() => doInit(phone)} disabled={working || !phone.trim()}>
                {working ? 'Initialisation…' : 'Initier le paiement'}
              </button>
            </>
          )}

          {mode === 'mobile_money' && intent && (
            <>
              <div className="notification notification-info mb-2" style={{ alignItems: 'flex-start' }}>
                <i className="bi bi-info-circle-fill" style={{ fontSize: '1.25rem' }}></i>
                <div>
                  <strong>Instructions au patient</strong>
                  <p style={{ marginTop: '0.25rem', fontSize: '0.875rem' }}>{intent.instructions}</p>
                  {intent.ussd_code && (
                    <div style={{ marginTop: '0.5rem', padding: '0.5rem 0.75rem', background: '#fff', border: '1px solid var(--cds-ui-03)', fontSize: '1.5rem', fontFamily: 'monospace', textAlign: 'center', letterSpacing: '0.125rem' }}>
                      {intent.ussd_code}
                    </div>
                  )}
                  <p className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.5rem' }}>
                    Référence : <code>{intent.reference}</code>
                  </p>
                </div>
              </div>
              {polling ? (
                <div className="text-muted" style={{ fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div className="spinner" style={{ width: '1rem', height: '1rem', borderWidth: '2px' }}></div>
                  En attente de confirmation Remita…
                </div>
              ) : (
                <button className="btn-primary" onClick={doConfirm} disabled={working}>
                  J'ai vu le SMS de confirmation — Valider le paiement
                </button>
              )}
            </>
          )}

          {mode === 'carte' && intent && (
            <>
              <div className="notification notification-info mb-2">
                <i className="bi bi-credit-card"></i>
                <span>{intent.instructions}</span>
              </div>
              <div className="form-group">
                <label className="form-label">Référence du TPE (optionnel)</label>
                <input
                  type="text"
                  className="form-input"
                  value={terminalRef}
                  onChange={e => setTerminalRef(e.target.value)}
                  placeholder="ex: 002345"
                />
              </div>
              <button className="btn-primary" onClick={doConfirm} disabled={working}>
                {working ? 'Confirmation…' : 'Approuvé — Confirmer le paiement'}
              </button>
            </>
          )}

          {mode === 'virement' && intent && (
            <>
              <div className="notification notification-info mb-2" style={{ alignItems: 'flex-start' }}>
                <i className="bi bi-bank2"></i>
                <div>
                  <strong>Coordonnées bancaires à communiquer</strong>
                  <p style={{ marginTop: '0.25rem', fontSize: '0.875rem' }}>
                    <em>(À configurer dans Configuration → Coordonnées de l'établissement.)</em>
                  </p>
                  <p className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.5rem' }}>
                    Référence interne : <code>{intent.reference}</code>
                  </p>
                </div>
              </div>
              <div className="form-group">
                <label className="form-label">Référence du virement *</label>
                <input
                  type="text"
                  className="form-input"
                  value={terminalRef}
                  onChange={e => setTerminalRef(e.target.value)}
                  placeholder="ex: VRT-2026-0042"
                  autoFocus
                />
              </div>
              <button className="btn-primary" onClick={doConfirm} disabled={working || !terminalRef.trim()}>
                {working ? 'Confirmation…' : 'Virement reçu — Confirmer'}
              </button>
            </>
          )}

          {mode === 'especes' && intent && (
            <>
              <div className="form-group">
                <label className="form-label">Montant reçu *</label>
                <input
                  type="number"
                  className="form-input"
                  value={montantRecu}
                  onChange={e => setMontantRecu(e.target.value)}
                  step="100"
                  autoFocus
                />
              </div>
              {monnaie > 0 && (
                <div className="notification notification-warning mb-2">
                  <i className="bi bi-coin"></i>
                  <span>Monnaie à rendre : <strong>{fmt(monnaie)}</strong></span>
                </div>
              )}
              <button className="btn-primary" onClick={doConfirm} disabled={working || Number(montantRecu) < montant}>
                {working ? 'Confirmation…' : 'Encaissé — Confirmer'}
              </button>
            </>
          )}

          {mode === 'assurance' && (
            <>
              <div className="form-group">
                <label className="form-label">Assurance *</label>
                <select
                  className="form-select"
                  value={assuranceId}
                  onChange={e => {
                    setAssuranceId(e.target.value);
                    const a = assurances.find(x => x.id === Number(e.target.value));
                    const taux = a?.tauxDefaut != null ? Number(a.tauxDefaut) : 80;
                    const couvert = Math.round(montant * (taux / 100));
                    setPartAssurance(couvert);
                    setPartPatient(montant - couvert);
                  }}
                  required
                >
                  <option value="">— Choisir —</option>
                  {assurances.map(a => (
                    <option key={a.id} value={a.id}>{a.nom} {a.code ? `(${a.code})` : ''}{a.tauxDefaut != null ? ` — ${a.tauxDefaut}% par défaut` : ''}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">N° de police *</label>
                <input
                  type="text"
                  className="form-input"
                  value={numeroPolice}
                  onChange={e => setNumeroPolice(e.target.value)}
                  placeholder="ex: AP/2026/00123"
                />
              </div>
              <div className="grid-2">
                <div className="form-group">
                  <label className="form-label">Part assurance</label>
                  <input
                    type="number"
                    className="form-input"
                    value={partAssurance}
                    onChange={e => {
                      const v = Math.max(0, Math.min(montant, Number(e.target.value)));
                      setPartAssurance(v);
                      setPartPatient(montant - v);
                    }}
                    step="100"
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Ticket modérateur (patient)</label>
                  <input
                    type="number"
                    className="form-input"
                    value={partPatient}
                    onChange={e => {
                      const v = Math.max(0, Math.min(montant, Number(e.target.value)));
                      setPartPatient(v);
                      setPartAssurance(montant - v);
                    }}
                    step="100"
                  />
                </div>
              </div>
              <div className="notification notification-info mb-2" style={{ fontSize: '0.8125rem' }}>
                <i className="bi bi-info-circle"></i>
                <span>
                  L'assurance sera facturée en tiers payant. Le patient doit régler son co-paiement
                  séparément si supérieur à 0. L'examen avance au labo dès la prise en charge enregistrée.
                </span>
              </div>
              <button className="btn-primary" onClick={doSubmitAssurance} disabled={working || !assuranceId || !numeroPolice.trim()}>
                {working ? 'Enregistrement…' : 'Enregistrer la prise en charge'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
