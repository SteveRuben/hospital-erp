import { Request, Response, NextFunction, ErrorRequestHandler } from 'express';
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
// Additional: sanitize string inputs. Arrays MUST stay arrays (the previous
// version used Object.entries on the top-level body which turned arrays of
// objects into object-keyed-by-index, breaking every bulk endpoint —
// PUT /settings, PUT /habilitations/menu-order, etc. that send an array body).
export const sanitizeInput = (req: Request, _res: Response, next: NextFunction): void => {
  const sanitize = (value: unknown): unknown => {
    if (value === null || value === undefined) return value;
    if (typeof value === 'string') return value.replace(/\0/g, '').trim();
    if (Array.isArray(value)) return value.map(sanitize);
    if (typeof value === 'object') {
      const cleaned: Record<string, unknown> = {};
      for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
        cleaned[key] = sanitize(v);
      }
      return cleaned;
    }
    return value;
  };

  if (req.body !== undefined && req.body !== null) {
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

// Rate limit for OTP verification (brute force protection)
export const otpRateLimit = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 5, // 5 attempts per 5 min
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Trop de tentatives, réessayez dans 5 minutes' },
});

// OWASP A05 - Security Misconfiguration: security headers via helmet (in index.ts)

// OWASP A07 - Identification and Authentication Failures: password policy
export const validatePassword = (password: string): { valid: boolean; message?: string } => {
  if (password.length < 8) return { valid: false, message: 'Le mot de passe doit contenir au moins 8 caractères' };
  if (!/[A-Z]/.test(password)) return { valid: false, message: 'Le mot de passe doit contenir au moins une majuscule' };
  if (!/[a-z]/.test(password)) return { valid: false, message: 'Le mot de passe doit contenir au moins une minuscule' };
  if (!/[0-9]/.test(password)) return { valid: false, message: 'Le mot de passe doit contenir au moins un chiffre' };
  if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) return { valid: false, message: 'Le mot de passe doit contenir au moins un caractère spécial' };
  return { valid: true };
};

// OWASP A08 - Software and Data Integrity: validate content-type
export const validateContentType = (req: Request, res: Response, next: NextFunction): void => {
  if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
    const contentType = req.headers['content-type'] || '';
    const hasBody = req.headers['content-length'] && parseInt(req.headers['content-length']) > 0;
    if (hasBody && !contentType.includes('application/json') && !contentType.includes('multipart/form-data')) {
      res.status(415).json({ error: 'Content-Type doit être application/json ou multipart/form-data' });
      return;
    }
  }
  next();
};

// OWASP A09 - Security Logging: audit is handled by services/audit.ts in route handlers
// Console logging for monitoring only (not persisted to DB here)

// OWASP A10 - Server-Side Request Forgery: not applicable (no outbound requests)

// Error handler that doesn't leak stack traces
export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  console.error('[ERROR]', err.message);
  
  // Never expose internal error details in production
  if (process.env.NODE_ENV === 'production') {
    res.status(500).json({ error: 'Erreur interne du serveur' });
  } else {
    res.status(500).json({ error: err.message });
  }
};