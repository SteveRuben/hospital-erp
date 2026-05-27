import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { io, Socket } from 'socket.io-client';
import { getInbox, getUnreadCount, markNotifRead, markAllNotifsRead, deleteNotif, type InboxNotification } from '../services/api';

/**
 * Bell-icon dropdown that drives the in-app notification inbox.
 *
 * Two update paths run in parallel for resilience:
 *   1. Socket.IO `notification` event from the gateway pushes new rows
 *      instantly. Optimal experience when connected.
 *   2. HTTP polling every 60s catches up if the socket dropped, the
 *      tab was backgrounded, or the gateway isn't attached (tests).
 *
 * Clicking a notification marks it read and navigates to its `link`.
 * The "tout marquer lu" action bulk-updates and refreshes the badge.
 */

const POLL_INTERVAL_MS = 60_000;

export default function NotificationsBell() {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<InboxNotification[]>([]);
  const navigate = useNavigate();
  const dropdownRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const [{ data: c }, { data: list }] = await Promise.all([getUnreadCount(), getInbox(20)]);
      setCount(c.count);
      setItems(list);
    } catch { /* offline / 401 handled by axios interceptor */ }
  }, []);

  // Initial fetch + polling fallback. Polling runs unconditionally because
  // Socket.IO connection state can flap (mobile network changes, sleep, etc.)
  // and the bell badge must stay correct even without realtime.
  useEffect(() => {
    refresh();
    const t = setInterval(refresh, POLL_INTERVAL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  // Realtime push. The socket is scoped to the logged-in user's room
  // (see backend/services/realtime.ts) so we receive only our own notifs.
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    let socket: Socket | null = null;
    try {
      socket = io({ auth: { token }, path: '/socket.io', transports: ['websocket', 'polling'] });
      socket.on('notification', (n: InboxNotification) => {
        setCount(c => c + 1);
        setItems(prev => [n, ...prev].slice(0, 20));
      });
      // Connection failures are non-fatal — polling covers them.
      socket.on('connect_error', () => { /* silent — polling fills the gap */ });
    } catch { /* socket.io may fail to init in some environments — ignore */ }
    return () => { socket?.disconnect(); };
  }, []);

  // Click-outside to close.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const handleClick = async (n: InboxNotification) => {
    if (!n.read) {
      try { await markNotifRead(n.id); } catch { /* ignore */ }
      setItems(prev => prev.map(it => it.id === n.id ? { ...it, read: true } : it));
      setCount(c => Math.max(0, c - 1));
    }
    setOpen(false);
    if (n.link) navigate(n.link.replace(/^\/app/, '/app')); // SPA path passthrough
  };

  const handleMarkAll = async () => {
    try {
      await markAllNotifsRead();
      setItems(prev => prev.map(it => ({ ...it, read: true })));
      setCount(0);
    } catch { /* ignore */ }
  };

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    try { await deleteNotif(id); } catch { /* ignore */ }
    setItems(prev => prev.filter(it => it.id !== id));
    refresh();
  };

  const fmtTime = (iso: string): string => {
    const diff = Date.now() - new Date(iso).getTime();
    const m = Math.floor(diff / 60_000);
    if (m < 1) return 'à l\'instant';
    if (m < 60) return `il y a ${m} min`;
    const h = Math.floor(m / 60);
    if (h < 24) return `il y a ${h} h`;
    return new Date(iso).toLocaleDateString('fr-FR');
  };

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      <button title="Notifications" onClick={() => setOpen(o => !o)} style={{ position: 'relative' }}>
        <i className="bi bi-bell"></i>
        {count > 0 && (
          <span style={{ position: 'absolute', top: 2, right: 2, background: 'var(--cds-support-error)', color: '#fff', borderRadius: '8px', fontSize: '0.625rem', fontWeight: 600, minWidth: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', lineHeight: 1 }}>
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, width: '360px', maxHeight: '500px', background: 'var(--cds-ui-02)', border: '1px solid var(--cds-ui-03)', boxShadow: '0 4px 20px rgba(0,0,0,0.15)', zIndex: 1000, display: 'flex', flexDirection: 'column', color: 'var(--cds-text-primary)' }}>
          <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--cds-ui-03)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong style={{ fontSize: '0.875rem' }}>Notifications</strong>
            {count > 0 && <button onClick={handleMarkAll} style={{ background: 'none', border: 'none', color: 'var(--cds-interactive)', fontSize: '0.75rem', cursor: 'pointer' }}>Tout marquer lu</button>}
          </div>
          <div style={{ overflowY: 'auto', flex: 1 }}>
            {items.length === 0 && (
              <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--cds-text-secondary)', fontSize: '0.8125rem' }}>
                <i className="bi bi-inbox" style={{ fontSize: '1.5rem', display: 'block', marginBottom: '0.5rem' }}></i>
                Aucune notification
              </div>
            )}
            {items.map(n => (
              <div key={n.id} onClick={() => handleClick(n)} style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--cds-ui-03)', cursor: n.link ? 'pointer' : 'default', background: n.read ? 'transparent' : 'var(--cds-ui-01)', display: 'flex', gap: '0.5rem', alignItems: 'flex-start' }}>
                {!n.read && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--cds-interactive)', marginTop: '0.5rem', flexShrink: 0 }}></div>}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.8125rem', fontWeight: n.read ? 400 : 600, marginBottom: '0.125rem' }}>{n.title}</div>
                  {n.body && <div style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{n.body}</div>}
                  <div style={{ fontSize: '0.6875rem', color: 'var(--cds-text-placeholder)', marginTop: '0.25rem' }}>{fmtTime(n.createdAt)}</div>
                </div>
                <button onClick={(e) => handleDelete(e, n.id)} title="Supprimer" style={{ background: 'none', border: 'none', color: 'var(--cds-text-placeholder)', cursor: 'pointer', padding: '0.25rem', fontSize: '0.75rem' }}><i className="bi bi-x"></i></button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
