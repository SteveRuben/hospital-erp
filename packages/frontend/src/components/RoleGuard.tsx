import { useContext } from 'react';
import { AuthContext } from '../App';
import type { UserRole } from '../types';

interface RoleGuardProps {
  roles: UserRole[];
  children: React.ReactNode;
  fallback?: React.ReactNode;
}

export default function RoleGuard({ roles, children, fallback }: RoleGuardProps) {
  const { user } = useContext(AuthContext);

  if (!user || !roles.includes(user.role)) {
    return fallback ? <>{fallback}</> : (
      <div style={{ textAlign: 'center', padding: '4rem 2rem' }}>
        <i className="bi bi-shield-lock" style={{ fontSize: '3rem', color: 'var(--cds-ui-04)', display: 'block', marginBottom: '1rem' }}></i>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 400, marginBottom: '0.5rem' }}>Accès refusé</h2>
        <p className="text-muted">Vous n'avez pas les permissions nécessaires pour accéder à cette page.</p>
        <p className="text-muted" style={{ fontSize: '0.75rem', marginTop: '0.5rem' }}>Rôle requis : {roles.join(', ')}</p>
      </div>
    );
  }

  return <>{children}</>;
}