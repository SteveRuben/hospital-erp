import { Router, Request, Response } from 'express';
import { query } from '../config/db.js';
import { authenticate, AuthRequest } from '../middleware/auth.js';
import { collectPayment, checkTransactionStatus } from '../services/remita.js';

const router = Router();

// Map frontend provider names to Remita transferMethod codes
const TRANSFER_METHOD_MAP: Record<string, string> = {
  orange_money: 'OMCM',
  mtn_momo: 'MOMOCM',
  OMCM: 'OMCM',
  MOMOCM: 'MOMOCM',
};

// Normalize phone number: strip spaces/dashes, ensure digits only (no +)
function normalizePhone(phone: string): string {
  let digits = phone.replace(/[^\d]/g, '');
  // If it doesn't start with country code, prepend 237 (Cameroon)
  if (digits.length === 9 && (digits.startsWith('6') || digits.startsWith('2'))) {
    digits = '237' + digits;
  }
  return digits;
}

// Initiate payment via Remita (Orange Money / MTN MoMo)
router.post('/collect', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { phoneNumber, amount, provider, transferMethod, countryName, facture_id, description } = req.body;

    if (!phoneNumber || !amount) {
      res.status(400).json({ error: 'Numéro de téléphone et montant requis' });
      return;
    }

    // Resolve transferMethod: use explicit transferMethod, or map from provider
    const resolvedMethod = transferMethod || TRANSFER_METHOD_MAP[provider] || 'OMCM';
    const resolvedCountry = countryName || 'Cameroon';
    const normalizedPhone = normalizePhone(phoneNumber);

    // Get customer name from facture if linked
    let customerName = normalizedPhone;
    if (facture_id) {
      const factureResult = await query('SELECT p.nom, p.prenom FROM factures f LEFT JOIN patients p ON f.patient_id = p.id WHERE f.id = $1', [facture_id]);
      if (factureResult.rows.length > 0) {
        customerName = `${factureResult.rows[0].prenom} ${factureResult.rows[0].nom}`;
      }
    }

    const result = await collectPayment({
      phoneNumber: normalizedPhone,
      amount: Number(amount),
      transferMethod: resolvedMethod,
      countryName: resolvedCountry,
      customerName,
    });

    // Log the transaction in DB
    if (facture_id && result.success) {
      await query(
        `INSERT INTO paiements (facture_id, montant, mode_paiement, reference, recu_par, notes) VALUES ($1,$2,$3,$4,$5,$6)`,
        [facture_id, amount, 'mobile_money', result.transactionId, req.user!.id, `Remita ${resolvedMethod} - ${normalizedPhone}${result.simulated ? ' [SIMULATION]' : ''}`]
      );

      // Update facture paid amount
      const totalPaye = await query('SELECT COALESCE(SUM(montant), 0) as total FROM paiements WHERE facture_id = $1', [facture_id]);
      const facture = await query('SELECT montant_total FROM factures WHERE id = $1', [facture_id]);
      if (facture.rows.length > 0) {
        const paye = parseFloat(totalPaye.rows[0].total as string);
        const total = parseFloat(facture.rows[0].montant_total as string);
        const statut = paye >= total ? 'payee' : 'partielle';
        await query('UPDATE factures SET montant_paye = $1, statut = $2 WHERE id = $3', [paye, statut, facture_id]);
      }
    }

    console.log(`[REMITA] Payment ${result.success ? 'initiated' : 'failed'}: ${normalizedPhone} ${amount} XAF via ${resolvedMethod} - txn: ${result.transactionId}`);

    res.json(result);
  } catch (err) {
    console.error('[REMITA] Error:', err);
    res.status(500).json({ error: 'Erreur lors du paiement' });
  }
});

// Webhook endpoint — Remita calls this to update transaction status
router.post('/webhook', async (req: Request, res: Response): Promise<void> => {
  try {
    const { transactionId, externalId, transactionStatus, amount, phoneNumber } = req.body;
    console.log(`[REMITA WEBHOOK] Received: txn=${transactionId} status=${transactionStatus} externalId=${externalId}`);

    if (!transactionId && !externalId) {
      res.status(400).json({ error: 'Missing transactionId or externalId' });
      return;
    }

    // Find the payment by reference (transactionId)
    const ref = transactionId || externalId;
    const paiement = await query('SELECT id, facture_id, montant FROM paiements WHERE reference = $1', [ref]);

    if (paiement.rows.length > 0) {
      const status = transactionStatus?.toUpperCase();
      if (status === 'SUCCESS' || status === 'COMPLETED') {
        console.log(`[REMITA WEBHOOK] Payment ${ref} confirmed SUCCESS`);
        // Payment already recorded at initiation — nothing extra needed
      } else if (status === 'FAILED' || status === 'CANCELLED' || status === 'EXPIRED') {
        // Reverse the payment record
        const p = paiement.rows[0];
        await query('DELETE FROM paiements WHERE id = $1', [p.id]);
        // Recalculate facture
        if (p.facture_id) {
          const totalPaye = await query('SELECT COALESCE(SUM(montant), 0) as total FROM paiements WHERE facture_id = $1', [p.facture_id]);
          const facture = await query('SELECT montant_total FROM factures WHERE id = $1', [p.facture_id]);
          if (facture.rows.length > 0) {
            const paye = parseFloat(totalPaye.rows[0].total as string);
            const total = parseFloat(facture.rows[0].montant_total as string);
            const statut = paye >= total ? 'payee' : paye > 0 ? 'partielle' : 'en_attente';
            await query('UPDATE factures SET montant_paye = $1, statut = $2 WHERE id = $3', [paye, statut, p.facture_id]);
          }
        }
        console.log(`[REMITA WEBHOOK] Payment ${ref} FAILED/CANCELLED — reversed`);
      }
    } else {
      console.log(`[REMITA WEBHOOK] No matching payment found for ref=${ref}`);
    }

    // Always respond 200 to acknowledge receipt
    res.json({ received: true });
  } catch (err) {
    console.error('[REMITA WEBHOOK] Error:', err);
    res.status(500).json({ error: 'Webhook processing error' });
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