/**
 * Workflow state machine — guards for every statut transition.
 *
 * Background (CEO Review §W1/W2): every route that writes a statut today
 * validates the value against the allowed set (now derived from the
 * Prisma enum, post §2 enum migration) — but none validates the
 * *transition*. A laborantin can roll an exam from 'transmis' back to
 * 'demande', and a réceptionniste can flip an RDV from 'termine' back to
 * 'planifie'. The valid sequence is encoded only in the order of UI
 * buttons.
 *
 * This module is the single source of truth for what transitions each
 * workflow allows. Routes call assertTransition() before the Prisma
 * update; if the transition is invalid the caller is responsible for
 * returning 400 (the function throws a typed WorkflowError so the
 * route can map it cleanly).
 *
 * Convention: the FROM key has a Set of valid TO labels. A terminal
 * state has an empty set. Any state may transition to itself
 * (idempotent no-op) — explicit, so writers can replay the same patch
 * without a 400.
 */

import {
  ExamenStatut, RendezVousStatut, ConsultationStatut, OrderStatut,
  PathologieStatut, PrescriptionStatut, OrdonnanceStatut, VisiteStatut,
  HospitalisationStatut, FileAttenteStatut, LitStatut,
  ProgrammePatientStatut, FactureStatut,
} from '@prisma/client';

export class WorkflowError extends Error {
  constructor(public readonly from: string, public readonly to: string, public readonly kind: string) {
    super(`Transition ${kind}: ${from} → ${to} non autorisée`);
    this.name = 'WorkflowError';
  }
}

// Lab Kanban. The 'demande' → 'prelevement' jump skips 'a_payer' for
// zero-amount exams (see laboratoire.ts:150 where the initial statut is
// chosen). Every billable exam must traverse 'a_payer'.
const EXAMEN: Record<ExamenStatut, ReadonlySet<ExamenStatut>> = {
  demande:     new Set([ExamenStatut.a_payer, ExamenStatut.prelevement]),
  a_payer:     new Set([ExamenStatut.prelevement]),
  prelevement: new Set([ExamenStatut.analyse]),
  analyse:     new Set([ExamenStatut.resultat]),
  resultat:    new Set([ExamenStatut.valide]),
  valide:      new Set([ExamenStatut.transmis]),
  transmis:    new Set(), // terminal
};

// RDV lifecycle. Cancellation and no-show are exits from any pre-end
// state. 'termine' / 'annule' / 'absent' are terminal.
const RDV: Record<RendezVousStatut, ReadonlySet<RendezVousStatut>> = {
  planifie:  new Set([RendezVousStatut.confirme, RendezVousStatut.annule, RendezVousStatut.absent]),
  confirme:  new Set([RendezVousStatut.en_cours, RendezVousStatut.annule, RendezVousStatut.absent]),
  en_cours:  new Set([RendezVousStatut.termine, RendezVousStatut.absent]),
  termine:   new Set(),
  annule:    new Set(),
  absent:    new Set(),
};

const CONSULTATION: Record<ConsultationStatut, ReadonlySet<ConsultationStatut>> = {
  en_cours: new Set([ConsultationStatut.terminee, ConsultationStatut.annulee]),
  terminee: new Set(),
  annulee:  new Set(),
};

const ORDER: Record<OrderStatut, ReadonlySet<OrderStatut>> = {
  nouveau:  new Set([OrderStatut.actif, OrderStatut.annule]),
  actif:    new Set([OrderStatut.complete, OrderStatut.annule, OrderStatut.expire]),
  complete: new Set(),
  annule:   new Set(),
  expire:   new Set(),
};

const PATHOLOGIE: Record<PathologieStatut, ReadonlySet<PathologieStatut>> = {
  active:   new Set([PathologieStatut.inactive, PathologieStatut.resolue]),
  inactive: new Set([PathologieStatut.active, PathologieStatut.resolue]),
  resolue:  new Set([PathologieStatut.active]), // can be re-flagged if it recurs
};

