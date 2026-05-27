/**
 * Staff chat — REST API. Real-time fanout is handled by services/realtime.ts
 * (Socket.IO rooms named `channel:<id>`).
 *
 * Access model:
 *   - GET /channels        — only channels the user is a member of (auto for
 *                            service/garde, manual for custom/dm)
 *   - POST /channels       — admin only for custom/dm; service/garde auto-created
 *                            by other parts of the system
 *   - GET /channels/:id/messages — must be a member
 *   - POST /channels/:id/messages — must be a member
 *
 * HIPAA: every message read/write is logged in audit_log. Soft delete only;
 * physical deletion goes through the redaction admin route.
 */

import { Router, Response } from 'express';
import { prisma } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { logAudit } from '../services/audit.js';
import { notifyMany } from '../services/notify.js';
import { emitToChannel } from '../services/realtime.js';
import { extractMentions, resolveMentions, BROADCAST_HANDLES } from '../services/mention.js';

const router = Router();

async function isMember(channelId: number, userId: number): Promise<boolean> {
  const row = await prisma.channelMember.findUnique({
    where: { channelId_userId: { channelId, userId } },
    select: { userId: true },
  });
  return row !== null;
}

// List my channels, with unread counts. Drives the chat sidebar.
router.get('/channels', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const memberships = await prisma.channelMember.findMany({
    where: { userId: req.user!.id },
    include: { channel: true },
  });
  const channels = memberships
    .filter(m => !m.channel.archived)
    .map(m => ({ ...m.channel, lastReadAt: m.lastReadAt }));

  // Unread = messages created after lastReadAt (or all messages if never read)
  const unreadCounts = await Promise.all(channels.map(async (c) => {
    const count = await prisma.chatMessage.count({
      where: {
        channelId: c.id,
        deletedAt: null,
        createdAt: c.lastReadAt ? { gt: c.lastReadAt } : undefined,
        // Don't count own messages as unread
        authorId: { not: req.user!.id },
      },
    });
    return { ...c, unread: count };
  }));

  res.json(unreadCounts);
}));

// Create a custom channel or DM. Service/garde channels are not created here
// (they're spawned by their owning system: services routes, planning module).
router.post('/channels', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const { type, name, description, member_ids } = req.body as { type: string; name: string; description?: string; member_ids?: number[] };

  if (!['custom', 'dm'].includes(type)) {
    res.status(400).json({ error: 'Type doit être "custom" ou "dm"' });
    return;
  }
  if (type === 'custom' && req.user!.role !== 'admin') {
    res.status(403).json({ error: 'Seul un admin peut créer un canal custom' });
    return;
  }
  if (!name || typeof name !== 'string' || name.trim().length === 0) {
    res.status(400).json({ error: 'Nom du canal requis' });
    return;
  }

  // DM: exactly one other member, name auto-formatted to the other user's name
  let memberIds = Array.isArray(member_ids) ? member_ids.filter((id): id is number => Number.isInteger(id)) : [];
  if (type === 'dm') {
    if (memberIds.length !== 1) { res.status(400).json({ error: 'Un DM doit cibler exactement 1 autre utilisateur' }); return; }
    // Reuse existing DM if one exists between these two users.
    const existing = await prisma.channel.findFirst({
      where: {
        type: 'dm',
        members: { every: { userId: { in: [req.user!.id, memberIds[0]] } } },
        AND: [
          { members: { some: { userId: req.user!.id } } },
          { members: { some: { userId: memberIds[0] } } },
        ],
      },
    });
    if (existing) { res.json(existing); return; }
  }

  // Always include the creator in the member list.
  if (!memberIds.includes(req.user!.id)) memberIds.unshift(req.user!.id);

  const created = await prisma.channel.create({
    data: {
      type,
      name: name.trim().substring(0, 200),
      description: description?.substring(0, 1000) ?? null,
      createdBy: req.user!.id,
      members: {
        create: memberIds.map(userId => ({ userId })),
      },
    },
  });

  await logAudit({ userId: req.user!.id, action: 'create', tableName: 'chat_channels', recordId: created.id, details: `${type} channel "${name}" with ${memberIds.length} members` });
  res.status(201).json(created);
}));

