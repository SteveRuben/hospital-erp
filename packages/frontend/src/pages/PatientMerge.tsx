import { useState, useEffect } from 'react';
import { getPatientDuplicates, mergePatients } from '../services/api';

export default function PatientMerge() {
  const [duplicates, setDuplicates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadDuplicates(); }, []);

  const loadDuplicates = async () => {
    try { const { data } = await getPatientDuplicates(); setDuplicates(data); }
    catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleMerge = async (keepId: number, mergeId: number) => {
    if (!confirm(`Fusionner le patient #${mergeId} dans #${keepId} ? Cette action est irréversible.`)) return;
    try { await mergePatients(keepId, mergeId); loadDuplicates(); alert('Fusion effectuée'); }
    catch (err: any) { alert(err.response?.data?.error || 'Erreur'); }
  };

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  return (
    <div>
      <nav className="breadcrumb"><a href="/app">Accueil</a><span className="breadcrumb-separator">/</span><span>Fusion de patients</span></nav>
      <div className="page-header"><h1 className="page-title">Détection de doublons</h1></div>

      <div className="notification notification-info mb-2"><i className="bi bi-info-circle"></i><span>Les doublons sont détectés par correspondance exacte du nom et prénom. La fusion transfère toutes les données du patient secondaire vers le principal.</span></div>

      {duplicates.length === 0 ? (
        <div className="table-empty" style={{ padding: '3rem' }}><i className="bi bi-check-circle" style={{fontSize:'2.5rem',display:'block',marginBottom:'0.5rem',color:'var(--cds-support-success)'}}></i>Aucun doublon détecté</div>
      ) : (
        <div>
          <p className="text-muted mb-2">{duplicates.length} doublon(s) potentiel(s) détecté(s)</p>
          {duplicates.map((d: any, i: number) => (
            <div key={i} className="tile mb-1" style={{ padding: '1.25rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: '1rem', alignItems: 'center' }}>
                <div>
                  <div className="fw-600">{d.prenom1} {d.nom1}</div>
                  <div className="text-muted" style={{ fontSize: '0.75rem' }}>ID: #{d.id1} {d.dob1 ? `• Né(e) le ${new Date(d.dob1).toLocaleDateString('fr-FR')}` : ''} {d.tel1 ? `• ${d.tel1}` : ''}</div>
                </div>
                <div style={{ textAlign: 'center' }}>
                  <i className="bi bi-arrow-left-right" style={{ fontSize: '1.25rem', color: 'var(--cds-support-warning)' }}></i>
                  <div className="d-flex gap-1 mt-1">
                    <button className="btn-ghost btn-sm" onClick={() => handleMerge(d.id1, d.id2)} title="Garder le patient de gauche">← Garder #{d.id1}</button>
                    <button className="btn-ghost btn-sm" onClick={() => handleMerge(d.id2, d.id1)} title="Garder le patient de droite">Garder #{d.id2} →</button>
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="fw-600">{d.prenom2} {d.nom2}</div>
                  <div className="text-muted" style={{ fontSize: '0.75rem' }}>ID: #{d.id2} {d.dob2 ? `• Né(e) le ${new Date(d.dob2).toLocaleDateString('fr-FR')}` : ''} {d.tel2 ? `• ${d.tel2}` : ''}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}