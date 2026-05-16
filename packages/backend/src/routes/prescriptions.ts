import { Router, Response } from 'express';
import { prisma } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { validate, createPrescriptionSchema } from '../middleware/validation.js';
import { requirePatientAccess } from '../middleware/patient-access.js';
import { requireResourceAccess } from '../middleware/resource-access.js';

const router = Router();

router.get('/:patientId', authenticate, requirePatientAccess, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const rows = await prisma.prescription.findMany({
      where: { patientId: Number(req.params.patientId) },
      include: { medecin: { select: { nom: true, prenom: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const mapped = rows.map(p => ({
      ...p,
      medecin_nom: p.medecin?.nom ?? null,
      medecin_prenom: p.medecin?.prenom ?? null,
    }));
    res.json(mapped);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/', authenticate, authorize('admin', 'medecin'), validate(createPrescriptionSchema), requirePatientAccess, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { patient_id, medecin_id, consultation_id, medicament, dosage, frequence, duree, voie, instructions, date_debut, date_fin } = req.body;
    const data: Parameters<typeof prisma.prescription.create>[0]['data'] = {
      patientId: Number(patient_id),
      medecinId: medecin_id ?? null,
      consultationId: consultation_id ?? null,
      medicament,
      dosage: dosage ?? null,
      frequence: frequence ?? null,
      duree: duree ?? null,
      voie: voie ?? null,
      instructions: instructions ?? null,
    };
    if (date_debut) data.dateDebut = new Date(date_debut);
    if (date_fin) data.dateFin = new Date(date_fin);
    const created = await prisma.prescription.create({ data });
    res.status(201).json(created);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.put('/:id/statut', authenticate, authorize('admin', 'medecin'), requireResourceAccess('prescription'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { statut } = req.body;
    try {
      const updated = await prisma.prescription.update({
        where: { id: Number(req.params.id) },
        data: { statut },
      });
      res.json(updated);
    } catch {
      res.status(404).json({ error: 'Non trouvé' });
    }
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.delete('/:id', authenticate, authorize('admin'), requireResourceAccess('prescription'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    try { await prisma.prescription.delete({ where: { id: Number(req.params.id) } }); } catch { /* ignore */ }
    res.json({ message: 'Supprimé' });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

export default router;
