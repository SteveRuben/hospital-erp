import pg from 'pg';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

dotenv.config();

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/hospital_erp';
const useSsl = connectionString.includes('neon.tech') || process.env.NODE_ENV === 'production';

export const pool = new Pool({
  connectionString,
  ssl: useSsl ? { rejectUnauthorized: true } : false,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

const adapter = new PrismaPg({ connectionString, ssl: useSsl ? { rejectUnauthorized: true } : false });

declare global {
  var __prisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  globalThis.__prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') globalThis.__prisma = prisma;

export const query = async (text: string, params?: unknown[]) => {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  // Only log in development, and never log query content (PHI protection)
  if (process.env.NODE_ENV === 'development') {
    console.log('Executed query', { text: text.substring(0, 50), duration, rows: res.rowCount });
  }
  return res;
};

export const getClient = async () => {
  const client = await pool.connect();
  const query = client.query.bind(client);
  const release = client.release.bind(client);
  
  // Set a timeout of 5 seconds
  const timeout = setTimeout(() => {
    console.error('Client has been checked out for too long');
  }, 5000);
  
  client.release = () => {
    clearTimeout(timeout);
    return release();
  };
  
  return client;
};

export default { pool, query, getClient, prisma };