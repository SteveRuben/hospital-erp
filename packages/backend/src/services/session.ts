/**
 * Session Management Service
 * - JWT token blacklist (revocation)
 * - Server-side session timeout tracking
 * - Uses Redis when REDIS_URL is configured, falls back to in-memory Map
 */

import RedisLib from 'ioredis';
// CJS/ESM interop fallback: some bundlers wrap the default export
const Redis = (RedisLib as any).default || RedisLib;

// Session timeout: 30 minutes of inactivity
const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const SESSION_TIMEOUT_SEC = Math.floor(SESSION_TIMEOUT_MS / 1000);

// Redis client (null if not configured)
let redis: any = null;

if (process.env.REDIS_URL) {
  try {
    redis = new (Redis as any)(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      retryStrategy: (times: number) => Math.min(times * 200, 5000),
    });
    redis.connect().then(() => {
      console.log('[SESSION] Redis connected — distributed session management active');
    }).catch((err: Error) => {
      console.warn('[SESSION] Redis connection failed, falling back to in-memory:', err.message);
      redis = null;
    });
  } catch {
    redis = null;
  }
} else {
  console.log('[SESSION] No REDIS_URL — using in-memory session store (single instance only)');
}

// In-memory fallback stores
const memBlacklist = new Map<string, number>();
const memSessions = new Map<number, number>();

// Cleanup for in-memory store
setInterval(() => {
  if (redis) return; // Redis handles TTL natively
  const now = Date.now();
  for (const [token, expiry] of memBlacklist) {
    if (expiry < now) memBlacklist.delete(token);
  }
  for (const [userId, lastActivity] of memSessions) {
    if (now - lastActivity > SESSION_TIMEOUT_MS * 2) memSessions.delete(userId);
  }
}, 10 * 60 * 1000).unref();

/**
 * Blacklist a token (e.g., on logout or password change)
 */
export async function blacklistToken(token: string, expiresInMs: number): Promise<void> {
  const ttlSec = Math.ceil(expiresInMs / 1000);
  if (redis) {
    await redis.set(`bl:${token}`, '1', 'EX', ttlSec).catch(() => {});
  } else {
    memBlacklist.set(token, Date.now() + expiresInMs);
  }
}

/**
 * Check if a token is blacklisted
 */
export async function isTokenBlacklisted(token: string): Promise<boolean> {
  if (redis) {
    const val = await redis.get(`bl:${token}`).catch(() => null);
    return val !== null;
  }
  const expiry = memBlacklist.get(token);
  if (!expiry) return false;
  if (expiry < Date.now()) { memBlacklist.delete(token); return false; }
  return true;
}

/**
 * Record user activity (call on each authenticated request)
 */
export async function recordActivity(userId: number): Promise<void> {
  if (redis) {
    await redis.set(`sess:${userId}`, String(Date.now()), 'EX', SESSION_TIMEOUT_SEC * 2).catch(() => {});
  } else {
    memSessions.set(userId, Date.now());
  }
}

/**
 * Check if session has timed out (server-side)
 */
export async function isSessionExpired(userId: number): Promise<boolean> {
  if (redis) {
    const val = await redis.get(`sess:${userId}`).catch(() => null);
    if (!val) return false; // First request
    return (Date.now() - parseInt(val)) > SESSION_TIMEOUT_MS;
  }
  const lastActivity = memSessions.get(userId);
  if (!lastActivity) return false;
  return (Date.now() - lastActivity) > SESSION_TIMEOUT_MS;
}

/**
 * Invalidate all sessions for a user (e.g., password change)
 */
export async function invalidateUserSessions(userId: number): Promise<void> {
  if (redis) {
    await redis.del(`sess:${userId}`).catch(() => {});
  } else {
    memSessions.delete(userId);
  }
}

export default {
  blacklistToken,
  isTokenBlacklisted,
  recordActivity,
  isSessionExpired,
  invalidateUserSessions,
};
