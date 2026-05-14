/**
 * Access Control Tests — IDOR regression coverage
 *
 * canAccessPatient() blocks medecins from accessing patients not attributed to them.
 *
 * Tested behaviors:
 * - Non-medecin roles bypass the DB check (no query made)
 * - Medecin with attribution → access granted
 * - Medecin without attribution → access denied
 * - Medecin with consultation history (legacy fallback) → access granted
 * - SQL is parameterized (Prisma template tag interpolates values as $N placeholders)
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockQueryRaw = jest.fn<(...args: unknown[]) => Promise<unknown[]>>();

jest.unstable_mockModule('../config/db.js', () => ({
  prisma: { $queryRaw: mockQueryRaw },
  query: jest.fn(),
  pool: {},
  getClient: jest.fn(),
  default: { prisma: { $queryRaw: mockQueryRaw }, query: jest.fn(), pool: {}, getClient: jest.fn() },
}));

const { canAccessPatient } = await import('../services/access-control.js');

describe('canAccessPatient — non-medecin roles (full access, no DB call)', () => {
  beforeEach(() => {
    mockQueryRaw.mockReset();
  });

  it('admin can access any patient (no DB call)', async () => {
    const ok = await canAccessPatient({ id: 1, role: 'admin' }, 999);
    expect(ok).toBe(true);
    expect(mockQueryRaw).not.toHaveBeenCalled();
  });

  it('comptable can access any patient (no DB call)', async () => {
    const ok = await canAccessPatient({ id: 2, role: 'comptable' }, 42);
    expect(ok).toBe(true);
    expect(mockQueryRaw).not.toHaveBeenCalled();
  });

  it('laborantin can access any patient (no DB call)', async () => {
    const ok = await canAccessPatient({ id: 3, role: 'laborantin' }, 42);
    expect(ok).toBe(true);
    expect(mockQueryRaw).not.toHaveBeenCalled();
  });

  it('reception can access any patient (no DB call)', async () => {
    const ok = await canAccessPatient({ id: 4, role: 'reception' }, 42);
    expect(ok).toBe(true);
    expect(mockQueryRaw).not.toHaveBeenCalled();
  });
});

describe('canAccessPatient — medecin (must be attributed)', () => {
  beforeEach(() => {
    mockQueryRaw.mockReset();
  });

  it('medecin WITH attribution → access granted', async () => {
    mockQueryRaw.mockResolvedValueOnce([{ ok: 1 }]);
    const ok = await canAccessPatient({ id: 5, role: 'medecin' }, 100);
    expect(ok).toBe(true);
    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
  });

  it('medecin WITHOUT attribution → access DENIED (regression: IDOR fix)', async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    const ok = await canAccessPatient({ id: 5, role: 'medecin' }, 999);
    expect(ok).toBe(false);
    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
  });

  it('medecin with multiple matching rows (attribution + consultation) → access granted', async () => {
    mockQueryRaw.mockResolvedValueOnce([{ ok: 1 }, { ok: 1 }]);
    const ok = await canAccessPatient({ id: 5, role: 'medecin' }, 100);
    expect(ok).toBe(true);
  });
});

describe('canAccessPatient — SQL safety', () => {
  beforeEach(() => {
    mockQueryRaw.mockReset();
  });

  it('passes user.id and patientId as tagged-template parameters (not interpolated)', async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    await canAccessPatient({ id: 42, role: 'medecin' }, 7);

    expect(mockQueryRaw).toHaveBeenCalledTimes(1);
    // Prisma tagged template: first arg is the strings array, remaining args are interpolated values.
    const call = mockQueryRaw.mock.calls[0];
    const strings = call[0] as ReadonlyArray<string>;
    const params = call.slice(1);

    // The literal SQL parts contain the table names; the values 42 and 7 are NOT in the strings.
    const sql = strings.join('');
    expect(sql).toContain('patient_attributions');
    expect(sql).toContain('consultations');
    expect(sql).not.toContain('42');
    expect(sql).not.toContain('= 7');

    // user.id and patientId are passed as parameter values, each twice (UNION ALL uses them on both sides)
    expect(params).toContain(42);
    expect(params).toContain(7);
  });

  it('checks both patient_attributions and consultations (defense in depth)', async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    await canAccessPatient({ id: 1, role: 'medecin' }, 1);

    const strings = mockQueryRaw.mock.calls[0][0] as ReadonlyArray<string>;
    const sql = strings.join('');
    expect(sql).toContain('patient_attributions');
    expect(sql).toContain('consultations');
  });

  it('only counts active attributions (actif = TRUE)', async () => {
    mockQueryRaw.mockResolvedValueOnce([]);
    await canAccessPatient({ id: 1, role: 'medecin' }, 1);

    const strings = mockQueryRaw.mock.calls[0][0] as ReadonlyArray<string>;
    const sql = strings.join('');
    expect(sql).toMatch(/actif\s*=\s*TRUE/i);
  });
});

describe('canAccessPatient — error propagation', () => {
  beforeEach(() => {
    mockQueryRaw.mockReset();
  });

  it('propagates DB errors (caller decides 500 vs 403)', async () => {
    const dbError = new Error('connection refused');
    mockQueryRaw.mockRejectedValueOnce(dbError);

    await expect(
      canAccessPatient({ id: 1, role: 'medecin' }, 1)
    ).rejects.toThrow('connection refused');
  });
});

describe('canAccessPatient — unknown roles (defensive)', () => {
  beforeEach(() => {
    mockQueryRaw.mockReset();
  });

  it('unknown role still bypasses the DB check (returns true) — guarded upstream by authorize()', async () => {
    const ok = await canAccessPatient({ id: 99, role: 'unknown_role' }, 1);
    expect(ok).toBe(true);
    expect(mockQueryRaw).not.toHaveBeenCalled();
  });
});
