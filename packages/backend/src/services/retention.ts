/**
 * Data retention service.
 *
 * Implements HIPAA §164.530(j) — covered entities must retain medical
 * documentation 6 years from creation, but older data should be purged
 * once the retention window closes. Currently scoped to chat messages
 * and read notifications; PHI in patient files is never auto-purged.
 *
 * Two windows controlled by settings:
 *   - chat_retention_months   (default 72 = 6 years): purge chat_messages older than that
 *   - notif_retention_days    (default 90): purge READ notifications older than that
 *
 * Soft-deleted chat messages (deleted_at set) are physically removed 30 days
 * after their soft delete — this matches the typical "trash bin" expectation.
 *
 * Run at boot (catches up after downtime) then daily via setInterval.unref()
 * so the process exits cleanly in tests. Idempotent — safe to run twice.
 */

import { prisma } from '../config/db.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const DAILY_INTERVAL_MS = 24 * 60 * 60 * 1000;
const SOFT_DELETE_GRACE_DAYS = 30;

const DEFAULTS = {
  chat_retention_months: 72,
  notif_retention_days: 90,
};

async function readSettingNumber(cle: string, fallback: number): Promise<number> {
  try {
    const row = await prisma.setting.findUnique({ where: { cle }, select: { valeur: true } });
    const n = Number(row?.valeur);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  } catch {
    return fallback;
  }
}

export async function runRetention(): Promise<{ chatPurged: number; chatSoftPurged: number; notifsPurged: number }> {
  const months = await readSettingNumber('chat_retention_months', DEFAULTS.chat_retention_months);
  const notifDays = await readSettingNumber('notif_retention_days', DEFAULTS.notif_retention_days);

  const now = Date.now();
  const chatCutoff = new Date(now - months * 30 * DAY_MS);
  const softDeleteCutoff = new Date(now - SOFT_DELETE_GRACE_DAYS * DAY_MS);
  const notifCutoff = new Date(now - notifDays * DAY_MS);

  let chatPurged = 0;
  let chatSoftPurged = 0;
  let notifsPurged = 0;

  try {
    // Purge soft-deleted messages older than the grace window
    const r1 = await prisma.chatMessage.deleteMany({
      where: { deletedAt: { not: null, lt: softDeleteCutoff } },
    });
    chatSoftPurged = r1.count;

    // Purge messages older than the HIPAA retention window
    const r2 = await prisma.chatMessage.deleteMany({
      where: { createdAt: { lt: chatCutoff } },
    });
    chatPurged = r2.count;

    // Purge READ notifications older than the notif window. Unread notifs
    // are kept indefinitely so a user returning from holiday doesn't miss them.
    const r3 = await prisma.notification.deleteMany({
      where: { read: true, createdAt: { lt: notifCutoff } },
    });
    notifsPurged = r3.count;

    if (chatPurged + chatSoftPurged + notifsPurged > 0) {
      console.log(`[RETENTION] purged ${chatPurged} old chat, ${chatSoftPurged} soft-deleted chat, ${notifsPurged} read notifs`);
    }
  } catch (err) {
    console.error('[RETENTION] run failed:', err);
  }

  return { chatPurged, chatSoftPurged, notifsPurged };
}

/**
 * Schedule a daily retention pass. Returns a function to cancel the interval
 * (used in tests so the daily timer doesn't keep Jest alive).
 */
export function scheduleRetention(): () => void {
  // Run once at boot — catches up if the process has been down for days.
  // Fire-and-forget to avoid blocking startup.
  void runRetention();
  const t = setInterval(() => { void runRetention(); }, DAILY_INTERVAL_MS);
  t.unref();
  return () => clearInterval(t);
}

export default { runRetention, scheduleRetention };
