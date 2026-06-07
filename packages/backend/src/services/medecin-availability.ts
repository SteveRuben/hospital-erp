import { prisma } from '../config/db.js';
import { RendezVousStatut } from '@prisma/client';

/**
 * Disponibilité d'un médecin à partir de son agenda :
 *   - disponibilités RÉCURRENTES (jour de semaine + plage horaire) ;
 *   - EXCEPTIONS datées : 'absence' (indispo) ou 'presence' (dispo ponctuelle).
 *
 * Priorité : une 'absence' couvrant l'heure l'emporte ; sinon une 'presence'
 * couvrant l'heure rend dispo ; sinon le récurrent du jour.
 * Aucun agenda défini = pas de contrainte (on ne bloque pas).
 */

function toMinutes(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function fmtMinutes(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

function localHHMM(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

interface Agenda {
  recurrent: Array<{ jourSemaine: number; heureDebut: string; heureFin: string }>;
  exceptions: Array<{ type: string; heureDebut: string | null; heureFin: string | null; motif: string | null }>;
}

// Minuit UTC pour la colonne DATE.
function dateOnlyUTC(when: Date): Date {
  const y = when.getFullYear();
  const mo = String(when.getMonth() + 1).padStart(2, '0');
  const d = String(when.getDate()).padStart(2, '0');
  return new Date(`${y}-${mo}-${d}T00:00:00.000Z`);
}

async function loadAgenda(medecinUserId: number, when: Date): Promise<Agenda> {
  const [recurrent, exceptions] = await Promise.all([
    prisma.medecinDisponibilite.findMany({ where: { medecinUserId } }),
    prisma.medecinException.findMany({ where: { medecinUserId, date: dateOnlyUTC(when) } }),
  ]);
  return { recurrent, exceptions };
}

export interface AvailabilityResult {
  available: boolean;
  reason?: string;
}

// null/null = journée entière → toujours dans la plage.
function inRange(minutes: number, debut: string | null, fin: string | null): boolean {
  const d0 = toMinutes(debut);
  const f0 = toMinutes(fin);
  if (d0 == null || f0 == null) return true;
  return minutes >= d0 && minutes < f0;
}

// Évalue la dispo à `minutes` un jour `jour` (0..6), agenda déjà chargé.
function evaluate(agenda: Agenda, jour: number, minutes: number): AvailabilityResult {
  for (const a of agenda.exceptions.filter(e => e.type === 'absence')) {
    if (inRange(minutes, a.heureDebut, a.heureFin)) {
      return { available: false, reason: `Le médecin est absent ce jour${a.motif ? ` (${a.motif})` : ''}.` };
    }
  }
  const presences = agenda.exceptions.filter(e => e.type === 'presence');
  if (presences.some(p => inRange(minutes, p.heureDebut, p.heureFin))) return { available: true };

  const slots = agenda.recurrent.filter(s => s.jourSemaine === jour);
  if (slots.some(s => inRange(minutes, s.heureDebut, s.heureFin))) return { available: true };

  if (slots.length === 0 && presences.length === 0) {
    return { available: false, reason: "Le médecin n'a pas de présence prévue ce jour." };
  }
  return { available: false, reason: 'Créneau hors des heures de présence du médecin.' };
}

export async function checkMedecinAvailability(medecinUserId: number, when: Date): Promise<AvailabilityResult> {
  if (Number.isNaN(when.getTime())) return { available: true };
  const agenda = await loadAgenda(medecinUserId, when);
  // Pas d'agenda du tout → pas de contrainte.
  if (agenda.recurrent.length === 0 && agenda.exceptions.length === 0) return { available: true };
  return evaluate(agenda, when.getDay(), when.getHours() * 60 + when.getMinutes());
}

/**
 * Liste les créneaux libres (HH:MM) d'un médecin pour une date donnée :
 * créneaux où il est disponible (agenda) ET sans RDV déjà pris. Pas d'agenda
 * défini → liste vide (rien à proposer ; la prise de RDV reste libre).
 */
export async function listFreeSlots(medecinUserId: number, dateStr: string, durationMin = 30): Promise<string[]> {
  const [y, mo, d] = dateStr.split('-').map(Number);
  if (!y || !mo || !d) return [];
  const dayDate = new Date(y, mo - 1, d); // local
  const jour = dayDate.getDay();

  const agenda = await loadAgenda(medecinUserId, dayDate);
  if (agenda.recurrent.length === 0 && agenda.exceptions.length === 0) return [];

  // RDV déjà pris ce jour (hors annulés / absents).
  const dayStart = new Date(y, mo - 1, d, 0, 0, 0, 0);
  const dayEnd = new Date(y, mo - 1, d, 23, 59, 59, 999);
  const booked = await prisma.rendezVous.findMany({
    where: {
      medecinId: medecinUserId,
      dateRdv: { gte: dayStart, lte: dayEnd },
      statut: { notIn: [RendezVousStatut.annule, RendezVousStatut.absent] },
    },
    select: { dateRdv: true },
  });
  const taken = new Set(booked.map(b => localHHMM(b.dateRdv)));

  // Pour aujourd'hui, on masque les créneaux déjà passés.
  const now = new Date();
  const isToday = now.getFullYear() === y && now.getMonth() === mo - 1 && now.getDate() === d;
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const slots: string[] = [];
  for (let min = 0; min < 24 * 60; min += durationMin) {
    if (!evaluate(agenda, jour, min).available) continue;
    const label = fmtMinutes(min);
    if (taken.has(label)) continue;
    if (isToday && min < nowMin) continue;
    slots.push(label);
  }
  return slots;
}
