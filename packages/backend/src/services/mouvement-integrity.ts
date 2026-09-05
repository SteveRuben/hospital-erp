/**
 * Detects stock_mouvements filed against a lot that doesn't exist in the
 * medicament's current stock. Under the pre-fix code, a mismatched lot made
 * the raw-SQL UPDATE's WHERE clause false for every row, so the movement was
 * recorded as 'valide' while silently never touching stock — see
 * routes/pharmacie.ts GET /mouvements (`orphelin` flag, same detection logic
 * inlined there for the UI) and the sufficiency-check fix that now prevents
 * new ones. This only needs to catch movements that predate that fix, but
 * runs on a schedule (not just once) in case of future data drift (manual DB
 * edits, imports, etc.).
 *
 * Persists as an actual admin notification — not just a highlight in the
 * Mouvements tab — deduped by a `[mvt:<id>]` marker in the notification body
 * so each broken movement is only ever notified once.
 */

import { prisma } from '../config/db.js';
import { notifyMany } from './notify.js';

const FIRST_RUN_DELAY_MS = 45_000;
const HOURS_BETWEEN_RUNS = 6;

async function checkOnce(): Promise<void> {
  try {
    const rows = await prisma.stockMouvement.findMany({
      where: { lot: { not: null } },
      select: { id: true, medicamentId: true, lot: true, quantite: true, typeMouvement: true },
    });
    if (rows.length === 0) return;

    const medIds = Array.from(new Set(rows.map(r => r.medicamentId).filter((v): v is number => v != null)));
    const stockRows = medIds.length > 0
      ? await prisma.stock.findMany({ where: { medicamentId: { in: medIds } }, select: { medicamentId: true, lot: true } })
      : [];
    const knownLots = new Set(stockRows.map(s => `${s.medicamentId}|${s.lot ?? ''}`));

    const orphans = rows.filter(r => r.medicamentId != null && r.lot && !knownLots.has(`${r.medicamentId}|${r.lot}`));
    if (orphans.length === 0) return;

    const admins = await prisma.user.findMany({ where: { role: 'admin' }, select: { id: true } });
    if (admins.length === 0) return;

    const orphanMedIds = Array.from(new Set(orphans.map(o => o.medicamentId as number)));
    const meds = await prisma.medicament.findMany({ where: { id: { in: orphanMedIds } }, select: { id: true, nom: true } });
    const medNameById = new Map(meds.map(m => [m.id, m.nom]));

    for (const o of orphans) {
      const marker = `[mvt:${o.id}]`;
      const already = await prisma.notification.findFirst({
        where: { type: 'stock_mouvement_orphelin', body: { contains: marker } },
        select: { id: true },
      });
      if (already) continue;

      const nom = medNameById.get(o.medicamentId as number) ?? `médicament #${o.medicamentId}`;
      await notifyMany(admins.map(a => a.id), {
        type: 'stock_mouvement_orphelin',
        title: `Mouvement à corriger : ${nom}`,
        body: `${o.typeMouvement} de ${o.quantite} — lot "${o.lot}" introuvable en stock, le stock n'a pas été modifié par ce mouvement. ${marker}`,
        link: `/app/pharmacie/${o.medicamentId}`,
      });
    }
  } catch (err) {
    console.error('[MOUVEMENT_INTEGRITY] check failed:', err);
  }
}

export function scheduleMouvementIntegrityCheck(): void {
  setTimeout(() => {
    checkOnce().catch(err => console.error('[MOUVEMENT_INTEGRITY] first run failed:', err));
  }, FIRST_RUN_DELAY_MS).unref();

  setInterval(() => {
    checkOnce().catch(err => console.error('[MOUVEMENT_INTEGRITY] scheduled run failed:', err));
  }, HOURS_BETWEEN_RUNS * 3600_000).unref();

  console.log(`[MOUVEMENT_INTEGRITY] scheduled — first run in ${FIRST_RUN_DELAY_MS / 1000}s, then every ${HOURS_BETWEEN_RUNS}h`);
}
