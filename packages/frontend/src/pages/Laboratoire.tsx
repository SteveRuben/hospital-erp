import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { getExamens, updateExamen, deleteExamen, getPatients } from '../services/api';
import type { Examen, Patient } from '../types';

const typeExamens = ['Analyse de sang', "Analyse d'urine", 'Glycémie', 'Créatinine', 'Urée', 'Cholestérol', 'Groupe sanguin', 'Sérologie', 'Test de grossesse', 'Autres'];
const statutLabels: Record<string, { label: string; tag: string }> = {
  demande: { label: 'Demandé', tag: 'tag-gray' },
  prelevement: { label: 'Prélèvement', tag: 'tag-blue' },
  analyse: { label: 'Analyse', tag: 'tag-yellow' },
  resultat: { label: 'Résultat', tag: 'tag-purple' },
  valide: { label: 'Validé', tag: 'tag-green' },
  transmis: { label: 'Transmis', tag: 'tag-teal' },
};

export default function Laboratoire() {
  const [examens, setExamens] = useState<Examen[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'table' | 'kanban'>('kanban');
  const navigate = useNavigate();

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    try {
      const [e, p] = await Promise.all([getExamens(), getPatients({ archived: 'false' })]);
      setExamens(e.data); setPatients(p.data.data);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const changeStatut = async (examen: Examen, newStatut: string) => {
    try { await updateExamen(examen.id, { ...examen, statut: newStatut }); loadData(); } catch { alert('Erreur'); }
  };

  const fmt = (n: number) => new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'XOF' }).format(n);
  const statuts = ['demande', 'prelevement', 'analyse', 'resultat', 'valide', 'transmis'];
  const nextStatut: Record<string, string> = { demande: 'prelevement', prelevement: 'analyse', analyse: 'resultat', resultat: 'valide', valide: 'transmis' };
  const nextAction: Record<string, string> = { demande: 'Prélever', prelevement: 'Analyser', analyse: 'Saisir résultat', resultat: 'Valider', valide: 'Transmettre' };

  if (loading) return <div className="loading"><div className="spinner"></div></div>;

  const totalExamens = examens.length;
  const totalRevenus = examens.reduce((s, e) => s + (Number(e.montant) || 0), 0);

  return (
    <div>
      <nav className="breadcrumb"><a href="/app">Accueil</a><span className="breadcrumb-separator">/</span><span>Laboratoire</span></nav>
      <div className="page-header">
        <h1 className="page-title">Laboratoire</h1>
        <div className="d-flex gap-1">
          <button className={view === 'kanban' ? 'btn-primary btn-sm' : 'btn-ghost btn-sm'} onClick={() => setView('kanban')}><i className="bi bi-kanban"></i> Kanban</button>
          <button className={view === 'table' ? 'btn-primary btn-sm' : 'btn-ghost btn-sm'} onClick={() => setView('table')}><i className="bi bi-table"></i> Table</button>
          <button className="btn-primary" onClick={() => navigate('/app/laboratoire/nouveau')}><i className="bi bi-plus"></i> Nouvel examen</button>
        </div>
      </div>

      <div className="grid-3 mb-3">
        <div className="tile stat-tile"><div className="stat-value">{totalExamens}</div><div className="stat-label">Total examens</div></div>
        <div className="tile stat-tile"><div className="stat-value text-success">{fmt(totalRevenus)}</div><div className="stat-label">Revenus</div></div>
        <div className="tile stat-tile"><div className="stat-value">{new Set(examens.map(e => e.type_examen)).size}</div><div className="stat-label">Types d'examens</div></div>
      </div>

      {view === 'kanban' ? (
        <div className="kanban">
          {statuts.map(s => {
            const items = examens.filter(e => (e as Examen & { statut?: string }).statut === s || (!('statut' in e) && s === 'demande'));
            return (
              <div className="kanban-column" key={s}>
                <div className="kanban-column-header"><span>{statutLabels[s]?.label || s}</span><span className="count">{items.length}</span></div>
                {items.map(ex => (
                  <div className="kanban-card" key={ex.id}>
                    <h4>{ex.patient_prenom} {ex.patient_nom}</h4>
                    <p>{ex.type_examen}</p>
                    <p>{new Date(ex.date_examen).toLocaleDateString('fr-FR')}</p>
                    {ex.montant && <p className="text-success fw-600">{fmt(Number(ex.montant))}</p>}
                    {nextStatut[s] && <button className="btn-ghost btn-sm mt-1" onClick={() => changeStatut(ex, nextStatut[s])}>{nextAction[s]} →</button>}
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      ) : (
        <table className="data-table"><thead><tr><th>Date</th><th>Patient</th><th>Type</th><th>Statut</th><th>Résultat</th><th>Montant</th><th></th></tr></thead>
          <tbody>
            {examens.map(ex => (
              <tr key={ex.id}>
                <td>{new Date(ex.date_examen).toLocaleDateString('fr-FR')}</td>
                <td>{ex.patient_prenom} {ex.patient_nom}</td>
                <td>{ex.type_examen}</td>
                <td><span className={`tag ${statutLabels[(ex as Examen & { statut?: string }).statut || 'demande']?.tag}`}>{statutLabels[(ex as Examen & { statut?: string }).statut || 'demande']?.label}</span></td>
                <td>{ex.resultat || '-'}</td>
                <td>{ex.montant ? fmt(Number(ex.montant)) : '-'}</td>
                <td>
                  <button className="btn-icon" onClick={() => navigate(`/app/laboratoire/${ex.id}/modifier`)}><i className="bi bi-pencil"></i></button>
                  <button className="btn-icon" onClick={async () => { if (confirm('Supprimer ?')) { await deleteExamen(ex.id); loadData(); }}}><i className="bi bi-trash"></i></button>
                </td>
              </tr>
            ))}
            {examens.length === 0 && <tr><td colSpan={7} className="table-empty"><i className="bi bi-flask"></i>Aucun examen</td></tr>}
          </tbody>
        </table>
      )}

    </div>
  );
}