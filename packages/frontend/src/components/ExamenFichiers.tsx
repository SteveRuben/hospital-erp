import { useEffect, useState, useRef } from 'react';
import {
  getExamenFichiers, uploadExamenFichier, deleteExamenFichier,
  type ExamenFichierRow,
} from '../services/api';

interface Props {
  examenId: number;
  /** Quand `false` (statut antérieur à 'analyse'), l'upload est bloqué côté UI
   *  pour matcher le 409 que renvoie le backend. */
  canUpload: boolean;
  /** Forme compacte (carte Kanban) vs étendue (modale de saisie résultat) */
  variant?: 'compact' | 'full';
  /** Callback pour rafraîchir la carte parent quand le nombre de fichiers change. */
  onChange?: () => void;
}

const ACCEPT = '.pdf,.png,.jpg,.jpeg,.gif,.bmp,.zip,.xlsx,.xls';

const fmtSize = (bytes: number | null) => {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} ko`;
  return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
};

const iconForType = (type: string | null, nom: string): string => {
  const t = (type ?? '').toLowerCase();
  const ext = nom.toLowerCase();
  if (t.startsWith('image/')) return 'bi-file-image';
  if (t === 'application/pdf' || ext.endsWith('.pdf')) return 'bi-file-pdf';
  if (ext.endsWith('.xlsx') || ext.endsWith('.xls')) return 'bi-file-spreadsheet';
  if (ext.endsWith('.zip')) return 'bi-file-zip';
  return 'bi-file-earmark';
};

export default function ExamenFichiers({ examenId, canUpload, variant = 'compact', onChange }: Props) {
  const [files, setFiles] = useState<ExamenFichierRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { void load(); }, [examenId]);

  const load = async () => {
    setLoading(true); setErr(null);
    try {
      const r = await getExamenFichiers(examenId);
      setFiles(r.data);
    } catch (e: any) {
      setErr(e.response?.data?.error || 'Erreur de chargement');
    } finally { setLoading(false); }
  };

  const handleUpload = async (file: File) => {
    if (!file) return;
    setUploading(true); setErr(null);
    try {
      await uploadExamenFichier(examenId, file);
      await load();
      if (onChange) onChange();
    } catch (e: any) {
      setErr(e.response?.data?.error || 'Échec de l\'upload');
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  const handleDelete = async (fid: number) => {
    if (!confirm('Supprimer ce fichier ?')) return;
    try {
      await deleteExamenFichier(examenId, fid);
      await load();
      if (onChange) onChange();
    } catch (e: any) {
      setErr(e.response?.data?.error || 'Erreur');
    }
  };

  // Forme compacte : un bouton paperclip + un compteur, la liste se déplie au survol.
  if (variant === 'compact') {
    return (
      <div style={{ marginTop: '0.375rem', fontSize: '0.6875rem' }}>
        {loading ? (
          <span className="text-muted">…</span>
        ) : (
          <details>
            <summary style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
              <i className="bi bi-paperclip"></i>
              {files.length === 0 ? 'Aucun fichier' : `${files.length} fichier${files.length > 1 ? 's' : ''}`}
            </summary>
            <div style={{ marginTop: '0.25rem', paddingLeft: '0.75rem' }}>
              {files.map(f => (
                <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', padding: '0.125rem 0' }}>
                  <i className={`bi ${iconForType(f.fichier_type, f.fichier_nom)}`}></i>
                  <a href={f.fichier_url} target="_blank" rel="noopener noreferrer" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={f.fichier_nom}>
                    {f.fichier_nom}
                  </a>
                  <span className="text-muted" style={{ fontSize: '0.625rem' }}>{fmtSize(f.fichier_taille)}</span>
                </div>
              ))}
              {canUpload && (
                <label className="btn-ghost btn-sm" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.25rem', cursor: 'pointer' }}>
                  <i className="bi bi-upload"></i> {uploading ? 'Envoi…' : 'Joindre'}
                  <input
                    ref={inputRef}
                    type="file"
                    accept={ACCEPT}
                    style={{ display: 'none' }}
                    disabled={uploading}
                    onChange={e => { const f = e.target.files?.[0]; if (f) void handleUpload(f); }}
                  />
                </label>
              )}
              {err && <div className="text-danger" style={{ fontSize: '0.625rem', marginTop: '0.25rem' }}>{err}</div>}
            </div>
          </details>
        )}
      </div>
    );
  }

  // Forme étendue : table de fichiers + dropzone explicite.
  return (
    <div className="form-group">
      <label className="form-label">Pièces jointes <span className="text-muted" style={{ fontSize: '0.6875rem', fontWeight: 400 }}>(PDF, images, Excel, ZIP — 10 Mo max)</span></label>
      {loading ? (
        <p className="text-muted" style={{ fontSize: '0.8125rem' }}>Chargement…</p>
      ) : (
        <>
          {files.length > 0 && (
            <table className="data-table" style={{ fontSize: '0.8125rem', marginBottom: '0.5rem' }}>
              <tbody>
                {files.map(f => (
                  <tr key={f.id}>
                    <td style={{ width: 24 }}><i className={`bi ${iconForType(f.fichier_type, f.fichier_nom)}`}></i></td>
                    <td>
                      <a href={f.fichier_url} target="_blank" rel="noopener noreferrer">{f.fichier_nom}</a>
                    </td>
                    <td className="text-muted" style={{ fontSize: '0.6875rem' }}>{fmtSize(f.fichier_taille)}</td>
                    <td className="text-muted" style={{ fontSize: '0.6875rem' }}>{new Date(f.created_at).toLocaleString('fr-FR')}</td>
                    <td style={{ width: 32 }}>
                      <button type="button" className="btn-icon" onClick={() => handleDelete(f.id)} title="Supprimer"><i className="bi bi-trash text-danger"></i></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {canUpload ? (
            <label
              style={{
                display: 'block', padding: '0.875rem', textAlign: 'center', cursor: uploading ? 'wait' : 'pointer',
                border: '1px dashed var(--cds-ui-03)', borderRadius: '4px', background: 'var(--cds-ui-01)',
                fontSize: '0.8125rem', color: 'var(--cds-text-secondary)',
              }}
              onDragOver={e => { e.preventDefault(); }}
              onDrop={e => {
                e.preventDefault();
                const f = e.dataTransfer.files?.[0];
                if (f) void handleUpload(f);
              }}
            >
              <i className="bi bi-cloud-upload" style={{ fontSize: '1.5rem', display: 'block', marginBottom: '0.25rem' }}></i>
              {uploading ? 'Envoi en cours…' : 'Cliquez ou déposez un fichier ici'}
              <input
                ref={inputRef}
                type="file"
                accept={ACCEPT}
                style={{ display: 'none' }}
                disabled={uploading}
                onChange={e => { const f = e.target.files?.[0]; if (f) void handleUpload(f); }}
              />
            </label>
          ) : (
            <p className="text-muted" style={{ fontSize: '0.75rem' }}>Les fichiers s'ajoutent à partir du statut « analyse ».</p>
          )}
          {err && <p className="text-danger" style={{ fontSize: '0.8125rem', marginTop: '0.375rem' }}>{err}</p>}
        </>
      )}
    </div>
  );
}
