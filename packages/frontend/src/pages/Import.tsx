import { useState, useRef } from 'react';
import { importFile, downloadTemplate } from '../services/api';

const importTypes = [
  { id: 'patients', label: 'Patients', icon: 'bi-people', desc: 'Importer des dossiers patients', fields: 'nom, prenom, sexe, date_naissance, telephone, email, adresse, ville, profession, nationalite, contact_urgence_nom, contact_urgence_telephone' },
  { id: 'medecins', label: 'Médecins', icon: 'bi-person-badge', desc: 'Importer des médecins', fields: 'nom, prenom, specialite, telephone' },
  { id: 'tarifs', label: 'Tarifs', icon: 'bi-receipt', desc: 'Importer la grille tarifaire', fields: 'code, libelle, categorie, montant' },
  { id: 'users', label: 'Utilisateurs', icon: 'bi-person-gear', desc: 'Importer des comptes utilisateurs (mot de passe par défaut: Changeme1)', fields: 'username, role, nom, prenom, telephone' },
];

export default function Import() {
  const [selectedType, setSelectedType] = useState('patients');
  const [result, setResult] = useState<{ imported: number; total: number; errors: string[]; note?: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const handleImport = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) { setError('Sélectionnez un fichier'); return; }
    
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!['csv', 'txt', 'xls', 'xlsx'].includes(ext || '')) {
      setError('Format accepté : CSV, TXT, XLS, XLSX');
      return;
    }

    setLoading(true); setError(''); setResult(null);
    try {
      const { data } = await importFile(selectedType, file);
      setResult(data);
    } catch (err: any) {
      setError(err.response?.data?.error || 'Erreur lors de l\'import');
    } finally {
      setLoading(false);
    }
  };

  const currentType = importTypes.find(t => t.id === selectedType)!;

  return (
    <div>
      <nav className="breadcrumb"><a href="/app">Accueil</a><span className="breadcrumb-separator">/</span><span>Import de données</span></nav>
      <div className="page-header"><h1 className="page-title">Import de données</h1></div>

      {/* Type selection */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', marginBottom: '1.5rem' }}>
        {importTypes.map(t => (
          <div key={t.id} className="tile tile-clickable" style={{ padding: '1.25rem', borderLeft: selectedType === t.id ? '3px solid var(--cds-interactive)' : '3px solid transparent', cursor: 'pointer' }} onClick={() => { setSelectedType(t.id); setResult(null); setError(''); }}>
            <i className={`bi ${t.icon}`} style={{ fontSize: '1.5rem', color: selectedType === t.id ? 'var(--cds-interactive)' : 'var(--cds-text-secondary)', display: 'block', marginBottom: '0.5rem' }}></i>
            <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>{t.label}</div>
            <p className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>{t.desc}</p>
          </div>
        ))}
      </div>

      <div className="grid-2">
        {/* Upload zone */}
        <div className="tile" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Importer {currentType.label}</h3>
          
          <div style={{ border: '2px dashed var(--cds-ui-04)', padding: '2rem', textAlign: 'center', marginBottom: '1rem' }}>
            <i className="bi bi-cloud-upload" style={{ fontSize: '2rem', color: 'var(--cds-text-secondary)', display: 'block', marginBottom: '0.5rem' }}></i>
            <input type="file" ref={fileRef} accept=".csv,.txt,.xls,.xlsx" style={{ marginBottom: '1rem' }} />
            <p className="text-muted" style={{ fontSize: '0.75rem' }}>Formats acceptés : CSV, TXT (séparateur: virgule, point-virgule ou tabulation)</p>
          </div>

          <div className="d-flex gap-1">
            <button className="btn-primary" onClick={handleImport} disabled={loading}>
              {loading ? 'Import en cours...' : `Importer les ${currentType.label.toLowerCase()}`}
            </button>
            <button className="btn-ghost" onClick={() => downloadTemplate(selectedType)}>
              <i className="bi bi-download"></i> Télécharger le modèle CSV
            </button>
          </div>

          {error && <div className="notification notification-error mt-2"><i className="bi bi-exclamation-circle"></i><span>{error}</span></div>}

          {result && (
            <div className={`notification ${result.errors.length === 0 ? 'notification-success' : 'notification-warning'} mt-2`}>
              <div>
                <strong>{result.imported} / {result.total}</strong> enregistrements importés
                {result.note && <p style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>{result.note}</p>}
                {result.errors.length > 0 && (
                  <details style={{ marginTop: '0.5rem' }}>
                    <summary style={{ cursor: 'pointer', fontSize: '0.75rem' }}>{result.errors.length} erreur(s)</summary>
                    <ul style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
                      {result.errors.map((e, i) => <li key={i}>{e}</li>)}
                    </ul>
                  </details>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Format guide */}
        <div className="tile" style={{ padding: '1.5rem' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '1rem' }}>Format du fichier</h3>
          
          <div className="notification notification-info mb-2">
            <i className="bi bi-info-circle"></i>
            <span>La première ligne doit contenir les en-têtes de colonnes. Le système reconnaît automatiquement les noms de colonnes en français et en anglais.</span>
          </div>

          <h4 style={{ fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.5rem' }}>Colonnes attendues :</h4>
          <p style={{ fontSize: '0.8125rem', fontFamily: 'monospace', background: 'var(--cds-field-01)', padding: '0.75rem', marginBottom: '1rem' }}>{currentType.fields}</p>

          <h4 style={{ fontSize: '0.8125rem', fontWeight: 600, marginBottom: '0.5rem' }}>Noms alternatifs reconnus :</h4>
          <table className="data-table" style={{ fontSize: '0.75rem' }}>
            <thead><tr><th>Colonne</th><th>Alternatives acceptées</th></tr></thead>
            <tbody>
              {selectedType === 'patients' && <>
                <tr><td>nom</td><td>name, last_name, nom_famille</td></tr>
                <tr><td>prenom</td><td>first_name, prenom_usuel</td></tr>
                <tr><td>sexe</td><td>genre, sex, gender</td></tr>
                <tr><td>date_naissance</td><td>dob, birth_date, date_de_naissance</td></tr>
                <tr><td>telephone</td><td>tel, phone, mobile</td></tr>
                <tr><td>email</td><td>mail, courriel</td></tr>
              </>}
              {selectedType === 'medecins' && <>
                <tr><td>nom</td><td>name, last_name</td></tr>
                <tr><td>prenom</td><td>first_name</td></tr>
                <tr><td>specialite</td><td>specialty, speciality</td></tr>
              </>}
              {selectedType === 'tarifs' && <>
                <tr><td>libelle</td><td>label, designation, description</td></tr>
                <tr><td>categorie</td><td>category, type</td></tr>
                <tr><td>montant</td><td>prix, price, amount</td></tr>
              </>}
              {selectedType === 'users' && <>
                <tr><td>username</td><td>login, identifiant</td></tr>
                <tr><td>role</td><td>profil, profile</td></tr>
              </>}
            </tbody>
          </table>

          <div className="notification notification-warning mt-2">
            <i className="bi bi-exclamation-triangle"></i>
            <span style={{ fontSize: '0.75rem' }}>
              {selectedType === 'users' ? 'Les utilisateurs importés auront le mot de passe par défaut "Changeme1". Ils devront le changer à la première connexion.' :
               selectedType === 'tarifs' ? 'Si un code existe déjà, le tarif sera mis à jour avec les nouvelles valeurs.' :
               'Les doublons ne sont pas détectés automatiquement. Vérifiez votre fichier avant l\'import.'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}