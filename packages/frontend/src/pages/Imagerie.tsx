import { useState, useEffect, useRef } from 'react';
import { getPatients, getMedecins } from '../services/api';
import api from '../services/api';
import type { Patient, Medecin } from '../types';

const typeExamens = ['Radiographie', 'Échographie', 'Scanner', 'IRM', 'Mammographie', 'Panoramique dentaire', 'Autre'];

export default function Imagerie() {
  const [images, setImages] = useState<any[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [medecins, setMedecins] = useState<Medecin[]>([]);
  const [selectedPatient, setSelectedPatient] = useState('');
  const [loading, setLoading] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showViewer, setShowViewer] = useState<any>(null);
  const [form, setForm] = useState({ patient_id: '', type_examen: '', description: '', date_examen: '', medecin_id: '' });
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { loadRefs(); }, []);
  useEffect(() => { if (selectedPatient) loadImages(); }, [selectedPatient]);

  const loadRefs = async () => {
    try {
      const [p, m] = await Promise.all([getPatients({ archived: 'false' }), getMedecins()]);
      setPatients(p.data.data || p.data); setMedecins(m.data);
    } catch (err) { console.error(err); }
  };

  const loadImages = async () => {
    setLoading(true);
    try { const { data } = await api.get(`/imagerie/${selectedPatient}`); setImages(data); }
    catch (err) { console.error(err); }
    finally { setLoading(false); }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    const file = fileRef.current?.files?.[0];
    if (!file || !form.patient_id) { alert('Patient et fichier requis'); return; }
    const formData = new FormData();
    formData.append('file', file);
    Object.entries(form).forEach(([k, v]) => { if (v) formData.append(k, v); });
    try {
      await api.post('/imagerie', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      setShowModal(false); setForm({ patient_id: '', type_examen: '', description: '', date_examen: '', medecin_id: '' });
      if (selectedPatient) loadImages();
    } catch (err: any) { alert(err.response?.data?.error || 'Erreur'); }
  };

  const isImage = (type: string) => type?.startsWith('image/');

  return (
    <div>
      <nav className="breadcrumb"><a href="/app">Accueil</a><span className="breadcrumb-separator">/</span><span>Imagerie médicale</span></nav>
      <div className="page-header"><h1 className="page-title">Imagerie médicale</h1><button className="btn-primary" onClick={() => setShowModal(true)}><i className="bi bi-upload"></i> Upload</button></div>

      <div className="tile mb-2" style={{ padding: '1rem' }}>
        <div className="form-group" style={{ marginBottom: 0 }}>
          <label className="form-label">Sélectionner un patient</label>
          <select className="form-select" value={selectedPatient} onChange={e => setSelectedPatient(e.target.value)} style={{ maxWidth: '400px' }}>
            <option value="">Choisir un patient...</option>
            {patients.map(p => <option key={p.id} value={p.id}>{p.prenom} {p.nom}</option>)}
          </select>
        </div>
      </div>

      {loading ? <div className="loading"><div className="spinner"></div></div> : selectedPatient ? (
        <div>
          {images.length === 0 ? (
            <div className="table-empty" style={{ padding: '3rem' }}><i className="bi bi-image" style={{fontSize:'2.5rem',display:'block',marginBottom:'0.5rem'}}></i>Aucune image pour ce patient</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '1rem' }}>
              {images.map((img: any) => (
                <div key={img.id} className="tile" style={{ padding: 0, overflow: 'hidden', cursor: 'pointer' }} onClick={() => setShowViewer(img)}>
                  <div style={{ height: '180px', background: '#e0e0e0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {isImage(img.fichier_type) ? (
                      <img src={`/uploads/imagerie/${img.fichier_url?.split('/').pop()}`} alt={img.description} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                    ) : (
                      <div style={{ textAlign: 'center', color: '#6f6f6f' }}><i className="bi bi-file-medical" style={{ fontSize: '2rem' }}></i><div style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>{img.fichier_nom}</div></div>
                    )}
                  </div>
                  <div style={{ padding: '0.75rem' }}>
                    <div style={{ fontWeight: 500, fontSize: '0.875rem' }}>{img.type_examen || 'Imagerie'}</div>
                    <div style={{ fontSize: '0.75rem', color: '#525252' }}>{new Date(img.date_examen).toLocaleDateString('fr-FR')}</div>
                    {img.description && <div style={{ fontSize: '0.75rem', color: '#6f6f6f', marginTop: '0.25rem' }}>{img.description}</div>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="table-empty" style={{ padding: '3rem' }}><i className="bi bi-arrow-up" style={{fontSize:'2rem',display:'block',marginBottom:'0.5rem'}}></i>Sélectionnez un patient</div>
      )}

      {/* Viewer modal */}
      {showViewer && (
        <div className="modal-overlay" onClick={() => setShowViewer(null)}>
          <div style={{ background: '#000', maxWidth: '90vw', maxHeight: '90vh', position: 'relative' }} onClick={e => e.stopPropagation()}>
            <button onClick={() => setShowViewer(null)} style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', background: 'rgba(0,0,0,0.5)', color: '#fff', border: 'none', padding: '0.5rem', cursor: 'pointer', zIndex: 10 }}><i className="bi bi-x-lg"></i></button>
            {isImage(showViewer.fichier_type) ? (
              <img src={`/uploads/imagerie/${showViewer.fichier_url?.split('/').pop()}`} alt="" style={{ maxWidth: '90vw', maxHeight: '85vh', display: 'block' }} />
            ) : (
              <div style={{ padding: '3rem', textAlign: 'center', color: '#fff' }}>
                <i className="bi bi-file-medical" style={{ fontSize: '3rem' }}></i>
                <p style={{ marginTop: '1rem' }}>{showViewer.fichier_nom}</p>
                <a href={`/uploads/imagerie/${showViewer.fichier_url?.split('/').pop()}`} target="_blank" style={{ color: '#78a9ff', marginTop: '0.5rem', display: 'inline-block' }}>Télécharger</a>
              </div>
            )}
            <div style={{ padding: '0.75rem', background: '#161616', color: '#c6c6c6', fontSize: '0.8125rem' }}>
              {showViewer.type_examen} — {new Date(showViewer.date_examen).toLocaleDateString('fr-FR')} {showViewer.medecin_nom ? `— Dr. ${showViewer.medecin_prenom} ${showViewer.medecin_nom}` : ''}
            </div>
          </div>
        </div>
      )}

      {/* Upload modal */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}><div className="modal-container" onClick={e => e.stopPropagation()}>
          <div className="modal-header"><h3>Upload imagerie</h3><button className="btn-icon" onClick={() => setShowModal(false)}><i className="bi bi-x-lg"></i></button></div>
          <form onSubmit={handleUpload}><div className="modal-body">
            <div className="grid-2">
              <div className="form-group"><label className="form-label">Patient *</label><select className="form-select" value={form.patient_id} onChange={e => setForm({...form, patient_id: e.target.value})} required><option value="">Sélectionner...</option>{patients.map(p => <option key={p.id} value={p.id}>{p.prenom} {p.nom}</option>)}</select></div>
              <div className="form-group"><label className="form-label">Type d'examen</label><select className="form-select" value={form.type_examen} onChange={e => setForm({...form, type_examen: e.target.value})}><option value="">Sélectionner...</option>{typeExamens.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
            </div>
            <div className="form-group"><label className="form-label">Fichier *</label><input type="file" ref={fileRef} accept=".dcm,.jpg,.jpeg,.png,.gif,.bmp,.tiff,.pdf" style={{ display: 'block', marginTop: '0.25rem' }} /></div>
            <div className="form-group"><label className="form-label">Description</label><input type="text" className="form-input" value={form.description} onChange={e => setForm({...form, description: e.target.value})} /></div>
            <div className="grid-2">
              <div className="form-group"><label className="form-label">Date</label><input type="date" className="form-input" value={form.date_examen} onChange={e => setForm({...form, date_examen: e.target.value})} /></div>
              <div className="form-group"><label className="form-label">Médecin</label><select className="form-select" value={form.medecin_id} onChange={e => setForm({...form, medecin_id: e.target.value})}><option value="">Sélectionner...</option>{medecins.map(m => <option key={m.id} value={m.id}>Dr. {m.prenom} {m.nom}</option>)}</select></div>
            </div>
          </div><div className="modal-footer"><button type="button" className="btn-secondary" onClick={() => setShowModal(false)}>Annuler</button><button type="submit" className="btn-primary">Upload</button></div></form>
        </div></div>
      )}
    </div>
  );
}