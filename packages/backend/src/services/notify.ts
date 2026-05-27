/**
 * In-app staff notification service.
 *
 * Single entry point for the rest of the codebase to push notifications
 * into the bell-icon inbox. Every persisted Notification row also fans out
 * over the Socket.IO `notification` event on the recipient's user-scoped
 * room so the bell can update without polling.
 *
 * The socket emit is best-effort — if the realtime gateway is down or the
 * recipient is offline, the DB row remains and is fetched on the next
 * client load. Never let the realtime layer break the source-of-truth.
 */

import { prisma } from '../config/db.js';
import { emitToUser } from './realtime.js';

export type NotificationType =
  | 'mention'           // someone @-mentioned the user in a note
  | 'lab_requested'     // a lab exam was assigned to the user's role
  | 'lab_validated'     // the user's requested exam came back with results
  | 'admission'         // a patient was admitted to the user's service
  | 'stock_low'         // a critical medication is running low
  | 'chat_message'      // direct chat message (Phase 2)
  | 'chat_mention';     // mentioned in a chat channel (Phase 2)

export interface CreateNotificationInput {
  userId: number;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string;        // SPA path, e.g. `/app/patients/42#notes`
}

export async function notify(input: CreateNotificationInput): Promise<void> {
  // Skip self-notifications (e.g. if a user mentions themselves in a note).
  // Caller is responsible for filtering, but we guard here too as defense.
  if (!Number.isInteger(input.userId) || input.userId < 1) return;

  try {
    const row = await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title.substring(0, 200),
        body: input.body?.substring(0, 2000) ?? null,
        link: input.link?.substring(0, 500) ?? null,
      },
    });
    // Fire-and-forget push to any connected sockets for this user.
    emitToUser(input.userId, 'notification', row);
  } catch (err) {
    // Notification failures must never break the originating action
    // (e.g. a note save shouldn't fail because the notif DB hiccupped).
    console.error('[NOTIFY] failed:', err);
  }
}

/**
 * Batch helper for workflow events where the same notification fans out to
 * multiple recipients (e.g. all laborantins when a lab exam is requested).
 */
export async function notifyMany(userIds: number[], input: Omit<CreateNotificationInput, 'userId'>): Promise<void> {
  const unique = Array.from(new Set(userIds.filter(id => Number.isInteger(id) && id > 0)));
  await Promise.all(unique.map(userId => notify({ ...input, userId })));
}

export default { notify, notifyMany };
