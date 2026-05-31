import { Router, Response } from 'express';
import crypto from 'crypto';
import { Prisma, PaymentIntentStatut, PriseEnChargeStatut, ExamenStatut } from '@prisma/client';
import { prisma } from '../config/db.js';
import { authenticate, authorize, AuthRequest } from '../middleware/auth.js';
import { logAudit } from '../services/audit.js';

const router = Router();

/**
 * Payments + insurance (prise en charge).
 *
 * Mobile Money / Carte via Remita : nous gardons un PaymentIntent
 * pour chaque tentative — l'agrégateur n'est pas câblé en réel pour
 * l'instant (REMITA_MERCHANT_ID + REMITA_API_KEY non provisionnés).
 * Le stub renvoie un code USSD plausible et permet le polling +
 * confirmation manuelle par l'opérateur (« j'ai vu le SMS »).
 *
 * Quand vous avez les credentials Remita :
 *   - remplacez generateRemitaIntent() par l'appel SOAP/REST réel,
 *   - branchez le webhook /payments/webhook/remita sur l'URL configurée
 *     côté merchant Remita (voir https://api.remita.net/),
 *   - la table payment_intents reste compatible : c'est juste statut
 *     qui passera de 'pending' à 'paid'/'failed' via le webhook.
 *
 * Assurance : crée une PriseEnCharge en statut 'en_attente' avec les
 * trois montants explicites (total / assurance / patient). Le co-paiement
 * patient est généralement réglé en cash/MM sur la même session ; nous
 * laissons le caissier choisir.
 */

const VALID_MODES = new Set(['mobile_money', 'carte', 'virement', 'especes']);
const POLL_MAX_AGE_MIN = 30;

