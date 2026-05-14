import { Router, Response } from 'express';
import { prisma } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { generateReference } from '../services/reference.js';
import { validate, createEncounterSchema } from '../middleware/validation.js';

const router = Router();

// Get encounter types
router.get('/types', authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const rows = await prisma.encounterType.findMany({ orderBy: { nom: 'asc' } });
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Get encounters for a patient
router.get('/patient/:patientId', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const rows = await prisma.encounter.findMany({
      where: { patientId: Number(req.params.patientId) },
      include: {
        encounterType: { select: { nom: true } },
        provider: { select: { nom: true, prenom: true } },
        service: { select: { nom: true } },
      },
      orderBy: { dateEncounter: 'desc' },
    });
    const mapped = rows.map(e => ({
      ...e,
      type_nom: e.encounterType?.nom ?? null,
      provider_nom: e.provider?.nom ?? null,
      provider_prenom: e.provider?.prenom ?? null,
      service_nom: e.service?.nom ?? null,
    }));
    res.json(mapped);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Get single encounter with observations
router.get('/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const enc = await prisma.encounter.findUnique({
      where: { id: Number(req.params.id) },
      include: {
        encounterType: { select: { nom: true } },
        provider: { select: { nom: true, prenom: true } },
        patient: { select: { nom: true, prenom: true } },
      },
    });
    if (!enc) { res.status(404).json({ error: 'Encounter non trouvé' }); return; }

    const obs = await prisma.observation.findMany({
      where: { encounterId: enc.id, voided: false },
      include: {
        concept: { select: { nom: true, code: true, datatype: true, unite: true } },
        codedConcept: { select: { nom: true } },
      },
      orderBy: { dateObs: 'asc' },
    });
    const obsMapped = obs.map(o => ({
      ...o,
      concept_nom: o.concept?.nom ?? null,
      concept_code: o.concept?.code ?? null,
      datatype: o.concept?.datatype ?? null,
      unite: o.concept?.unite ?? null,
      valeur_coded_nom: o.codedConcept?.nom ?? null,
    }));
    res.json({
      ...enc,
      type_nom: enc.encounterType?.nom ?? null,
      provider_nom: enc.provider?.nom ?? null,
      provider_prenom: enc.provider?.prenom ?? null,
      patient_nom: enc.patient?.nom ?? null,
      patient_prenom: enc.patient?.prenom ?? null,
      observations: obsMapped,
    });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Create encounter with observations
router.post('/', authenticate, authorize('admin', 'medecin'), validate(createEncounterSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { patient_id, encounter_type_id, visite_id, service_id, notes, observations } = req.body;
    if (!patient_id || !encounter_type_id) { res.status(400).json({ error: 'Patient et type requis' }); return; }
    const n = (v: unknown) => (v === '' || v === undefined) ? null : v;
    const reference = await generateReference('encounters');
    const enc = await prisma.encounter.create({
      data: {
        reference,
        patientId: Number(patient_id),
        encounterTypeId: Number(encounter_type_id),
        visiteId: n(visite_id) as number | null,
        providerId: req.user!.id,
        serviceId: n(service_id) as number | null,
        notes: n(notes) as string | null,
      },
    });

    // Insert observations
    if (observations && Array.isArray(observations)) {
      for (const obs of observations) {
        if (!obs.concept_id) continue;
        await prisma.observation.create({
          data: {
            encounterId: enc.id,
            patientId: Number(patient_id),
            conceptId: Number(obs.concept_id),
            valeurNumerique: n(obs.valeur_numerique) as number | null,
            valeurTexte: n(obs.valeur_texte) as string | null,
            valeurDate: obs.valeur_date ? new Date(obs.valeur_date) : null,
            valeurCoded: n(obs.valeur_coded) as number | null,
            valeurBoolean: obs.valeur_boolean ?? null,
            commentaire: n(obs.commentaire) as string | null,
            providerId: req.user!.id,
          },
        });
      }
    }

    res.status(201).json(enc);
  } catch (err) { console.error('[ERROR] Create encounter:', err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// Add observation to existing encounter
router.post('/:id/observations', authenticate, authorize('admin', 'medecin', 'laborantin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const enc = await prisma.encounter.findUnique({
      where: { id: Number(req.params.id) },
      select: { patientId: true },
    });
    if (!enc) { res.status(404).json({ error: 'Encounter non trouvé' }); return; }
    const { concept_id, valeur_numerique, valeur_texte, valeur_date, valeur_coded, valeur_boolean, commentaire } = req.body;
    const n = (v: unknown) => (v === '' || v === undefined) ? null : v;
    const created = await prisma.observation.create({
      data: {
        encounterId: Number(req.params.id),
        patientId: enc.patientId,
        conceptId: Number(concept_id),
        valeurNumerique: n(valeur_numerique) as number | null,
        valeurTexte: n(valeur_texte) as string | null,
        valeurDate: valeur_date ? new Date(valeur_date) : null,
        valeurCoded: n(valeur_coded) as number | null,
        valeurBoolean: valeur_boolean ?? null,
        commentaire: n(commentaire) as string | null,
        providerId: req.user!.id,
      },
    });
    res.status(201).json(created);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

export default router;
