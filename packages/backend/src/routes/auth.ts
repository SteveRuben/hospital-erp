import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import argon2 from 'argon2';
import { query } from '../config/db.js';
import { authenticate, authorize, generateToken, AuthRequest } from '../middleware/auth.js';
import { validate, loginSchema, createUserSchema } from '../middleware/validation.js';
import { validatePassword } from '../middleware/security.js';
import { UserRole } from '../types/index.js';
import { blacklistToken, invalidateUserSessions, recordActivity } from '../services/session.js';
import { logAudit } from '../services/audit.js';
import mfa from '../services/mfa.js';

const router = Router();

// Argon2 configuration (OWASP recommended)
const ARGON2_OPTIONS = { type: argon2.argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 };

/**
 * Verify password — supports both argon2 (new) and bcrypt (legacy) hashes.
 * If a bcrypt hash is verified successfully, it's automatically rehashed with argon2.
 */
async function verifyPassword(hash: string, password: string, userId?: number): Promise<boolean> {
  // Argon2 hashes start with $argon2
  if (hash.startsWith('$argon2')) {
    return argon2.verify(hash, password);
  }
  // Legacy bcrypt hashes start with $2a$ or $2b$
  if (hash.startsWith('$2a$') || hash.startsWith('$2b$')) {
    // Dynamic import for backward compat (bcryptjs may still be installed)
    try {
      const bcryptjs = await import('bcryptjs');
      const valid = await bcryptjs.default.compare(password, hash);
      // Auto-rehash to argon2 on successful login
      if (valid && userId) {
        const newHash = await argon2.hash(password, ARGON2_OPTIONS);
        await query('UPDATE users SET password = $1 WHERE id = $2', [newHash, userId]);
      }
      return valid;
    } catch {
      return false;
    }
  }
  return false;
}

// MFA challenge store (opaque IDs to prevent user enumeration)
const mfaChallenges = new Map<string, { userId: number; expires: number }>();

// Cleanup expired challenges every 5 minutes
setInterval(() => {
  const now = Date.now();
  for (const [id, ch] of mfaChallenges) {
    if (ch.expires < now) mfaChallenges.delete(id);
  }
}, 5 * 60 * 1000).unref();

// Common passwords list (top 100 most common — check against these)
const COMMON_PASSWORDS = new Set([
  'password', '123456', '12345678', 'qwerty', 'abc123', 'monkey', '1234567',
  'letmein', 'trustno1', 'dragon', 'baseball', 'iloveyou', 'master', 'sunshine',
  'ashley', 'michael', 'shadow', '123123', '654321', 'superman', 'qazwsx',
  'football', 'password1', 'password123', 'admin123', 'admin1234', 'welcome',
  'welcome1', 'p@ssw0rd', 'passw0rd', 'changeme', 'hospital', 'hospital123',
  'medecin', 'medecin123', 'docteur', 'docteur123', '12345', '1234567890',
]);

function isCommonPassword(password: string): boolean {
  return COMMON_PASSWORDS.has(password.toLowerCase());
}

