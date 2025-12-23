/**
 * Cache Invalidation Utilities
 *
 * Phase 7.5: Cache Invalidation Strategy
 *
 * Provides centralized cache invalidation logic for maintaining
 * cache consistency across related entities.
 *
 * Enterprise coding standards applied:
 * - API-003: Error handling with graceful degradation
 * - DB-006: Tenant isolation in invalidation patterns
 *
 * Key Invalidation Patterns:
 * 1. Single entity invalidation (e.g., update a shift summary)
 * 2. Cascading invalidation (e.g., shift close affects day summary)
 * 3. Bulk invalidation (e.g., day close affects all related reports)
 */

import { cacheService, CacheKeys } from "../services/cache.service";

/**
 * Invalidation result for tracking
 */
export interface InvalidationResult {
  success: boolean;
  invalidated_keys: string[];
  errors: string[];
}

/**
 * Invalidate all caches related to a shift
 *
 * Called when:
 * - A shift is closed
 * - A shift summary is updated
 * - Variance is approved/modified
 *
 * @param shiftId - The shift ID
 * @param storeId - The store ID (for related invalidations)
 * @param businessDate - The business date (for day summary invalidation)
 */
export async function invalidateShiftCaches(
  shiftId: string,
  storeId: string,
  businessDate: Date,
): Promise<InvalidationResult> {
  const result: InvalidationResult = {
    success: true,
    invalidated_keys: [],
    errors: [],
  };

  // 1. Invalidate shift summary cache
  try {
    await cacheService.invalidateShiftSummary(shiftId);
    result.invalidated_keys.push(CacheKeys.shiftSummary(shiftId));
  } catch (error) {
    result.errors.push(`Shift summary: ${error}`);
    result.success = false;
  }

  // 2. Invalidate Z report cache (if exists)
  try {
    await cacheService.delete(CacheKeys.zReport(shiftId));
    result.invalidated_keys.push(CacheKeys.zReport(shiftId));
  } catch (error) {
    result.errors.push(`Z report: ${error}`);
  }

  // 3. Invalidate related day summary
  try {
    await cacheService.invalidateDaySummary(storeId, businessDate);
    result.invalidated_keys.push(CacheKeys.daySummary(storeId, businessDate));
  } catch (error) {
    result.errors.push(`Day summary: ${error}`);
    result.success = false;
  }

  // 4. Invalidate period reports for the store
  try {
    const deletedCount = await cacheService.invalidateStoreReports(storeId);
    if (deletedCount > 0) {
      result.invalidated_keys.push(`${deletedCount} period reports`);
    }
  } catch (error) {
    result.errors.push(`Period reports: ${error}`);
  }

  return result;
}

/**
 * Invalidate all caches related to a business day
 *
 * Called when:
 * - A day is closed
 * - Day summary is manually updated
 * - Multiple shifts are modified
 *
 * @param storeId - The store ID
 * @param businessDate - The business date
 */
export async function invalidateDayCaches(
  storeId: string,
  businessDate: Date,
): Promise<InvalidationResult> {
  const result: InvalidationResult = {
    success: true,
    invalidated_keys: [],
    errors: [],
  };

  // 1. Invalidate day summary cache
  try {
    await cacheService.invalidateDaySummary(storeId, businessDate);
    result.invalidated_keys.push(CacheKeys.daySummary(storeId, businessDate));
  } catch (error) {
    result.errors.push(`Day summary: ${error}`);
    result.success = false;
  }

  // 2. Invalidate period reports
  try {
    const deletedCount = await cacheService.invalidateStoreReports(storeId);
    if (deletedCount > 0) {
      result.invalidated_keys.push(`${deletedCount} period reports`);
    }
  } catch (error) {
    result.errors.push(`Period reports: ${error}`);
  }

  return result;
}

/**
 * Invalidate all caches for a store
 *
 * Called when:
 * - Store configuration changes
 * - Bulk data import
 * - Data correction operations
 *
 * WARNING: This is an expensive operation. Use sparingly.
 *
 * @param storeId - The store ID
 */
export async function invalidateStoreCaches(
  storeId: string,
): Promise<InvalidationResult> {
  const result: InvalidationResult = {
    success: true,
    invalidated_keys: [],
    errors: [],
  };

  // 1. Invalidate all day summaries for the store
  try {
    const dayCount = await cacheService.invalidateStoreDaySummaries(storeId);
    if (dayCount > 0) {
      result.invalidated_keys.push(`${dayCount} day summaries`);
    }
  } catch (error) {
    result.errors.push(`Day summaries: ${error}`);
    result.success = false;
  }

  // 2. Invalidate all period reports
  try {
    const reportCount = await cacheService.invalidateStoreReports(storeId);
    if (reportCount > 0) {
      result.invalidated_keys.push(`${reportCount} period reports`);
    }
  } catch (error) {
    result.errors.push(`Period reports: ${error}`);
  }

  return result;
}

