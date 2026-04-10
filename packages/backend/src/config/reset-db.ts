import { pool } from './db.js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const resetDB = async () => {
  const client = await pool.connect();
  try {
    console.log('Dropping all tables...');
    await client.query(`
      DROP TABLE IF EXISTS paiements CASCADE;
      DROP TABLE IF EXISTS facture_lignes CASCADE;
      DROP TABLE IF EXISTS factures CASCADE;
      DROP TABLE IF EXISTS tarifs CASCADE;
      DROP TABLE IF EXISTS programme_patients CASCADE;
      DROP TABLE IF EXISTS programmes CASCADE;
      DROP TABLE IF EXISTS hospitalisations CASCADE;
      DROP TABLE IF EXISTS lits CASCADE;
      DROP TABLE IF EXISTS pavillons CASCADE;
      DROP TABLE IF EXISTS liste_patient_membres CASCADE;
      DROP TABLE IF EXISTS listes_patients CASCADE;
      DROP TABLE IF EXISTS formulaire_reponses CASCADE;
      DROP TABLE IF EXISTS formulaires CASCADE;
      DROP TABLE IF EXISTS file_attente CASCADE;
      DROP TABLE IF EXISTS visites CASCADE;
      DROP TABLE IF EXISTS alertes CASCADE;
      DROP TABLE IF EXISTS notes CASCADE;
      DROP TABLE IF EXISTS vaccinations CASCADE;
      DROP TABLE IF EXISTS ordonnances CASCADE;
      DROP TABLE IF EXISTS prescriptions CASCADE;
      DROP TABLE IF EXISTS pathologies CASCADE;
      DROP TABLE IF EXISTS allergies CASCADE;
      DROP TABLE IF EXISTS vitaux CASCADE;
      DROP TABLE IF EXISTS audit_log CASCADE;
      DROP TABLE IF EXISTS documents CASCADE;
      DROP TABLE IF EXISTS rendez_vous CASCADE;
      DROP TABLE IF EXISTS examens CASCADE;
      DROP TABLE IF EXISTS depenses CASCADE;
      DROP TABLE IF EXISTS recettes CASCADE;
      DROP TABLE IF EXISTS consultations CASCADE;
      DROP TABLE IF EXISTS services CASCADE;
      DROP TABLE IF EXISTS medecins CASCADE;
      DROP TABLE IF EXISTS patients CASCADE;
      DROP TABLE IF EXISTS users CASCADE;
    `);
    console.log('All tables dropped. Restart the server to recreate them.');
  } catch (err) {
    console.error('Error resetting database:', err);
  } finally {
    client.release();
    await pool.end();
  }
};

resetDB();