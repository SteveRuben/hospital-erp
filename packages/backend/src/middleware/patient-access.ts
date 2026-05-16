import { Response, NextFunction } from 'express';
import { canAccessPatient } from '../services/access-control.js';
import { logAudit } from '../services/audit.js';
import { AuthRequest } from './auth.js';

/**
 * OWASP A01: enforces canAccessPatient at every PHI route entry point.
 *
 * Resolves patientId from (in order): URL param `patientId`, URL param `id`,
 * `req.body.patient_id`, `req.query.patient_id`. Routes mounted with
 * `:patientId` get it from params; routes that take an id-of-resource and
 * derive patient via body get it from body.
 *
 *                Request
 *                   │
 *                   ▼
 *           extract patientId
 *           (params → body → query)
 *                   │
 *         ┌─────────┴──────────┐
 *         │ no patientId       │ has patientId
 *         ▼                    ▼
 *   pass-through         canAccessPatient(user, id)
 *   (let route          ┌──────┴──────┐
 *    handle 400)        │             │
 *                     allow         deny
 *                       │             │
 *                       ▼             ▼
 *                     next()    audit('access_denied') + 403
 *
 * OWASP A09: every denial writes an audit_log row with action='access_denied'
 * so repeated probing is visible to compliance review.
 */
export const requirePatientAccess = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ error: 'Authentification requise' });
    return;
  }

  // Only read explicit patient identifiers. Do NOT fall back to params.id,
  // because PUT /:id and DELETE /:id routes use :id for the RESOURCE id
  // (e.g. allergieId), not the patient id. Those routes need a separate
  // resource-level access check (load the row, get its patient_id, then check).
  const raw =
    req.params.patientId ??
    (req.body as Record<string, unknown> | undefined)?.patient_id ??
    req.query.patient_id;

  if (raw === undefined || raw === null || raw === '') {
    next();
    return;
  }

  const patientId = Number(raw);
  if (!Number.isInteger(patientId) || patientId < 1) {
    res.status(400).json({ error: 'patient_id invalide' });
    return;
  }

  let allowed = false;
  try {
    allowed = await canAccessPatient(req.user, patientId);
  } catch (err) {
    console.error('[ACCESS_CONTROL] canAccessPatient threw:', err);
    res.status(500).json({ error: 'Erreur serveur' });
    return;
  }

  if (!allowed) {
    await logAudit({
      userId: req.user.id,
      action: 'access_denied',
      tableName: 'patients',
      recordId: patientId,
      details: `${req.user.username} (${req.user.role}) attempted ${req.method} ${req.path} on patient ${patientId}`,
      ip: req.ip,
    });
    console.warn(`[SECURITY] access_denied user=${req.user.username} role=${req.user.role} patient=${patientId} path=${req.path}`);
    res.status(403).json({ error: 'Accès refusé — ce patient ne vous est pas attribué' });
    return;
  }

  next();
};

export default requirePatientAccess;
