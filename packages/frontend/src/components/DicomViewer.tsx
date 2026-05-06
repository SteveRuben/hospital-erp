import { useEffect, useRef, useState } from 'react';

interface DicomViewerProps {
  imageUrl: string;
  fileType: string;
  fileName: string;
}

export default function DicomViewer({ imageUrl, fileType, fileName }: DicomViewerProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [invert, setInvert] = useState(false);
  const [rotation, setRotation] = useState(0);

  const isImage = fileType?.startsWith('image/');
  const isDicom = fileName?.toLowerCase().endsWith('.dcm');

  const resetView = () => { setZoom(1); setBrightness(100); setContrast(100); setInvert(false); setRotation(0); };

  const imageStyle: React.CSSProperties = {
    maxWidth: '100%',
    maxHeight: '70vh',
    transform: `scale(${zoom}) rotate(${rotation}deg)`,
    filter: `brightness(${brightness}%) contrast(${contrast}%) ${invert ? 'invert(1)' : ''}`,
    transition: 'transform 0.2s, filter 0.2s',
  };

  return (
    <div style={{ background: '#000', color: '#fff', minHeight: '500px' }}>
      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.5rem 1rem', background: '#1c1c1c', borderBottom: '1px solid #333', flexWrap: 'wrap' }}>
        <button onClick={() => setZoom(z => Math.min(z + 0.25, 5))} style={toolBtnStyle} title="Zoom +"><i className="bi bi-zoom-in"></i></button>
        <button onClick={() => setZoom(z => Math.max(z - 0.25, 0.25))} style={toolBtnStyle} title="Zoom -"><i className="bi bi-zoom-out"></i></button>
        <span style={{ color: '#6f6f6f', fontSize: '0.75rem', margin: '0 0.25rem' }}>|</span>
        <button onClick={() => setRotation(r => r - 90)} style={toolBtnStyle} title="Rotation gauche"><i className="bi bi-arrow-counterclockwise"></i></button>
        <button onClick={() => setRotation(r => r + 90)} style={toolBtnStyle} title="Rotation droite"><i className="bi bi-arrow-clockwise"></i></button>
        <span style={{ color: '#6f6f6f', fontSize: '0.75rem', margin: '0 0.25rem' }}>|</span>
        <label style={{ fontSize: '0.6875rem', color: '#a8a8a8' }}>Luminosité</label>
        <input type="range" min="0" max="200" value={brightness} onChange={e => setBrightness(Number(e.target.value))} style={{ width: '80px' }} />
        <label style={{ fontSize: '0.6875rem', color: '#a8a8a8' }}>Contraste</label>
        <input type="range" min="0" max="200" value={contrast} onChange={e => setContrast(Number(e.target.value))} style={{ width: '80px' }} />
        <span style={{ color: '#6f6f6f', fontSize: '0.75rem', margin: '0 0.25rem' }}>|</span>
        <button onClick={() => setInvert(!invert)} style={{ ...toolBtnStyle, background: invert ? '#0f62fe' : undefined }} title="Inverser"><i className="bi bi-circle-half"></i></button>
        <button onClick={resetView} style={toolBtnStyle} title="Réinitialiser"><i className="bi bi-arrow-repeat"></i></button>
        <span style={{ marginLeft: 'auto', fontSize: '0.6875rem', color: '#6f6f6f' }}>{Math.round(zoom * 100)}% | {fileName}</span>
      </div>

      {/* Image area */}
      <div ref={canvasRef} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '450px', overflow: 'hidden', padding: '1rem' }}>
        {isImage ? (
          <img src={imageUrl} alt={fileName} style={imageStyle} />
        ) : isDicom ? (
          <div style={{ textAlign: 'center', color: '#a8a8a8' }}>
            <i className="bi bi-file-medical" style={{ fontSize: '4rem', display: 'block', marginBottom: '1rem' }}></i>
            <p>Fichier DICOM détecté</p>
            <p style={{ fontSize: '0.75rem', marginTop: '0.5rem' }}>Pour un viewer DICOM complet, intégrez Cornerstone.js ou OHIF Viewer</p>
            <a href={imageUrl} target="_blank" style={{ color: '#78a9ff', marginTop: '1rem', display: 'inline-block' }}>Télécharger le fichier</a>
          </div>
        ) : (
          <div style={{ textAlign: 'center', color: '#a8a8a8' }}>
            <i className="bi bi-file-earmark" style={{ fontSize: '4rem', display: 'block', marginBottom: '1rem' }}></i>
            <p>{fileName}</p>
            <a href={imageUrl} target="_blank" style={{ color: '#78a9ff', marginTop: '1rem', display: 'inline-block' }}>Télécharger</a>
          </div>
        )}
      </div>

      {/* Info bar */}
      <div style={{ padding: '0.5rem 1rem', background: '#1c1c1c', borderTop: '1px solid #333', fontSize: '0.6875rem', color: '#6f6f6f', display: 'flex', gap: '2rem' }}>
        <span>Type: {fileType || 'inconnu'}</span>
        <span>Zoom: {Math.round(zoom * 100)}%</span>
        <span>Rotation: {rotation}°</span>
        {invert && <span style={{ color: '#78a9ff' }}>Inversé</span>}
      </div>
    </div>
  );
}

const toolBtnStyle: React.CSSProperties = {
  background: 'none', border: '1px solid #444', color: '#c6c6c6',
  padding: '0.375rem 0.5rem', cursor: 'pointer', borderRadius: '2px', fontSize: '0.875rem',
};