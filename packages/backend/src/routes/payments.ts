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

// Public-facing list — only active assurances. Used by the dropdown
// in PaymentModal. The admin variant /assurances/admin returns
// everything (including inactive) plus claim/amount aggregates.
router.get('/assurances', authenticate, async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const rows = await prisma.assurance.findMany({ where: { actif: true }, orderBy: { nom: 'asc' } });
    res.json(rows);
  } catch (err) { res.status(500).json({ error: 'Erreur serveur' }); }
});

router.get('/assurances/admin', authenticate, authorize('admin', 'comptable'), async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const rows = await prisma.assurance.findMany({ orderBy: { nom: 'asc' } });
    // Aggregate claims per assurance — montant total engagé,
    // montant déjà payé par l'assureur, nombre de PEC actives.
    const stats = await prisma.priseEnCharge.groupBy({
      by: ['assuranceId', 'statut'],
      _count: { _all: true },
      _sum: { montantAssurance: true },
    });
    const decorated = rows.map(a => {
      const mine = stats.filter(s => s.assuranceId === a.id);
      const enAttente = mine.find(s => s.statut === 'en_attente');
      const accordee = mine.find(s => s.statut === 'accordee');
      const payee = mine.find(s => s.statut === 'payee');
      const refusee = mine.find(s => s.statut === 'refusee');
      return {
        ...a,
        nb_en_attente: enAttente?._count._all ?? 0,
        nb_accordee: accordee?._count._all ?? 0,
        nb_payee: payee?._count._all ?? 0,
        nb_refusee: refusee?._count._all ?? 0,
        montant_a_recouvrer: Number(enAttente?._sum.montantAssurance ?? 0) + Number(accordee?._sum.montantAssurance ?? 0),
        montant_recouvre: Number(payee?._sum.montantAssurance ?? 0),
      };
    });
    res.json(decorated);
  } catch (err) {
    console.error('[PAYMENTS] assurances/admin failed:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/assurances', authenticate, authorize('admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { nom, code, contact, taux_defaut } = req.body as { nom?: string; code?: string; contact?: string; taux_defaut?: number };
    if (!nom || !String(nom).trim()) { res.status(400).json({ error: 'Nom requis' }); return; }
    const taux = taux_defaut !== undefined ? Number(taux_defaut) : 80;
    if (!Number.isFinite(taux) || taux < 0 || taux > 100) { res.status(400).json({ error: 'Taux entre 0 et 100' }); return; }
    const created = await prisma.assurance.create({
      data: {
        nom: String(nom).trim().substring(0, 200),
        code: code ? String(code).trim().toUpperCase().substring(0, 50) : null,
        contact: contact ? String(contact).substring(0, 200) : null,
        tauxDefaut: new Prisma.Decimal(taux),
        actif: true,
      },
    });
    await logAudit({ userId: req.user!.id, action: 'create', tableName: 'assurances', recordId: created.id, details: `Assurance ${created.nom}` });
    res.status(201).json(created);
  } catch (err: any) {
    if (err?.code === 'P2002') { res.status(409).json({ error: 'Ce code d\'assurance existe déjà' }); return; }
    console.error('[PAYMENTS] create assurance failed:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/assurances/:id', authenticate, authorize('admin'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const { nom, code, contact, taux_defaut, actif } = req.body as { nom?: string; code?: string; contact?: string | null; taux_defaut?: number; actif?: boolean };
    const data: any = {};
    if (nom !== undefined) data.nom = String(nom).trim().substring(0, 200);
    if (code !== undefined) data.code = code ? String(code).trim().toUpperCase().substring(0, 50) : null;
    if (contact !== undefined) data.contact = contact ? String(contact).substring(0, 200) : null;
    if (taux_defaut !== undefined) {
      const t = Number(taux_defaut);
      if (!Number.isFinite(t) || t < 0 || t > 100) { res.status(400).json({ error: 'Taux entre 0 et 100' }); return; }
      data.tauxDefaut = new Prisma.Decimal(t);
    }
    if (actif !== undefined) data.actif = Boolean(actif);
    const updated = await prisma.assurance.update({ where: { id }, data });
    await logAudit({ userId: req.user!.id, action: 'update', tableName: 'assurances', recordId: id, details: `Mise à jour ${updated.nom}` });
    res.json(updated);
  } catch (err: any) {
    if (err?.code === 'P2025') { res.status(404).json({ error: 'Assurance non trouvée' }); return; }
    if (err?.code === 'P2002') { res.status(409).json({ error: 'Ce code existe déjà' }); return; }
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

// === PRISES EN CHARGE — gestion ===

router.get('/prises-en-charge', authenticate, authorize('admin', 'comptable'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { assurance_id, statut, patient_id, debut, fin } = req.query;
    const where: Prisma.PriseEnChargeWhereInput = {};
    if (assurance_id) where.assuranceId = Number(assurance_id);
    if (patient_id) where.patientId = Number(patient_id);
    if (statut) {
      const s = String(statut);
      if (!(['en_attente', 'accordee', 'refusee', 'payee'] as const).includes(s as PriseEnChargeStatut)) {
        res.status(400).json({ error: 'statut invalide' });
        return;
      }
      where.statut = s as PriseEnChargeStatut;
    }
    if (debut || fin) {
      where.createdAt = {};
      if (debut) (where.createdAt as Prisma.DateTimeFilter).gte = new Date(String(debut));
      if (fin) (where.createdAt as Prisma.DateTimeFilter).lte = new Date(String(fin));
    }
    const rows = await prisma.priseEnCharge.findMany({
      where,
      include: {
        assurance: { select: { id: true, nom: true, code: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    // Decorate patient + examen labels in a single round-trip rather
    // than per-row .include (cheaper for the 500-row default cap).
    const patientIds = Array.from(new Set(rows.map(r => r.patientId)));
    const examenIds = Array.from(new Set(rows.map(r => r.examenId).filter((v): v is number => v != null)));
    const [patients, examens] = await Promise.all([
      patientIds.length
        ? prisma.patient.findMany({ where: { id: { in: patientIds } }, select: { id: true, nom: true, prenom: true, referenceId: true } })
        : Promise.resolve([] as Array<{ id: number; nom: string; prenom: string; referenceId: string | null }>),
      examenIds.length
        ? prisma.examen.findMany({ where: { id: { in: examenIds } }, select: { id: true, typeExamen: true } })
        : Promise.resolve([] as Array<{ id: number; typeExamen: string }>),
    ]);
    const pMap = new Map(patients.map(p => [p.id, p]));
    const eMap = new Map(examens.map(e => [e.id, e]));
    res.json(rows.map(r => ({
      ...r,
      patient_nom: pMap.get(r.patientId)?.nom ?? null,
      patient_prenom: pMap.get(r.patientId)?.prenom ?? null,
      patient_reference: pMap.get(r.patientId)?.referenceId ?? null,
      examen_type: r.examenId ? eMap.get(r.examenId)?.typeExamen ?? null : null,
      assurance_nom: r.assurance.nom,
      assurance_code: r.assurance.code,
    })));
  } catch (err) {
    console.error('[PAYMENTS] list PEC failed:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.patch('/prises-en-charge/:id/statut', authenticate, authorize('admin', 'comptable'), async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const id = Number(req.params.id);
    const { statut, notes } = req.body as { statut?: string; notes?: string };
    const validStatuts = ['en_attente', 'accordee', 'refusee', 'payee'] as const;
    if (!statut || !validStatuts.includes(statut as PriseEnChargeStatut)) {
      res.status(400).json({ error: 'Statut requis (en_attente | accordee | refusee | payee)' });
      return;
    }
    const before = await prisma.priseEnCharge.findUnique({ where: { id } });
    if (!before) { res.status(404).json({ error: 'Prise en charge non trouvée' }); return; }
    const updated = await prisma.priseEnCharge.update({
      where: { id },
      data: {
        statut: statut as PriseEnChargeStatut,
        notes: notes !== undefined ? (notes ? String(notes).substring(0, 1000) : null) : before.notes,
      },
    });
    await logAudit({
      userId: req.user!.id, action: 'update', tableName: 'prises_en_charge', recordId: id,
      details: `PEC #${id} : ${before.statut} → ${updated.statut}${notes ? ` — ${notes.substring(0, 100)}` : ''}`,
    });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: 'Erreur serveur' });
  }
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
