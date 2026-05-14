import { useState, useEffect, createContext, useContext, useCallback } from 'react';

type SnackbarType = 'success' | 'error' | 'warning' | 'info';

interface SnackbarMessage {
  id: number;
  message: string;
  type: SnackbarType;
  duration: number;
}

interface SnackbarContextType {
  showSnackbar: (message: string, type?: SnackbarType, duration?: number) => void;
}

const SnackbarContext = createContext<SnackbarContextType>({ showSnackbar: () => {} });

export function useSnackbar() {
  return useContext(SnackbarContext);
}

let nextId = 0;

export function SnackbarProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<SnackbarMessage[]>([]);

  const showSnackbar = useCallback((message: string, type: SnackbarType = 'info', duration = 5000) => {
    const id = nextId++;
    setMessages(prev => [...prev, { id, message, type, duration }]);
  }, []);

  const dismiss = useCallback((id: number) => {
    setMessages(prev => prev.filter(m => m.id !== id));
  }, []);

  return (
    <SnackbarContext.Provider value={{ showSnackbar }}>
      {children}
      <div style={{ position: 'fixed', bottom: '1.5rem', right: '1.5rem', zIndex: 10000, display: 'flex', flexDirection: 'column', gap: '0.5rem', maxWidth: '400px' }}>
        {messages.map(msg => (
          <SnackbarItem key={msg.id} msg={msg} onDismiss={dismiss} />
        ))}
      </div>
    </SnackbarContext.Provider>
  );
}

function SnackbarItem({ msg, onDismiss }: { msg: SnackbarMessage; onDismiss: (id: number) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDismiss(msg.id), msg.duration);
    return () => clearTimeout(timer);
  }, [msg.id, msg.duration, onDismiss]);

  const colors: Record<SnackbarType, { bg: string; border: string; icon: string }> = {
    success: { bg: '#d4edda', border: '#28a745', icon: 'bi-check-circle-fill' },
    error: { bg: '#f8d7da', border: '#dc3545', icon: 'bi-exclamation-triangle-fill' },
    warning: { bg: '#fff3cd', border: '#ffc107', icon: 'bi-exclamation-circle-fill' },
    info: { bg: '#d1ecf1', border: '#17a2b8', icon: 'bi-info-circle-fill' },
  };

  const c = colors[msg.type];

  return (
    <div style={{
      background: c.bg, borderLeft: `4px solid ${c.border}`, padding: '0.875rem 1rem',
      borderRadius: '4px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)', display: 'flex',
      alignItems: 'center', gap: '0.75rem', animation: 'slideInRight 0.3s ease',
      fontSize: '0.8125rem', lineHeight: 1.4,
    }}>
      <i className={`bi ${c.icon}`} style={{ color: c.border, fontSize: '1.125rem', flexShrink: 0 }}></i>
      <span style={{ flex: 1 }}>{msg.message}</span>
      <button onClick={() => onDismiss(msg.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem', color: '#666', fontSize: '1rem' }}>×</button>
    </div>
  );
}
