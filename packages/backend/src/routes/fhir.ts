/**
 * FHIR R4 read-only facade. Exposes internal data as standard FHIR resources
 * for interoperability. Authenticated (reuses the staff JWT) and PHI-access
 * controlled: medecins only see patients they're attributed to, exactly like
 * the native API.
 *
 * Supported:
 *   GET /fhir/metadata                       → CapabilityStatement
 *   GET /fhir/Patient/:id                     → Patient
 *   GET /fhir/Patient?name=&_count=           → searchset Bundle
 *   GET /fhir/Observation?patient=:id         → Bundle (clinical obs + vitals)
 *   GET /fhir/Encounter?patient=:id           → Bundle
 *   GET /fhir/MedicationRequest?patient=:id   → Bundle
 *
 * Responses use Content-Type application/fhir+json. Errors are
 * FHIR OperationOutcome resources.
 */

import { Router, Request, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../config/db.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { canAccessPatient, accessiblePatientIds } from '../services/access-control.js';
import { logAudit } from '../services/audit.js';
import {
  patientToFhir, observationToFhir, vitalToFhirObservations, encounterToFhir,
  prescriptionToFhir, bundle, operationOutcome, capabilityStatement,
} from '../services/fhir.js';

const router = Router();

const FHIR_CT = 'application/fhir+json';
const baseUrlOf = (req: Request): string => {
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.get('host') || '';
  return `${proto}://${host}/fhir`;
};

const sendFhir = (res: Response, status: number, body: unknown): void => {
  res.status(status).type(FHIR_CT).send(JSON.stringify(body));
};

// CapabilityStatement — public-ish (still behind authenticate to avoid leaking
// server internals to anonymous scanners).
router.get('/metadata', authenticate, asyncHandler(async (req, res) => {
  sendFhir(res, 200, capabilityStatement(baseUrlOf(req)));
}));

// Patient read
router.get('/Patient/:id', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id < 1) { sendFhir(res, 400, operationOutcome('error', 'invalid', 'Identifiant patient invalide')); return; }

  if (!(await canAccessPatient(req.user!, id))) {
    await logAudit({ userId: req.user!.id, action: 'access_denied', tableName: 'patients', recordId: id, details: `FHIR Patient/${id}`, ip: req.ip });
    sendFhir(res, 403, operationOutcome('error', 'forbidden', 'Accès refusé à ce patient')); return;
  }

  const p = await prisma.patient.findUnique({ where: { id } });
  if (!p) { sendFhir(res, 404, operationOutcome('error', 'not-found', `Patient/${id} introuvable`)); return; }
  sendFhir(res, 200, patientToFhir(p));
}));

// Patient search by name (?name=, ?_count=)
router.get('/Patient', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const name = req.query.name ? String(req.query.name) : undefined;
  const count = Math.min(100, Math.max(1, Number(req.query._count) || 20));

  const where: Prisma.PatientWhereInput = { archived: false };
  if (name) {
    where.OR = [
      { nom: { contains: name, mode: 'insensitive' } },
      { prenom: { contains: name, mode: 'insensitive' } },
    ];
  }
  // HIPAA minimum necessary: medecins only get their attributed patients.
  const allowed = await accessiblePatientIds(req.user!);
  if (allowed !== null) where.id = { in: allowed };

  const rows = await prisma.patient.findMany({ where, take: count, orderBy: { nom: 'asc' } });
  sendFhir(res, 200, bundle(rows.map(patientToFhir), baseUrlOf(req)));
}));

// Observation search by patient (clinical observations + structured vitals)
router.get('/Observation', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const patientId = parsePatientParam(req.query.patient);
  if (patientId === null) { sendFhir(res, 400, operationOutcome('error', 'required', 'Paramètre patient requis (?patient=<id>)')); return; }
  if (!(await canAccessPatient(req.user!, patientId))) { sendFhir(res, 403, operationOutcome('error', 'forbidden', 'Accès refusé')); return; }

  const [obs, vitals] = await Promise.all([
    prisma.observation.findMany({
      where: { patientId },
      include: { concept: { select: { nom: true, unite: true } }, codedConcept: { select: { nom: true } } },
      orderBy: { dateObs: 'desc' },
      take: 200,
    }),
    prisma.vital.findMany({ where: { patientId }, orderBy: { dateMesure: 'desc' }, take: 100 }),
  ]);

  const resources = [
    ...obs.map(observationToFhir),
    ...vitals.flatMap(vitalToFhirObservations),
  ];
  sendFhir(res, 200, bundle(resources, baseUrlOf(req)));
}));

// Encounter search by patient
router.get('/Encounter', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const patientId = parsePatientParam(req.query.patient);
  if (patientId === null) { sendFhir(res, 400, operationOutcome('error', 'required', 'Paramètre patient requis (?patient=<id>)')); return; }
  if (!(await canAccessPatient(req.user!, patientId))) { sendFhir(res, 403, operationOutcome('error', 'forbidden', 'Accès refusé')); return; }

  const rows = await prisma.encounter.findMany({
    where: { patientId },
    include: {
      encounterType: { select: { nom: true } },
      provider: { select: { nom: true, prenom: true } },
      service: { select: { nom: true } },
    },
    orderBy: { dateEncounter: 'desc' },
    take: 200,
  });
  sendFhir(res, 200, bundle(rows.map(encounterToFhir), baseUrlOf(req)));
}));

// MedicationRequest search by patient (from prescriptions)
router.get('/MedicationRequest', authenticate, asyncHandler(async (req: AuthRequest, res: Response) => {
  const patientId = parsePatientParam(req.query.patient);
  if (patientId === null) { sendFhir(res, 400, operationOutcome('error', 'required', 'Paramètre patient requis (?patient=<id>)')); return; }
  if (!(await canAccessPatient(req.user!, patientId))) { sendFhir(res, 403, operationOutcome('error', 'forbidden', 'Accès refusé')); return; }

  const rows = await prisma.prescription.findMany({
    where: { patientId },
    include: { medecin: { select: { nom: true, prenom: true } } },
    orderBy: { dateDebut: 'desc' },
    take: 200,
  });
  sendFhir(res, 200, bundle(rows.map(prescriptionToFhir), baseUrlOf(req)));
}));

// Accepts both ?patient=42 and the FHIR reference form ?patient=Patient/42.
function parsePatientParam(raw: unknown): number | null {
  if (raw === undefined || raw === null) return null;
  const s = String(raw).replace(/^Patient\//, '');
  const n = Number(s);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export default router;
