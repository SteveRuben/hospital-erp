import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
  info: ErrorInfo | null;
}

/**
 * Filet de sécurité global. Sans lui, toute exception levée pendant le
 * rendu démonte l'arbre React et laisse un écran blanc — impossible à
 * diagnostiquer côté utilisateur. Ici on capture l'erreur, on la logge
 * (stack complète en console pour le support) et on affiche un message
 * lisible avec le détail technique repliable + un bouton de récupération.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Logge la stack côté navigateur pour le diagnostic.
    console.error('[ErrorBoundary] Rendu interrompu :', error, info.componentStack);
    this.setState({ info });
  }

  handleReset = () => {
    this.setState({ error: null, info: null });
  };

  render() {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <div style={{ maxWidth: '720px', margin: '4rem auto', padding: '0 1.5rem' }}>
        <div className="notification notification-error mb-2" style={{ alignItems: 'flex-start' }}>
          <i className="bi bi-exclamation-octagon-fill" style={{ fontSize: '1.5rem' }}></i>
          <div>
            <strong>Une erreur a interrompu l'affichage de cette page.</strong>
            <p style={{ marginTop: '0.25rem', fontSize: '0.875rem' }}>
              Rien n'a été perdu. Vous pouvez réessayer ou recharger la page. Si le problème
              persiste, transmettez le détail technique ci-dessous au support.
            </p>
          </div>
        </div>

        <details style={{ marginBottom: '1rem' }}>
          <summary style={{ cursor: 'pointer', fontSize: '0.8125rem', color: 'var(--cds-text-02, #525252)' }}>
            Détail technique
          </summary>
          <pre style={{
            marginTop: '0.5rem', padding: '0.75rem', background: 'var(--cds-ui-01, #f4f4f4)',
            borderRadius: '4px', fontSize: '0.75rem', overflow: 'auto', whiteSpace: 'pre-wrap',
          }}>
            {error.message}
            {info?.componentStack ?? ''}
          </pre>
        </details>

        <div className="d-flex gap-1">
          <button className="btn-primary" onClick={this.handleReset}>
            <i className="bi bi-arrow-counterclockwise"></i> Réessayer
          </button>
          <button className="btn-secondary" onClick={() => window.location.reload()}>
            <i className="bi bi-arrow-clockwise"></i> Recharger la page
          </button>
        </div>
      </div>
    );
  }
}
