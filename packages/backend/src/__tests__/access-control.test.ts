/**
 * Access Control Tests — IDOR regression coverage
 *
 * The fix in commit 46dcf76 added canAccessPatient() to block medecins
 * from accessing patients not attributed to them. These tests pin that
 * behavior so the regression cannot be reintroduced.
 *
 * Tested behaviors:
 * - Non-medecin roles bypass the DB check (no query made)
 * - Medecin with attribution → access granted
 * - Medecin without attribution → access denied
 * - Medecin with consultation history (legacy fallback) → access granted
 * - SQL is parameterized (no user-controlled string interpolation)
 *
 * The DB query itself is mocked — we test the access logic, not Postgres.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// Mock '../config/db.js' before importing the service under test (ESM pattern).
const mockQuery = jest.fn<(text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>>();

jest.unstable_mockModule('../config/db.js', () => ({
  query: mockQuery,
  pool: {},
  getClient: jest.fn(),
  default: { query: mockQuery, pool: {}, getClient: jest.fn() },
}));

// Dynamic import AFTER the mock is registered
const { canAccessPatient } = await import('../services/access-control.js');

describe('canAccessPatient — non-medecin roles (full access, no DB call)', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('admin can access any patient (no DB call)', async () => {
    const ok = await canAccessPatient({ id: 1, role: 'admin' }, 999);
    expect(ok).toBe(true);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('comptable can access any patient (no DB call)', async () => {
    const ok = await canAccessPatient({ id: 2, role: 'comptable' }, 42);
    expect(ok).toBe(true);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('laborantin can access any patient (no DB call)', async () => {
    const ok = await canAccessPatient({ id: 3, role: 'laborantin' }, 42);
    expect(ok).toBe(true);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('reception can access any patient (no DB call)', async () => {
    const ok = await canAccessPatient({ id: 4, role: 'reception' }, 42);
    expect(ok).toBe(true);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});

describe('canAccessPatient — medecin (must be attributed)', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('medecin WITH attribution → access granted', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
    const ok = await canAccessPatient({ id: 5, role: 'medecin' }, 100);
    expect(ok).toBe(true);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('medecin WITHOUT attribution → access DENIED (regression: IDOR fix)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    const ok = await canAccessPatient({ id: 5, role: 'medecin' }, 999);
    expect(ok).toBe(false);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('medecin with multiple matching rows (attribution + consultation) → access granted', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ '?column?': 1 }, { '?column?': 1 }] });
    const ok = await canAccessPatient({ id: 5, role: 'medecin' }, 100);
    expect(ok).toBe(true);
  });
});

describe('canAccessPatient — SQL safety', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('passes user.id and patientId as parameters (not string-interpolated)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await canAccessPatient({ id: 42, role: 'medecin' }, 7);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0];

    // Parameters are passed as the second arg, not interpolated
    expect(params).toEqual([42, 7]);
    // SQL uses placeholders ($1, $2), not literal values
    expect(sql).toContain('$1');
    expect(sql).toContain('$2');
    expect(sql).not.toContain('42');
    expect(sql).not.toContain('= 7');
  });

  it('checks both patient_attributions and consultations (defense in depth)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await canAccessPatient({ id: 1, role: 'medecin' }, 1);

    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toContain('patient_attributions');
    expect(sql).toContain('consultations');
  });

  it('only counts active attributions (actif = TRUE)', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });
    await canAccessPatient({ id: 1, role: 'medecin' }, 1);

    const [sql] = mockQuery.mock.calls[0];
    expect(sql).toMatch(/actif\s*=\s*TRUE/i);
  });
});

describe('canAccessPatient — error propagation', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('propagates DB errors (caller decides 500 vs 403)', async () => {
    const dbError = new Error('connection refused');
    mockQuery.mockRejectedValueOnce(dbError);

    await expect(
      canAccessPatient({ id: 1, role: 'medecin' }, 1)
    ).rejects.toThrow('connection refused');
  });
});

describe('canAccessPatient — unknown roles (defensive)', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('unknown role still bypasses the DB check (returns true) — guarded upstream by authorize()', async () => {
    // Note: this is the current behavior — only 'medecin' triggers the strict check.
    // Defense-in-depth lives at the authorize() middleware layer; canAccessPatient is the
    // patient-level filter for the medecin role only.
    const ok = await canAccessPatient({ id: 99, role: 'unknown_role' }, 1);
    expect(ok).toBe(true);
    expect(mockQuery).not.toHaveBeenCalled();
  });
});
