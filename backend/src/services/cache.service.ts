/**
 * Cache Service
 *
 * Phase 7.3: Caching Strategy
 *
 * Enterprise coding standards applied:
 * - API-002: Rate limiting considerations with cache TTLs
 * - API-003: Error handling with graceful degradation
 * - DB-006: Tenant isolation in cache keys
 *
 * Provides a centralized caching layer for:
 * - Shift summaries
 * - Day summaries
 * - Lookup tables (tender types, departments, tax rates)
 * - Period reports (weekly, monthly)
 *
 * Features:
 * - Graceful degradation when Redis unavailable
 * - Automatic serialization/deserialization
 * - Cache invalidation patterns
 * - Configurable TTLs per data type
 */

import { getRedisClient, isRedisConnected } from "../utils/redis";

/**
 * Cache TTL constants (in seconds)
 *
 * Different data types have different freshness requirements:
 * - Summary data: Cached longer since it's immutable after creation
 * - Lookup tables: Medium cache since they change infrequently
 * - Active/live data: Short cache or no cache
 */
export const CACHE_TTL = {
  // Shift summary: Immutable after shift close, cache for 1 hour
  SHIFT_SUMMARY: 60 * 60,

  // Day summary: Updated incrementally, cache for 30 minutes
  DAY_SUMMARY: 60 * 30,

  // Period reports: Aggregated data, cache for 15 minutes
  PERIOD_REPORT: 60 * 15,

  // Lookup tables: Change infrequently, cache for 5 minutes
  TENDER_TYPES: 60 * 5,
  DEPARTMENTS: 60 * 5,
  TAX_RATES: 60 * 5,

  // X/Z Reports: Immutable after creation, cache for 2 hours
  X_REPORT: 60 * 60 * 2,
  Z_REPORT: 60 * 60 * 2,

  // Store configuration: Rarely changes, cache for 10 minutes
  STORE_CONFIG: 60 * 10,

  // Pack UPC data: Ephemeral, cache for 24 hours (safety fallback)
  // Explicit deletion occurs when pack is depleted or returned
  PACK_UPC: 60 * 60 * 24,
} as const;

/**
 * Cache key prefixes for namespace isolation
 */
export const CACHE_PREFIX = {
  SHIFT_SUMMARY: "shift:summary",
  DAY_SUMMARY: "day:summary",
  WEEK_REPORT: "report:week",
  MONTH_REPORT: "report:month",
  TENDER_TYPES: "config:tenders",
  DEPARTMENTS: "config:departments",
  TAX_RATES: "config:tax-rates",
  X_REPORT: "report:x",
  Z_REPORT: "report:z",
  STORE_CONFIG: "store:config",
  PACK_UPC: "pack:upc",
} as const;

/**
 * Cache key builder functions
 *
 * Each function builds a consistent, scoped cache key.
 * Keys include tenant identifiers for proper isolation.
 */
