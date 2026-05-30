import { lazy, type ComponentType, type LazyExoticComponent } from 'react';

/**
 * Drop-in replacement for React.lazy that survives the classic
 * "Failed to fetch dynamically imported module" error users hit right after
 * a deploy.
 *
 * What goes wrong: Vite emits content-hashed chunks (Visites-DAlH-7JS.js).
 * The user's open tab still holds the previous index bundle, which knows the
 * OLD chunk name. After we deploy, the OLD chunk is gone from the server and
 * any lazy route the user navigates to throws TypeError on import.
 *
 * Fix: on the first chunk-load failure we force a full reload. That fetches
 * the new index.html, which references the new chunk names. A 10-second
 * sessionStorage guard prevents an infinite reload loop if the network is
 * actually broken (e.g. captive portal, server down) — after one reload we
 * surface the real error to the existing Suspense boundary.
 */

const RELOAD_KEY = 'gstack:chunk-reload';
const RELOAD_GUARD_MS = 10_000;

function isChunkLoadError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message || '';
  // Covers Chrome, Firefox, and Safari phrasing.
  return /failed to fetch dynamically imported module|importing a module script failed|error loading dynamically imported module/i.test(msg);
}

export function lazyWithReload<T extends ComponentType<unknown>>(
  importFn: () => Promise<{ default: T }>,
): LazyExoticComponent<T> {
  return lazy(async () => {
    try {
      return await importFn();
    } catch (err) {
      if (isChunkLoadError(err) && typeof window !== 'undefined') {
        const now = Date.now();
        const last = Number(window.sessionStorage.getItem(RELOAD_KEY) || 0);
        if (now - last > RELOAD_GUARD_MS) {
          window.sessionStorage.setItem(RELOAD_KEY, String(now));
          window.location.reload();
          // Hold the promise forever so React keeps the Suspense fallback
          // up while the reload kicks in — never rejects, never resolves.
          return new Promise<{ default: T }>(() => { /* unresolved */ });
        }
      }
      throw err;
    }
  });
}