// Login — with MFA support
router.post('/login', validate(loginSchema), async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password, mfa_token } = req.body;

    const result = await query('SELECT * FROM users WHERE username = $1', [username]);
    
    if (result.rows.length === 0) {
      await argon2.hash('dummy', ARGON2_OPTIONS);
      res.status(401).json({ error: 'Identifiants invalides' });
      return;
    }
    
    const user = result.rows[0];
    const validPassword = await verifyPassword(user.password, password, user.id);
    
    if (!validPassword) {
      console.warn(`[SECURITY] Failed login attempt for user: ${username} from IP: ${req.ip}`);
      await logAudit({ userId: user.id, action: 'login', tableName: 'users', recordId: user.id, details: `Failed login from IP: ${req.ip}`, ip: req.ip || undefined });
      res.status(401).json({ error: 'Identifiants invalides' });
      return;
    }

    // MFA check: if user has MFA enabled, require token
    if (user.mfa_enabled) {
      if (!mfa_token) {
        // Return opaque challenge — don't leak user_id
        const challengeId = crypto.randomUUID();
        mfaChallenges.set(challengeId, { userId: user.id, expires: Date.now() + 5 * 60 * 1000 });
        res.json({ mfa_required: true, challenge_id: challengeId });
        return;
      }
      const secret = await mfa.getMfaSecret(user.id);
      if (!secret || !mfa.verifyToken(mfa_token, secret)) {
        res.status(401).json({ error: 'Code MFA invalide' });
        return;
      }
    }
    
    const token = generateToken(user);
    await recordActivity(user.id);

    await logAudit({ userId: user.id, action: 'login', tableName: 'users', recordId: user.id, details: `Successful login from IP: ${req.ip}`, ip: req.ip || undefined });
    
    res.json({ 
      token, 
      user: { 
        id: user.id, 
        username: user.username, 
        role: user.role, 
        nom: user.nom, 
        prenom: user.prenom,
        must_change_password: user.must_change_password ?? false,
        mfa_enabled: user.mfa_enabled ?? false,
      } 
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Complete MFA login with challenge_id + mfa_token
router.post('/login/mfa', async (req: Request, res: Response): Promise<void> => {
  try {
    const { challenge_id, mfa_token } = req.body;
    if (!challenge_id || !mfa_token) { res.status(400).json({ error: 'challenge_id et mfa_token requis' }); return; }

    const challenge = mfaChallenges.get(challenge_id);
    if (!challenge || challenge.expires < Date.now()) {
      mfaChallenges.delete(challenge_id);
      res.status(401).json({ error: 'Challenge expiré, reconnectez-vous' });
      return;
    }

    const secret = await mfa.getMfaSecret(challenge.userId);
    if (!secret || !mfa.verifyToken(mfa_token, secret)) {
      res.status(401).json({ error: 'Code MFA invalide' });
      return;
    }

    mfaChallenges.delete(challenge_id);

    const result = await query('SELECT id, username, role, nom, prenom, must_change_password, mfa_enabled FROM users WHERE id = $1', [challenge.userId]);
    if (result.rows.length === 0) { res.status(401).json({ error: 'Utilisateur non trouvé' }); return; }

    const user = result.rows[0];
    const token = generateToken(user);
    await recordActivity(user.id);

    await logAudit({ userId: user.id, action: 'login', tableName: 'users', recordId: user.id, details: 'MFA login completed' });

    res.json({
      token,
      user: {
        id: user.id, username: user.username, role: user.role,
        nom: user.nom, prenom: user.prenom,
        must_change_password: user.must_change_password ?? false,
        mfa_enabled: user.mfa_enabled ?? false,
      }
    });
  } catch (err) {
    console.error('MFA login error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Logout — blacklist current token
router.post('/logout', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (req.token) {
      // Blacklist for remaining token lifetime (max 8h)
      await blacklistToken(req.token, 8 * 60 * 60 * 1000);
    }
    await invalidateUserSessions(req.user!.id);
    await logAudit({ userId: req.user!.id, action: 'logout', tableName: 'users', recordId: req.user!.id });
    res.json({ message: 'Déconnexion réussie' });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// MFA Setup — generate secret and QR code
router.post('/mfa/setup', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const alreadyEnabled = await mfa.isMfaEnabled(req.user!.id);
    if (alreadyEnabled) {
      res.status(400).json({ error: 'MFA déjà activé' });
      return;
    }

    const { secret, otpauthUrl } = mfa.generateSecret(req.user!.username);
    const qrCode = await mfa.generateQRCode(otpauthUrl);

    // Store secret temporarily (not yet confirmed)
    await query('UPDATE users SET mfa_secret = $1 WHERE id = $2', [secret, req.user!.id]);

    res.json({ secret, qrCode, otpauthUrl });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// MFA Verify — confirm setup with a valid token
router.post('/mfa/verify', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { token } = req.body;
    if (!token) { res.status(400).json({ error: 'Code MFA requis' }); return; }

    const secret = await mfa.getMfaSecret(req.user!.id);
    if (!secret) { res.status(400).json({ error: 'MFA non configuré' }); return; }

    if (!mfa.verifyToken(token, secret)) {
      res.status(401).json({ error: 'Code MFA invalide' });
      return;
    }

    await mfa.enableMfa(req.user!.id, secret);
    await logAudit({ userId: req.user!.id, action: 'mfa_setup', tableName: 'users', recordId: req.user!.id, details: 'MFA enabled' });

    res.json({ message: 'MFA activé avec succès' });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// MFA Disable (admin or self) — requires password + own MFA if disabling another user
router.post('/mfa/disable', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { user_id, password, mfa_token } = req.body;
    const targetId = user_id && req.user!.role === 'admin' ? user_id : req.user!.id;

    // Require password confirmation
    if (!password) { res.status(400).json({ error: 'Mot de passe requis pour désactiver MFA' }); return; }
    const userResult = await query('SELECT password FROM users WHERE id = $1', [req.user!.id]);
    if (userResult.rows.length === 0) { res.status(404).json({ error: 'Utilisateur non trouvé' }); return; }
    const valid = await verifyPassword(userResult.rows[0].password, password);
    if (!valid) { res.status(401).json({ error: 'Mot de passe incorrect' }); return; }

    // If disabling another user's MFA, require admin's own MFA token
    if (targetId !== req.user!.id) {
      const adminMfaEnabled = await mfa.isMfaEnabled(req.user!.id);
      if (adminMfaEnabled) {
        if (!mfa_token) { res.status(400).json({ error: 'Votre code MFA est requis pour désactiver le MFA d\'un autre utilisateur' }); return; }
        const adminSecret = await mfa.getMfaSecret(req.user!.id);
        if (!adminSecret || !mfa.verifyToken(mfa_token, adminSecret)) {
          res.status(401).json({ error: 'Code MFA admin invalide' });
          return;
        }
      }
    }

    await mfa.disableMfa(targetId);
    await logAudit({ userId: req.user!.id, action: 'mfa_setup', tableName: 'users', recordId: targetId, details: `MFA disabled for user ${targetId}${targetId !== req.user!.id ? ' (by admin)' : ''}` });

    res.json({ message: 'MFA désactivé' });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Get current user
router.get('/me', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await query(
      'SELECT id, username, role, nom, prenom, telephone, mfa_enabled FROM users WHERE id = $1', 
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
router.post('/users', authenticate, authorize('admin'), validate(createUserSchema), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { username, password, role, nom, prenom, telephone } = req.body;
    
    const passwordCheck = validatePassword(password);
    if (!passwordCheck.valid) {
      res.status(400).json({ error: passwordCheck.message });
      return;
    }

    if (isCommonPassword(password)) {
      res.status(400).json({ error: 'Ce mot de passe est trop courant, choisissez-en un plus sûr' });
      return;
    }

    const hashedPassword = await argon2.hash(password, ARGON2_OPTIONS);
    
    const result = await query(
      `INSERT INTO users (username, password, role, nom, prenom, telephone) 
       VALUES ($1, $2, $3, $4, $5, $6) 
       RETURNING id, username, role, nom, prenom`,
      [username, hashedPassword, role, nom, prenom, telephone]
    );
    
    await logAudit({ userId: req.user!.id, action: 'create', tableName: 'users', recordId: result.rows[0].id, details: `Created user ${username} (${role})` });
    
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
      'SELECT id, username, role, nom, prenom, telephone, mfa_enabled, created_at FROM users ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Update user
router.put('/users/:id', authenticate, authorize('admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { nom, prenom, telephone, role } = req.body;

    const before = await query('SELECT nom, prenom, telephone, role FROM users WHERE id = $1', [id]);
    if (before.rows.length === 0) { res.status(404).json({ error: 'Utilisateur non trouvé' }); return; }
    
    const result = await query(
      `UPDATE users SET nom = $1, prenom = $2, telephone = $3, role = $4 
       WHERE id = $5 RETURNING id, username, role, nom, prenom, telephone`,
      [nom, prenom, telephone, role, id]
    );

    await logAudit({ userId: req.user!.id, action: 'update', tableName: 'users', recordId: Number(id), before: before.rows[0], after: { nom, prenom, telephone, role } });
    
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// Delete user
router.delete('/users/:id', authenticate, authorize('admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const result = await query('DELETE FROM users WHERE id = $1 RETURNING id, username', [id]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'Utilisateur non trouvé' }); return; }
    await logAudit({ userId: req.user!.id, action: 'delete', tableName: 'users', recordId: Number(id), details: `Deleted user ${result.rows[0].username}` });
    res.json({ message: 'Utilisateur supprimé' });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Impersonate user (admin only)
router.post('/impersonate/:id', authenticate, authorize('admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const targetUser = await query('SELECT id, username, role, nom, prenom FROM users WHERE id = $1', [req.params.id]);
    if (targetUser.rows.length === 0) { res.status(404).json({ error: 'Utilisateur non trouvé' }); return; }

    const target = targetUser.rows[0];
    const token = generateToken(target);

    await logAudit({ userId: req.user!.id, action: 'impersonate', tableName: 'users', recordId: target.id, details: `Admin ${req.user!.username} impersonated ${target.username} (${target.role})` });

    res.json({
      token,
      user: { id: target.id, username: target.username, role: target.role, nom: target.nom, prenom: target.prenom },
      impersonatedBy: { id: req.user!.id, username: req.user!.username },
    });
  } catch (err) { console.error(err); res.status(500).json({ error: 'Erreur serveur' }); }
});

// Stop impersonation
router.post('/stop-impersonate', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { admin_id } = req.body;
    if (!admin_id) { res.status(400).json({ error: 'admin_id requis' }); return; }

    const impersonationCheck = await query(
      `SELECT id FROM audit_log WHERE user_id = $1 AND action = 'impersonate' AND record_id = $2 AND created_at > NOW() - INTERVAL '8 hours' ORDER BY created_at DESC LIMIT 1`,
      [admin_id, req.user!.id]
    );
    if (impersonationCheck.rows.length === 0) {
      res.status(403).json({ error: 'Aucune session d\'impersonation trouvée' });
      return;
    }

    const adminUser = await query('SELECT id, username, role, nom, prenom FROM users WHERE id = $1 AND role = $2', [admin_id, 'admin']);
    if (adminUser.rows.length === 0) { res.status(403).json({ error: 'Utilisateur admin non trouvé' }); return; }

    const admin = adminUser.rows[0];
    const token = generateToken(admin);

    await logAudit({ userId: admin.id, action: 'stop_impersonate' as any, tableName: 'users', recordId: admin.id, details: `Admin ${admin.username} stopped impersonation` });

    res.json({ token, user: { id: admin.id, username: admin.username, role: admin.role, nom: admin.nom, prenom: admin.prenom } });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

// Change password — with common password check + token invalidation
router.post('/change-password', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { old_password, new_password } = req.body;
    if (!old_password || !new_password) { res.status(400).json({ error: 'Ancien et nouveau mot de passe requis' }); return; }

    const result = await query('SELECT password FROM users WHERE id = $1', [req.user!.id]);
    if (result.rows.length === 0) { res.status(404).json({ error: 'Utilisateur non trouvé' }); return; }

    const valid = await verifyPassword(result.rows[0].password, old_password);
    if (!valid) { res.status(401).json({ error: 'Ancien mot de passe incorrect' }); return; }

    const passwordCheck = validatePassword(new_password);
    if (!passwordCheck.valid) { res.status(400).json({ error: passwordCheck.message }); return; }

    if (isCommonPassword(new_password)) {
      res.status(400).json({ error: 'Ce mot de passe est trop courant, choisissez-en un plus sûr' });
      return;
    }

    const hashed = await argon2.hash(new_password, ARGON2_OPTIONS);
    await query('UPDATE users SET password = $1, must_change_password = FALSE WHERE id = $2', [hashed, req.user!.id]);

    // Invalidate all existing sessions for this user
    await invalidateUserSessions(req.user!.id);
    if (req.token) await blacklistToken(req.token, 8 * 60 * 60 * 1000);

    await logAudit({ userId: req.user!.id, action: 'password_change', tableName: 'users', recordId: req.user!.id });

    // Generate new token
    const newToken = generateToken({ id: req.user!.id, username: req.user!.username, role: req.user!.role });
    res.json({ message: 'Mot de passe modifié', token: newToken });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

export default router;