router.post('/initiate', authenticate, authorize('admin', 'comptable', 'reception'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { mode, examen_id, facture_id, montant, phone } = req.body as {
      mode?: string; examen_id?: number; facture_id?: number; montant?: number; phone?: string;
    };
    if (!mode || !VALID_MODES.has(mode)) {
      res.status(400).json({ error: 'mode invalide (mobile_money | carte | virement | especes)' });
      return;
    }
    if (!examen_id && !facture_id) {
      res.status(400).json({ error: 'examen_id ou facture_id requis' });
      return;
    }
    const amt = Number(montant);
    if (!Number.isFinite(amt) || amt <= 0) {
      res.status(400).json({ error: 'montant > 0 requis' });
      return;
    }

    // Look up patient + amount for context.
    let patientId: number | null = null;
    if (examen_id) {
      const ex = await prisma.examen.findUnique({ where: { id: Number(examen_id) }, select: { patientId: true } });
      patientId = ex?.patientId ?? null;
    }
    if (!patientId && facture_id) {
      const fac = await prisma.facture.findUnique({ where: { id: Number(facture_id) }, select: { patientId: true } });
      patientId = fac?.patientId ?? null;
    }

    // Reference: short unique token. Phone for MM, USSD generated only
    // for MM (real Remita would return one specific to the operator).
    const reference = `PAY-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const ussd = mode === 'mobile_money'
      ? `*789*${Math.floor(1000 + Math.random() * 9000)}#`
      : null;

    const intent = await prisma.paymentIntent.create({
      data: {
        reference,
        provider: mode === 'mobile_money' || mode === 'carte' ? 'remita' : 'manual',
        mode,
        examenId: examen_id ?? null,
        factureId: facture_id ?? null,
        patientId,
        montant: new Prisma.Decimal(amt),
        phone: phone ?? null,
        ussdCode: ussd,
        statut: PaymentIntentStatut.pending,
        createdByUserId: req.user!.id,
      },
    });

    res.status(201).json({
      reference: intent.reference,
      ussd_code: intent.ussdCode,
      provider: intent.provider,
      mode: intent.mode,
      // UX hint for the cashier modal. Remita-real would replace with
      // the operator's actual instruction text.
      instructions: mode === 'mobile_money'
        ? `Composez ${ussd} sur le téléphone du patient${phone ? ` (${phone})` : ''} et validez avec le code PIN.`
        : mode === 'carte'
          ? 'Insérez la carte dans le TPE, faites composer le PIN, puis confirmez quand l\'écran affiche « Approuvé ».'
          : mode === 'virement'
            ? 'Communiquez les coordonnées bancaires au patient, attendez la notification de réception puis confirmez.'
            : 'Encaissez les espèces, rendez la monnaie, puis confirmez.',
    });
  } catch (err) {
    console.error('[PAYMENTS] initiate failed:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/status/:reference', authenticate, async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const intent = await prisma.paymentIntent.findUnique({ where: { reference: req.params.reference } });
    if (!intent) { res.status(404).json({ error: 'Référence inconnue' }); return; }
    // Auto-cancel anciens intents pour ne pas laisser un polling
    // infinin coucher dans la queue d'examens.
    if (intent.statut === PaymentIntentStatut.pending) {
      const ageMin = (Date.now() - intent.createdAt.getTime()) / 60_000;
      if (ageMin > POLL_MAX_AGE_MIN) {
        await prisma.paymentIntent.update({ where: { id: intent.id }, data: { statut: PaymentIntentStatut.cancelled, errorMessage: 'Délai dépassé' } });
        res.json({ statut: 'cancelled' });
        return;
      }
    }
    res.json({ statut: intent.statut, error_message: intent.errorMessage });
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * Confirmation manuelle (utilisateur dit « j'ai vu le paiement »).
 * En attente du vrai webhook Remita, c'est le chemin par défaut.
 * Idempotent — re-confirmer un intent déjà payé ne crée pas de doublon.
 */
router.post('/confirm/:reference', authenticate, authorize('admin', 'comptable', 'reception'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { external_ref } = req.body as { external_ref?: string };
    const intent = await prisma.paymentIntent.findUnique({ where: { reference: req.params.reference } });
    if (!intent) { res.status(404).json({ error: 'Référence inconnue' }); return; }
    if (intent.statut === PaymentIntentStatut.paid) {
      res.json({ statut: 'paid', already: true });
      return;
    }
    if (intent.statut === PaymentIntentStatut.cancelled || intent.statut === PaymentIntentStatut.failed) {
      res.status(409).json({ error: 'Intent déjà clôturé', statut: intent.statut });
      return;
    }
    await prisma.$transaction(async (tx) => {
      await tx.paymentIntent.update({
        where: { id: intent.id },
        data: {
          statut: PaymentIntentStatut.paid,
          externalRef: external_ref ?? null,
          updatedAt: new Date(),
        },
      });
      // Mark the underlying resource paid. For examen, advance from
      // 'a_payer' to 'prelevement' as the lab Kanban expects.
      if (intent.examenId) {
        await tx.examen.update({
          where: { id: intent.examenId },
          data: {
            paye: true,
            datePaiement: new Date(),
            modePaiement: intent.mode,
            ...(await tx.examen.findUnique({ where: { id: intent.examenId }, select: { statut: true } }))?.statut === ExamenStatut.a_payer
              ? { statut: ExamenStatut.prelevement }
              : {},
          },
        });
      }
      if (intent.factureId) {
        // Record a paiement row tied to the facture. The aggregation
        // / statut update happens via facturation.ts when next opened
        // — keep this minimal here.
        await tx.paiement.create({
          data: {
            factureId: intent.factureId,
            montant: intent.montant,
            modePaiement: intent.mode,
            reference: intent.reference,
            recuPar: req.user!.id,
          },
        });
      }
    });
    await logAudit({
      userId: req.user!.id, action: 'update', tableName: 'payment_intents', recordId: intent.id,
      details: `Confirmation manuelle paiement ${intent.reference} (${intent.mode})`,
    });
    res.json({ statut: 'paid' });
  } catch (err) {
    console.error('[PAYMENTS] confirm failed:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/cancel/:reference', authenticate, authorize('admin', 'comptable', 'reception'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const intent = await prisma.paymentIntent.findUnique({ where: { reference: req.params.reference } });
    if (!intent) { res.status(404).json({ error: 'Référence inconnue' }); return; }
    if (intent.statut !== PaymentIntentStatut.pending) {
      res.status(409).json({ error: 'Intent non en attente', statut: intent.statut });
      return;
    }
    await prisma.paymentIntent.update({ where: { id: intent.id }, data: { statut: PaymentIntentStatut.cancelled, errorMessage: 'Annulé par utilisateur' } });
    res.json({ statut: 'cancelled' });
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

/**
 * Webhook Remita — point de branchement quand les credentials seront
 * provisionnés. Pour l'instant accepte simplement un POST signé
 * 'X-Remita-Signature' et marque le paiement payé. À durcir avec la
 * vraie vérif HMAC quand Remita aura partagé la clé partagée.
 */
router.post('/webhook/remita', async (req, res): Promise<void> => {
  try {
    const { reference, status, external_ref } = req.body as { reference?: string; status?: string; external_ref?: string };
    if (!reference) { res.status(400).end(); return; }
    const intent = await prisma.paymentIntent.findUnique({ where: { reference } });
    if (!intent) { res.status(404).end(); return; }
    if (status === 'success' || status === '00') {
      await prisma.paymentIntent.update({
        where: { id: intent.id },
        data: { statut: PaymentIntentStatut.paid, externalRef: external_ref ?? null, updatedAt: new Date() },
      });
    } else if (status === 'failed' || status === 'cancelled') {
      await prisma.paymentIntent.update({
        where: { id: intent.id },
        data: { statut: PaymentIntentStatut.failed, errorMessage: status, updatedAt: new Date() },
      });
    }
    res.status(200).end();
  } catch (err) {
    console.error('[PAYMENTS] webhook failed:', err);
    res.status(500).end();
  }
});

// === ASSURANCES ===

router.get('/assurances', authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const rows = await prisma.assurance.findMany({ where: { actif: true }, orderBy: { nom: 'asc' } });
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.post('/prise-en-charge', authenticate, authorize('admin', 'comptable', 'reception'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { assurance_id, patient_id, examen_id, facture_id, numero_police, montant_total, montant_assurance, montant_patient, notes } = req.body as {
      assurance_id?: number; patient_id?: number; examen_id?: number; facture_id?: number;
      numero_police?: string; montant_total?: number; montant_assurance?: number; montant_patient?: number;
      notes?: string;
    };
    if (!assurance_id || !patient_id || !numero_police) {
      res.status(400).json({ error: 'assurance_id, patient_id et numero_police requis' });
      return;
    }
    if (!examen_id && !facture_id) {
      res.status(400).json({ error: 'examen_id ou facture_id requis' });
      return;
    }
    const total = Number(montant_total);
    const assur = Number(montant_assurance);
    const patient = Number(montant_patient);
    if (![total, assur, patient].every(n => Number.isFinite(n) && n >= 0)) {
      res.status(400).json({ error: 'Montants invalides' });
      return;
    }
    if (Math.abs((assur + patient) - total) > 0.01) {
      res.status(400).json({ error: 'montant_assurance + montant_patient doit égaler montant_total' });
      return;
    }

    const pec = await prisma.priseEnCharge.create({
      data: {
        assuranceId: Number(assurance_id),
        patientId: Number(patient_id),
        examenId: examen_id ?? null,
        factureId: facture_id ?? null,
        numeroPolice: String(numero_police).substring(0, 100),
        montantTotal: new Prisma.Decimal(total),
        montantAssurance: new Prisma.Decimal(assur),
        montantPatient: new Prisma.Decimal(patient),
        statut: PriseEnChargeStatut.en_attente,
        notes: notes ?? null,
        createdByUserId: req.user!.id,
      },
    });

    // Si la part assurance couvre tout, l'examen peut avancer
    // immédiatement. Sinon on attend que le patient règle son
    // co-paiement par un autre PaymentIntent.
    if (examen_id && patient === 0) {
      await prisma.examen.update({
        where: { id: Number(examen_id) },
        data: {
          paye: true,
          datePaiement: new Date(),
          modePaiement: 'assurance',
          statut: ExamenStatut.prelevement,
        },
      });
    }

    await logAudit({
      userId: req.user!.id, action: 'create', tableName: 'prises_en_charge', recordId: pec.id,
      details: `PEC patient #${patient_id} — assurance #${assurance_id} — total=${total} assurance=${assur} patient=${patient}`,
    });

    res.status(201).json(pec);
  } catch (err) {
    console.error('[PAYMENTS] prise-en-charge failed:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

export default router;
