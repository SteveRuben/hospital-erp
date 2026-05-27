import { Router } from 'express';
import { prisma } from '../config/db.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { validate, createNoteSchema } from '../middleware/validation.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requirePatientAccess } from '../middleware/patient-access.js';
import { requireResourceAccess } from '../middleware/resource-access.js';
import { notifyMany } from '../services/notify.js';
import { extractMentions, resolveMentions } from '../services/mention.js';

const router = Router();

router.get('/:patientId', authenticate, requirePatientAccess, asyncHandler(async (req, res) => {
  const rows = await prisma.note.findMany({
    where: { patientId: Number(req.params.patientId) },
    include: { auteur: { select: { nom: true, prenom: true, role: true } } },
    orderBy: { createdAt: 'desc' },
  });
  // Resolve @mentions server-side so the frontend renders chips with full
  // names instead of raw @username tokens. Single query for all notes,
  // matches both username and custom mention_handle.
  const allMentions = new Set<string>();
  for (const n of rows) for (const u of extractMentions(n.contenu)) allMentions.add(u);
  const mentionedUsers = await resolveMentions(Array.from(allMentions));
  // A user can be reached by either their username or their custom handle;
  // build a lookup that resolves both so the chip resolution works whichever
  // form the author typed.
  const userByHandle = new Map<string, typeof mentionedUsers[number]>();
  for (const u of mentionedUsers) {
    userByHandle.set(u.username.toLowerCase(), u);
    if (u.mention_handle) userByHandle.set(u.mention_handle.toLowerCase(), u);
  }

  const mapped = rows.map(n => {
    const usernames = extractMentions(n.contenu);
    const mentions = usernames.map(u => userByHandle.get(u)).filter((u): u is NonNullable<typeof u> => u != null);
    return {
      ...n,
      // Frontend expects snake_case; Prisma returns camelCase. The note's
      // own timestamp was the source of the "Invalid Date" the user saw.
      created_at: n.createdAt,
      type_note: n.typeNote,
      patient_id: n.patientId,
      auteur_id: n.auteurId,
      auteur_nom: n.auteur?.nom ?? null,
      auteur_prenom: n.auteur?.prenom ?? null,
      auteur_role: n.auteur?.role ?? null,
      mentions,
    };
  });
  res.json(mapped);
}));

router.post('/', authenticate, validate(createNoteSchema), requirePatientAccess, asyncHandler(async (req, res) => {
  const authReq = req as AuthRequest;
  const { patient_id, titre, contenu, type_note } = req.body;
  const created = await prisma.note.create({
    data: {
      patientId: Number(patient_id),
      auteurId: authReq.user!.id,
      titre: titre ?? null,
      contenu,
      typeNote: type_note || 'general',
    },
  });

  // Fan out @-mentions to in-app notifications. Best-effort: a notification
  // failure must not roll back the note creation. Uses the shared mention
  // service so username + custom mention_handle both work.
  try {
    const handles = extractMentions(contenu);
    if (handles.length > 0) {
      const users = await resolveMentions(handles);
      // Don't notify the author when they mention themselves.
      const recipientIds = users.map(u => u.id).filter(id => id !== authReq.user!.id);
      if (recipientIds.length > 0) {
        const authorName = `${authReq.user!.username}`;
        const previewBody = contenu.length > 200 ? contenu.substring(0, 200) + '…' : contenu;
        await notifyMany(recipientIds, {
          type: 'mention',
          title: `${authorName} vous a mentionné dans une note`,
          body: previewBody,
          link: `/app/patients/${patient_id}#notes`,
        });
      }
    }
  } catch (err) {
    console.error('[NOTES] mention fanout failed:', err);
  }

  res.status(201).json(created);
}));

router.delete('/:id', authenticate, requireResourceAccess('note'), asyncHandler(async (req, res) => {
  try {
    await prisma.note.delete({ where: { id: Number(req.params.id) } });
  } catch { /* ignore */ }
  res.json({ message: 'Supprimé' });
}));

export default router;
