/**
 * Database client.
 *
 * Production code uses the `prisma` export. The legacy `pool` / `query` / `getClient`
 * exports remain ONLY for `config/init.ts` (boot-time DDL) and `config/reset-db.ts`
 * (dev-only destructive script). Both of those will be retired once init.ts is
 * replaced by `prisma migrate deploy` + a `prisma/seed.ts` script.
 *
 * Do NOT use pool/query/getClient in new code. They run on a separate connection
 * pool from Prisma, doubling the connection budget against Neon (the dual-pool
 * issue flagged in the 2026-05-16 eng review).
 */

import pg from 'pg';
import dotenv from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

dotenv.config();

const { Pool } = pg;

const connectionString = process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/hospital_erp';
const useSsl = connectionString.includes('neon.tech') || process.env.NODE_ENV === 'production';
const poolMax = Number(process.env.DB_POOL_MAX) || 10;

/**
 * @deprecated Use `prisma` instead. Only `config/init.ts` and `config/reset-db.ts`
 * may import this; everything else goes through Prisma.
 */
export const pool = new Pool({
  connectionString,
  ssl: useSsl ? { rejectUnauthorized: true } : false,
  max: poolMax,
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

/**
 * @deprecated Use `prisma.$queryRaw` or a typed Prisma method instead.
 */
export const query = async (text: string, params?: unknown[]) => {
  const start = Date.now();
  const res = await pool.query(text, params);
  const duration = Date.now() - start;
  if (process.env.NODE_ENV === 'development') {
    console.log('Executed query', { text: text.substring(0, 50), duration, rows: res.rowCount });
  }
  return res;
};

/**
 * @deprecated Use `prisma.$transaction(async tx => { ... })` instead.
 */
export const getClient = async () => {
  const client = await pool.connect();
  const release = client.release.bind(client);

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