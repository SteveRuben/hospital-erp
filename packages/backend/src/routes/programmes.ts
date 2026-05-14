import { Router, Response } from 'express';
import { prisma } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { validate, createProgrammeSchema } from '../middleware/validation.js';

const router = Router();

router.get('/', authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const rows = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT p.*,
        (SELECT COUNT(*) FROM programme_patients pp WHERE pp.programme_id = p.id AND pp.statut = 'actif')::bigint as nb_patients
      FROM programmes p
      ORDER BY p.nom
    `;
    res.json(rows.map(r => ({ ...r, nb_patients: Number(r.nb_patients as bigint) })));
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.get('/:id', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const prog = await prisma.programme.findUnique({ where: { id } });
    if (!prog) { res.status(404).json({ error: 'Non trouvé' }); return; }
    const patients = await prisma.$queryRaw<Array<Record<string, unknown>>>`
      SELECT pp.*, p.nom, p.prenom, p.sexe, p.telephone
      FROM programme_patients pp
      LEFT JOIN patients p ON pp.patient_id = p.id
      WHERE pp.programme_id = ${id}
      ORDER BY pp.date_inscription DESC
    `;
    res.json({ ...prog, patients });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/', authenticate, authorize('admin', 'medecin'), validate(createProgrammeSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { nom, description, type_programme } = req.body;
    const created = await prisma.programme.create({
      data: { nom, description: description || null, typeProgramme: type_programme || null },
    });
    res.status(201).json(created);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/:id/patients', authenticate, authorize('admin', 'medecin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { patient_id } = req.body;
    const created = await prisma.programmePatient.create({
      data: { programmeId: Number(req.params.id), patientId: Number(patient_id) },
    });
    res.status(201).json(created);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.put('/:progId/patients/:id/statut', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { statut } = req.body;
    const id = Number(req.params.id);
    const data: { statut: string; dateSortie?: Date } = { statut };
    if (statut !== 'actif') data.dateSortie = new Date();
    try {
      const updated = await prisma.programmePatient.update({ where: { id }, data });
      res.json(updated);
    } catch {
      res.status(404).json({ error: 'Non trouvé' });
    }
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.delete('/:id', authenticate, authorize('admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    await prisma.programmePatient.deleteMany({ where: { programmeId: id } });
    await prisma.programme.delete({ where: { id } }).catch(() => undefined);
    res.json({ message: 'Programme supprimé' });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

export default router;
