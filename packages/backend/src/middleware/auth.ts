import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { UserRole, JWTPayload } from '../types/index.js';

const JWT_SECRET = process.env.JWT_SECRET || 'hospital_secret_key_2024';
const JWT_ALGORITHM = 'HS256' as const;

// OWASP A07 - Fail if no secret configured in production
if (process.env.NODE_ENV === 'production' && JWT_SECRET === 'hospital_secret_key_2024') {
  console.error('CRITICAL: JWT_SECRET must be set in production');
  process.exit(1);
}

export interface AuthRequest extends Request {
  user?: JWTPayload;
}

// OWASP A01 - Authentication
export const authenticate = (req: AuthRequest, res: Response, next: NextFunction): void => {
  const authHeader = req.headers.authorization;
  // Support token in query string for print routes (opened in new tab)
  const queryToken = req.query.token as string | undefined;
  
  let token: string | undefined;
  
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.substring(7);
  } else if (queryToken) {
    token = queryToken;
  }
  
  if (!token) {
    res.status(401).json({ error: 'Token requis' });
    return;
  }
  
  if (token.split('.').length !== 3) {
    res.status(401).json({ error: 'Format de token invalide' });
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
    
    req.user = decoded;
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
      // OWASP A09 - Log unauthorized access attempts
      console.warn(`[SECURITY] Unauthorized access attempt: user=${req.user?.username || 'unknown'} path=${req.path} required=${roles.join(',')}`);
      res.status(403).json({ error: 'Accès refusé' });
      return;
    }
    next();
  };
};

// OWASP A02 - Token generation with pinned algorithm
export const generateToken = (user: { id: number; username: string; role: UserRole }): string => {
  return jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { 
      algorithm: JWT_ALGORITHM,
      expiresIn: '8h', // Reduced from 24h for security
      issuer: 'hospital-erp',
      audience: 'hospital-erp-frontend',
    }
  );
};

export default { authenticate, authorize, generateToken };