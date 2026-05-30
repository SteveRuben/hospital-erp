/**
 * Session Management Service
 * - JWT token blacklist (revocation)
 * - Server-side session timeout tracking
 * - Uses Redis when REDIS_URL is configured, falls back to in-memory Map
 */

import RedisLib from 'ioredis';
import { prisma } from '../config/db.js';
// CJS/ESM interop fallback: some bundlers wrap the default export
const Redis = (RedisLib as any).default || RedisLib;

// Session inactivity timeout. The DB setting `session_timeout_minutes`
// (seeded at 30, editable in /app/parametres-generaux) is the source of
// truth. We cache it for 60 s so the lookup doesn't hit Postgres on every
// authenticated request — admins editing the value see it apply within a
// minute. If Prisma is unavailable (tests, boot races) we fall back to
// the historical default of 30 min.
const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;
const CACHE_TTL_MS = 60 * 1000;
let cachedTimeoutMs = DEFAULT_TIMEOUT_MS;
let cacheExpiresAt = 0;

export async function getSessionTimeoutMs(): Promise<number> {
  const now = Date.now();
  if (now < cacheExpiresAt) return cachedTimeoutMs;
  try {
    const row = await prisma.setting.findUnique({
      where: { cle: 'session_timeout_minutes' },
      select: { valeur: true },
    });
    const mins = Number(row?.valeur);
    cachedTimeoutMs = Number.isFinite(mins) && mins > 0 ? mins * 60 * 1000 : DEFAULT_TIMEOUT_MS;
  } catch {
    cachedTimeoutMs = DEFAULT_TIMEOUT_MS;
  }
  cacheExpiresAt = now + CACHE_TTL_MS;
  return cachedTimeoutMs;
}

// Invalidate the cache immediately — call after an admin edits the
// setting so the next request picks up the new value without waiting
// for the TTL to lapse.
export function invalidateSessionTimeoutCache(): void {
  cacheExpiresAt = 0;
}

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

// Cleanup for in-memory store. Use a fixed 12-hour bound rather than
// the configured timeout because this is only housekeeping for the
// in-memory fallback; sessions older than half a day are inert noise.
const MEM_GC_MAX_AGE_MS = 12 * 60 * 60 * 1000;
setInterval(() => {
  if (redis) return; // Redis handles TTL natively
  const now = Date.now();
  for (const [token, expiry] of memBlacklist) {
    if (expiry < now) memBlacklist.delete(token);
  }
  for (const [userId, lastActivity] of memSessions) {
    if (now - lastActivity > MEM_GC_MAX_AGE_MS) memSessions.delete(userId);
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
    const ttlSec = Math.floor((await getSessionTimeoutMs()) / 1000) * 2;
    await redis.set(`sess:${userId}`, String(Date.now()), 'EX', ttlSec).catch(() => {});
  } else {
    memSessions.set(userId, Date.now());
  }
}

/**
 * Check if session has timed out (server-side)
 */
export async function isSessionExpired(userId: number): Promise<boolean> {
  const timeoutMs = await getSessionTimeoutMs();
  if (redis) {
    const val = await redis.get(`sess:${userId}`).catch(() => null);
    if (!val) return false; // First request
    return (Date.now() - parseInt(val)) > timeoutMs;
  }
  const lastActivity = memSessions.get(userId);
  if (!lastActivity) return false;
  return (Date.now() - lastActivity) > timeoutMs;
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