const PRESCRIPTION: Record<PrescriptionStatut, ReadonlySet<PrescriptionStatut>> = {
  active:   new Set([PrescriptionStatut.terminee, PrescriptionStatut.annulee]),
  terminee: new Set(),
  annulee:  new Set(),
};

const ORDONNANCE: Record<OrdonnanceStatut, ReadonlySet<OrdonnanceStatut>> = {
  emise:    new Set([OrdonnanceStatut.delivree, OrdonnanceStatut.annulee]),
  delivree: new Set(),
  annulee:  new Set(),
};

const VISITE: Record<VisiteStatut, ReadonlySet<VisiteStatut>> = {
  active:   new Set([VisiteStatut.terminee]),
  terminee: new Set(),
};

const HOSPITALISATION: Record<HospitalisationStatut, ReadonlySet<HospitalisationStatut>> = {
  active:    new Set([HospitalisationStatut.sortie, HospitalisationStatut.transfere, HospitalisationStatut.deces]),
  sortie:    new Set(),
  transfere: new Set(),
  deces:     new Set(),
};

const FILE_ATTENTE: Record<FileAttenteStatut, ReadonlySet<FileAttenteStatut>> = {
  en_attente: new Set([FileAttenteStatut.en_cours, FileAttenteStatut.absent]),
  en_cours:   new Set([FileAttenteStatut.termine]),
  termine:    new Set(),
  absent:     new Set(),
};

// Beds cycle freely between disponible ↔ occupe (admission/discharge) and
// can be parked for maintenance or held in reservation from either side.
const LIT: Record<LitStatut, ReadonlySet<LitStatut>> = {
  disponible:  new Set([LitStatut.occupe, LitStatut.maintenance, LitStatut.reserve]),
  occupe:      new Set([LitStatut.disponible, LitStatut.maintenance]),
  maintenance: new Set([LitStatut.disponible]),
  reserve:     new Set([LitStatut.disponible, LitStatut.occupe]),
};

const PROGRAMME_PATIENT: Record<ProgrammePatientStatut, ReadonlySet<ProgrammePatientStatut>> = {
  actif:      new Set([ProgrammePatientStatut.termine, ProgrammePatientStatut.abandonne]),
  termine:    new Set(),
  abandonne:  new Set([ProgrammePatientStatut.actif]), // re-enrolment allowed
};

// Facture: any non-terminal state can be cancelled. 'partielle' can
// continue accumulating paiements toward 'payee'.
const FACTURE: Record<FactureStatut, ReadonlySet<FactureStatut>> = {
  en_attente: new Set([FactureStatut.partielle, FactureStatut.payee, FactureStatut.annulee]),
  partielle:  new Set([FactureStatut.payee, FactureStatut.annulee]),
  payee:      new Set(),
  annulee:    new Set(),
};

const TABLES = {
  examen:           EXAMEN,
  rdv:              RDV,
  consultation:     CONSULTATION,
  order:            ORDER,
  pathologie:       PATHOLOGIE,
  prescription:     PRESCRIPTION,
  ordonnance:       ORDONNANCE,
  visite:           VISITE,
  hospitalisation:  HOSPITALISATION,
  fileAttente:      FILE_ATTENTE,
  lit:              LIT,
  programmePatient: PROGRAMME_PATIENT,
  facture:          FACTURE,
} as const;

export type WorkflowKind = keyof typeof TABLES;

/**
 * Returns true if the transition is permitted (including the
 * idempotent self-transition, which we always allow so a route can
 * replay the same statut without a 400).
 */
export function canTransition<K extends WorkflowKind>(
  kind: K,
  from: string,
  to: string,
): boolean {
  if (from === to) return true;
  const table = TABLES[kind] as Record<string, ReadonlySet<string>>;
  const next = table[from];
  return !!next && next.has(to);
}

/**
 * Throws WorkflowError when the transition is not in the allow-list.
 * Route handlers should catch and map to 400.
 */
export function assertTransition<K extends WorkflowKind>(
  kind: K,
  from: string,
  to: string,
): void {
  if (!canTransition(kind, from, to)) {
    throw new WorkflowError(from, to, kind);
  }
}
