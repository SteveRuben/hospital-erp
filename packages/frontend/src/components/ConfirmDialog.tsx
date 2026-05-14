import { useState, createContext, useContext, useCallback } from 'react';

interface ConfirmOptions {
  title?: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'warning' | 'info';
}

interface ConfirmContextType {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextType>({ confirm: () => Promise.resolve(false) });

export function useConfirm() {
  return useContext(ConfirmContext);
}

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<{ options: ConfirmOptions; resolve: (v: boolean) => void } | null>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      setState({ options, resolve });
    });
  }, []);

  const handleConfirm = () => { state?.resolve(true); setState(null); };
  const handleCancel = () => { state?.resolve(false); setState(null); };

  const variantColors = {
    danger: { bg: 'var(--cds-support-error)', icon: 'bi-exclamation-triangle' },
    warning: { bg: 'var(--cds-support-warning)', icon: 'bi-exclamation-circle' },
    info: { bg: 'var(--cds-interactive)', icon: 'bi-info-circle' },
  };

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {state && (
        <div className="modal-overlay" onClick={handleCancel} style={{ zIndex: 9999 }}>
          <div className="modal-container" onClick={e => e.stopPropagation()} style={{ maxWidth: '420px' }}>
            <div className="modal-body" style={{ padding: '2rem', textAlign: 'center' }}>
              <div style={{
                width: '56px', height: '56px', borderRadius: '50%',
                background: variantColors[state.options.variant || 'danger'].bg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 1.25rem', fontSize: '1.5rem', color: '#fff'
              }}>
                <i className={`bi ${variantColors[state.options.variant || 'danger'].icon}`}></i>
              </div>
              <h3 style={{ fontSize: '1.125rem', fontWeight: 600, marginBottom: '0.75rem' }}>
                {state.options.title || 'Confirmation'}
              </h3>
              <p style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)', lineHeight: 1.5 }}>
                {state.options.message}
              </p>
            </div>
            <div className="modal-footer" style={{ justifyContent: 'center', gap: '0.75rem', padding: '1rem 2rem 1.5rem' }}>
              <button className="btn-secondary" onClick={handleCancel} style={{ minWidth: '100px' }}>
                {state.options.cancelLabel || 'Annuler'}
              </button>
              <button
                className={state.options.variant === 'danger' ? 'btn-danger' : 'btn-primary'}
                onClick={handleConfirm}
                style={{ minWidth: '100px', background: state.options.variant === 'danger' ? 'var(--cds-support-error)' : undefined, color: '#fff' }}
              >
                {state.options.confirmLabel || 'Confirmer'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}
