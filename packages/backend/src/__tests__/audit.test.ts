/**
 * Audit Service Tests
 *
 * Covers:
 * - logAudit writes to audit_log with parameters in the right slots
 * - update action computes diff (only changed fields)
 * - sensitive fields (password, token, secret, otp, mfa_secret) are redacted
 * - Long detail strings are truncated to 2000 chars + suffix
 * - DB errors are swallowed (audit must never break the main flow)
 * - auditCreate / auditUpdate / auditDelete helpers
 *
 * The DB query is mocked — we verify the right SQL is sent, not Postgres execution.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockQuery = jest.fn<(text: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount?: number }>>();

jest.unstable_mockModule('../config/db.js', () => ({
  query: mockQuery,
  pool: {},
  getClient: jest.fn(),
  default: { query: mockQuery, pool: {}, getClient: jest.fn() },
}));

const { logAudit, auditCreate, auditUpdate, auditDelete } = await import('../services/audit.js');

describe('logAudit — basic INSERT', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
  });

  it('inserts into audit_log with the right params', async () => {
    await logAudit({
      userId: 42,
      action: 'create',
      tableName: 'patients',
      recordId: 100,
      details: 'Created patient X',
    });

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [sql, params] = mockQuery.mock.calls[0];
    expect(sql).toContain('INSERT INTO audit_log');
    expect(sql).toContain('user_id, action, table_name, record_id, details');
    expect(params).toEqual([42, 'create', 'patients', 100, 'Created patient X']);
  });

  it('sends null for missing recordId', async () => {
    await logAudit({ userId: 1, action: 'login', tableName: 'users' });
    const [, params] = mockQuery.mock.calls[0];
    expect(params![3]).toBeNull();
  });

  it('sends null for missing details', async () => {
    await logAudit({ userId: 1, action: 'login', tableName: 'users', recordId: 1 });
    const [, params] = mockQuery.mock.calls[0];
    expect(params![4]).toBeNull();
  });
});

describe('logAudit — update diff', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
  });

  it('computes diff: only changed fields appear in details', async () => {
    await logAudit({
      userId: 1,
      action: 'update',
      tableName: 'patients',
      recordId: 5,
      before: { nom: 'Doe', prenom: 'John', telephone: '+1234' },
      after: { nom: 'Smith', prenom: 'John', telephone: '+1234' }, // only nom changed
    });

    const [, params] = mockQuery.mock.calls[0];
    const details = params![4] as string;
    expect(details).toContain('nom');
    expect(details).toContain('"Doe"');
    expect(details).toContain('"Smith"');
    expect(details).not.toContain('prenom');
    expect(details).not.toContain('telephone');
  });

  it('arrow → between old and new in diff', async () => {
    await logAudit({
      userId: 1,
      action: 'update',
      tableName: 'recettes',
      recordId: 9,
      before: { montant: 1000 },
      after: { montant: 1500 },
    });
    const details = mockQuery.mock.calls[0][1]![4] as string;
    expect(details).toContain('1000');
    expect(details).toContain('1500');
    expect(details).toContain('→');
  });

  it('returns empty string in details if no fields changed', async () => {
    await logAudit({
      userId: 1,
      action: 'update',
      tableName: 'users',
      recordId: 1,
      before: { nom: 'Same', prenom: 'Same' },
      after: { nom: 'Same', prenom: 'Same' },
    });
    const details = mockQuery.mock.calls[0][1]![4];
    // Empty diff produces empty details (falsy → null in INSERT)
    expect(details).toBeNull();
  });
});

describe('logAudit — sensitive field redaction', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
  });

  it('redacts password changes', async () => {
    await logAudit({
      userId: 1,
      action: 'update',
      tableName: 'users',
      recordId: 1,
      before: { nom: 'Foo', password: 'old-hash' },
      after: { nom: 'Foo', password: 'new-hash' },
    });
    const details = mockQuery.mock.calls[0][1]![4] as string;
    expect(details).toContain('password');
    expect(details).toContain('[REDACTED]');
    expect(details).not.toContain('old-hash');
    expect(details).not.toContain('new-hash');
  });

  it('redacts mfa_secret changes', async () => {
    await logAudit({
      userId: 1,
      action: 'update',
      tableName: 'users',
      recordId: 1,
      before: { mfa_secret: 'AAAA' },
      after: { mfa_secret: 'BBBB' },
    });
    const details = mockQuery.mock.calls[0][1]![4] as string;
    expect(details).toContain('[REDACTED]');
    expect(details).not.toContain('AAAA');
    expect(details).not.toContain('BBBB');
  });

  it('redacts token, secret, otp fields', async () => {
    for (const field of ['token', 'secret', 'otp']) {
      mockQuery.mockReset();
      mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
      await logAudit({
        userId: 1,
        action: 'update',
        tableName: 'users',
        recordId: 1,
        before: { [field]: 'old' },
        after: { [field]: 'new' },
      });
      const details = mockQuery.mock.calls[0][1]![4] as string;
      expect(details).toContain('[REDACTED]');
      expect(details).not.toContain('old');
      expect(details).not.toContain('new');
    }
  });
});

describe('logAudit — detail truncation', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
  });

  it('truncates details > 2000 chars', async () => {
    const longString = 'x'.repeat(3000);
    await logAudit({
      userId: 1,
      action: 'create',
      tableName: 'notes',
      recordId: 1,
      details: longString,
    });
    const details = mockQuery.mock.calls[0][1]![4] as string;
    expect(details.length).toBeLessThanOrEqual(2030); // 2000 + suffix
    expect(details).toContain('[truncated]');
  });

  it('does not truncate short details', async () => {
    await logAudit({
      userId: 1,
      action: 'create',
      tableName: 'notes',
      recordId: 1,
      details: 'short',
    });
    const details = mockQuery.mock.calls[0][1]![4] as string;
    expect(details).toBe('short');
    expect(details).not.toContain('[truncated]');
  });
});

describe('logAudit — error swallowing', () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it('does not throw when DB query fails (audit must never break the main flow)', async () => {
    mockQuery.mockRejectedValue(new Error('connection refused'));
    await expect(
      logAudit({ userId: 1, action: 'create', tableName: 'x', recordId: 1 })
    ).resolves.toBeUndefined();
  });
});

describe('audit helpers', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
  });

  it('auditCreate sends action=create', async () => {
    await auditCreate(7, 'patients', 99, 'Created');
    const [, params] = mockQuery.mock.calls[0];
    expect(params).toEqual([7, 'create', 'patients', 99, 'Created']);
  });

  it('auditDelete sends action=delete', async () => {
    await auditDelete(7, 'patients', 99, 'Archived');
    const [, params] = mockQuery.mock.calls[0];
    expect(params).toEqual([7, 'delete', 'patients', 99, 'Archived']);
  });

  it('auditUpdate sends action=update with computed diff', async () => {
    await auditUpdate(7, 'patients', 99, { nom: 'A' }, { nom: 'B' });
    const [, params] = mockQuery.mock.calls[0];
    expect(params![1]).toBe('update');
    expect(params![4]).toContain('nom');
    expect(params![4]).toContain('"A"');
    expect(params![4]).toContain('"B"');
  });

  it('auditCreate without details still works', async () => {
    await auditCreate(1, 'x', 1);
    const [, params] = mockQuery.mock.calls[0];
    expect(params![4]).toBeNull();
  });
});