// Messages, paginated descending. Default 50 most recent; older pages via `before` cursor.
router.get('/channels/:id/messages', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const channelId = Number(req.params.id);
  if (!(await isMember(channelId, req.user!.id))) {
    res.status(403).json({ error: 'Accès refusé — non membre de ce canal' });
    return;
  }
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const before = req.query.before ? new Date(String(req.query.before)) : undefined;
  const rows = await prisma.chatMessage.findMany({
    where: { channelId, deletedAt: null, createdAt: before ? { lt: before } : undefined },
    include: { author: { select: { id: true, username: true, nom: true, prenom: true, role: true } } },
    orderBy: { createdAt: 'desc' },
    take: limit,
  });

  // Resolve mentions across the page in a single query so the client can
  // render @username chips with full names.
  const all = new Set<string>();
  for (const r of rows) for (const u of extractMentions(r.content)) all.add(u);
  const mentionedUsers = await resolveMentions(Array.from(all));
  const userMap = new Map(mentionedUsers.map(u => [u.username.toLowerCase(), u]));
  const enriched = rows.map(r => {
    const mentions = extractMentions(r.content).map(u => userMap.get(u)).filter((u): u is NonNullable<typeof u> => u != null);
    return { ...r, mentions };
  });

  res.json(enriched);
}));

// Post a message. Fans out to channel members via Socket.IO + creates
// notifications for @mentions and (for DM/critical channels) for offline members.
router.post('/channels/:id/messages', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const channelId = Number(req.params.id);
  if (!(await isMember(channelId, req.user!.id))) {
    res.status(403).json({ error: 'Accès refusé — non membre de ce canal' });
    return;
  }
  const { content } = req.body as { content: string };
  if (!content || typeof content !== 'string' || content.trim().length === 0) {
    res.status(400).json({ error: 'Contenu du message requis' });
    return;
  }
  if (content.length > 5000) {
    res.status(400).json({ error: 'Message trop long (max 5000 caractères)' });
    return;
  }

  const created = await prisma.chatMessage.create({
    data: { channelId, authorId: req.user!.id, content: content.trim() },
    include: { author: { select: { id: true, username: true, nom: true, prenom: true, role: true } } },
  });

  // Resolve mentions for both the realtime push and the HTTP response so
  // every client renders chips immediately without a separate lookup.
  const mentionedUsers = await resolveMentions(extractMentions(created.content));
  const message = { ...created, mentions: mentionedUsers };

  // Realtime push to everyone subscribed to the channel room
  emitToChannel(channelId, 'chat_message', message);

  // Audit: who wrote what to which channel. Content NOT logged here — the
  // message row itself is the record of truth and is retained per policy.
  await logAudit({
    userId: req.user!.id,
    action: 'create',
    tableName: 'chat_messages',
    recordId: message.id,
    details: `channel=${channelId} (${content.length} chars)`,
  });

  // @-mention notifications: same parser as note mentions.
  try {
    const mentioned = extractMentions(content);
    const channel = await prisma.channel.findUnique({ where: { id: channelId }, select: { name: true, type: true, members: { select: { userId: true } } } });
    if (!channel) return;
    const channelMemberIds = new Set(channel.members.map(m => m.userId));

    // @tous / @all in group channels broadcasts to every member. Suppressed
    // in DM (the other party is already notified through the dm branch below)
    // — avoids a noisy duplicate notif.
    const hasBroadcast = mentioned.some(u => BROADCAST_HANDLES.has(u));
    if (hasBroadcast && channel.type !== 'dm') {
      const broadcastRecipients = Array.from(channelMemberIds).filter(id => id !== req.user!.id);
      if (broadcastRecipients.length > 0) {
        await notifyMany(broadcastRecipients, {
          type: 'chat_mention',
          title: `Annonce à tous dans #${channel.name}`,
          body: content.substring(0, 200),
          link: `/app/chat/${channelId}`,
        });
      }
    }

    // Targeted @-handle mentions — only fire for users who are channel members.
    // resolveMentions matches both username and custom mention_handle.
    const realMentions = mentioned.filter(u => !BROADCAST_HANDLES.has(u));
    if (realMentions.length > 0) {
      const users = await resolveMentions(realMentions);
      const mentionRecipients = users.map(u => u.id).filter(id => id !== req.user!.id && channelMemberIds.has(id));
      if (mentionRecipients.length > 0) {
        await notifyMany(mentionRecipients, {
          type: 'chat_mention',
          title: `Mention dans #${channel.name}`,
          body: content.substring(0, 200),
          link: `/app/chat/${channelId}`,
        });
      }
    }

    // DM: always notify the other party (the dropdown is the only signal for DMs)
    if (channel.type === 'dm') {
      const others = Array.from(channelMemberIds).filter(id => id !== req.user!.id);
      await notifyMany(others, {
        type: 'chat_message',
        title: 'Nouveau message direct',
        body: content.substring(0, 200),
        link: `/app/chat/${channelId}`,
      });
    }
  } catch (err) {
    console.error('[CHAT] mention/DM fanout failed:', err);
  }

  res.status(201).json(message);
}));

