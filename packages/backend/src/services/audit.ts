/**
 * Audit Trail Service
 * Logs all CREATE/UPDATE/DELETE operations on PHI and financial data
 * Stores in audit_log table with before/after diff
 */

import { prisma } from '../config/db.js';

export interface AuditEntry {
  userId: number;
  action: 'create' | 'update' | 'delete' | 'login' | 'logout' | 'impersonate' | 'password_change' | 'mfa_setup' | 'mfa_verify' | 'export' | 'access_denied';
  tableName: string;
  recordId?: number;
  details?: string;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
  ip?: string;
}

/**
 * Log an audit entry to the database
 */
export async function logAudit(entry: AuditEntry): Promise<void> {
  try {
    let details = entry.details || '';

    // Compute diff for updates
    if (entry.action === 'update' && entry.before && entry.after) {
      const changes: string[] = [];
      for (const key of Object.keys(entry.after)) {
        if (JSON.stringify(entry.before[key]) !== JSON.stringify(entry.after[key])) {
          // Don't log sensitive field values
          if (['password', 'token', 'secret', 'otp', 'mfa_secret'].includes(key)) {
            changes.push(`${key}: [REDACTED]`);
          } else {
            changes.push(`${key}: ${JSON.stringify(entry.before[key])} → ${JSON.stringify(entry.after[key])}`);
          }
        }
      }
      if (changes.length > 0) {
        details = changes.join('; ');
      }
    }

    // Truncate details to prevent oversized entries
    if (details.length > 2000) {
      details = details.substring(0, 2000) + '... [truncated]';
    }

    await prisma.auditLog.create({
      data: {
        userId: entry.userId,
        action: entry.action,
        tableName: entry.tableName,
        recordId: entry.recordId || null,
        details: details || null,
      },
    });
  } catch (err) {
    // Never let audit failures break the main flow
    console.error('[AUDIT] Failed to log:', err);
  }
}

/**
 * Helper: log a create operation
 */
export function auditCreate(userId: number, tableName: string, recordId: number, details?: string): Promise<void> {
  return logAudit({ userId, action: 'create', tableName, recordId, details });
}

/**
 * Helper: log an update operation with before/after
 */
export function auditUpdate(userId: number, tableName: string, recordId: number, before: Record<string, unknown>, after: Record<string, unknown>): Promise<void> {
  return logAudit({ userId, action: 'update', tableName, recordId, before, after });
}

/**
 * Helper: log a delete operation
 */
export function auditDelete(userId: number, tableName: string, recordId: number, details?: string): Promise<void> {
  return logAudit({ userId, action: 'delete', tableName, recordId, details });
}

export default { logAudit, auditCreate, auditUpdate, auditDelete };
