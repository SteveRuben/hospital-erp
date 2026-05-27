import { Router } from 'express';
import { prisma } from '../config/db.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { validate, createNoteSchema } from '../middleware/validation.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requirePatientAccess } from '../middleware/patient-access.js';
import { requireResourceAccess } from '../middleware/resource-access.js';
import { notifyMany } from '../services/notify.js';

const router = Router();

// Matches @username — letters, digits, dot, underscore, hyphen — 2-100 chars.
// Anchored at word boundaries so "email@example.com" is NOT a mention.
// Capture group 1 is the bare username.
const MENTION_RE = /(?:^|\s)@([a-zA-Z0-9._-]{2,100})\b/g;

function extractMentions(content: string): string[] {
  const matches = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = MENTION_RE.exec(content)) !== null) matches.add(m[1].toLowerCase());
  return Array.from(matches);
}

router.get('/:patientId', authenticate, requirePatientAccess, asyncHandler(async (req, res) => {
  const rows = await prisma.note.findMany({
    where: { patientId: Number(req.params.patientId) },
    include: { auteur: { select: { nom: true, prenom: true, role: true } } },
    orderBy: { createdAt: 'desc' },
  });
  const mapped = rows.map(n => ({
    ...n,
    auteur_nom: n.auteur?.nom ?? null,
    auteur_prenom: n.auteur?.prenom ?? null,
    auteur_role: n.auteur?.role ?? null,
  }));
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

  // Fan out @username mentions to in-app notifications. Best-effort: a
  // notification failure must not roll back the note creation.
  try {
    const mentionedUsernames = extractMentions(contenu);
    if (mentionedUsernames.length > 0) {
      const users = await prisma.user.findMany({
        where: { username: { in: mentionedUsernames, mode: 'insensitive' } },
        select: { id: true },
      });
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
