import { Router, Response } from 'express';
import { prisma } from '../config/db.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { validate, createListePatientsSchema, addPatientToListeSchema } from '../middleware/validation.js';

const router = Router();

// Get all lists
router.get('/', authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const rows = await prisma.$queryRaw<any[]>`
      SELECT lp.*,
             u.nom AS created_nom,
             u.prenom AS created_prenom,
             (SELECT COUNT(*) FROM liste_patient_membres lpm WHERE lpm.liste_id = lp.id) AS nb_patients
      FROM listes_patients lp
      LEFT JOIN users u ON lp.created_by = u.id
      ORDER BY lp.created_at DESC
    `;
    // Convert BigInt counts to Number for JSON serialization
    res.json(rows.map(r => ({ ...r, nb_patients: r.nb_patients != null ? Number(r.nb_patients) : 0 })));
  } catch (err) { console.error('[ERROR] Get listes:', err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// Get single list with members
router.get('/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const liste = await prisma.listePatient.findUnique({ where: { id } });
    if (!liste) { res.status(404).json({ error: 'Liste non trouvée' }); return; }
    const membres = await prisma.$queryRaw<any[]>`
      SELECT lpm.*, p.nom, p.prenom, p.sexe, p.telephone, p.date_naissance, p.ville
      FROM liste_patient_membres lpm
      LEFT JOIN patients p ON lpm.patient_id = p.id
      WHERE lpm.liste_id = ${id}
      ORDER BY lpm.added_at DESC
    `;
    res.json({ ...liste, patients: membres });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Create list
router.post('/', authenticate, validate(createListePatientsSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { nom, description } = req.body;
    if (!nom) { res.status(400).json({ error: 'Nom requis' }); return; }
    const created = await prisma.listePatient.create({
      data: { nom, description: description || null, createdBy: req.user!.id },
    });
    res.status(201).json(created);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Delete list
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    await prisma.listePatientMembre.deleteMany({ where: { listeId: id } });
    try { await prisma.listePatient.delete({ where: { id } }); } catch { /* not found ok */ }
    res.json({ message: 'Liste supprimée' });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Add patient to list
router.post('/:id/patients', authenticate, validate(addPatientToListeSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { patient_id } = req.body;
    if (!patient_id) { res.status(400).json({ error: 'Patient requis' }); return; }
    const listeId = Number(req.params.id);
    const existing = await prisma.listePatientMembre.findFirst({
      where: { listeId, patientId: patient_id },
      select: { id: true },
    });
    if (existing) { res.status(400).json({ error: 'Patient déjà dans la liste' }); return; }
    const created = await prisma.listePatientMembre.create({
      data: { listeId, patientId: patient_id },
    });
    res.status(201).json(created);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Remove patient from list
router.delete('/:id/patients/:patientId', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    await prisma.listePatientMembre.deleteMany({
      where: { listeId: Number(req.params.id), patientId: Number(req.params.patientId) },
    });
    res.json({ message: 'Patient retiré' });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

export default router;