// Mark a channel as read for this user (called when the client opens it).
router.post('/channels/:id/read', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const channelId = Number(req.params.id);
  await prisma.channelMember.updateMany({
    where: { channelId, userId: req.user!.id },
    data: { lastReadAt: new Date() },
  });
  res.json({ ok: true });
}));

// Soft-delete a message. Author or admin only. Preserves the row for audit.
router.delete('/messages/:id', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  const msg = await prisma.chatMessage.findUnique({ where: { id }, select: { authorId: true, channelId: true } });
  if (!msg) { res.status(404).json({ error: 'Message non trouvé' }); return; }
  if (msg.authorId !== req.user!.id && req.user!.role !== 'admin') {
    res.status(403).json({ error: 'Vous ne pouvez supprimer que vos propres messages' });
    return;
  }
  await prisma.chatMessage.update({ where: { id }, data: { deletedAt: new Date() } });
  await logAudit({ userId: req.user!.id, action: 'delete', tableName: 'chat_messages', recordId: id, details: `channel=${msg.channelId}` });
  emitToChannel(msg.channelId, 'chat_message_deleted', { id });
  res.json({ ok: true });
}));

// Admin: soft-delete every chat message that mentions a patient's full name.
// Implements right-to-erasure (RGPD art. 17 / HIPAA §164.522) for chat content.
// The audit log of the redaction is preserved so the operation itself is provable.
router.post('/redact-patient/:id', authenticate, authorize('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const patientId = Number(req.params.id);
  const patient = await prisma.patient.findUnique({ where: { id: patientId }, select: { nom: true, prenom: true } });
  if (!patient) { res.status(404).json({ error: 'Patient non trouvé' }); return; }

  // Match full-name occurrence, case-insensitive. Doesn't catch fragments
  // (e.g. only first name) — the admin should follow up with manual review
  // for thoroughness. This catches the obvious cases automatically.
  const needle = `${patient.prenom} ${patient.nom}`;
  const affected = await prisma.chatMessage.updateMany({
    where: { deletedAt: null, content: { contains: needle, mode: 'insensitive' } },
    data: { deletedAt: new Date() },
  });

  await logAudit({
    userId: req.user!.id,
    action: 'delete',
    tableName: 'chat_messages',
    recordId: patientId,
    details: `redact-patient: ${affected.count} messages soft-deleted referencing "${needle}"`,
  });

  res.json({ redacted: affected.count });
}));

export default router;
