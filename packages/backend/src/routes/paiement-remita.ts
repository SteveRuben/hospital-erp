import { Router, Response } from 'express';
import { query } from '../config/db.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { collectPayment, checkTransactionStatus } from '../services/remita.js';

const router = Router();

// Initiate payment via Remita (Orange Money / MTN MoMo)
router.post('/collect', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { phoneNumber, amount, provider, facture_id, description } = req.body;

    if (!phoneNumber || !amount) {
      res.status(400).json({ error: 'Numéro de téléphone et montant requis' });
      return;
    }

    const externalId = `HERP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const result = await collectPayment({
      phoneNumber,
      amount: Number(amount),
      provider: provider || 'orange_money',
      description: description || `Paiement facture Hospital ERP`,
      externalId,
    });

    // Log the transaction
    if (facture_id && result.success) {
      await query(
        `INSERT INTO paiements (facture_id, montant, mode_paiement, reference, recu_par, notes) VALUES ($1,$2,$3,$4,$5,$6)`,
        [facture_id, amount, provider === 'mtn_momo' ? 'mobile_money' : 'mobile_money', result.transactionId, req.user!.id, `Remita ${provider || 'orange_money'} - ${phoneNumber}${result.simulated ? ' [SIMULATION]' : ''}`]
      );

      // Update facture
      const totalPaye = await query('SELECT COALESCE(SUM(montant), 0) as total FROM paiements WHERE facture_id = $1', [facture_id]);
      const facture = await query('SELECT montant_total FROM factures WHERE id = $1', [facture_id]);
      if (facture.rows.length > 0) {
        const paye = parseFloat(totalPaye.rows[0].total as string);
        const total = parseFloat(facture.rows[0].montant_total as string);
        const statut = paye >= total ? 'payee' : 'partielle';
        await query('UPDATE factures SET montant_paye = $1, statut = $2 WHERE id = $3', [paye, statut, facture_id]);
      }
    }

    // Audit log
    console.log(`[REMITA] Payment ${result.success ? 'initiated' : 'failed'}: ${phoneNumber} ${amount} XAF via ${provider || 'orange_money'} - txn: ${result.transactionId}`);

    res.json(result);
  } catch (err) {
    console.error('[REMITA] Error:', err);
    res.status(500).json({ error: 'Erreur lors du paiement' });
  }
});

// Check transaction status
router.get('/status/:transactionId', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const result = await checkTransactionStatus(req.params.transactionId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Erreur lors de la vérification' });
  }
});

export default router;