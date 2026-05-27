import { useState, useEffect, useRef, useCallback, useContext } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { io, type Socket } from 'socket.io-client';
import { AuthContext } from '../App';
import { useSnackbar } from '../components/Snackbar';
import {
  listMyChannels, getMessages, postMessage, markChannelRead, deleteChatMessage,
  createChannel, lookupUsers,
  type ChatChannel, type ChatMessage, type UserLookup,
} from '../services/api';

/**
 * Staff chat page. Channels in a left sidebar, messages in the main area,
 * input at the bottom. Socket.IO is the live transport; if it's down the
 * page still works through pure REST (manual refresh on focus).
 */

export default function Chat() {
  const { user } = useContext(AuthContext);
  const { channelId: channelIdParam } = useParams<{ channelId?: string }>();
  const navigate = useNavigate();
  const { showSnackbar } = useSnackbar();
  const [channels, setChannels] = useState<ChatChannel[]>([]);
  const [activeId, setActiveId] = useState<number | null>(channelIdParam ? Number(channelIdParam) : null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [showNewChannel, setShowNewChannel] = useState(false);
  const socketRef = useRef<Socket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const refreshChannels = useCallback(async () => {
    try { const { data } = await listMyChannels(); setChannels(data); }
    catch { /* axios interceptor handles 401 */ }
  }, []);

  // Initial channels load + URL sync
  useEffect(() => { refreshChannels(); }, [refreshChannels]);
  useEffect(() => { if (channelIdParam) setActiveId(Number(channelIdParam)); }, [channelIdParam]);

  // Socket.IO setup. Single connection for the page; subscribe to whichever
  // channel is currently active and unsub when it changes.
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;
    const socket = io({ auth: { token }, path: '/socket.io', transports: ['websocket', 'polling'] });
    socketRef.current = socket;
    socket.on('chat_message', (m: ChatMessage) => {
      // Only append if the message is for the channel currently open.
      // Other channels' unread counts will refresh on the next channels poll.
      setMessages(prev => (prev[0]?.channelId === m.channelId || prev.length === 0) && m.channelId === activeId ? [m, ...prev] : prev);
      // Refresh sidebar to update unread counters in non-active channels.
      if (m.channelId !== activeId) refreshChannels();
    });
    socket.on('chat_message_deleted', (payload: { id: number }) => {
      setMessages(prev => prev.filter(m => m.id !== payload.id));
    });
    return () => { socket.disconnect(); socketRef.current = null; };
    // activeId / refreshChannels intentionally not in deps — we manage subscription explicitly below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Subscribe to the active channel's room
  useEffect(() => {
    const s = socketRef.current;
    if (!s || !activeId) return;
    s.emit('chat:subscribe', activeId);
    return () => { s.emit('chat:unsubscribe', activeId); };
  }, [activeId]);

  // Load messages when the active channel changes, and mark as read
  useEffect(() => {
    if (!activeId) { setMessages([]); return; }
    (async () => {
      try {
        const { data } = await getMessages(activeId);
        setMessages(data);
        await markChannelRead(activeId);
        refreshChannels();
      } catch { /* ignore */ }
    })();
  }, [activeId, refreshChannels]);

  // Auto-scroll to bottom on new messages
  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.trim() || !activeId) return;
    try {
      await postMessage(activeId, draft.trim());
      setDraft('');
      // Optimistic: the socket will push our own message back, but if the socket
      // isn't connected we still want to see it. Pull a fresh page to be sure.
      const { data } = await getMessages(activeId);
      setMessages(data);
    } catch (err: any) {
      showSnackbar(err.response?.data?.error || 'Erreur d\'envoi', 'error');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Supprimer ce message ?')) return;
    try { await deleteChatMessage(id); setMessages(prev => prev.filter(m => m.id !== id)); }
    catch { showSnackbar('Erreur', 'error'); }
  };

  const activeChannel = channels.find(c => c.id === activeId);
  const ordered = [...messages].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  return (
    <div>
      <nav className="breadcrumb"><a href="/app">Accueil</a><span className="breadcrumb-separator">/</span><span>Discussion équipe</span></nav>
      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: '1rem', height: 'calc(100vh - 160px)' }}>
        {/* Sidebar */}
        <div className="tile" style={{ padding: '0.75rem', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div className="d-flex justify-between align-center mb-1">
            <h3 style={{ fontSize: '0.875rem', fontWeight: 600 }}>Canaux</h3>
            <button className="btn-icon" title="Nouveau canal" onClick={() => setShowNewChannel(true)}><i className="bi bi-plus-lg"></i></button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {channels.length === 0 && <div className="text-muted" style={{ fontSize: '0.75rem', padding: '1rem 0', textAlign: 'center' }}>Aucun canal</div>}
            {channels.map(c => (
              <div key={c.id} onClick={() => { setActiveId(c.id); navigate(`/app/chat/${c.id}`); }} style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', background: activeId === c.id ? 'var(--cds-interactive)' : 'transparent', color: activeId === c.id ? '#fff' : 'inherit', fontSize: '0.8125rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.125rem' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <i className={`bi bi-${c.type === 'dm' ? 'person' : c.type === 'service' ? 'building' : c.type === 'garde' ? 'shield' : 'hash'}`} style={{ flexShrink: 0 }}></i>
                  {c.name}
                </span>
                {c.unread > 0 && <span style={{ background: activeId === c.id ? '#fff' : 'var(--cds-support-error)', color: activeId === c.id ? 'var(--cds-interactive)' : '#fff', borderRadius: '8px', fontSize: '0.625rem', fontWeight: 600, minWidth: '18px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', lineHeight: 1 }}>{c.unread}</span>}
              </div>
            ))}
          </div>
        </div>

        {/* Main */}
        <div className="tile" style={{ padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {!activeChannel ? (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', color: 'var(--cds-text-secondary)' }}>
              <i className="bi bi-chat-dots" style={{ fontSize: '3rem', marginBottom: '0.5rem' }}></i>
              <div>Sélectionnez un canal pour commencer</div>
            </div>
          ) : (
            <>
              <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--cds-ui-03)' }}>
                <div style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                  <i className={`bi bi-${activeChannel.type === 'dm' ? 'person' : activeChannel.type === 'service' ? 'building' : activeChannel.type === 'garde' ? 'shield' : 'hash'}`} style={{ marginRight: '0.375rem' }}></i>
                  {activeChannel.name}
                </div>
                {activeChannel.description && <div className="text-muted" style={{ fontSize: '0.75rem' }}>{activeChannel.description}</div>}
              </div>
              <div style={{ flex: 1, overflowY: 'auto', padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {ordered.length === 0 && <div className="text-muted text-center" style={{ fontSize: '0.8125rem' }}>Aucun message — soyez le premier !</div>}
                {ordered.map(m => (
                  <div key={m.id} style={{ display: 'flex', flexDirection: 'column', alignItems: m.author.id === user?.id ? 'flex-end' : 'flex-start' }}>
                    <div style={{ background: m.author.id === user?.id ? 'var(--cds-interactive)' : 'var(--cds-ui-01)', color: m.author.id === user?.id ? '#fff' : 'inherit', padding: '0.5rem 0.75rem', borderRadius: '4px', maxWidth: '70%', position: 'relative' }}>
                      {m.author.id !== user?.id && <div style={{ fontSize: '0.6875rem', fontWeight: 600, marginBottom: '0.125rem', opacity: 0.8 }}>{m.author.prenom} {m.author.nom}</div>}
                      <div style={{ fontSize: '0.875rem', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{m.content}</div>
                      <div style={{ fontSize: '0.625rem', opacity: 0.7, marginTop: '0.25rem' }}>{new Date(m.createdAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</div>
                    </div>
                    {(m.author.id === user?.id || user?.role === 'admin') && (
                      <button onClick={() => handleDelete(m.id)} className="btn-icon" style={{ fontSize: '0.625rem', opacity: 0.5, marginTop: '0.125rem' }} title="Supprimer"><i className="bi bi-trash"></i></button>
                    )}
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>
              <form onSubmit={handleSend} style={{ padding: '0.75rem', borderTop: '1px solid var(--cds-ui-03)', display: 'flex', gap: '0.5rem' }}>
                <input type="text" className="form-input" placeholder="Écrire un message… (utilisez @username pour mentionner)" value={draft} onChange={e => setDraft(e.target.value)} style={{ flex: 1 }} />
                <button type="submit" className="btn-primary" disabled={!draft.trim()}><i className="bi bi-send"></i></button>
              </form>
            </>
          )}
        </div>
      </div>

      {showNewChannel && <NewChannelDialog onClose={() => setShowNewChannel(false)} onCreated={(c) => { setShowNewChannel(false); refreshChannels(); setActiveId(c.id); navigate(`/app/chat/${c.id}`); }} isAdmin={user?.role === 'admin'} />}
    </div>
  );
}

function NewChannelDialog({ onClose, onCreated, isAdmin }: { onClose: () => void; onCreated: (c: ChatChannel) => void; isAdmin: boolean }) {
  const [type, setType] = useState<'custom' | 'dm'>(isAdmin ? 'custom' : 'dm');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<UserLookup[]>([]);
  const [selected, setSelected] = useState<UserLookup[]>([]);
  const { showSnackbar } = useSnackbar();

  useEffect(() => {
    if (search.length < 2) { setResults([]); return; }
    let cancelled = false;
    lookupUsers(search).then(({ data }) => { if (!cancelled) setResults(data.filter(u => !selected.some(s => s.id === u.id))); }).catch(() => {});
    return () => { cancelled = true; };
  }, [search, selected]);

  const handleCreate = async () => {
    if (type === 'dm' && selected.length !== 1) { showSnackbar('Sélectionnez exactement 1 utilisateur', 'warning'); return; }
    if (type === 'custom' && (!name.trim() || selected.length === 0)) { showSnackbar('Nom et au moins 1 membre requis', 'warning'); return; }
    try {
      const computedName = type === 'dm' ? `${selected[0].prenom ?? ''} ${selected[0].nom ?? ''}`.trim() || selected[0].username : name.trim();
      const { data } = await createChannel({ type, name: computedName, description: description.trim() || undefined, member_ids: selected.map(s => s.id) });
      onCreated(data);
    } catch (err: any) {
      showSnackbar(err.response?.data?.error || 'Erreur de création', 'error');
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={e => e.stopPropagation()}>
        <div className="modal-header"><h3>Nouveau canal</h3><button className="btn-icon" onClick={onClose}><i className="bi bi-x-lg"></i></button></div>
        <div className="modal-body">
          {isAdmin && (
            <div className="form-group">
              <label className="form-label">Type</label>
              <select className="form-select" value={type} onChange={e => setType(e.target.value as 'custom' | 'dm')}>
                <option value="custom">Canal custom (groupe)</option>
                <option value="dm">Message direct (1:1)</option>
              </select>
            </div>
          )}
          {type === 'custom' && (
            <>
              <div className="form-group"><label className="form-label">Nom *</label><input className="form-input" value={name} onChange={e => setName(e.target.value)} placeholder="Réunion qualité" /></div>
              <div className="form-group"><label className="form-label">Description</label><input className="form-input" value={description} onChange={e => setDescription(e.target.value)} /></div>
            </>
          )}
          <div className="form-group">
            <label className="form-label">{type === 'dm' ? 'Utilisateur' : 'Membres'}</label>
            {selected.length > 0 && (
              <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                {selected.map(u => (
                  <span key={u.id} className="tag tag-blue" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                    {u.prenom} {u.nom} <button onClick={() => setSelected(prev => prev.filter(s => s.id !== u.id))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'inherit' }}>×</button>
                  </span>
                ))}
              </div>
            )}
            <input className="form-input" placeholder="Tapez un nom (2 caractères min)…" value={search} onChange={e => setSearch(e.target.value)} />
            {results.length > 0 && (
              <div style={{ border: '1px solid var(--cds-ui-03)', marginTop: '0.25rem', maxHeight: '160px', overflowY: 'auto' }}>
                {results.map(u => (
                  <div key={u.id} onClick={() => { setSelected(prev => type === 'dm' ? [u] : [...prev, u]); setSearch(''); setResults([]); }} style={{ padding: '0.5rem 0.75rem', cursor: 'pointer', fontSize: '0.8125rem', borderBottom: '1px solid var(--cds-ui-03)' }}>
                    <strong>{u.prenom} {u.nom}</strong> <span className="text-muted">@{u.username} · {u.role}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>Annuler</button>
          <button className="btn-primary" onClick={handleCreate}>Créer</button>
        </div>
      </div>
    </div>
  );
}
