/**
 * Offline mutation queue (MVP).
 *
 * When the browser is offline, the axios interceptor (see api.ts)
 * stuffs the request into this queue instead of trying to hit the
 * server. The queue persists in IndexedDB so a page reload doesn't
 * lose pending changes.
 *
 * When `online` fires we replay every queued mutation in order. A
 * failure logs but does NOT drop the entry — the user can decide
 * whether to retry later via the banner.
 *
 * Scope of the MVP:
 *   - Queues only non-GET requests (mutations).
 *   - Doesn't try to merge / dedupe — if you submit the same form
 *     twice while offline, you get two POSTs on reconnect.
 *   - No file uploads (multipart bodies stay rejected).
 *
 * Honest UX caveat: queued submits return a synthetic 202 so the
 * form UI thinks it succeeded. The user sees the banner explaining
 * that N changes are pending — replay errors land in the same banner.
 */

const DB_NAME = 'hospital-erp-offline';
const DB_VERSION = 1;
const STORE = 'mutations';

export interface QueuedMutation {
  id?: number;
  method: 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  url: string;
  body: unknown;
  headers: Record<string, string>;
  ts: number;
  lastError?: string;
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
    };
  });
  return dbPromise;
}

export async function enqueue(m: Omit<QueuedMutation, 'id' | 'ts'>): Promise<number> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const req = store.add({ ...m, ts: Date.now() });
    req.onsuccess = () => resolve(req.result as number);
    req.onerror = () => reject(req.error);
  });
}

export async function list(): Promise<QueuedMutation[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const store = tx.objectStore(STORE);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as QueuedMutation[]);
    req.onerror = () => reject(req.error);
  });
}

export async function remove(id: number): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function markFailed(id: number, error: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const getReq = store.get(id);
    getReq.onsuccess = () => {
      const row = getReq.result as QueuedMutation | undefined;
      if (!row) { resolve(); return; }
      row.lastError = error.substring(0, 500);
      store.put(row);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function count(): Promise<number> {
  const items = await list();
  return items.length;
}

/**
 * Replay every queued mutation. Returns the count successfully sent
 * and the count that failed (left in the queue with lastError set).
 * Caller decides what to surface to the user.
 */
export async function replay(): Promise<{ sent: number; failed: number }> {
  const items = await list();
  let sent = 0, failed = 0;
  for (const item of items) {
    try {
      const r = await fetch(item.url, {
        method: item.method,
        headers: { ...item.headers, 'Content-Type': 'application/json' },
        body: item.body !== undefined ? JSON.stringify(item.body) : undefined,
      });
      if (r.ok || r.status === 201 || r.status === 204) {
        if (item.id !== undefined) await remove(item.id);
        sent += 1;
      } else {
        failed += 1;
        if (item.id !== undefined) await markFailed(item.id, `HTTP ${r.status}`);
      }
    } catch (err: any) {
      failed += 1;
      if (item.id !== undefined) await markFailed(item.id, err?.message ?? 'network error');
    }
  }
  return { sent, failed };
}
