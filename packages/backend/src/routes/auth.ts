import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { query } from '../config/db.js';
import { authenticate, authorize, generateToken, AuthRequest } from '../middleware/auth.js';
import { validate, loginSchema, createUserSchema } from '../middleware/validation.js';
import { validatePassword } from '../middleware/security.js';
import { UserRole } from '../types/index.js';

const router = Router();

// OWASP A07 - Bcrypt cost factor (12 rounds)
const BCRYPT_ROUNDS = 12;

// Login
router.post('/login', validate(loginSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password } = req.body;

    const result = await query('SELECT * FROM users WHERE username = $1', [username]);
    
    if (result.rows.length === 0) {
      // OWASP A07 - Constant time response to prevent user enumeration
      await bcrypt.hash('dummy', BCRYPT_ROUNDS);
      res.status(401).json({ error: 'Identifiants invalides' });
      return;
    }
    
    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password);
    
    if (!validPassword) {
      // OWASP A09 - Log failed login attempts
      console.warn(`[SECURITY] Failed login attempt for user: ${username} from IP: ${req.ip}`);
      res.status(401).json({ error: 'Identifiants invalides' });
      return;
    }
    
    const token = generateToken(user);
    
    // OWASP A09 - Log successful login
    console.log(`[AUDIT] Successful login: user=${username} ip=${req.ip}`);
    
    res.json({ 
      token, 
      user: { 
        id: user.id, 
        username: user.username, 
        role: user.role, 
        nom: user.nom, 
        prenom: user.prenom 
      } 
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Get current user
router.get('/me', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query(
      'SELECT id, username, role, nom, prenom, telephone FROM users WHERE id = $1', 
      [req.user!.id]
    );
    
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Utilisateur non trouvé' });
      return;
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Create user (admin only)
router.post('/users', authenticate, authorize('admin'), validate(createUserSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password, role, nom, prenom, telephone } = req.body;
    
    // OWASP A07 - Password policy enforcement
    const passwordCheck = validatePassword(password);
    if (!passwordCheck.valid) {
      res.status(400).json({ error: passwordCheck.message });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
    
    const result = await query(
      `INSERT INTO users (username, password, role, nom, prenom, telephone) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING id, username, role, nom, prenom`,
      [username, hashedPassword, role, nom, prenom, telephone]
    );
    
    res.status(201).json(result.rows[0]);
  } catch (err: unknown) {
    if (err instanceof Error && err.message.includes('unique')) {
      res.status(400).json({ error: 'Nom d\'utilisateur déjà existant' });
      return;
    }
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Get all users (admin only)
router.get('/users', authenticate, authorize('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const result = await query(
      'SELECT id, username, role, nom, prenom, telephone, created_at FROM users ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Update user
router.put('/users/:id', authenticate, authorize('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { nom, prenom, telephone, role } = req.body;
    
    const result = await query(
      `UPDATE users SET nom = $1, prenom = $2, telephone = $3, role = $4 
       WHERE id = $5 RETURNING id, username, role, nom, prenom, telephone`,
      [nom, prenom, telephone, role, id]
    );
    
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Utilisateur non trouvé' });
      return;
    }
    
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Delete user
router.delete('/users/:id', authenticate, authorize('admin'), async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    
    const result = await query('DELETE FROM users WHERE id = $1 RETURNING id', [id]);
    
    if (result.rows.length === 0) {
      res.status(404).json({ error: 'Utilisateur non trouvé' });
      return;
    }
    
    res.json({ message: 'Utilisateur supprimé' });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;