/**
 * Invalidate lookup table caches for a client
 *
 * Called when:
 * - Tender types are added/modified/deleted
 * - Departments are added/modified/deleted
 * - Tax rates are modified
 *
 * @param clientId - The client ID (null for system defaults)
 * @param storeId - Optional store ID for store-scoped entities
 */
export async function invalidateLookupCaches(
  clientId: string | null,
  storeId?: string,
): Promise<InvalidationResult> {
  const result: InvalidationResult = {
    success: true,
    invalidated_keys: [],
    errors: [],
  };

  // 1. Invalidate tender types
  try {
    await cacheService.invalidateTenderTypes(clientId);
    result.invalidated_keys.push(CacheKeys.tenderTypes(clientId));
  } catch (error) {
    result.errors.push(`Tender types: ${error}`);
  }

  // 2. Invalidate departments (client-level and store-level if provided)
  try {
    await cacheService.invalidateDepartments(clientId, null);
    result.invalidated_keys.push(CacheKeys.departments(clientId, null));

    if (storeId) {
      await cacheService.invalidateDepartments(clientId, storeId);
      result.invalidated_keys.push(CacheKeys.departments(clientId, storeId));
    }
  } catch (error) {
    result.errors.push(`Departments: ${error}`);
  }

  // 3. Invalidate tax rates if store provided
  if (storeId) {
    try {
      await cacheService.invalidateTaxRates(storeId);
      result.invalidated_keys.push(CacheKeys.taxRates(storeId));
    } catch (error) {
      result.errors.push(`Tax rates: ${error}`);
    }
  }

  return result;
}

/**
 * Invalidate tender types cache after modification
 *
 * @param clientId - The client ID (null for system defaults)
 */
export async function invalidateTenderTypeCache(
  clientId: string | null,
): Promise<void> {
  try {
    await cacheService.invalidateTenderTypes(clientId);
    // Also invalidate system defaults if this is a client-specific change
    // because clients see merged results
    if (clientId !== null) {
      await cacheService.invalidateTenderTypes(null);
    }
  } catch (error) {
    console.warn("Failed to invalidate tender type cache:", error);
  }
}

/**
 * Invalidate departments cache after modification
 *
 * @param clientId - The client ID
 * @param storeId - Optional store ID
 */
export async function invalidateDepartmentCache(
  clientId: string | null,
  storeId?: string,
): Promise<void> {
  try {
    await cacheService.invalidateDepartments(clientId, null);
    if (storeId) {
      await cacheService.invalidateDepartments(clientId, storeId);
    }
    // Also invalidate system defaults if this is a client-specific change
    if (clientId !== null) {
      await cacheService.invalidateDepartments(null, null);
    }
  } catch (error) {
    console.warn("Failed to invalidate department cache:", error);
  }
}

/**
 * Invalidate tax rates cache after modification
 *
 * @param storeId - The store ID
 */
export async function invalidateTaxRateCache(storeId: string): Promise<void> {
  try {
    await cacheService.invalidateTaxRates(storeId);
  } catch (error) {
    console.warn("Failed to invalidate tax rate cache:", error);
  }
}

/**
 * Warm up cache for a store
 *
 * Pre-populates cache with commonly accessed data.
 * Called during store initialization or after cache flush.
 *
 * @param storeId - The store ID
 * @param clientId - The client ID
 */
export async function warmUpStoreCache(
  storeId: string,
  clientId: string,
): Promise<void> {
  // This is a placeholder for cache warming logic
  // In production, this would pre-fetch:
  // 1. Today's day summary
  // 2. Current week's day summaries
  // 3. Lookup tables (tender types, departments, tax rates)

  console.log(
    `Cache warm-up requested for store ${storeId} (client ${clientId})`,
  );

  // Note: Actual warming would be done by calling the respective service methods
  // which will populate the cache as a side effect of reading
}

/**
 * Log cache invalidation for monitoring
 *
 * @param operation - The operation that triggered invalidation
 * @param result - The invalidation result
 */
export function logInvalidation(
  operation: string,
  result: InvalidationResult,
): void {
  if (result.success) {
    console.log(
      `[CACHE] ${operation}: Invalidated ${result.invalidated_keys.length} keys`,
      result.invalidated_keys,
    );
  } else {
    console.warn(
      `[CACHE] ${operation}: Partial invalidation with ${result.errors.length} errors`,
      { keys: result.invalidated_keys, errors: result.errors },
    );
  }
}
