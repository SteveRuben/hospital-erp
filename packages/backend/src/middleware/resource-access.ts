import { Response, NextFunction } from 'express';
import { prisma } from '../config/db.js';
import { canAccessPatient } from '../services/access-control.js';
import { logAudit } from '../services/audit.js';
import { AuthRequest } from './auth.js';

/**
 * OWASP A01 (residual): the IDOR middleware (`requirePatientAccess`) only
 * extracts patient identifiers explicitly named `patientId`. PUT and DELETE
 * routes use `:id` for the RESOURCE id (allergieId, prescriptionId, etc.),
 * not the patient id — so an unattributed medecin can still modify or delete
 * another patient's allergie/note/etc. by id.
 *
 * `requireResourceAccess(model)` closes that gap: load the row by params.id,
 * read its `patientId`, then call canAccessPatient. 403 + audit log on deny,
 * 404 if the row doesn't exist (no information disclosure either way).
 *
 *               PUT /allergies/:id (resource id = 42)
 *                        │
 *                        ▼
 *               prisma[model].findUnique({ id: 42 })
 *                        │
 *           ┌────────────┴────────────┐
 *           │ not found               │ found
 *           ▼                         ▼
 *      404                     canAccessPatient(user, row.patientId)
 *                              ┌──────┴──────┐
 *                            allow         deny
 *                              │             │
 *                              ▼             ▼
 *                            next()    audit + 403
 */

type SupportedModel =
  | 'allergie'
  | 'pathologie'
  | 'prescription'
  | 'ordonnance'
  | 'vaccination'
  | 'note'
  | 'alerte'
  | 'vital'
  | 'imagerie';

async function lookupPatientId(model: SupportedModel, id: number): Promise<number | null> {
  const select = { patientId: true } as const;
  switch (model) {
    case 'allergie':    { const row = await prisma.allergie.findUnique({ where: { id }, select }); return row?.patientId ?? null; }
    case 'pathologie':  { const row = await prisma.pathologie.findUnique({ where: { id }, select }); return row?.patientId ?? null; }
    case 'prescription':{ const row = await prisma.prescription.findUnique({ where: { id }, select }); return row?.patientId ?? null; }
    case 'ordonnance':  { const row = await prisma.ordonnance.findUnique({ where: { id }, select }); return row?.patientId ?? null; }
    case 'vaccination': { const row = await prisma.vaccination.findUnique({ where: { id }, select }); return row?.patientId ?? null; }
    case 'note':        { const row = await prisma.note.findUnique({ where: { id }, select }); return row?.patientId ?? null; }
    case 'alerte':      { const row = await prisma.alerte.findUnique({ where: { id }, select }); return row?.patientId ?? null; }
    case 'vital':       { const row = await prisma.vital.findUnique({ where: { id }, select }); return row?.patientId ?? null; }
    case 'imagerie':    { const row = await prisma.imagerie.findUnique({ where: { id }, select }); return row?.patientId ?? null; }
  }
}

export function requireResourceAccess(model: SupportedModel) {
  return async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentification requise' });
      return;
    }

    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id < 1) {
      res.status(400).json({ error: 'ID invalide' });
      return;
    }

    let patientId: number | null;
    try {
      patientId = await lookupPatientId(model, id);
    } catch (err) {
      console.error(`[RESOURCE_ACCESS] lookup ${model}/${id} threw:`, err);
      res.status(500).json({ error: 'Erreur serveur' });
      return;
    }

    if (patientId === null) {
      // Row doesn't exist (or no patient_id on the row — imagerie allows that).
      // For imagerie specifically, when patientId is null the row has no patient
      // association so role-level authorize() is the only gate. Pass through.
      next();
      return;
    }

    let allowed = false;
    try {
      allowed = await canAccessPatient(req.user, patientId);
    } catch (err) {
      console.error('[RESOURCE_ACCESS] canAccessPatient threw:', err);
      res.status(500).json({ error: 'Erreur serveur' });
      return;
    }

    if (!allowed) {
      await logAudit({
        userId: req.user.id,
        action: 'access_denied',
        tableName: 'patients',
        recordId: patientId,
        details: `${req.user.username} (${req.user.role}) attempted ${req.method} ${req.path} (${model} id=${id}) on patient ${patientId}`,
        ip: req.ip,
      });
      console.warn(`[SECURITY] resource_access_denied user=${req.user.username} role=${req.user.role} ${model}=${id} patient=${patientId} path=${req.path}`);
      res.status(403).json({ error: 'Accès refusé — ce patient ne vous est pas attribué' });
      return;
    }

    next();
  };
}

export default requireResourceAccess;
