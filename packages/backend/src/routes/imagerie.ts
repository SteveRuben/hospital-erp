import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { query } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';

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
router.get('/:patientId', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query(`SELECT i.*, m.nom as medecin_nom, m.prenom as medecin_prenom FROM imagerie i LEFT JOIN medecins m ON i.medecin_id = m.id WHERE i.patient_id = $1 ORDER BY i.date_examen DESC`, [req.params.patientId]);
    res.json(result.rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Upload image
router.post('/', authenticate, authorize('admin', 'medecin'), upload.single('file'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { patient_id, type_examen, description, date_examen, medecin_id } = req.body;
    if (!patient_id || !req.file) { res.status(400).json({ error: 'Patient et fichier requis' }); return; }
    const n = (v: unknown) => (v === '' || v === undefined) ? null : v;
    const fichier_url = `/uploads/imagerie/${req.file.filename}`;
    const result = await query(`INSERT INTO imagerie (patient_id, type_examen, description, fichier_url, fichier_nom, fichier_type, date_examen, medecin_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *`,
      [patient_id, n(type_examen), n(description), fichier_url, req.file.originalname, req.file.mimetype, n(date_examen), n(medecin_id)]);
    res.status(201).json(result.rows[0]);
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
    const result = await query('DELETE FROM imagerie WHERE id = $1 RETURNING fichier_url', [req.params.id]);
    if (result.rows.length > 0 && result.rows[0].fichier_url) {
      const filePath = path.resolve(__dirname, '../..', result.rows[0].fichier_url.replace(/^\//, ''));
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
    res.json({ message: 'Supprimé' });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

export default router;