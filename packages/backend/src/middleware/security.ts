import { Request, Response, NextFunction } from 'express';
import rateLimit from 'express-rate-limit';

// OWASP A01 - Broken Access Control: handled by auth.ts authorize()

// OWASP A02 - Cryptographic Failures: enforce HTTPS in production
export const enforceHttps = (req: Request, res: Response, next: NextFunction): void => {
  if (process.env.NODE_ENV === 'production' && req.headers['x-forwarded-proto'] !== 'https') {
    res.redirect(301, `https://${req.hostname}${req.url}`);
    return;
  }
  next();
};

// OWASP A03 - Injection: parameterized queries already used in all routes
// Additional: sanitize string inputs
export const sanitizeInput = (req: Request, _res: Response, next: NextFunction): void => {
  const sanitize = (obj: Record<string, unknown>): Record<string, unknown> => {
    const cleaned: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        // Strip null bytes, trim whitespace
        cleaned[key] = value.replace(/\0/g, '').trim();
      } else if (value && typeof value === 'object' && !Array.isArray(value)) {
        cleaned[key] = sanitize(value as Record<string, unknown>);
      } else {
        cleaned[key] = value;
      }
    }
    return cleaned;
  };

  if (req.body && typeof req.body === 'object') {
    req.body = sanitize(req.body);
  }
  next();
};

// OWASP A04 - Insecure Design: rate limiting
export const globalRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 500, // 500 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de requêtes, réessayez plus tard' },
});

// Strict rate limit for auth endpoints (brute force protection)
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 login attempts per 15 min
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives de connexion, réessayez dans 15 minutes' },
  keyGenerator: (req: Request) => {
    return req.ip || req.headers['x-forwarded-for'] as string || 'unknown';
  },
});

// OWASP A05 - Security Misconfiguration: security headers via helmet (in index.ts)

// OWASP A07 - Identification and Authentication Failures: password policy
export const validatePassword = (password: string): { valid: boolean; message?: string } => {
  if (password.length < 8) return { valid: false, message: 'Le mot de passe doit contenir au moins 8 caractères' };
  if (!/[A-Z]/.test(password)) return { valid: false, message: 'Le mot de passe doit contenir au moins une majuscule' };
  if (!/[a-z]/.test(password)) return { valid: false, message: 'Le mot de passe doit contenir au moins une minuscule' };
  if (!/[0-9]/.test(password)) return { valid: false, message: 'Le mot de passe doit contenir au moins un chiffre' };
  return { valid: true };
};

// OWASP A08 - Software and Data Integrity: validate content-type
export const validateContentType = (req: Request, res: Response, next: NextFunction): void => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const contentType = req.headers['content-type'] || '';
    const hasBody = req.headers['content-length'] && parseInt(req.headers['content-length']) > 0;
    if (hasBody && !contentType.includes('application/json')) {
      res.status(415).json({ error: 'Content-Type doit être application/json' });
      return;
    }
  }
  next();
};

// OWASP A09 - Security Logging and Monitoring: audit middleware
export const auditLog = (req: Request, _res: Response, next: NextFunction): void => {
  if (process.env.NODE_ENV !== 'test') {
    const authReq = req as Request & { user?: { id: number; username: string } };
    const logEntry = {
      timestamp: new Date().toISOString(),
      method: req.method,
      path: req.path,
      ip: req.ip || req.headers['x-forwarded-for'],
      userId: authReq.user?.id || 'anonymous',
      userAgent: req.headers['user-agent']?.substring(0, 100),
    };
    // Log sensitive operations
    if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
      console.log('[AUDIT]', JSON.stringify(logEntry));
    }
  }
  next();
};

// OWASP A10 - Server-Side Request Forgery: not applicable (no outbound requests)

// Error handler that doesn't leak stack traces
export const errorHandler = (err: Error, _req: Request, res: Response, _next: NextFunction): void => {
  console.error('[ERROR]', err.message);
  
  // Never expose internal error details in production
  if (process.env.NODE_ENV === 'production') {
    res.status(500).json({ error: 'Erreur interne du serveur' });
  } else {
    res.status(500).json({ error: err.message });
  }
};