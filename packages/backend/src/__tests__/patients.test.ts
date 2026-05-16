/**
 * Patients API integration tests via supertest.
 *
 * Replaces the placeholder file. Uses the same module-mock pattern as
 * auth.test.ts: mock prisma + session + audit before importing app.ts.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import jwt from 'jsonwebtoken';

// ---- Prisma mock ----------------------------------------------------------
const mockPatientFindMany   = jest.fn<(args?: unknown) => Promise<unknown[]>>();
const mockPatientFindUnique = jest.fn<(args: unknown) => Promise<unknown>>();
const mockPatientCount      = jest.fn<(args?: unknown) => Promise<number>>();
const mockPatientCreate     = jest.fn<(args: unknown) => Promise<unknown>>();
const mockPatientUpdate     = jest.fn<(args: unknown) => Promise<unknown>>();
const mockQueryRaw          = jest.fn<(...a: unknown[]) => Promise<unknown[]>>();
const mockSettingFindMany   = jest.fn<(args?: unknown) => Promise<unknown[]>>();

jest.unstable_mockModule('../config/db.js', () => {
  const prisma = {
    patient: {
      findMany: mockPatientFindMany,
      findUnique: mockPatientFindUnique,
      count: mockPatientCount,
      create: mockPatientCreate,
      update: mockPatientUpdate,
    },
    consultation: { findMany: jest.fn(async () => []), count: jest.fn(async () => 0) },
    examen: { findMany: jest.fn(async () => []), count: jest.fn(async () => 0) },
    recette: { findMany: jest.fn(async () => []) },
    document: { findMany: jest.fn(async () => []) },
    setting: { findMany: mockSettingFindMany },
    auditLog: { create: jest.fn() },
    $queryRaw: mockQueryRaw,
  };
  return { prisma, query: jest.fn(), pool: {}, getClient: jest.fn(), default: { prisma } };
});

// session mock — non-medecin roles can bypass canAccessPatient's DB check entirely
const mockIsTokenBlacklisted    = jest.fn<(t: string) => Promise<boolean>>();
const mockRecordActivity        = jest.fn<(id: number) => Promise<void>>();
const mockIsSessionExpired      = jest.fn<(id: number) => Promise<boolean>>();
jest.unstable_mockModule('../services/session.js', () => ({
  isTokenBlacklisted: mockIsTokenBlacklisted,
  recordActivity: mockRecordActivity,
  isSessionExpired: mockIsSessionExpired,
  blacklistToken: jest.fn(async () => {}),
  invalidateUserSessions: jest.fn(async () => {}),
  default: {},
}));

jest.unstable_mockModule('../services/audit.js', () => ({
  logAudit: jest.fn(async () => {}),
  auditCreate: jest.fn(async () => {}),
  auditUpdate: jest.fn(async () => {}),
  auditDelete: jest.fn(async () => {}),
  default: {},
}));

// reference id generator — return a stable test value
jest.unstable_mockModule('../services/reference.js', () => ({
  generatePatientReferenceId: jest.fn(async () => 'TEST-PAT-0001'),
  generateReference: jest.fn(async () => 'TEST-0001'),
  invalidateCache: jest.fn(),
  default: {},
}));

const JWT_SECRET = 'test-secret-do-not-use-in-production-xxxxxxxxxxxxxxxx';
process.env.JWT_SECRET = JWT_SECRET;
process.env.NODE_ENV = 'test';

const { default: app } = await import('../app.js');
const { default: request } = await import('supertest');

function adminToken(): string {
  return jwt.sign(
    { id: 1, username: 'admin', role: 'admin' },
    JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '8h', issuer: 'hospital-erp', audience: 'hospital-erp-frontend' },
  );
}

function receptionToken(): string {
  return jwt.sign(
    { id: 4, username: 'reception1', role: 'reception' },
    JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '8h', issuer: 'hospital-erp', audience: 'hospital-erp-frontend' },
  );
}

function comptableToken(): string {
  return jwt.sign(
    { id: 3, username: 'comptable1', role: 'comptable' },
    JWT_SECRET,
    { algorithm: 'HS256', expiresIn: '8h', issuer: 'hospital-erp', audience: 'hospital-erp-frontend' },
  );
}

describe('GET /api/patients', () => {
  beforeEach(() => {
    mockPatientFindMany.mockReset();
    mockPatientCount.mockReset();
    mockIsTokenBlacklisted.mockResolvedValue(false);
    mockIsSessionExpired.mockResolvedValue(false);
    mockRecordActivity.mockResolvedValue();
  });

  it('returns 401 without Authorization header', async () => {
    const res = await request(app).get('/api/patients');
    expect(res.status).toBe(401);
  });

  it('returns paginated results with total + page + totalPages', async () => {
    mockPatientCount.mockResolvedValueOnce(42);
    mockPatientFindMany.mockResolvedValueOnce([
      { id: 1, nom: 'Dupont', prenom: 'Jean' },
      { id: 2, nom: 'Martin', prenom: 'Marie' },
    ]);
    const res = await request(app).get('/api/patients?page=1&limit=20').set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.total).toBe(42);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(20);
    expect(res.body.totalPages).toBe(3); // ceil(42 / 20)
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body.data.length).toBe(2);
  });

  it('caps limit at 100 to prevent unbounded responses', async () => {
    mockPatientCount.mockResolvedValueOnce(0);
    mockPatientFindMany.mockResolvedValueOnce([]);
    const res = await request(app).get('/api/patients?limit=99999').set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.limit).toBe(100);
  });
});

describe('POST /api/patients', () => {
  beforeEach(() => {
    mockPatientCreate.mockReset();
    mockIsTokenBlacklisted.mockResolvedValue(false);
    mockIsSessionExpired.mockResolvedValue(false);
    mockRecordActivity.mockResolvedValue();
  });

  it('returns 401 without Authorization header', async () => {
    const res = await request(app).post('/api/patients').send({ nom: 'X', prenom: 'Y' });
    expect(res.status).toBe(401);
  });

  it('returns 403 for comptable role (only admin/medecin/reception can create)', async () => {
    const res = await request(app)
      .post('/api/patients')
      .set('Authorization', `Bearer ${comptableToken()}`)
      .send({ nom: 'Dupont', prenom: 'Jean' });
    expect(res.status).toBe(403);
  });

  it('returns 400 when Zod schema rejects empty nom', async () => {
    const res = await request(app)
      .post('/api/patients')
      .set('Authorization', `Bearer ${receptionToken()}`)
      .send({ nom: '', prenom: 'Jean' });
    expect(res.status).toBe(400);
  });

  it('returns 201 + the created row on valid input', async () => {
    mockPatientCreate.mockResolvedValueOnce({
      id: 99, nom: 'Dupont', prenom: 'Jean', referenceId: 'TEST-PAT-0001',
    });
    const res = await request(app)
      .post('/api/patients')
      .set('Authorization', `Bearer ${receptionToken()}`)
      .send({ nom: 'Dupont', prenom: 'Jean' });
    expect(res.status).toBe(201);
    expect(res.body.id).toBe(99);
    expect(res.body.referenceId).toBe('TEST-PAT-0001');
  });
});

describe('GET /api/patients/:id — IDOR enforcement', () => {
  beforeEach(() => {
    mockPatientFindUnique.mockReset();
    mockQueryRaw.mockReset();
    mockIsTokenBlacklisted.mockResolvedValue(false);
    mockIsSessionExpired.mockResolvedValue(false);
    mockRecordActivity.mockResolvedValue();
  });

  it('admin can read any patient (no canAccessPatient DB check)', async () => {
    mockPatientFindUnique.mockResolvedValueOnce({ id: 42, nom: 'Test', prenom: 'Patient' });
    const res = await request(app).get('/api/patients/42').set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(42);
  });

  it('404 when patient does not exist (admin role, so access check passes)', async () => {
    mockPatientFindUnique.mockResolvedValueOnce(null);
    const res = await request(app).get('/api/patients/99999').set('Authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(404);
  });
});
