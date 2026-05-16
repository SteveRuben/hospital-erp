/**
 * Resource Access Middleware Tests — OWASP A01 residual coverage.
 *
 * requireResourceAccess(model) closes the gap left by requirePatientAccess:
 * PUT and DELETE /:id routes use the RESOURCE id (allergieId, etc.), not
 * the patient id. The middleware loads the row, reads its patient_id, then
 * delegates to canAccessPatient.
 *
 * Asserts:
 *   - 401 when no req.user
 *   - 400 for invalid resource id
 *   - 404-equivalent pass-through (next()) when the row doesn't exist
 *   - admin/reception/comptable bypass via canAccessPatient short-circuit
 *   - medecin WITH attribution → next()
 *   - medecin WITHOUT attribution → 403 + audit_log access_denied row
 *   - Prisma lookup failure → 500 (no false next/403)
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { Response, NextFunction } from 'express';

const mockCanAccess = jest.fn<(user: unknown, patientId: number) => Promise<boolean>>();
const mockLogAudit = jest.fn<(entry: unknown) => Promise<void>>();
const mockAllergieFindUnique = jest.fn<(args: unknown) => Promise<unknown>>();
const mockNoteFindUnique = jest.fn<(args: unknown) => Promise<unknown>>();

jest.unstable_mockModule('../services/access-control.js', () => ({
  canAccessPatient: mockCanAccess,
  default: { canAccessPatient: mockCanAccess },
}));

jest.unstable_mockModule('../services/audit.js', () => ({
  logAudit: mockLogAudit,
  auditCreate: jest.fn(), auditUpdate: jest.fn(), auditDelete: jest.fn(),
  default: { logAudit: mockLogAudit, auditCreate: jest.fn(), auditUpdate: jest.fn(), auditDelete: jest.fn() },
}));

jest.unstable_mockModule('../config/db.js', () => ({
  prisma: {
    allergie: { findUnique: mockAllergieFindUnique },
    note: { findUnique: mockNoteFindUnique },
    pathologie: { findUnique: jest.fn() },
    prescription: { findUnique: jest.fn() },
    ordonnance: { findUnique: jest.fn() },
    vaccination: { findUnique: jest.fn() },
    alerte: { findUnique: jest.fn() },
    vital: { findUnique: jest.fn() },
    imagerie: { findUnique: jest.fn() },
  },
  query: jest.fn(), pool: {}, getClient: jest.fn(),
  default: { prisma: {} },
}));

const { requireResourceAccess } = await import('../middleware/resource-access.js');

type MockRes = Response & { _status?: number; _body?: unknown };
function makeRes(): MockRes {
  const res = {} as MockRes;
  res.status = jest.fn((c: number) => { res._status = c; return res; }) as unknown as Response['status'];
  res.json = jest.fn((b: unknown) => { res._body = b; return res; }) as unknown as Response['json'];
  return res;
}
function makeReq(opts: { user?: { id: number; username: string; role: string } | null; params?: Record<string, string>; path?: string; method?: string } = {}) {
  return {
    user: opts.user === null ? undefined : (opts.user ?? { id: 5, username: 'dr.test', role: 'medecin' }),
    params: opts.params ?? {},
    path: opts.path ?? '/test',
    method: opts.method ?? 'PUT',
    ip: '127.0.0.1',
  } as Parameters<ReturnType<typeof requireResourceAccess>>[0];
}

describe('requireResourceAccess — auth + validation', () => {
  beforeEach(() => {
    mockCanAccess.mockReset();
    mockLogAudit.mockReset(); mockLogAudit.mockResolvedValue();
    mockAllergieFindUnique.mockReset();
  });

  it('401 when req.user is missing', async () => {
    const mw = requireResourceAccess('allergie');
    const req = makeReq({ user: null, params: { id: '42' } });
    const res = makeRes();
    const next = jest.fn();
    await mw(req, res, next as NextFunction);
    expect(res._status).toBe(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('400 when resource id is non-integer', async () => {
    const mw = requireResourceAccess('allergie');
    const req = makeReq({ params: { id: 'abc' } });
    const res = makeRes();
    const next = jest.fn();
    await mw(req, res, next as NextFunction);
    expect(res._status).toBe(400);
  });

  it('400 when resource id is negative', async () => {
    const mw = requireResourceAccess('allergie');
    const req = makeReq({ params: { id: '-1' } });
    const res = makeRes();
    const next = jest.fn();
    await mw(req, res, next as NextFunction);
    expect(res._status).toBe(400);
  });
});

describe('requireResourceAccess — IDOR on resource id (OWASP A01 residual)', () => {
  beforeEach(() => {
    mockCanAccess.mockReset();
    mockLogAudit.mockReset(); mockLogAudit.mockResolvedValue();
    mockAllergieFindUnique.mockReset();
  });

  it('medecin WITH attribution → next()', async () => {
    mockAllergieFindUnique.mockResolvedValueOnce({ patientId: 100 });
    mockCanAccess.mockResolvedValueOnce(true);
    const mw = requireResourceAccess('allergie');
    const req = makeReq({ user: { id: 5, username: 'dr.attributed', role: 'medecin' }, params: { id: '42' } });
    const next = jest.fn();
    await mw(req, makeRes(), next as NextFunction);
    expect(next).toHaveBeenCalledTimes(1);
    expect(mockLogAudit).not.toHaveBeenCalled();
  });

  it('medecin WITHOUT attribution → 403 + audit row with resource model in details', async () => {
    mockAllergieFindUnique.mockResolvedValueOnce({ patientId: 999 });
    mockCanAccess.mockResolvedValueOnce(false);
    const mw = requireResourceAccess('allergie');
    const req = makeReq({
      user: { id: 5, username: 'dr.unattributed', role: 'medecin' },
      params: { id: '42' },
      path: '/api/allergies/42',
      method: 'DELETE',
    });
    const res = makeRes();
    const next = jest.fn();
    await mw(req, res, next as NextFunction);
    expect(res._status).toBe(403);
    expect(next).not.toHaveBeenCalled();
    expect(mockLogAudit).toHaveBeenCalledTimes(1);
    const audit = mockLogAudit.mock.calls[0][0] as Record<string, unknown>;
    expect(audit.action).toBe('access_denied');
    expect(audit.recordId).toBe(999);
    expect(String(audit.details)).toContain('allergie');
    expect(String(audit.details)).toContain('id=42');
  });

  it('row not found → next() (route handler decides 404 or proceed)', async () => {
    mockAllergieFindUnique.mockResolvedValueOnce(null);
    const mw = requireResourceAccess('allergie');
    const req = makeReq({ params: { id: '99999' } });
    const next = jest.fn();
    await mw(req, makeRes(), next as NextFunction);
    expect(next).toHaveBeenCalledTimes(1);
    expect(mockCanAccess).not.toHaveBeenCalled();
  });

  it('admin → bypass via canAccessPatient (it short-circuits for non-medecin roles)', async () => {
    mockAllergieFindUnique.mockResolvedValueOnce({ patientId: 100 });
    mockCanAccess.mockResolvedValueOnce(true);
    const mw = requireResourceAccess('allergie');
    const req = makeReq({ user: { id: 1, username: 'admin', role: 'admin' }, params: { id: '42' } });
    const next = jest.fn();
    await mw(req, makeRes(), next as NextFunction);
    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe('requireResourceAccess — failure modes', () => {
  beforeEach(() => {
    mockCanAccess.mockReset();
    mockLogAudit.mockReset(); mockLogAudit.mockResolvedValue();
    mockAllergieFindUnique.mockReset();
  });

  it('Prisma findUnique throws → 500, no next, no audit', async () => {
    mockAllergieFindUnique.mockRejectedValueOnce(new Error('DB down'));
    const mw = requireResourceAccess('allergie');
    const req = makeReq({ params: { id: '42' } });
    const res = makeRes();
    const next = jest.fn();
    await mw(req, res, next as NextFunction);
    expect(res._status).toBe(500);
    expect(next).not.toHaveBeenCalled();
    expect(mockLogAudit).not.toHaveBeenCalled();
  });

  it('canAccessPatient throws → 500, no next, no audit', async () => {
    mockAllergieFindUnique.mockResolvedValueOnce({ patientId: 100 });
    mockCanAccess.mockRejectedValueOnce(new Error('connection refused'));
    const mw = requireResourceAccess('allergie');
    const req = makeReq({ params: { id: '42' } });
    const res = makeRes();
    const next = jest.fn();
    await mw(req, res, next as NextFunction);
    expect(res._status).toBe(500);
    expect(next).not.toHaveBeenCalled();
  });
});

describe('requireResourceAccess — multi-model', () => {
  beforeEach(() => {
    mockCanAccess.mockReset();
    mockLogAudit.mockReset(); mockLogAudit.mockResolvedValue();
    mockNoteFindUnique.mockReset();
  });

  it('note model: 403 path correctly identifies the model in audit details', async () => {
    mockNoteFindUnique.mockResolvedValueOnce({ patientId: 7 });
    mockCanAccess.mockResolvedValueOnce(false);
    const mw = requireResourceAccess('note');
    const req = makeReq({
      user: { id: 5, username: 'dr.x', role: 'medecin' },
      params: { id: '11' },
      path: '/api/notes/11',
    });
    const res = makeRes();
    const next = jest.fn();
    await mw(req, res, next as NextFunction);
    expect(res._status).toBe(403);
    const audit = mockLogAudit.mock.calls[0][0] as Record<string, unknown>;
    expect(String(audit.details)).toContain('note');
    expect(audit.recordId).toBe(7);
  });
});