export const CacheKeys = {
  /**
   * Shift summary: shift:summary:{shiftId}
   */
  shiftSummary: (shiftId: string): string =>
    `${CACHE_PREFIX.SHIFT_SUMMARY}:${shiftId}`,

  /**
   * Day summary: day:summary:{storeId}:{YYYY-MM-DD}
   */
  daySummary: (storeId: string, date: Date | string): string => {
    const dateStr =
      typeof date === "string" ? date : date.toISOString().split("T")[0];
    return `${CACHE_PREFIX.DAY_SUMMARY}:${storeId}:${dateStr}`;
  },

  /**
   * Weekly report: report:week:{storeId}:{YYYY-WW}
   */
  weeklyReport: (storeId: string, year: number, week: number): string =>
    `${CACHE_PREFIX.WEEK_REPORT}:${storeId}:${year}-W${String(week).padStart(2, "0")}`,

  /**
   * Monthly report: report:month:{storeId}:{YYYY-MM}
   */
  monthlyReport: (storeId: string, year: number, month: number): string =>
    `${CACHE_PREFIX.MONTH_REPORT}:${storeId}:${year}-${String(month).padStart(2, "0")}`,

  /**
   * Tender types: config:tenders:{clientId}
   * Uses 'system' for null clientId (system defaults)
   */
  tenderTypes: (clientId: string | null): string =>
    `${CACHE_PREFIX.TENDER_TYPES}:${clientId || "system"}`,

  /**
   * Departments: config:departments:{clientId}:{storeId}
   * Uses 'all' for null storeId (client-level departments)
   */
  departments: (clientId: string | null, storeId: string | null): string =>
    `${CACHE_PREFIX.DEPARTMENTS}:${clientId || "system"}:${storeId || "all"}`,

  /**
   * Tax rates: config:tax-rates:{storeId}
   */
  taxRates: (storeId: string): string => `${CACHE_PREFIX.TAX_RATES}:${storeId}`,

  /**
   * X Report: report:x:{shiftId}:{reportNumber}
   */
  xReport: (shiftId: string, reportNumber: number): string =>
    `${CACHE_PREFIX.X_REPORT}:${shiftId}:${reportNumber}`,

  /**
   * Z Report: report:z:{shiftId}
   */
  zReport: (shiftId: string): string => `${CACHE_PREFIX.Z_REPORT}:${shiftId}`,

  /**
   * Store configuration: store:config:{storeId}
   */
  storeConfig: (storeId: string): string =>
    `${CACHE_PREFIX.STORE_CONFIG}:${storeId}`,

  /**
   * Pack UPC data: pack:upc:{packId}
   */
  packUpc: (packId: string): string => `${CACHE_PREFIX.PACK_UPC}:${packId}`,

  /**
   * Pattern for invalidating all shift summaries for a store
   */
  shiftSummaryPattern: (): string => `${CACHE_PREFIX.SHIFT_SUMMARY}:*`,

  /**
   * Pattern for invalidating all day summaries for a store
   */
  daySummaryStorePattern: (storeId: string): string =>
    `${CACHE_PREFIX.DAY_SUMMARY}:${storeId}:*`,

  /**
   * Pattern for invalidating all reports for a store
   */
  reportStorePattern: (storeId: string): string => `report:*:${storeId}:*`,
};

/**
 * Cache Service class
 *
 * Provides methods for caching and retrieving data with
 * automatic serialization and graceful degradation.
 */
