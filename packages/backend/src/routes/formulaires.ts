/**
 * Dynamic forms (formulaires) + responses (formulaire_reponses).
 *
 * A formulaire stores a JSON schema describing fields; a response stores
 * the user-filled values keyed by field id. Lets admins build clinical
 * questionnaires (anamnèse, suivi diabète, dépistage…) without code.
 *
 * Schema shape (validated lightly here — the renderer is the strict consumer):
 *   { fields: [{ id, label, type, required?, options?, placeholder? }] }
 *   type ∈ text | textarea | number | date | boolean | select
 */

import { Router, Response } from 'express';
import { prisma } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { requirePatientAccess } from '../middleware/patient-access.js';
import { logAudit } from '../services/audit.js';

const router = Router();

const ALLOWED_TYPES = new Set(['text', 'textarea', 'number', 'date', 'boolean', 'select']);

function validateSchema(raw: unknown): { ok: true; json: string } | { ok: false; reason: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, reason: 'Schema requis' };
  const obj = raw as Record<string, unknown>;
  if (!Array.isArray(obj.fields)) return { ok: false, reason: 'Schema.fields doit être un tableau' };
  const seenIds = new Set<string>();
  for (const f of obj.fields as Array<Record<string, unknown>>) {
    if (!f || typeof f !== 'object') return { ok: false, reason: 'Champ invalide' };
    if (typeof f.id !== 'string' || !/^[a-zA-Z_][a-zA-Z0-9_]{0,49}$/.test(f.id)) return { ok: false, reason: `Identifiant invalide: ${String(f.id)}` };
    if (seenIds.has(f.id)) return { ok: false, reason: `Identifiant en doublon: ${f.id}` };
    seenIds.add(f.id);
    if (typeof f.label !== 'string' || f.label.trim().length === 0) return { ok: false, reason: `Libellé manquant sur ${f.id}` };
    if (typeof f.type !== 'string' || !ALLOWED_TYPES.has(f.type)) return { ok: false, reason: `Type non supporté sur ${f.id}` };
    if (f.type === 'select' && (!Array.isArray(f.options) || f.options.length === 0)) {
      return { ok: false, reason: `Le champ ${f.id} (select) doit déclarer des options` };
    }
  }
  return { ok: true, json: JSON.stringify({ fields: obj.fields }) };
}

// ── Formulaire definitions ─────────────────────────────────────────────────

router.get('/', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const { actif, service_id } = req.query;
  const rows = await prisma.formulaire.findMany({
    where: {
      ...(actif === 'true' ? { actif: true } : actif === 'false' ? { actif: false } : {}),
      ...(service_id ? { serviceId: Number(service_id) } : {}),
    },
    orderBy: { nom: 'asc' },
  });
  // Parse schema for client convenience
  res.json(rows.map(r => ({ ...r, schema: safeParse(r.schemaJson) })));
}));

router.get('/:id', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  const f = await prisma.formulaire.findUnique({ where: { id } });
  if (!f) { res.status(404).json({ error: 'Formulaire non trouvé' }); return; }
  res.json({ ...f, schema: safeParse(f.schemaJson) });
}));

router.post('/', authenticate, authorize('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const { nom, description, service_id, schema } = req.body as { nom: string; description?: string; service_id?: number; schema: unknown };
  if (!nom || typeof nom !== 'string') { res.status(400).json({ error: 'Nom requis' }); return; }
  const v = validateSchema(schema);
  if (!v.ok) { res.status(400).json({ error: v.reason }); return; }
  const created = await prisma.formulaire.create({
    data: { nom: nom.trim().substring(0, 200), description: description?.substring(0, 1000) ?? null, serviceId: service_id ?? null, schemaJson: v.json },
  });
  await logAudit({ userId: req.user!.id, action: 'create', tableName: 'formulaires', recordId: created.id, details: `formulaire "${nom}"` });
  res.status(201).json(created);
}));

router.put('/:id', authenticate, authorize('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  const { nom, description, service_id, schema, actif } = req.body as { nom?: string; description?: string; service_id?: number | null; schema?: unknown; actif?: boolean };
  const data: Parameters<typeof prisma.formulaire.update>[0]['data'] = {};
  if (nom !== undefined) data.nom = String(nom).trim().substring(0, 200);
  if (description !== undefined) data.description = description ? String(description).substring(0, 1000) : null;
  if (service_id !== undefined) data.serviceId = service_id;
  if (actif !== undefined) data.actif = Boolean(actif);
  if (schema !== undefined) {
    const v = validateSchema(schema);
    if (!v.ok) { res.status(400).json({ error: v.reason }); return; }
    data.schemaJson = v.json;
  }
  try {
    const updated = await prisma.formulaire.update({ where: { id }, data });
    await logAudit({ userId: req.user!.id, action: 'update', tableName: 'formulaires', recordId: id });
    res.json(updated);
  } catch {
    res.status(404).json({ error: 'Formulaire non trouvé' });
  }
}));

