/**
 * Session Management Service
 * - JWT token blacklist (revocation)
 * - Server-side session timeout tracking
 * - In production, replace Map with Redis for distributed state
 */

// Blacklisted tokens (jti or raw token hash)
const tokenBlacklist = new Map<string, number>(); // token -> expiry timestamp

// Active sessions: userId -> last activity timestamp
const activeSessions = new Map<number, number>();

// Session timeout: 30 minutes of inactivity (server-side enforcement)
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;

// Cleanup interval: remove expired entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [token, expiry] of tokenBlacklist) {
    if (expiry < now) tokenBlacklist.delete(token);
  }
  for (const [userId, lastActivity] of activeSessions) {
    if (now - lastActivity > SESSION_TIMEOUT_MS * 2) activeSessions.delete(userId);
  }
}, 10 * 60 * 1000).unref();

/**
 * Blacklist a token (e.g., on logout or password change)
 */
export function blacklistToken(token: string, expiresInMs: number): void {
  tokenBlacklist.set(token, Date.now() + expiresInMs);
}

/**
 * Check if a token is blacklisted
 */
export function isTokenBlacklisted(token: string): boolean {
  const expiry = tokenBlacklist.get(token);
  if (!expiry) return false;
  if (expiry < Date.now()) {
    tokenBlacklist.delete(token);
    return false;
  }
  return true;
}

/**
 * Record user activity (call on each authenticated request)
 */
export function recordActivity(userId: number): void {
  activeSessions.set(userId, Date.now());
}

/**
 * Check if session has timed out (server-side)
 */
export function isSessionExpired(userId: number): boolean {
  const lastActivity = activeSessions.get(userId);
  if (!lastActivity) return false; // First request, allow
  return (Date.now() - lastActivity) > SESSION_TIMEOUT_MS;
}

/**
 * Invalidate all sessions for a user (e.g., password change)
 */
export function invalidateUserSessions(userId: number): void {
  activeSessions.delete(userId);
}

export default {
  blacklistToken,
  isTokenBlacklisted,
  recordActivity,
  isSessionExpired,
  invalidateUserSessions,
};
