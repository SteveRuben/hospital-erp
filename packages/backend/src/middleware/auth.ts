import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole, JWTPayload } from '../types/index.js';
import { isTokenBlacklisted, recordActivity, isSessionExpired } from '../services/session.js';

const JWT_SECRET = process.env.JWT_SECRET || 'hospital_secret_key_2024';
const JWT_ALGORITHM = 'HS256' as const;

// OWASP A07 - Fail if no secret configured in production
if (process.env.NODE_ENV === 'production' && JWT_SECRET === 'hospital_secret_key_2024') {
  console.error('CRITICAL: JWT_SECRET must be set in production');
  process.exit(1);
}

export interface AuthRequest extends Request {
  user?: JWTPayload;
  token?: string;
}

// OWASP A01 - Authentication with session management (async for Redis)
export const authenticate = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  const authHeader = req.headers.authorization;
  
  let token: string | undefined;
  
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  }
  
  if (!token) {
    res.status(401).json({ error: 'Token requis' });
    return;
  }
  
  if (token.split('.').length !== 3) {
    res.status(401).json({ error: 'Format de token invalide' });
    return;
  }

  // Check token blacklist (revoked tokens)
  if (await isTokenBlacklisted(token)) {
    res.status(401).json({ error: 'Session expirée, veuillez vous reconnecter' });
    return;
  }

  try {
    // OWASP A02 - Pin algorithm to prevent algorithm confusion attacks
    const decoded = jwt.verify(token, JWT_SECRET, { 
      algorithms: [JWT_ALGORITHM],
      maxAge: '24h',
    }) as JWTPayload;
    
    // Validate payload structure
    if (!decoded.id || !decoded.username || !decoded.role) {
      res.status(401).json({ error: 'Token malformé' });
      return;
    }

    // Enforce the forced first-login password change server-side. While the
    // token carries mcp=true, only the endpoints needed to complete the change
    // (or to sign out) are reachable — every PHI/data route is blocked even if
    // the client bypasses the frontend guard and calls the API directly.
    if (decoded.mcp === true) {
      const path = req.originalUrl.split('?')[0];
      const allowed = ['/api/auth/change-password', '/api/auth/me', '/api/auth/logout'];
      if (!allowed.includes(path)) {
        res.status(403).json({ error: 'Vous devez changer votre mot de passe avant de continuer', code: 'PASSWORD_CHANGE_REQUIRED' });
        return;
      }
    }

    // Server-side session timeout check
    if (await isSessionExpired(decoded.id)) {
      res.status(401).json({ error: 'Session expirée par inactivité' });
      return;
    }
    
    // Record activity for session timeout tracking
    await recordActivity(decoded.id);
    
    req.user = decoded;
    req.token = token;
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      res.status(401).json({ error: 'Token expiré' });
    } else {
      res.status(401).json({ error: 'Token invalide' });
    }
  }
};

// OWASP A01 - Authorization
export const authorize = (...roles: UserRole[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role)) {
      console.warn(`[SECURITY] Unauthorized access attempt: user=${req.user?.username || 'unknown'} path=${req.path} required=${roles.join(',')}`);
      res.status(403).json({ error: 'Accès refusé' });
      return;
    }
    next();
  };
};

// OWASP A02 - Token generation with pinned algorithm.
// `mustChangePassword` stamps an `mcp` claim so the authenticate middleware
// can gate the session until the forced first-login change is done. Omitted
// when false to keep the token small and avoid a stale claim after the change
// (change-password issues a fresh token without it).
export const generateToken = (user: { id: number; username: string; role: UserRole }, mustChangePassword = false): string => {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role, ...(mustChangePassword ? { mcp: true } : {}) },
    JWT_SECRET,
    {
      algorithm: JWT_ALGORITHM,
      expiresIn: '8h',
      issuer: 'hospital-erp',
      audience: 'hospital-erp-frontend',
    }
  );
};

export default { authenticate, authorize, generateToken };
