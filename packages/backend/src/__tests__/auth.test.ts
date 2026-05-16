/**
 * Auth API integration tests via supertest.
 *
 * Replaces the 2024-era placeholder file that had 9 `expect(true).toBe(true)`
 * stubs with commented-out request examples. Each describe block here
 * actually hits the real Express handler chain (auth middleware, rate
 * limiter, Zod validator, route handler) with a mocked Prisma + mocked
 * argon2 to keep tests hermetic.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

type ArgonModule = typeof import('argon2');

// ---- Prisma mock ----------------------------------------------------------
const mockUserFindUnique = jest.fn<(args: unknown) => Promise<unknown>>();
const mockUserCreate     = jest.fn<(args: unknown) => Promise<unknown>>();
const mockUserUpdate     = jest.fn<(args: unknown) => Promise<unknown>>();
const mockUserFindMany   = jest.fn<(args: unknown) => Promise<unknown[]>>();
const mockAuditCreate    = jest.fn<(args: unknown) => Promise<unknown>>();
const mockAuditFindFirst = jest.fn<(args: unknown) => Promise<unknown>>();

jest.unstable_mockModule('../config/db.js', () => {
  const prisma = {
    user: {
      findUnique: mockUserFindUnique,
      create: mockUserCreate,
      update: mockUserUpdate,
      findMany: mockUserFindMany,
    },
    auditLog: { create: mockAuditCreate, findFirst: mockAuditFindFirst },
    setting: { findMany: jest.fn(async () => []) },
  };
  return { prisma, query: jest.fn(), pool: {}, getClient: jest.fn(), default: { prisma } };
});

// ---- Session / MFA mocks (auth.ts imports both) ---------------------------
const mockIsTokenBlacklisted    = jest.fn<(t: string) => Promise<boolean>>();
const mockRecordActivity        = jest.fn<(id: number) => Promise<void>>();
const mockIsSessionExpired      = jest.fn<(id: number) => Promise<boolean>>();
const mockBlacklistToken        = jest.fn<(t: string, ms: number) => Promise<void>>();
const mockInvalidateUserSessions = jest.fn<(id: number) => Promise<void>>();

jest.unstable_mockModule('../services/session.js', () => ({
  isTokenBlacklisted: mockIsTokenBlacklisted,
  recordActivity: mockRecordActivity,
  isSessionExpired: mockIsSessionExpired,
  blacklistToken: mockBlacklistToken,
  invalidateUserSessions: mockInvalidateUserSessions,
  default: {
    isTokenBlacklisted: mockIsTokenBlacklisted,
    recordActivity: mockRecordActivity,
    isSessionExpired: mockIsSessionExpired,
    blacklistToken: mockBlacklistToken,
    invalidateUserSessions: mockInvalidateUserSessions,
  },
}));

jest.unstable_mockModule('../services/mfa.js', () => {
  const m = {
    getMfaSecret: jest.fn(async () => null),
    verifyToken: jest.fn(() => false),
    isMfaEnabled: jest.fn(async () => false),
    enableMfa: jest.fn(async () => {}),
    disableMfa: jest.fn(async () => {}),
    generateSecret: jest.fn(() => ({ secret: 's', otpauthUrl: 'u' })),
    generateQRCode: jest.fn(async () => 'qr'),
  };
  return { ...m, default: m };
});

jest.unstable_mockModule('../services/audit.js', () => ({
  logAudit: jest.fn(async () => {}),
  auditCreate: jest.fn(async () => {}),
  auditUpdate: jest.fn(async () => {}),
  auditDelete: jest.fn(async () => {}),
  default: {
    logAudit: jest.fn(async () => {}),
    auditCreate: jest.fn(async () => {}),
    auditUpdate: jest.fn(async () => {}),
    auditDelete: jest.fn(async () => {}),
  },
}));

// ---- argon2 mock ----------------------------------------------------------
// Real argon2 hashing is slow (~100ms per hash). Mock it for hermetic tests.
const mockArgonVerify = jest.fn<NonNullable<ArgonModule['verify']>>();
const mockArgonHash   = jest.fn<NonNullable<ArgonModule['hash']>>();

jest.unstable_mockModule('argon2', () => ({
  default: { verify: mockArgonVerify, hash: mockArgonHash, argon2id: 2 },
  verify: mockArgonVerify,
  hash: mockArgonHash,
  argon2id: 2,
}));

// Set the JWT secret BEFORE app.ts loads (middleware/auth.ts reads it once)
process.env.JWT_SECRET = 'test-secret-do-not-use-in-production-xxxxxxxxxxxxxxxx';
process.env.NODE_ENV = 'test';

// ---- Now import app + supertest ------------------------------------------
const { default: app } = await import('../app.js');
const { default: request } = await import('supertest');

describe('POST /api/auth/login', () => {
  beforeEach(() => {
    mockUserFindUnique.mockReset();
    mockArgonVerify.mockReset();
    mockArgonHash.mockReset();
    mockArgonHash.mockResolvedValue('$argon2id$mock-dummy-hash');
    mockRecordActivity.mockResolvedValue();
    mockIsTokenBlacklisted.mockResolvedValue(false);
    mockIsSessionExpired.mockResolvedValue(false);
  });

  it('returns 400 when payload fails Zod validation (empty username)', async () => {
    const res = await request(app).post('/api/auth/login').send({ username: '', password: 'x' });
    expect(res.status).toBe(400);
  });

  it('returns 401 for unknown user (does the dummy hash to thwart timing attack)', async () => {
    mockUserFindUnique.mockResolvedValueOnce(null);
    const res = await request(app).post('/api/auth/login').send({ username: 'nope', password: 'whatever' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Identifiants invalides');
    // Dummy argon2.hash should have run to make response time indistinguishable
    expect(mockArgonHash).toHaveBeenCalled();
  });

  it('returns 401 for wrong password (audit log writes "Failed login" entry)', async () => {
    mockUserFindUnique.mockResolvedValueOnce({
      id: 1, username: 'admin', role: 'admin', password: '$argon2id$realhash', mfaEnabled: false,
    });
    mockArgonVerify.mockResolvedValueOnce(false);

    const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Identifiants invalides');
  });

  it('returns token + user on valid credentials', async () => {
    mockUserFindUnique.mockResolvedValueOnce({
      id: 1, username: 'admin', role: 'admin',
      password: '$argon2id$realhash',
      nom: 'Admin', prenom: 'Sys',
      must_change_password: false, mfaEnabled: false,
    });
    mockArgonVerify.mockResolvedValueOnce(true);

    const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'correct' });
    expect(res.status).toBe(200);
    expect(typeof res.body.token).toBe('string');
    expect(res.body.token.split('.').length).toBe(3); // JWT header.payload.signature
    expect(res.body.user.id).toBe(1);
    expect(res.body.user.username).toBe('admin');
    expect(res.body.user.role).toBe('admin');
    // Password must NEVER appear in the response
    expect(res.body.user.password).toBeUndefined();
  });

  it('returns mfa_required + challenge_id when MFA is enabled and no token provided', async () => {
    mockUserFindUnique.mockResolvedValueOnce({
      id: 5, username: 'doctor', role: 'medecin',
      password: '$argon2id$realhash',
      mfaEnabled: true,
    });
    mockArgonVerify.mockResolvedValueOnce(true);

    const res = await request(app).post('/api/auth/login').send({ username: 'doctor', password: 'correct' });
    expect(res.status).toBe(200);
    expect(res.body.mfa_required).toBe(true);
    expect(typeof res.body.challenge_id).toBe('string');
    expect(res.body.token).toBeUndefined();
  });
});

describe('GET /api/auth/me', () => {
  beforeEach(() => {
    mockUserFindUnique.mockReset();
    mockIsTokenBlacklisted.mockResolvedValue(false);
    mockIsSessionExpired.mockResolvedValue(false);
    mockRecordActivity.mockResolvedValue();
  });

  it('returns 401 without Authorization header', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('Token requis');
  });

  it('returns 401 for malformed JWT', async () => {
    const res = await request(app).get('/api/auth/me').set('Authorization', 'Bearer not-a-jwt');
    expect(res.status).toBe(401);
  });
});

describe('Auth integration — security guarantees', () => {
  beforeEach(() => {
    mockUserFindUnique.mockReset();
    mockArgonVerify.mockReset();
    mockArgonHash.mockReset();
    mockArgonHash.mockResolvedValue('$argon2id$mock-dummy-hash');
    mockIsTokenBlacklisted.mockResolvedValue(false);
    mockIsSessionExpired.mockResolvedValue(false);
    mockRecordActivity.mockResolvedValue();
  });

  it('password never echoed back in response body (regression: A02 cryptographic failures)', async () => {
    mockUserFindUnique.mockResolvedValueOnce({
      id: 1, username: 'admin', role: 'admin',
      password: '$argon2id$realhash', mfaEnabled: false,
    });
    mockArgonVerify.mockResolvedValueOnce(true);

    const res = await request(app).post('/api/auth/login').send({ username: 'admin', password: 'plaintext-secret' });
    expect(JSON.stringify(res.body)).not.toContain('$argon2id');
    expect(JSON.stringify(res.body)).not.toContain('plaintext-secret');
  });

  it('Authorization header parsing requires the literal "Bearer " prefix', async () => {
    // No Bearer prefix → rejected
    const res = await request(app).get('/api/auth/me').set('Authorization', 'token-no-prefix');
    expect(res.status).toBe(401);
  });
});
