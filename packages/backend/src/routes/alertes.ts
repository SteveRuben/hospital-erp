import { Router } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/db.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { validate, createAlerteSchema } from '../middleware/validation.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requirePatientAccess } from '../middleware/patient-access.js';
import { requireResourceAccess } from '../middleware/resource-access.js';
import { notifyMany } from '../services/notify.js';

const router = Router();

const CRITICAL_SEVERITIES = new Set(['danger', 'critical']);

router.get('/:patientId', authenticate, requirePatientAccess, asyncHandler(async (req, res) => {
  const { active } = req.query;
  const where: Prisma.AlerteWhereInput = { patientId: Number(req.params.patientId) };
  if (active === 'true') where.active = true;
  const rows = await prisma.alerte.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { creator: { select: { nom: true, prenom: true } } },
  });
  res.json(rows.map(r => ({
    ...r,
    created_nom: r.creator?.nom ?? null,
    created_prenom: r.creator?.prenom ?? null,
  })));
}));

router.post('/', authenticate, validate(createAlerteSchema), requirePatientAccess, asyncHandler(async (req, res) => {
  const authReq = req as AuthRequest;
  const { patient_id, type_alerte, message, severite } = req.body;
  const created = await prisma.alerte.create({
    data: {
      patientId: patient_id,
      typeAlerte: type_alerte,
      message,
      severite: severite || 'info',
      createdBy: authReq.user!.id,
    },
  });

  // Workflow notification: a critical-severity alert fans out to admins and
  // to medecins attributed to this patient. Best-effort — never roll back
  // the alert creation on a notification failure.
  if (CRITICAL_SEVERITIES.has(created.severite)) {
    try {
      const [admins, attributions, patient] = await Promise.all([
        prisma.user.findMany({ where: { role: 'admin' }, select: { id: true } }),
        prisma.patientAttribution.findMany({
          where: { patientId: patient_id, actif: true, medecinUserId: { not: null } },
          select: { medecinUserId: true },
        }),
        prisma.patient.findUnique({ where: { id: patient_id }, select: { nom: true, prenom: true } }),
      ]);
      const recipients = [
        ...admins.map(a => a.id),
        ...attributions.map(a => a.medecinUserId).filter((id): id is number => id != null),
      ].filter(id => id !== authReq.user!.id);

      const patientLabel = patient ? `${patient.prenom} ${patient.nom}` : `patient #${patient_id}`;
      await notifyMany(recipients, {
        type: 'mention',
        title: `Alerte ${created.severite} sur ${patientLabel}`,
        body: message.substring(0, 200),
        link: `/app/patients/${patient_id}#alertes`,
      });
    } catch (err) {
      console.error('[ALERTES] notification fanout failed:', err);
    }
  }

  res.status(201).json(created);
}));

router.put('/:id/toggle', authenticate, requireResourceAccess('alerte'), asyncHandler(async (req, res) => {
  const id = Number(req.params.id);
  const current = await prisma.alerte.findUnique({ where: { id }, select: { active: true } });
  if (!current) { res.status(404).json({ error: 'Non trouvé' }); return; }
  const updated = await prisma.alerte.update({ where: { id }, data: { active: !current.active } });
  res.json(updated);
}));

router.delete('/:id', authenticate, requireResourceAccess('alerte'), asyncHandler(async (req, res) => {
  try {
    await prisma.alerte.delete({ where: { id: Number(req.params.id) } });
  } catch { /* ignore not found */ }
  res.json({ message: 'Supprimé' });
}));

export default router;