router.delete('/:id', authenticate, authorize('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  try {
    await prisma.formulaire.delete({ where: { id } });
    await logAudit({ userId: req.user!.id, action: 'delete', tableName: 'formulaires', recordId: id });
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: 'Formulaire non trouvé' });
  }
}));

// ── Responses ──────────────────────────────────────────────────────────────

// All responses for a patient (timeline / history view)
router.get('/reponses/patient/:patientId', authenticate, requirePatientAccess, asyncHandler(async (req: AuthRequest, res: Response) => {
  const patientId = Number(req.params.patientId);
  const rows = await prisma.formulaireReponse.findMany({
    where: { patientId },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  const formIds = Array.from(new Set(rows.map(r => r.formulaireId).filter((v): v is number => v != null)));
  const userIds = Array.from(new Set(rows.map(r => r.rempliPar).filter((v): v is number => v != null)));
  const [forms, users] = await Promise.all([
    formIds.length ? prisma.formulaire.findMany({ where: { id: { in: formIds } }, select: { id: true, nom: true, schemaJson: true } }) : Promise.resolve([]),
    userIds.length ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, nom: true, prenom: true } }) : Promise.resolve([]),
  ]);
  const formMap = new Map(forms.map(f => [f.id, f]));
  const userMap = new Map(users.map(u => [u.id, u]));
  res.json(rows.map(r => ({
    ...r,
    donnees: safeParse(r.donneesJson),
    formulaire_nom: r.formulaireId != null ? formMap.get(r.formulaireId)?.nom ?? null : null,
    schema: r.formulaireId != null ? safeParse(formMap.get(r.formulaireId)?.schemaJson ?? '') : null,
    rempli_par_nom: r.rempliPar != null ? userMap.get(r.rempliPar)?.nom ?? null : null,
    rempli_par_prenom: r.rempliPar != null ? userMap.get(r.rempliPar)?.prenom ?? null : null,
  })));
}));

// Submit a new response
router.post('/reponses', authenticate, requirePatientAccess, asyncHandler(async (req: AuthRequest, res: Response) => {
  const { formulaire_id, patient_id, donnees } = req.body as { formulaire_id: number; patient_id: number; donnees: Record<string, unknown> };
  if (!Number.isInteger(formulaire_id) || !Number.isInteger(patient_id)) { res.status(400).json({ error: 'formulaire_id et patient_id requis' }); return; }
  if (!donnees || typeof donnees !== 'object') { res.status(400).json({ error: 'donnees requises' }); return; }

  const form = await prisma.formulaire.findUnique({ where: { id: formulaire_id }, select: { id: true, schemaJson: true } });
  if (!form) { res.status(404).json({ error: 'Formulaire non trouvé' }); return; }
  const schema = safeParse(form.schemaJson) as { fields?: Array<{ id: string; required?: boolean; type: string }> } | null;
  // Verify required fields are present (light check; the renderer also enforces).
  for (const f of schema?.fields ?? []) {
    if (f.required && (donnees[f.id] === undefined || donnees[f.id] === null || donnees[f.id] === '')) {
      res.status(400).json({ error: `Champ requis manquant: ${f.id}` });
      return;
    }
  }

  const created = await prisma.formulaireReponse.create({
    data: { formulaireId: formulaire_id, patientId: patient_id, rempliPar: req.user!.id, donneesJson: JSON.stringify(donnees) },
  });
  await logAudit({ userId: req.user!.id, action: 'create', tableName: 'formulaire_reponses', recordId: created.id, details: `formulaire ${formulaire_id} / patient ${patient_id}` });
  res.status(201).json(created);
}));

router.delete('/reponses/:id', authenticate, authorize('admin'), asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  try {
    await prisma.formulaireReponse.delete({ where: { id } });
    await logAudit({ userId: req.user!.id, action: 'delete', tableName: 'formulaire_reponses', recordId: id });
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: 'Réponse non trouvée' });
  }
}));

function safeParse(json: string | null | undefined): unknown {
  if (!json) return null;
  try { return JSON.parse(json); } catch { return null; }
}

export default router;
