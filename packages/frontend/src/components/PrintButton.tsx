import { useState } from 'react';

interface PrintButtonProps {
  url: string;
  label?: string;
  icon?: string;
  className?: string;
}

export default function PrintButton({ url, label = 'Imprimer', icon = 'bi-printer', className = 'btn-ghost btn-sm' }: PrintButtonProps) {
  const [status, setStatus] = useState<'idle' | 'checking' | 'printing' | 'error'>('idle');

  const handlePrint = async () => {
    setStatus('checking');

    // Open print window
    const printWindow = window.open(url, '_blank', 'width=800,height=600');

    if (!printWindow) {
      setStatus('error');
      alert('Impossible d\'ouvrir la fenêtre d\'impression. Vérifiez que les popups ne sont pas bloqués.');
      setTimeout(() => setStatus('idle'), 2000);
      return;
    }

    // Wait for content to load then trigger print
    setStatus('printing');
    printWindow.onload = () => {
      setTimeout(() => {
        try {
          printWindow.print();
          setStatus('idle');
        } catch (err) {
          console.error('Print error:', err);
          setStatus('error');
          setTimeout(() => setStatus('idle'), 3000);
        }
      }, 500);
    };

    // Fallback if onload doesn't fire
    setTimeout(() => {
      if (status === 'printing') setStatus('idle');
    }, 5000);
  };

  return (
    <button className={className} onClick={handlePrint} disabled={status !== 'idle'} title={label}>
      {status === 'idle' && <><i className={`bi ${icon}`}></i> {label}</>}
      {status === 'checking' && <><i className="bi bi-hourglass-split"></i> Détection...</>}
      {status === 'printing' && <><i className="bi bi-printer"></i> Impression...</>}
      {status === 'error' && <><i className="bi bi-exclamation-triangle"></i> Erreur</>}
    </button>
  );
}

// Hook to detect if printing is available
export function usePrintAvailable(): boolean {
  // window.print is always available in browsers
  // But we can check if the browser supports the Print API
  return typeof window !== 'undefined' && typeof window.print === 'function';
}

// Direct print utility
export function printUrl(url: string) {
  const w = window.open(url, '_blank');
  if (w) {
    w.onload = () => setTimeout(() => w.print(), 500);
  } else {
    alert('Popups bloqués. Autorisez les popups pour imprimer.');
  }
}