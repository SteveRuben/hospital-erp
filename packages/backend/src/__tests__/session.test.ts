/**
 * Session Service Tests — in-memory fallback
 *
 * Covers the in-memory branch (REDIS_URL not set) which is the default
 * for local dev. Redis path tests would need ioredis-mock or a live
 * Redis container — out of scope here.
 *
 * Tested behaviors:
 * - blacklistToken / isTokenBlacklisted round-trip
 * - Unknown token → not blacklisted
 * - Expired blacklist entry → auto-cleaned, not blacklisted anymore
 * - recordActivity + isSessionExpired (fresh → not expired, stale → expired)
 * - First-request user (no record) → not expired (allow)
 * - invalidateUserSessions removes the user record
 * - Multiple users / tokens are independent
 * - All exports return Promises (async API)
 */

import { describe, it, expect, beforeAll, afterEach, beforeEach, jest } from '@jest/globals';

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // matches session.ts

let svc: typeof import('../services/session.js');

beforeAll(async () => {
  // Force in-memory mode by ensuring REDIS_URL is unset before import
  delete process.env.REDIS_URL;
  jest.resetModules();
  svc = await import('../services/session.js');
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('session — token blacklist', () => {
  it('blacklisted token is reported as blacklisted', async () => {
    const token = 'token-' + Math.random();
    await svc.blacklistToken(token, 60_000);
    expect(await svc.isTokenBlacklisted(token)).toBe(true);
  });

  it('unknown token is not blacklisted', async () => {
    expect(await svc.isTokenBlacklisted('never-seen-' + Math.random())).toBe(false);
  });

  it('expired blacklist entry is no longer blacklisted (auto-cleanup on read)', async () => {
    const token = 'token-' + Math.random();
    await svc.blacklistToken(token, 100); // 100ms TTL

    // Just past expiry
    const realNow = Date.now;
    jest.spyOn(Date, 'now').mockImplementation(() => realNow() + 200);

    expect(await svc.isTokenBlacklisted(token)).toBe(false);
  });

  it('multiple tokens are tracked independently', async () => {
    const a = 'token-a-' + Math.random();
    const b = 'token-b-' + Math.random();
    await svc.blacklistToken(a, 60_000);
    expect(await svc.isTokenBlacklisted(a)).toBe(true);
    expect(await svc.isTokenBlacklisted(b)).toBe(false);
  });

  it('blacklistToken returns a Promise (async API)', () => {
    const result = svc.blacklistToken('x', 1000);
    expect(result).toBeInstanceOf(Promise);
    return result; // ensure no unhandled rejection
  });
});

describe('session — activity tracking', () => {
  it('user with no recorded activity is NOT considered expired (first request)', async () => {
    const userId = 100_000 + Math.floor(Math.random() * 1000);
    expect(await svc.isSessionExpired(userId)).toBe(false);
  });

  it('user with recent activity is NOT expired', async () => {
    const userId = 200_000 + Math.floor(Math.random() * 1000);
    await svc.recordActivity(userId);
    expect(await svc.isSessionExpired(userId)).toBe(false);
  });

  it('user inactive longer than 30 minutes IS expired', async () => {
    const userId = 300_000 + Math.floor(Math.random() * 1000);
    await svc.recordActivity(userId);

    // Jump ahead 31 minutes
    const realNow = Date.now;
    jest.spyOn(Date, 'now').mockImplementation(() => realNow() + SESSION_TIMEOUT_MS + 60_000);

    expect(await svc.isSessionExpired(userId)).toBe(true);
  });

  it('user inactive exactly 29 minutes is still NOT expired', async () => {
    const userId = 400_000 + Math.floor(Math.random() * 1000);
    await svc.recordActivity(userId);

    const realNow = Date.now;
    jest.spyOn(Date, 'now').mockImplementation(() => realNow() + 29 * 60 * 1000);

    expect(await svc.isSessionExpired(userId)).toBe(false);
  });

  it('multiple users have independent activity records', async () => {
    const alice = 500_000 + Math.floor(Math.random() * 1000);
    const bob = 600_000 + Math.floor(Math.random() * 1000);

    await svc.recordActivity(alice);
    expect(await svc.isSessionExpired(alice)).toBe(false);
    expect(await svc.isSessionExpired(bob)).toBe(false); // never recorded

    // Bob now activates; advance time past timeout
    await svc.recordActivity(bob);
    const realNow = Date.now;
    jest.spyOn(Date, 'now').mockImplementation(() => realNow() + SESSION_TIMEOUT_MS + 60_000);

    // Both expired now (we mocked AFTER both recorded)
    expect(await svc.isSessionExpired(alice)).toBe(true);
    expect(await svc.isSessionExpired(bob)).toBe(true);
  });
});

describe('session — invalidation', () => {
  it('invalidateUserSessions removes the activity record', async () => {
    const userId = 700_000 + Math.floor(Math.random() * 1000);
    await svc.recordActivity(userId);
    expect(await svc.isSessionExpired(userId)).toBe(false);

    await svc.invalidateUserSessions(userId);

    // After invalidation, no record → first-request semantics → not expired
    expect(await svc.isSessionExpired(userId)).toBe(false);
  });

  it('invalidateUserSessions on unknown user does not throw', async () => {
    const userId = 999_999_999;
    await expect(svc.invalidateUserSessions(userId)).resolves.toBeUndefined();
  });

  it('invalidating one user does not affect others', async () => {
    const alice = 800_000 + Math.floor(Math.random() * 1000);
    const bob = 900_000 + Math.floor(Math.random() * 1000);
    await svc.recordActivity(alice);
    await svc.recordActivity(bob);

    await svc.invalidateUserSessions(alice);

    // Bob's record is intact — advance time and verify only Alice acts as fresh
    const realNow = Date.now;
    jest.spyOn(Date, 'now').mockImplementation(() => realNow() + SESSION_TIMEOUT_MS + 60_000);

    expect(await svc.isSessionExpired(alice)).toBe(false); // no record after invalidate
    expect(await svc.isSessionExpired(bob)).toBe(true);    // stale record
  });
});

describe('session — async API contract', () => {
  // Regression guard: the call sites in routes/auth.ts currently fire-and-forget
  // these Promises (lines 111, 159, 183, 185, 444, 445). If the API ever switches
  // back to sync, those sites break silently. Pin async by asserting Promise return.

  it('blacklistToken returns a Promise', () => {
    const r = svc.blacklistToken('p1', 1000);
    expect(r).toBeInstanceOf(Promise);
    return r;
  });

  it('isTokenBlacklisted returns a Promise', () => {
    const r = svc.isTokenBlacklisted('p2');
    expect(r).toBeInstanceOf(Promise);
    return r;
  });

  it('recordActivity returns a Promise', () => {
    const r = svc.recordActivity(1234567);
    expect(r).toBeInstanceOf(Promise);
    return r;
  });

  it('isSessionExpired returns a Promise', () => {
    const r = svc.isSessionExpired(1234568);
    expect(r).toBeInstanceOf(Promise);
    return r;
  });

  it('invalidateUserSessions returns a Promise', () => {
    const r = svc.invalidateUserSessions(1234569);
    expect(r).toBeInstanceOf(Promise);
    return r;
  });
});

describe('session — default export shape', () => {
  it('default export exposes all functions', () => {
    const def = svc.default;
    expect(def.blacklistToken).toBe(svc.blacklistToken);
    expect(def.isTokenBlacklisted).toBe(svc.isTokenBlacklisted);
    expect(def.recordActivity).toBe(svc.recordActivity);
    expect(def.isSessionExpired).toBe(svc.isSessionExpired);
    expect(def.invalidateUserSessions).toBe(svc.invalidateUserSessions);
  });
});
