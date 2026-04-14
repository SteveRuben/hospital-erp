import { query } from '../config/db.js';

const prefixes: Record<string, string> = {
  consultations: 'CONS',
  examens: 'EXAM',
  rendez_vous: 'RDV',
  hospitalisations: 'HOSP',
  ordonnances: 'ORD',
  prescriptions: 'PRESC',
};

export const generateReference = async (table: string): Promise<string> => {
  const prefix = prefixes[table] || table.substring(0, 4).toUpperCase();
  const result = await query(`SELECT COUNT(*) as c FROM ${table}`);
  const num = parseInt(result.rows[0].c as string) + 1;
  return `${prefix}-${String(num).padStart(4, '0')}`;
};