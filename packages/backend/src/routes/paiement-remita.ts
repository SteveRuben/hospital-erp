import { Router, Request, Response } from 'express';
import { prisma } from '../config/db.js';
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

async function recomputeFactureStatus(factureId: number) {
  const agg = await prisma.paiement.aggregate({
    where: { factureId },
    _sum: { montant: true },
  });
  const facture = await prisma.facture.findUnique({ where: { id: factureId }, select: { montantTotal: true } });
  if (!facture) return;
  const paye = Number(agg._sum.montant ?? 0);
  const total = Number(facture.montantTotal);
  const statut = paye >= total ? 'payee' : paye > 0 ? 'partielle' : 'en_attente';
  await prisma.facture.update({ where: { id: factureId }, data: { montantPaye: paye, statut } });
}

// Initiate payment via Remita (Orange Money / MTN MoMo)
router.post('/collect', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { phoneNumber, amount, provider, transferMethod, countryName, facture_id, description } = req.body;
    void description;

    if (!phoneNumber || !amount) {
      res.status(400).json({ error: 'Numéro de téléphone et montant requis' });
      return;
    }

    // Resolve transferMethod: use explicit transferMethod, or map from provider
    const resolvedMethod = transferMethod || TRANSFER_METHOD_MAP[provider] || 'OMCM';
    const resolvedCountry = countryName || 'CAMEROON';
    const normalizedPhone = normalizePhone(phoneNumber);

    // Get customer name from facture if linked
    let customerName = normalizedPhone;
    if (facture_id) {
      const facture = await prisma.facture.findUnique({
        where: { id: Number(facture_id) },
        select: { patientId: true },
      });
      if (facture?.patientId) {
        const patient = await prisma.patient.findUnique({
          where: { id: facture.patientId },
          select: { nom: true, prenom: true },
        });
        if (patient) customerName = `${patient.prenom} ${patient.nom}`;
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
      await prisma.paiement.create({
        data: {
          factureId: Number(facture_id),
          montant: amount,
          modePaiement: 'mobile_money',
          reference: result.transactionId,
          recuPar: req.user!.id,
          notes: `Remita ${resolvedMethod} - ${normalizedPhone}${result.simulated ? ' [SIMULATION]' : ''}`,
        },
      });

      // Update facture paid amount
      await recomputeFactureStatus(Number(facture_id));
    }

    console.log(`[REMITA] Payment ${result.success ? 'initiated' : 'failed'}: ${normalizedPhone} ${amount} XAF via ${resolvedMethod} - txn: ${result.transactionId}`);

    res.json(result);
  } catch (err) {
    console.error('[REMITA] Error:', err);
    res.status(500).json({ error: 'Erreur lors du paiement' });
  }
});

// Webhook endpoint — Remita calls this to update transaction status
// Idempotent: duplicate events are ignored
router.post('/webhook', async (req: Request, res: Response): Promise<void> => {
  try {
    const { transactionId, externalId, transactionStatus, amount, phoneNumber } = req.body;
    void amount; void phoneNumber;
    console.log(`[REMITA WEBHOOK] Received: txn=${transactionId} status=${transactionStatus} externalId=${externalId}`);

    if (!transactionId && !externalId) {
      res.status(400).json({ error: 'Missing transactionId or externalId' });
      return;
    }

    // Idempotence check: skip if already processed
    const eventId = `${transactionId || externalId}_${transactionStatus}`;
    const existing = await prisma.webhookEvent.findUnique({ where: { eventId }, select: { id: true } });
    if (existing) {
      console.log(`[REMITA WEBHOOK] Duplicate event ${eventId} — skipping`);
      res.json({ received: true, duplicate: true });
      return;
    }

    // Record the event for idempotence
    try {
      await prisma.webhookEvent.create({
        data: {
          eventId,
          source: 'remita',
          payload: JSON.stringify(req.body).substring(0, 2000),
        },
      });
    } catch {
      // Unique violation race — proceed
    }

    // Find the payment by reference (transactionId)
    const ref = transactionId || externalId;
    const paiement = await prisma.paiement.findFirst({
      where: { reference: ref },
      select: { id: true, factureId: true, montant: true },
    });

    if (paiement) {
      const status = transactionStatus?.toUpperCase();
      if (status === 'SUCCESS' || status === 'COMPLETED') {
        console.log(`[REMITA WEBHOOK] Payment ${ref} confirmed SUCCESS`);
        // Payment already recorded at initiation — nothing extra needed
      } else if (status === 'FAILED' || status === 'CANCELLED' || status === 'EXPIRED') {
        // Reverse the payment record
        await prisma.paiement.delete({ where: { id: paiement.id } });
        if (paiement.factureId) {
          await recomputeFactureStatus(paiement.factureId);
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
