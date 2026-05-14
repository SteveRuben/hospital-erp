/**
 * Audit Service Tests
 *
 * Covers:
 * - logAudit writes to audit_log with the right fields
 * - update action computes diff (only changed fields)
 * - sensitive fields (password, token, secret, otp, mfa_secret) are redacted
 * - Long detail strings are truncated to 2000 chars + suffix
 * - DB errors are swallowed (audit must never break the main flow)
 * - auditCreate / auditUpdate / auditDelete helpers
 *
 * Prisma is mocked — we verify the right data is sent, not Postgres execution.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

type CreateArgs = { data: { userId: number; action: string; tableName: string; recordId: number | null; details: string | null } };
const mockCreate = jest.fn<(args: CreateArgs) => Promise<unknown>>();

jest.unstable_mockModule('../config/db.js', () => ({
  prisma: { auditLog: { create: mockCreate } },
  query: jest.fn(),
  pool: {},
  getClient: jest.fn(),
  default: { prisma: { auditLog: { create: mockCreate } }, query: jest.fn(), pool: {}, getClient: jest.fn() },
}));

const { logAudit, auditCreate, auditUpdate, auditDelete } = await import('../services/audit.js');

const lastData = () => (mockCreate.mock.calls[0]![0] as CreateArgs).data;

describe('logAudit — basic create', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockCreate.mockResolvedValue({});
  });

  it('writes the right fields to auditLog', async () => {
    await logAudit({
      userId: 42,
      action: 'create',
      tableName: 'patients',
      recordId: 100,
      details: 'Created patient X',
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(lastData()).toEqual({
      userId: 42,
      action: 'create',
      tableName: 'patients',
      recordId: 100,
      details: 'Created patient X',
    });
  });

  it('sends null for missing recordId', async () => {
    await logAudit({ userId: 1, action: 'login', tableName: 'users' });
    expect(lastData().recordId).toBeNull();
  });

  it('sends null for missing details', async () => {
    await logAudit({ userId: 1, action: 'login', tableName: 'users', recordId: 1 });
    expect(lastData().details).toBeNull();
  });
});

describe('logAudit — update diff', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockCreate.mockResolvedValue({});
  });

  it('computes diff: only changed fields appear in details', async () => {
    await logAudit({
      userId: 1,
      action: 'update',
      tableName: 'patients',
      recordId: 5,
      before: { nom: 'Doe', prenom: 'John', telephone: '+1234' },
      after: { nom: 'Smith', prenom: 'John', telephone: '+1234' },
    });

    const details = lastData().details!;
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
    const details = lastData().details!;
    expect(details).toContain('1000');
    expect(details).toContain('1500');
    expect(details).toContain('→');
  });

  it('returns null in details if no fields changed', async () => {
    await logAudit({
      userId: 1,
      action: 'update',
      tableName: 'users',
      recordId: 1,
      before: { nom: 'Same', prenom: 'Same' },
      after: { nom: 'Same', prenom: 'Same' },
    });
    expect(lastData().details).toBeNull();
  });
});

describe('logAudit — sensitive field redaction', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockCreate.mockResolvedValue({});
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
    const details = lastData().details!;
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
    const details = lastData().details!;
    expect(details).toContain('[REDACTED]');
    expect(details).not.toContain('AAAA');
    expect(details).not.toContain('BBBB');
  });

  it('redacts token, secret, otp fields', async () => {
    for (const field of ['token', 'secret', 'otp']) {
      mockCreate.mockReset();
      mockCreate.mockResolvedValue({});
      await logAudit({
        userId: 1,
        action: 'update',
        tableName: 'users',
        recordId: 1,
        before: { [field]: 'old' },
        after: { [field]: 'new' },
      });
      const details = lastData().details!;
      expect(details).toContain('[REDACTED]');
      expect(details).not.toContain('old');
      expect(details).not.toContain('new');
    }
  });
});

describe('logAudit — detail truncation', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockCreate.mockResolvedValue({});
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
    const details = lastData().details!;
    expect(details.length).toBeLessThanOrEqual(2030);
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
    const details = lastData().details!;
    expect(details).toBe('short');
    expect(details).not.toContain('[truncated]');
  });
});

describe('logAudit — error swallowing', () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it('does not throw when DB query fails (audit must never break the main flow)', async () => {
    mockCreate.mockRejectedValue(new Error('connection refused'));
    await expect(
      logAudit({ userId: 1, action: 'create', tableName: 'x', recordId: 1 })
    ).resolves.toBeUndefined();
  });
});

describe('audit helpers', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    mockCreate.mockResolvedValue({});
  });

  it('auditCreate sends action=create', async () => {
    await auditCreate(7, 'patients', 99, 'Created');
    expect(lastData()).toEqual({ userId: 7, action: 'create', tableName: 'patients', recordId: 99, details: 'Created' });
  });

  it('auditDelete sends action=delete', async () => {
    await auditDelete(7, 'patients', 99, 'Archived');
    expect(lastData()).toEqual({ userId: 7, action: 'delete', tableName: 'patients', recordId: 99, details: 'Archived' });
  });

  it('auditUpdate sends action=update with computed diff', async () => {
    await auditUpdate(7, 'patients', 99, { nom: 'A' }, { nom: 'B' });
    expect(lastData().action).toBe('update');
    expect(lastData().details).toContain('nom');
    expect(lastData().details).toContain('"A"');
    expect(lastData().details).toContain('"B"');
  });

  it('auditCreate without details still works', async () => {
    await auditCreate(1, 'x', 1);
    expect(lastData().details).toBeNull();
  });
});
