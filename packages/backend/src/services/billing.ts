/**
 * Automatic billing service.
 *
 * Closes the gap (flow analysis §5) where a completed consultation or a paid
 * exam never generated any financial record — every recette had to be typed
 * in by hand at the cash desk.
 *
 * Design choices:
 *   - We write to `recettes` (the simple revenue ledger), not `factures`.
 *     Recettes is what Finances/Rapports already aggregate; an invoice
 *     workflow (devis → facture → paiement) is a heavier flow the cashier
 *     drives manually when a patient needs a formal invoice.
 *   - Idempotence: each acte is billed at most once. We tag the recette with
 *     a deterministic `description` marker ("[auto:consultation:42]") and skip
 *     creation if a matching, non-cancelled recette already exists. Replaying
 *     the same status transition (e.g. terminee → terminee) is therefore safe.
 *   - Best-effort: billing must never break the clinical flow. Callers wrap
 *     this in their own try/catch OR rely on the internal guard that logs and
 *     swallows. A failed recette is logged, not thrown.
 */

import { prisma } from '../config/db.js';
import { logAudit } from './audit.js';

export type ActeKind = 'consultation' | 'examen' | 'hospitalisation';

function autoMarker(kind: ActeKind, sourceId: number): string {
  return `[auto:${kind}:${sourceId}]`;
}

interface RecordActeOptions {
  kind: ActeKind;
  sourceId: number;
  patientId: number | null;
  serviceId?: number | null;
  typeActe: string;
  montant: number;
  modePaiement?: string | null;
  userId: number;
}

/**
 * Idempotently record revenue for a clinical acte. Returns the created
 * recette id, or null when nothing was written (zero amount, duplicate, or a
 * swallowed error).
 */
export async function recordActeRevenue(opts: RecordActeOptions): Promise<number | null> {
  try {
    const montant = Number(opts.montant);
    if (!Number.isFinite(montant) || montant <= 0) return null; // free acte → no revenue line

    const marker = autoMarker(opts.kind, opts.sourceId);

    // Idempotence par colonnes dédiées (source_kind, source_id) plutôt qu'un
    // LIKE sur description (fragile + scan). Un index UNIQUE PARTIEL garantit
    // l'unicité même en cas de concurrence.
    const findLive = () => prisma.recette.findFirst({
      where: {
        sourceKind: opts.kind,
        sourceId: opts.sourceId,
        OR: [{ annulee: false }, { annulee: null }],
      },
      select: { id: true },
    });

    const existing = await findLive();
    if (existing) return existing.id;

    let created;
    try {
      created = await prisma.recette.create({
        data: {
          patientId: opts.patientId,
          serviceId: opts.serviceId ?? null,
          typeActe: opts.typeActe.substring(0, 100),
          montant,
          modePaiement: (opts.modePaiement ?? 'especes').substring(0, 50),
          sourceKind: opts.kind,
          sourceId: opts.sourceId,
          description: marker, // lisible pour l'humain ; l'idempotence vient des colonnes
        },
      });
    } catch (err: any) {
      // Course : un autre process a inséré la même source entre le find et le
      // create → l'index unique partiel rejette (P2002). On récupère l'existant.
      if (err?.code === 'P2002') {
        const live = await findLive();
        if (live) return live.id;
      }
      throw err;
    }

    await logAudit({
      userId: opts.userId, action: 'create', tableName: 'recettes', recordId: created.id,
      details: `Recette auto ${opts.kind} #${opts.sourceId} — ${montant}`,
    });

    return created.id;
  } catch (err) {
    console.error('[BILLING] recordActeRevenue failed:', err);
    return null;
  }
}

/**
 * Bill a consultation when it is completed. The fee is taken from the linked
 * service's `prix`; a consultation with no service or a zero-priced service
 * produces no recette (the clinic may bill those some other way).
 */
export async function billConsultation(consultationId: number, userId: number): Promise<number | null> {
  try {
    const c = await prisma.consultation.findUnique({
      where: { id: consultationId },
      select: {
        patientId: true, serviceId: true,
        service: { select: { nom: true, prix: true } },
      },
    });
    if (!c) return null;
    const montant = Number(c.service?.prix ?? 0);
    if (montant <= 0) return null;
    return recordActeRevenue({
      kind: 'consultation',
      sourceId: consultationId,
      patientId: c.patientId,
      serviceId: c.serviceId,
      typeActe: c.service?.nom ? `Consultation — ${c.service.nom}` : 'Consultation',
      montant,
      userId,
    });
  } catch (err) {
    console.error('[BILLING] billConsultation failed:', err);
    return null;
  }
}