class CacheService {
  /**
   * Get a value from cache
   *
   * @param key - Cache key
   * @returns Cached value or null if not found/unavailable
   */
  async get<T>(key: string): Promise<T | null> {
    if (!isRedisConnected()) {
      return null;
    }

    try {
      const client = await getRedisClient();
      if (!client) {
        return null;
      }

      const data = await client.get(key);
      if (!data) {
        return null;
      }

      return JSON.parse(data) as T;
    } catch (error) {
      // Log error but don't throw - graceful degradation
      console.warn(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set a value in cache with TTL
   *
   * @param key - Cache key
   * @param value - Value to cache (will be JSON serialized)
   * @param ttlSeconds - Time to live in seconds
   * @returns True if cached successfully, false otherwise
   */
  async set<T>(key: string, value: T, ttlSeconds: number): Promise<boolean> {
    if (!isRedisConnected()) {
      return false;
    }

    try {
      const client = await getRedisClient();
      if (!client) {
        return false;
      }

      const serialized = JSON.stringify(value);
      await client.setEx(key, ttlSeconds, serialized);
      return true;
    } catch (error) {
      // Log error but don't throw - graceful degradation
      console.warn(`Cache set error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Delete a specific key from cache
   *
   * @param key - Cache key to delete
   * @returns True if deleted, false otherwise
   */
  async delete(key: string): Promise<boolean> {
    if (!isRedisConnected()) {
      return false;
    }

    try {
      const client = await getRedisClient();
      if (!client) {
        return false;
      }

      await client.del(key);
      return true;
    } catch (error) {
      console.warn(`Cache delete error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Delete multiple keys matching a pattern
   *
   * WARNING: Use with caution on large datasets.
   * Uses SCAN to avoid blocking Redis.
   *
   * @param pattern - Redis glob pattern (e.g., "shift:summary:*")
   * @returns Number of keys deleted
   */
  async deletePattern(pattern: string): Promise<number> {
    if (!isRedisConnected()) {
      return 0;
    }

    try {
      const client = await getRedisClient();
      if (!client) {
        return 0;
      }

      let deletedCount = 0;
      let cursor = 0;

      // Use SCAN to iterate without blocking
      do {
        const result = await client.scan(cursor, {
          MATCH: pattern,
          COUNT: 100,
        });

        cursor = result.cursor;
        const keys = result.keys;

        if (keys.length > 0) {
          await client.del(keys);
          deletedCount += keys.length;
        }
      } while (cursor !== 0);

      return deletedCount;
    } catch (error) {
      console.warn(`Cache deletePattern error for pattern ${pattern}:`, error);
      return 0;
    }
  }

  /**
   * Get or set pattern (cache-aside)
   *
   * Attempts to get value from cache, if not found,
   * executes the factory function and caches the result.
   *
   * @param key - Cache key
   * @param factory - Function to produce value if not cached
   * @param ttlSeconds - Time to live in seconds
   * @returns Cached or freshly computed value
   */
  async getOrSet<T>(
    key: string,
    factory: () => Promise<T>,
    ttlSeconds: number,
  ): Promise<T> {
    // Try to get from cache
    const cached = await this.get<T>(key);
    if (cached !== null) {
      return cached;
    }

    // Not in cache, execute factory
    const value = await factory();

    // Store in cache (don't await, fire-and-forget)
    this.set(key, value, ttlSeconds).catch((error) => {
      console.warn(`Background cache set failed for key ${key}:`, error);
    });

    return value;
  }

  /**
   * Check if a key exists in cache
   *
   * @param key - Cache key
   * @returns True if exists, false otherwise
   */
  async exists(key: string): Promise<boolean> {
    if (!isRedisConnected()) {
      return false;
    }

    try {
      const client = await getRedisClient();
      if (!client) {
        return false;
      }

      const result = await client.exists(key);
      return result === 1;
    } catch (error) {
      console.warn(`Cache exists error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Get remaining TTL for a key
   *
   * @param key - Cache key
   * @returns TTL in seconds, -1 if no expiry, -2 if key doesn't exist
   */
  async ttl(key: string): Promise<number> {
    if (!isRedisConnected()) {
      return -2;
    }

    try {
      const client = await getRedisClient();
      if (!client) {
        return -2;
      }

      return await client.ttl(key);
    } catch (error) {
      console.warn(`Cache ttl error for key ${key}:`, error);
      return -2;
    }
  }

  // ============================================================================
  // HIGH-LEVEL CACHE METHODS
  // ============================================================================

  /**
   * Cache a shift summary
   */
  async cacheShiftSummary(shiftId: string, summary: unknown): Promise<boolean> {
    return this.set(
      CacheKeys.shiftSummary(shiftId),
      summary,
      CACHE_TTL.SHIFT_SUMMARY,
    );
  }

  /**
   * Get cached shift summary
   */
  async getShiftSummary<T>(shiftId: string): Promise<T | null> {
    return this.get<T>(CacheKeys.shiftSummary(shiftId));
  }

  /**
   * Invalidate shift summary cache
   */
  async invalidateShiftSummary(shiftId: string): Promise<boolean> {
    return this.delete(CacheKeys.shiftSummary(shiftId));
  }

  /**
   * Cache a day summary
   */
  async cacheDaySummary(
    storeId: string,
    date: Date | string,
    summary: unknown,
  ): Promise<boolean> {
    return this.set(
      CacheKeys.daySummary(storeId, date),
      summary,
      CACHE_TTL.DAY_SUMMARY,
    );
  }

  /**
   * Get cached day summary
   */
  async getDaySummary<T>(
    storeId: string,
    date: Date | string,
  ): Promise<T | null> {
    return this.get<T>(CacheKeys.daySummary(storeId, date));
  }

  /**
   * Invalidate day summary cache
   */
  async invalidateDaySummary(
    storeId: string,
    date: Date | string,
  ): Promise<boolean> {
    return this.delete(CacheKeys.daySummary(storeId, date));
  }

  /**
   * Invalidate all day summaries for a store
   */
  async invalidateStoreDaySummaries(storeId: string): Promise<number> {
    return this.deletePattern(CacheKeys.daySummaryStorePattern(storeId));
  }

  /**
   * Cache tender types for a client
   */
  async cacheTenderTypes(
    clientId: string | null,
    tenderTypes: unknown[],
  ): Promise<boolean> {
    return this.set(
      CacheKeys.tenderTypes(clientId),
      tenderTypes,
      CACHE_TTL.TENDER_TYPES,
    );
  }

  /**
   * Get cached tender types
   */
  async getTenderTypes<T>(clientId: string | null): Promise<T[] | null> {
    return this.get<T[]>(CacheKeys.tenderTypes(clientId));
  }

  /**
   * Invalidate tender types cache for a client
   */
  async invalidateTenderTypes(clientId: string | null): Promise<boolean> {
    return this.delete(CacheKeys.tenderTypes(clientId));
  }

  /**
   * Cache departments
   */
  async cacheDepartments(
    clientId: string | null,
    storeId: string | null,
    departments: unknown[],
  ): Promise<boolean> {
    return this.set(
      CacheKeys.departments(clientId, storeId),
      departments,
      CACHE_TTL.DEPARTMENTS,
    );
  }

  /**
   * Get cached departments
   */
  async getDepartments<T>(
    clientId: string | null,
    storeId: string | null,
  ): Promise<T[] | null> {
    return this.get<T[]>(CacheKeys.departments(clientId, storeId));
  }

  /**
   * Invalidate departments cache
   */
  async invalidateDepartments(
    clientId: string | null,
    storeId: string | null,
  ): Promise<boolean> {
    return this.delete(CacheKeys.departments(clientId, storeId));
  }

  /**
   * Cache tax rates for a store
   */
  async cacheTaxRates(storeId: string, taxRates: unknown[]): Promise<boolean> {
    return this.set(CacheKeys.taxRates(storeId), taxRates, CACHE_TTL.TAX_RATES);
  }

  /**
   * Get cached tax rates
   */
  async getTaxRates<T>(storeId: string): Promise<T[] | null> {
    return this.get<T[]>(CacheKeys.taxRates(storeId));
  }

  /**
   * Invalidate tax rates cache for a store
   */
  async invalidateTaxRates(storeId: string): Promise<boolean> {
    return this.delete(CacheKeys.taxRates(storeId));
  }

  /**
   * Cache a weekly report
   */
  async cacheWeeklyReport(
    storeId: string,
    year: number,
    week: number,
    report: unknown,
  ): Promise<boolean> {
    return this.set(
      CacheKeys.weeklyReport(storeId, year, week),
      report,
      CACHE_TTL.PERIOD_REPORT,
    );
  }

  /**
   * Get cached weekly report
   */
  async getWeeklyReport<T>(
    storeId: string,
    year: number,
    week: number,
  ): Promise<T | null> {
    return this.get<T>(CacheKeys.weeklyReport(storeId, year, week));
  }

  /**
   * Cache a monthly report
   */
  async cacheMonthlyReport(
    storeId: string,
    year: number,
    month: number,
    report: unknown,
  ): Promise<boolean> {
    return this.set(
      CacheKeys.monthlyReport(storeId, year, month),
      report,
      CACHE_TTL.PERIOD_REPORT,
    );
  }

  /**
   * Get cached monthly report
   */
  async getMonthlyReport<T>(
    storeId: string,
    year: number,
    month: number,
  ): Promise<T | null> {
    return this.get<T>(CacheKeys.monthlyReport(storeId, year, month));
  }

  /**
   * Invalidate all period reports for a store
   */
  async invalidateStoreReports(storeId: string): Promise<number> {
    return this.deletePattern(CacheKeys.reportStorePattern(storeId));
  }

  /**
   * Cache a Z Report
   */
  async cacheZReport(shiftId: string, report: unknown): Promise<boolean> {
    return this.set(CacheKeys.zReport(shiftId), report, CACHE_TTL.Z_REPORT);
  }

  /**
   * Get cached Z Report
   */
  async getZReport<T>(shiftId: string): Promise<T | null> {
    return this.get<T>(CacheKeys.zReport(shiftId));
  }

  /**
   * Cache an X Report
   */
  async cacheXReport(
    shiftId: string,
    reportNumber: number,
    report: unknown,
  ): Promise<boolean> {
    return this.set(
      CacheKeys.xReport(shiftId, reportNumber),
      report,
      CACHE_TTL.X_REPORT,
    );
  }

  /**
   * Get cached X Report
   */
  async getXReport<T>(
    shiftId: string,
    reportNumber: number,
  ): Promise<T | null> {
    return this.get<T>(CacheKeys.xReport(shiftId, reportNumber));
  }
}

// Export singleton instance
export const cacheService = new CacheService();

// Export for direct access to cache utilities
export { CacheService };
