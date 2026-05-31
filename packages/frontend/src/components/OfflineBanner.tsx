import { useEffect, useState } from 'react';
import { count as queueCount, replay } from '../lib/offlineQueue';

/**
 * Mince bandeau au-dessus du contenu — affiché uniquement quand le
 * navigateur est offline OU quand des mutations attendent en queue.
 * Permet à l'utilisateur de comprendre que ses derniers POSTs ne sont
 * pas encore arrivés au serveur et de lancer un replay manuel s'il
 * sait que la connexion est revenue.
 */
export default function OfflineBanner() {
  const [online, setOnline] = useState(navigator.onLine);
  const [pending, setPending] = useState(0);
  const [replaying, setReplaying] = useState(false);
  const [lastResult, setLastResult] = useState<string | null>(null);

  const refresh = async () => {
    try { setPending(await queueCount()); } catch { setPending(0); }
  };

  useEffect(() => {
    refresh();
    const onOnline = async () => {
      setOnline(true);
      // Auto-replay on reconnect — typical UX: user closes laptop, opens
      // it later, the queue drains without any explicit action.
      const r = await replay();
      setLastResult(r.failed > 0
        ? `${r.sent} envoyé(s), ${r.failed} en échec`
        : `${r.sent} envoyé(s)`);
      await refresh();
    };
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    const interval = setInterval(refresh, 5000);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      clearInterval(interval);
    };
  }, []);

  const manualReplay = async () => {
    if (replaying) return;
    setReplaying(true);
    try {
      const r = await replay();
      setLastResult(`${r.sent} envoyé(s), ${r.failed} en échec`);
      await refresh();
    } finally { setReplaying(false); }
  };

  if (online && pending === 0) return null;

  return (
    <div role="status" style={{
      background: online ? 'var(--cds-support-warning)' : 'var(--cds-support-error)',
      color: '#fff',
      padding: '0.5rem 1rem',
      fontSize: '0.8125rem',
      display: 'flex',
      alignItems: 'center',
      gap: '0.75rem',
      position: 'sticky',
      top: 0,
      zIndex: 9000,
    }}>
      <i className={`bi ${online ? 'bi-arrow-clockwise' : 'bi-wifi-off'}`}></i>
      <span>
        {!online && (
          <strong>Mode hors-ligne</strong>
        )}
        {!online && pending > 0 && ' — '}
        {pending > 0 && (
          <>
            <strong>{pending}</strong> changement{pending > 1 ? 's' : ''} en attente d'envoi.
          </>
        )}
        {online && pending === 0 && 'Connexion rétablie.'}
        {lastResult && <span style={{ marginLeft: '0.5rem', opacity: 0.85 }}>({lastResult})</span>}
      </span>
      {online && pending > 0 && (
        <button onClick={manualReplay} disabled={replaying}
          style={{ marginLeft: 'auto', background: 'rgba(255,255,255,0.2)', border: '1px solid rgba(255,255,255,0.4)', color: '#fff', padding: '0.25rem 0.625rem', cursor: 'pointer', fontSize: '0.75rem' }}>
          {replaying ? 'Envoi…' : 'Renvoyer maintenant'}
        </button>
      )}
    </div>
  );
}
