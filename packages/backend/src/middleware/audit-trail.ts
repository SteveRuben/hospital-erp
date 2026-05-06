import { query } from '../config/db.js';

interface AuditEntry {
  userId: number;
  action: 'create' | 'update' | 'delete' | 'archive';
  tableName: string;
  recordId: number;
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}

export const logAudit = async (entry: AuditEntry): Promise<void> => {
  try {
    const diff = entry.before && entry.after ? computeDiff(entry.before, entry.after) : null;
    const details = diff ? JSON.stringify({ action: entry.action, diff }) : JSON.stringify({ action: entry.action, data: entry.after || entry.before });

    await query(
      'INSERT INTO audit_log (user_id, action, table_name, record_id, details) VALUES ($1,$2,$3,$4,$5)',
      [entry.userId, entry.action, entry.tableName, entry.recordId, details]
    );
  } catch (err) {
    console.error('[AUDIT] Failed to log:', err);
  }
};

function computeDiff(before: Record<string, unknown>, after: Record<string, unknown>): Record<string, { old: unknown; new: unknown }> {
  const diff: Record<string, { old: unknown; new: unknown }> = {};

  for (const key of Object.keys(after)) {
    if (key === 'created_at' || key === 'updated_at') continue;
    const oldVal = before[key];
    const newVal = after[key];

    if (String(oldVal ?? '') !== String(newVal ?? '')) {
      diff[key] = { old: oldVal ?? null, new: newVal ?? null };
    }
  }

  return diff;
}

export default logAudit;