import { Router, Response, Request } from 'express';
import { prisma } from '../config/db.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';

const router = Router();

// FHIR CapabilityStatement (public — describes server capabilities)
router.get('/metadata', (_req: Request, res: Response): void => {
  res.json({
    resourceType: 'CapabilityStatement',
    status: 'active',
    date: new Date().toISOString(),
    kind: 'instance',
    software: { name: 'Hospital ERP', version: '1.0.0' },
    fhirVersion: '4.0.1',
    format: ['json'],
    rest: [{ mode: 'server', security: { service: [{ coding: [{ system: 'http://terminology.hl7.org/CodeSystem/restful-security-service', code: 'Bearer' }] }] }, resource: [
      { type: 'Patient', interaction: [{ code: 'read' }, { code: 'search-type' }] },
      { type: 'Encounter', interaction: [{ code: 'read' }, { code: 'search-type' }] },
      { type: 'Observation', interaction: [{ code: 'search-type' }] },
      { type: 'MedicationRequest', interaction: [{ code: 'search-type' }] },
      { type: 'Appointment', interaction: [{ code: 'search-type' }] },
    ]}],
  });
});

// FHIR Patient — SECURED
router.get('/Patient/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const p = await prisma.patient.findUnique({ where: { id: Number(req.params.id) } });
    if (!p) { res.status(404).json({ resourceType: 'OperationOutcome', issue: [{ severity: 'error', code: 'not-found' }] }); return; }
    res.json({
      resourceType: 'Patient',
      id: String(p.id),
      identifier: [{ system: 'urn:hospital-erp', value: String(p.id) }, ...(p.numeroIdentite ? [{ system: 'urn:national-id', value: p.numeroIdentite }] : [])],
      name: [{ family: p.nom, given: [p.prenom, p.deuxiemePrenom].filter(Boolean) }],
      gender: p.sexe === 'M' ? 'male' : p.sexe === 'F' ? 'female' : 'unknown',
      birthDate: p.dateNaissance ? new Date(p.dateNaissance).toISOString().split('T')[0] : undefined,
      telecom: [...(p.telephone ? [{ system: 'phone', value: p.telephone }] : []), ...(p.email ? [{ system: 'email', value: p.email }] : [])],
      address: [{ city: p.ville, state: p.province, country: p.pays, line: [p.adresse].filter(Boolean) }],
      active: !p.archived,
    });
  } catch (err) { res.status(500).json({ resourceType: 'OperationOutcome', issue: [{ severity: 'error', code: 'exception' }] }); }
});

// FHIR Patient Search — SECURED
router.get('/Patient', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { name, _count = '20' } = req.query;
    const take = Math.min(100, parseInt(_count as string) || 20);
    const where: any = { archived: false };
    if (name) {
      where.OR = [
        { nom: { contains: String(name), mode: 'insensitive' } },
        { prenom: { contains: String(name), mode: 'insensitive' } },
      ];
    }
    const rows = await prisma.patient.findMany({ where, take });
    res.json({
      resourceType: 'Bundle', type: 'searchset', total: rows.length,
      entry: rows.map(p => ({
        resource: {
          resourceType: 'Patient', id: String(p.id),
          name: [{ family: p.nom, given: [p.prenom] }],
          gender: p.sexe === 'M' ? 'male' : p.sexe === 'F' ? 'female' : 'unknown',
          birthDate: p.dateNaissance ? new Date(p.dateNaissance).toISOString().split('T')[0] : undefined,
        }
      })),
    });
  } catch (err) { res.status(500).json({ resourceType: 'OperationOutcome', issue: [{ severity: 'error', code: 'exception' }] }); }
});

// FHIR Observation search by patient — SECURED
router.get('/Observation', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { patient } = req.query;
    if (!patient) { res.status(400).json({ resourceType: 'OperationOutcome', issue: [{ severity: 'error', code: 'required', details: { text: 'patient parameter required' } }] }); return; }
    const rows = await prisma.$queryRaw<any[]>`
      SELECT o.*, c.nom AS concept_nom, c.code AS concept_code, c.unite
      FROM observations o
      LEFT JOIN concepts c ON o.concept_id = c.id
      WHERE o.patient_id = ${Number(patient)} AND o.voided = FALSE
      ORDER BY o.date_obs DESC
      LIMIT 50
    `;
    res.json({
      resourceType: 'Bundle', type: 'searchset', total: rows.length,
      entry: rows.map((o: any) => ({
        resource: {
          resourceType: 'Observation', id: String(o.id), status: 'final',
          code: { coding: [{ system: 'urn:hospital-erp:concepts', code: o.concept_code || String(o.concept_id), display: o.concept_nom }] },
          subject: { reference: `Patient/${o.patient_id}` },
          effectiveDateTime: o.date_obs,
          ...(o.valeur_numerique != null ? { valueQuantity: { value: parseFloat(o.valeur_numerique), unit: o.unite || '' } } : {}),
          ...(o.valeur_texte ? { valueString: o.valeur_texte } : {}),
          ...(o.valeur_boolean != null ? { valueBoolean: o.valeur_boolean } : {}),
        }
      })),
    });
  } catch (err) { res.status(500).json({ resourceType: 'OperationOutcome', issue: [{ severity: 'error', code: 'exception' }] }); }
});

export default router;
