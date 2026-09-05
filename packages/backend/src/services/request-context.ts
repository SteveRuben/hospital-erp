/**
 * Per-request context (AsyncLocalStorage) so services deep in the call
 * stack — audit logging in particular — can read "where" a write came
 * from (client IP, route) without every call site having to thread
 * `req` through. Populated once per request by the middleware installed
 * in app.ts, read by services/audit.ts.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

export interface RequestContext {
  ip?: string;
  method: string;
  route: string;
}

const als = new AsyncLocalStorage<RequestContext>();

export function runWithRequestContext<T>(ctx: RequestContext, fn: () => T): T {
  return als.run(ctx, fn);
}

export function getRequestContext(): RequestContext | undefined {
  return als.getStore();
}
