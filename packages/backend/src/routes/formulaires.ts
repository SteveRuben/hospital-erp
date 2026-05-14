import { Router, Response } from 'express';
import { prisma } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { validate, createFormulaireSchema, createReponseFormulaireSchema } from '../middleware/validation.js';

const router = Router();

// Get all form definitions
router.get('/', authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT f.*, s.nom AS service_nom
      FROM formulaires f
      LEFT JOIN services s ON f.service_id = s.id
      WHERE f.actif = TRUE
      ORDER BY f.nom
    `;
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Create form definition
router.post('/', authenticate, authorize('admin'), validate(createFormulaireSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { nom, description, schema_json, service_id } = req.body;
    const created = await prisma.formulaire.create({
      data: {
        nom,
        description,
        schemaJson: typeof schema_json === 'string' ? schema_json : JSON.stringify(schema_json),
        serviceId: service_id ?? null,
      },
    });
    res.status(201).json(created);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Get form responses for a patient
router.get('/reponses/:patientId', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT fr.*, f.nom AS formulaire_nom, u.nom AS rempli_nom, u.prenom AS rempli_prenom
      FROM formulaire_reponses fr
      LEFT JOIN formulaires f ON fr.formulaire_id = f.id
      LEFT JOIN users u ON fr.rempli_par = u.id
      WHERE fr.patient_id = ${Number(req.params.patientId)}
      ORDER BY fr.created_at DESC
    `;
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Submit form response
router.post('/reponses', authenticate, validate(createReponseFormulaireSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { formulaire_id, patient_id, donnees_json } = req.body;
    const created = await prisma.formulaireReponse.create({
      data: {
        formulaireId: formulaire_id,
        patientId: patient_id,
        rempliPar: req.user!.id,
        donneesJson: typeof donnees_json === 'string' ? donnees_json : JSON.stringify(donnees_json),
      },
    });
    res.status(201).json(created);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

export default router;
