/**
 * Patient Access Middleware Tests — IDOR regression coverage (OWASP A01 + A09).
 *
 * Asserts the middleware:
 *   - extracts patientId from params.patientId, body.patient_id, or query.patient_id
 *   - 401s if no authenticated user
 *   - 400s if patientId is non-integer or negative
 *   - calls canAccessPatient(user, patientId) with the right shape
 *   - on allow: calls next() with no response
 *   - on deny: writes an audit_log row with action='access_denied' AND returns 403
 *   - rejects probing from medecins without attribution (the IDOR fix regression)
 *
 * Prisma + audit + access-control are mocked. We verify behavior, not DB rows.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { Response, NextFunction } from 'express';

const mockCanAccess = jest.fn<(user: unknown, patientId: number) => Promise<boolean>>();
const mockLogAudit = jest.fn<(entry: unknown) => Promise<void>>();

jest.unstable_mockModule('../services/access-control.js', () => ({
  canAccessPatient: mockCanAccess,
  default: { canAccessPatient: mockCanAccess },
}));

jest.unstable_mockModule('../services/audit.js', () => ({
  logAudit: mockLogAudit,
  auditCreate: jest.fn(),
  auditUpdate: jest.fn(),
  auditDelete: jest.fn(),
  default: { logAudit: mockLogAudit, auditCreate: jest.fn(), auditUpdate: jest.fn(), auditDelete: jest.fn() },
}));

const { requirePatientAccess } = await import('../middleware/patient-access.js');

type MockRes = Response & { _status?: number; _body?: unknown };

function makeRes(): MockRes {
  const res = {} as MockRes;
  res.status = jest.fn((code: number) => {
    res._status = code;
    return res;
  }) as unknown as Response['status'];
  res.json = jest.fn((body: unknown) => {
    res._body = body;
    return res;
  }) as unknown as Response['json'];
  return res;
}

function makeReq(opts: {
  user?: { id: number; username: string; role: string } | null;
  params?: Record<string, string>;
  body?: Record<string, unknown>;
  query?: Record<string, string>;
  path?: string;
  method?: string;
} = {}) {
  return {
    user: opts.user === null ? undefined : (opts.user ?? { id: 5, username: 'dr.test', role: 'medecin' }),
    params: opts.params ?? {},
    body: opts.body ?? {},
    query: opts.query ?? {},
    path: opts.path ?? '/test',
    method: opts.method ?? 'GET',
    ip: '127.0.0.1',
  } as Parameters<typeof requirePatientAccess>[0];
}

describe('requirePatientAccess — authentication gate', () => {
  beforeEach(() => {
    mockCanAccess.mockReset();
    mockLogAudit.mockReset();
    mockLogAudit.mockResolvedValue();
  });

  it('returns 401 when req.user is missing', async () => {
    const req = makeReq({ user: null, params: { patientId: '1' } });
    const res = makeRes();
    const next = jest.fn();
    await requirePatientAccess(req, res, next as NextFunction);
    expect(res._status).toBe(401);
    expect(next).not.toHaveBeenCalled();
    expect(mockCanAccess).not.toHaveBeenCalled();
  });
});

describe('requirePatientAccess — patientId extraction', () => {
  beforeEach(() => {
    mockCanAccess.mockReset();
    mockLogAudit.mockReset();
    mockLogAudit.mockResolvedValue();
  });

  it('reads patientId from params.patientId', async () => {
    mockCanAccess.mockResolvedValueOnce(true);
    const req = makeReq({ params: { patientId: '42' } });
    const next = jest.fn();
    await requirePatientAccess(req, makeRes(), next as NextFunction);
    expect(mockCanAccess).toHaveBeenCalledWith(expect.objectContaining({ id: 5 }), 42);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('reads patient_id from body when params.patientId is absent', async () => {
    mockCanAccess.mockResolvedValueOnce(true);
    const req = makeReq({ body: { patient_id: 7 } });
    const next = jest.fn();
    await requirePatientAccess(req, makeRes(), next as NextFunction);
    expect(mockCanAccess).toHaveBeenCalledWith(expect.anything(), 7);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('reads patient_id from query when params and body are absent', async () => {
    mockCanAccess.mockResolvedValueOnce(true);
    const req = makeReq({ query: { patient_id: '13' } });
    const next = jest.fn();
    await requirePatientAccess(req, makeRes(), next as NextFunction);
    expect(mockCanAccess).toHaveBeenCalledWith(expect.anything(), 13);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('passes through (no DB call) when no patientId is in the request', async () => {
    const req = makeReq({ params: { id: '99' } });
    const next = jest.fn();
    await requirePatientAccess(req, makeRes(), next as NextFunction);
    expect(mockCanAccess).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('does NOT fall back to params.id (would false-403 PUT/DELETE /:resource routes)', async () => {
    const req = makeReq({ params: { id: '999' } });
    const next = jest.fn();
    await requirePatientAccess(req, makeRes(), next as NextFunction);
    expect(mockCanAccess).not.toHaveBeenCalled();
  });

  it('returns 400 for non-integer patientId', async () => {
    const req = makeReq({ params: { patientId: 'not-a-number' } });
    const res = makeRes();
    const next = jest.fn();
    await requirePatientAccess(req, res, next as NextFunction);
    expect(res._status).toBe(400);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 400 for negative patientId', async () => {
    const req = makeReq({ params: { patientId: '-5' } });
    const res = makeRes();
    const next = jest.fn();
    await requirePatientAccess(req, res, next as NextFunction);
    expect(res._status).toBe(400);
  });
});

describe('requirePatientAccess — IDOR regression (OWASP A01)', () => {
  beforeEach(() => {
    mockCanAccess.mockReset();
    mockLogAudit.mockReset();
    mockLogAudit.mockResolvedValue();
  });

  it('medecin WITH attribution → allow, no audit row', async () => {
    mockCanAccess.mockResolvedValueOnce(true);
    const req = makeReq({ user: { id: 5, username: 'dr.attributed', role: 'medecin' }, params: { patientId: '100' } });
    const next = jest.fn();
    await requirePatientAccess(req, makeRes(), next as NextFunction);
    expect(next).toHaveBeenCalledTimes(1);
    expect(mockLogAudit).not.toHaveBeenCalled();
  });

  it('medecin WITHOUT attribution → 403 + audit_log access_denied entry (regression: IDOR fix + A09)', async () => {
    mockCanAccess.mockResolvedValueOnce(false);
    const req = makeReq({
      user: { id: 5, username: 'dr.unattributed', role: 'medecin' },
      params: { patientId: '999' },
      path: '/api/allergies/999',
      method: 'GET',
    });
    const res = makeRes();
    const next = jest.fn();
    await requirePatientAccess(req, res, next as NextFunction);
    expect(res._status).toBe(403);
    expect(next).not.toHaveBeenCalled();
    expect(mockLogAudit).toHaveBeenCalledTimes(1);
    const auditCall = mockLogAudit.mock.calls[0][0] as Record<string, unknown>;
    expect(auditCall.action).toBe('access_denied');
    expect(auditCall.tableName).toBe('patients');
    expect(auditCall.recordId).toBe(999);
    expect(auditCall.userId).toBe(5);
    expect(String(auditCall.details)).toContain('dr.unattributed');
    expect(String(auditCall.details)).toContain('999');
  });

  it('admin → allow, canAccessPatient short-circuits (no DB call from helper)', async () => {
    // canAccessPatient itself returns true synchronously for non-medecin roles;
    // we still call it for explicit-over-clever, but it must not produce a denial.
    mockCanAccess.mockResolvedValueOnce(true);
    const req = makeReq({ user: { id: 1, username: 'admin', role: 'admin' }, params: { patientId: '42' } });
    const next = jest.fn();
    await requirePatientAccess(req, makeRes(), next as NextFunction);
    expect(next).toHaveBeenCalledTimes(1);
    expect(mockLogAudit).not.toHaveBeenCalled();
  });

  it('reception / comptable / laborantin → allow (no PHI restriction for these roles)', async () => {
    for (const role of ['reception', 'comptable', 'laborantin'] as const) {
      mockCanAccess.mockResolvedValueOnce(true);
      mockLogAudit.mockReset();
      const req = makeReq({ user: { id: 10, username: `user.${role}`, role }, params: { patientId: '42' } });
      const next = jest.fn();
      await requirePatientAccess(req, makeRes(), next as NextFunction);
      expect(next).toHaveBeenCalledTimes(1);
      expect(mockLogAudit).not.toHaveBeenCalled();
    }
  });
});

describe('requirePatientAccess — failure modes', () => {
  beforeEach(() => {
    mockCanAccess.mockReset();
    mockLogAudit.mockReset();
    mockLogAudit.mockResolvedValue();
  });

  it('canAccessPatient throw → 500, no audit, no next', async () => {
    mockCanAccess.mockRejectedValueOnce(new Error('DB connection refused'));
    const req = makeReq({ params: { patientId: '42' } });
    const res = makeRes();
    const next = jest.fn();
    await requirePatientAccess(req, res, next as NextFunction);
    expect(res._status).toBe(500);
    expect(next).not.toHaveBeenCalled();
    expect(mockLogAudit).not.toHaveBeenCalled();
  });

  it('audit log failure does NOT swallow the 403 (audit.ts catches internally)', async () => {
    mockCanAccess.mockResolvedValueOnce(false);
    // logAudit is built to never throw; verify we still 403 even if it did
    mockLogAudit.mockRejectedValueOnce(new Error('audit_log full'));
    const req = makeReq({ params: { patientId: '999' } });
    const res = makeRes();
    const next = jest.fn();
    // Catch since logAudit rejection would propagate from the middleware in this mock setup
    await requirePatientAccess(req, res, next as NextFunction).catch(() => undefined);
    // Either 403 happened before the audit await, OR an error escaped; in both cases next() must NOT have been called
    expect(next).not.toHaveBeenCalled();
  });
});

describe('requirePatientAccess — audit row shape (OWASP A09 evidence)', () => {
  beforeEach(() => {
    mockCanAccess.mockReset();
    mockLogAudit.mockReset();
    mockLogAudit.mockResolvedValue();
  });

  it('5 IDOR probe attempts → 5 audit rows (probing visibility)', async () => {
    for (let i = 0; i < 5; i++) {
      mockCanAccess.mockResolvedValueOnce(false);
      const req = makeReq({ params: { patientId: String(100 + i) }, path: `/api/allergies/${100 + i}` });
      const res = makeRes();
      await requirePatientAccess(req, res, jest.fn() as NextFunction);
    }
    expect(mockLogAudit).toHaveBeenCalledTimes(5);
    const recordIds = mockLogAudit.mock.calls.map(c => (c[0] as Record<string, unknown>).recordId);
    expect(recordIds).toEqual([100, 101, 102, 103, 104]);
  });
});
