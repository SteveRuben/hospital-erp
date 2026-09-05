/**
 * Facility scope middleware.
 *
 * Resolves the current facility from the request and attaches it to req.user.
 * - super_admin: can access ALL facilities (scope = null means "all")
 * - admin + other roles: scoped to their assigned facility (from JWT / user record)
 *
 * Usage in routes:
 *   const scope = facilityScope(req.user!);
 *   if (scope.kind === 'restricted') where.facilityId = scope.facilityId;
 *
 * The X-Facility-Id header allows super_admin to switch context.
 */

import { AuthRequest } from '../middleware/auth.js';

export interface FacilityScopeAll {
  kind: 'all';
}

export interface FacilityScopeRestricted {
  kind: 'restricted';
  facilityId: number;
}

export type FacilityScope = FacilityScopeAll | FacilityScopeRestricted;

/**
 * Returns the facility scope for the given user.
 * super_admin with no X-Facility-Id header → sees all facilities.
 * super_admin with X-Facility-Id header → scoped to that facility.
 * All other roles → scoped to their assigned facility.
 */
export function facilityScope(user: AuthRequest['user'], headerFacilityId?: string | string[] | number): FacilityScope {
  if (!user) return { kind: 'all' };

  if (user.role === 'super_admin') {
    // If a specific facility is requested via header, scope to it
    if (headerFacilityId) {
      const raw = Array.isArray(headerFacilityId) ? headerFacilityId[0] : headerFacilityId;
      const fid = Number(raw);
      if (Number.isFinite(fid) && fid > 0) return { kind: 'restricted', facilityId: fid };
    }
    return { kind: 'all' };
  }

  // For all other roles, scope to their assigned facility
  if (user.facilityId) {
    return { kind: 'restricted', facilityId: user.facilityId };
  }

  // No facility assigned → full access (backwards compatibility for existing data)
  return { kind: 'all' };
}

/**
 * Helper: build a Prisma WHERE clause for facility scoping.
 * Use in route handlers:
 *   const where = facilityWhere(user, {});
 *   const results = await prisma.patient.findMany({ where });
 */
export function facilityWhere<T extends Record<string, unknown>>(
  scope: FacilityScope,
  existingWhere: T,
): T & { facilityId?: number | { in: number[] } | undefined } {
  if (scope.kind === 'all') return existingWhere;
  return { ...existingWhere, facilityId: scope.facilityId };
}
