import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { prisma } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { validate, createImagerieSchema } from '../middleware/validation.js';
import { requirePatientAccess } from '../middleware/patient-access.js';
import { validateUpload, IMAGERIE_MIMES } from '../middleware/upload-validation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDir = path.resolve(__dirname, '../../uploads/imagerie');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_')}`),
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 }, fileFilter: (_req, file, cb) => {
  const allowed = ['.dcm', '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.tiff', '.pdf'];
  const ext = path.extname(file.originalname).toLowerCase();
  cb(null, allowed.includes(ext));
}});

const router = Router();

// Get images for a patient
router.get('/:patientId', authenticate, requirePatientAccess, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const rows = await prisma.imagerie.findMany({
      where: { patientId: Number(req.params.patientId) },
      orderBy: { dateExamen: 'desc' },
    });
    // Pull medecin info separately to mirror the LEFT JOIN
    const medecinIds = Array.from(new Set(rows.map(r => r.medecinId).filter((v): v is number => v != null)));
    const medecins = medecinIds.length > 0
      ? await prisma.medecin.findMany({ where: { id: { in: medecinIds } }, select: { id: true, nom: true, prenom: true } })
      : [];
    const medMap = new Map(medecins.map(m => [m.id, m]));
    const mapped = rows.map(r => ({
      ...r,
      medecin_nom: r.medecinId != null ? (medMap.get(r.medecinId)?.nom ?? null) : null,
      medecin_prenom: r.medecinId != null ? (medMap.get(r.medecinId)?.prenom ?? null) : null,
    }));
    res.json(mapped);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Upload image
router.post('/', authenticate, authorize('admin', 'medecin'), upload.single('file'), validateUpload(IMAGERIE_MIMES), validate(createImagerieSchema), requirePatientAccess, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { patient_id, type_examen, description, date_examen, medecin_id } = req.body;
    if (!patient_id || !req.file) { res.status(400).json({ error: 'Patient et fichier requis' }); return; }
    const n = (v: unknown) => (v === '' || v === undefined) ? null : v;
    const fichier_url = `/uploads/imagerie/${req.file.filename}`;
    const data: Parameters<typeof prisma.imagerie.create>[0]['data'] = {
      patientId: Number(patient_id),
      typeExamen: n(type_examen) as string | null,
      description: n(description) as string | null,
      fichierUrl: fichier_url,
      fichierNom: req.file.originalname,
      fichierType: req.file.mimetype,
      medecinId: n(medecin_id) as number | null,
    };
    if (date_examen) data.dateExamen = new Date(date_examen);
    const created = await prisma.imagerie.create({ data });
    res.status(201).json(created);
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// Serve uploaded file
router.get('/file/:filename', authenticate, (req: AuthRequest, res: Response): void => {
  const filePath = path.join(uploadDir, req.params.filename);
  if (!fs.existsSync(filePath)) { res.status(404).json({ error: 'Fichier non trouvé' }); return; }
  res.sendFile(filePath);
});

// Delete image
router.delete('/:id', authenticate, authorize('admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    try {
      const deleted = await prisma.imagerie.delete({ where: { id: Number(req.params.id) } });
      if (deleted?.fichierUrl) {
        const filePath = path.resolve(__dirname, '../..', deleted.fichierUrl.replace(/^\//, ''));
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      }
    } catch { /* not found */ }
    res.json({ message: 'Supprimé' });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

export default router;
