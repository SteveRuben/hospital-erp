import { pool } from './db.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/**
 * Reset COMPLET de la base : supprime tout le schéma `public` puis le recrée
 * vide. Robuste face à la dérive du schéma — plus aucune liste de tables à
 * maintenir (l'ancienne version oubliait assurances, prises_en_charge,
 * payment_intents, examen_fichiers, reference_lists, concepts/EAV, etc.).
 *
 * Après ce reset, REDÉMARRER le serveur : la séquence de boot recrée tout
 *   (migrate-bootstrap → prisma migrate deploy → init.ts seed) :
 *   schéma + données de base (admin, habilitations, menu, listes de référence).
 *
 * DESTRUCTIF ET IRRÉVERSIBLE. Garde-fou : exige CONFIRM_RESET=1 pour éviter un
 * déclenchement accidentel contre une base de production.
 *
 *   Local   :  CONFIRM_RESET=1 npm run db:reset
 *   Railway :  one-off command ->  CONFIRM_RESET=1 npm run db:reset
 *              puis redéployer / redémarrer le service.
 */
const resetDB = async () => {
  if (process.env.CONFIRM_RESET !== '1') {
    console.error('Reset refusé (operation destructive). Relancez avec :  CONFIRM_RESET=1 npm run db:reset');
    process.exit(1);
  }
  const client = await pool.connect();
  try {
    const { rows } = await client.query('SELECT current_database() AS db, current_user AS usr');
    console.log(`Reset COMPLET du schéma public — base "${rows[0].db}" (user ${rows[0].usr})...`);
    await client.query('DROP SCHEMA IF EXISTS public CASCADE;');
    await client.query('CREATE SCHEMA public;');
    await client.query('GRANT ALL ON SCHEMA public TO CURRENT_USER;');
    console.log('Schéma public recréé (vide).');
    console.log('-> Redémarrez/redéployez le serveur : migrate deploy + init.ts recréent et re-seedent tout.');
  } catch (err) {
    console.error('Erreur lors du reset:', err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
};

resetDB();
