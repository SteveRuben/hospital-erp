import { prisma } from '../config/db.js';

/**
 * Disponibilité d'un médecin à un instant donné, à partir de son agenda :
 *   - disponibilités RÉCURRENTES (par jour de semaine + plage horaire) ;
 *   - EXCEPTIONS datées : 'absence' (indispo) ou 'presence' (dispo ponctuelle).
 *
 * Priorité : une 'absence' ce jour l'emporte ; sinon une 'presence' couvrant
 * l'heure rend dispo ; sinon on regarde le récurrent du jour.
 *
 * Si AUCUN agenda n'est défini pour ce médecin, on ne bloque pas (aucune
 * contrainte tant que l'agenda n'a pas été saisi).
 */

function toMinutes(hhmm: string | null | undefined): number | null {
  if (!hhmm) return null;
  const m = /^(\d{1,2}):(\d{2})$/.exec(hhmm.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export interface AvailabilityResult {
  available: boolean;
  reason?: string;
}

export async function checkMedecinAvailability(medecinUserId: number, when: Date): Promise<AvailabilityResult> {
  if (Number.isNaN(when.getTime())) return { available: true }; // date invalide → ne bloque pas ici

  const minutes = when.getHours() * 60 + when.getMinutes();
  const jour = when.getDay(); // 0=dimanche … 6=samedi
  const y = when.getFullYear();
  const mo = String(when.getMonth() + 1).padStart(2, '0');
  const d = String(when.getDate()).padStart(2, '0');
  const dateOnly = new Date(`${y}-${mo}-${d}T00:00:00.000Z`); // colonne DATE = minuit UTC

  const [recurrent, exceptions] = await Promise.all([
    prisma.medecinDisponibilite.findMany({ where: { medecinUserId } }),
    prisma.medecinException.findMany({ where: { medecinUserId, date: dateOnly } }),
  ]);

  // Pas d'agenda du tout → pas de contrainte.
  if (recurrent.length === 0 && exceptions.length === 0) return { available: true };

  // null/null = journée entière → toujours dans la plage.
  const inRange = (debut: string | null, fin: string | null) => {
    const d0 = toMinutes(debut);
    const f0 = toMinutes(fin);
    if (d0 == null || f0 == null) return true;
    return minutes >= d0 && minutes < f0;
  };

  // 1) Exceptions du jour priment.
  for (const a of exceptions.filter(e => e.type === 'absence')) {
    if (inRange(a.heureDebut, a.heureFin)) {
      return { available: false, reason: `Le médecin est absent ce jour${a.motif ? ` (${a.motif})` : ''}.` };
    }
  }
  const presences = exceptions.filter(e => e.type === 'presence');
  if (presences.some(p => inRange(p.heureDebut, p.heureFin))) return { available: true };

  // 2) Récurrent du jour.
  const slots = recurrent.filter(s => s.jourSemaine === jour);
  if (slots.some(s => inRange(s.heureDebut, s.heureFin))) return { available: true };

  if (slots.length === 0 && presences.length === 0) {
    return { available: false, reason: "Le médecin n'a pas de présence prévue ce jour." };
  }
  return { available: false, reason: 'Créneau hors des heures de présence du médecin.' };
}
