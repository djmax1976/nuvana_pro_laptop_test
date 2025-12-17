import { getRedisClient } from "../utils/redis";
import { prisma } from "../utils/db";

/**
 * Store-Company mapping cache entry
 */
interface StoreCompanyMapping {
  store_id: string;
  company_id: string;
  cached_at: string;
}

/**
 * Permission Cache Service
 *
 * Provides high-performance caching for permission-related lookups
 * that would otherwise require database queries on every request.
 *
 * Key optimizations:
 * 1. Store-Company Mapping Cache: Caches which company owns which store
 *    - Used by verifyStoreCompanyAccessFromJWT to avoid stores table queries
 *    - 15 minute TTL (store ownership rarely changes)
 *
 * 2. User Scope Cache: Caches user's accessible companies/stores
 *    - Falls back to JWT claims when cache miss
 *    - 5 minute TTL (roles change more frequently)
 *
 * @security Cache entries contain only IDs, no sensitive data
 * @production Monitor cache hit rates via getMetrics()
 */
class PermissionCacheService {
  // Cache TTLs
  private readonly STORE_COMPANY_TTL = 900; // 15 minutes
  // Reserved for future user scope caching
  // private readonly USER_SCOPE_TTL = 300; // 5 minutes

  // Metrics
  private metrics = {
    storeCompanyHits: 0,
    storeCompanyMisses: 0,
    userScopeHits: 0,
    userScopeMisses: 0,
  };

  /**
   * Get company_id for a store from cache or database
   *
   * This is the most frequent lookup in scoped permission checks.
   * Caching eliminates the stores table query on every request.
   *
   * @param storeId - Store ID to look up
   * @returns Company ID if found, null otherwise
   */
  async getStoreCompanyId(storeId: string): Promise<string | null> {
    const cacheKey = `store_company:${storeId}`;

    // Try cache first
    const redis = await getRedisClient();
    if (redis) {
      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          this.metrics.storeCompanyHits++;
          const mapping: StoreCompanyMapping = JSON.parse(cached);
          return mapping.company_id;
        }
      } catch (error) {
        // Cache miss or error - fall through to DB
        console.warn(
          "[PermissionCache] Redis error, falling back to DB:",
          error,
        );
      }
    }

    this.metrics.storeCompanyMisses++;

    // Query database
    const store = await prisma.store.findUnique({
      where: { store_id: storeId },
      select: { store_id: true, company_id: true },
    });

    if (!store) {
      return null;
    }

    // Cache the result
    if (redis) {
      try {
        const mapping: StoreCompanyMapping = {
          store_id: store.store_id,
          company_id: store.company_id,
          cached_at: new Date().toISOString(),
        };
        await redis.setEx(
          cacheKey,
          this.STORE_COMPANY_TTL,
          JSON.stringify(mapping),
        );
      } catch (error) {
        // Cache write failed - not critical
        console.warn(
          "[PermissionCache] Failed to cache store-company mapping:",
          error,
        );
      }
    }

    return store.company_id;
  }

  /**
   * Check if a store belongs to any of the given companies
   *
   * Optimized version of verifyStoreCompanyAccessFromJWT that uses cache.
   *
   * @param companyIds - Array of company IDs to check against
   * @param storeId - Store ID to verify
   * @returns true if store belongs to one of the companies
   */
  async verifyStoreCompanyAccess(
    companyIds: string[],
    storeId: string,
  ): Promise<boolean> {
    if (companyIds.length === 0) {
      return false;
    }

    const storeCompanyId = await this.getStoreCompanyId(storeId);
    if (!storeCompanyId) {
      return false;
    }

    return companyIds.includes(storeCompanyId);
  }

  /**
   * Invalidate store-company cache entry
   * Call this when store ownership changes (rare)
   *
   * @param storeId - Store ID to invalidate
   */
  async invalidateStoreCompanyCache(storeId: string): Promise<void> {
    const redis = await getRedisClient();
    if (redis) {
      try {
        await redis.del(`store_company:${storeId}`);
      } catch (error) {
        console.error(
          "[PermissionCache] Failed to invalidate store-company cache:",
          error,
        );
      }
    }
  }

  /**
   * Batch populate store-company cache
   * Useful at application startup or for prewarming
   *
   * @param storeIds - Array of store IDs to cache
   */
  async warmStoreCompanyCache(storeIds: string[]): Promise<void> {
    if (storeIds.length === 0) return;

    const redis = await getRedisClient();
    if (!redis) return;

    try {
      // Fetch all stores in one query
      const stores = await prisma.store.findMany({
        where: { store_id: { in: storeIds } },
        select: { store_id: true, company_id: true },
      });

      // Cache all mappings
      const pipeline = redis.multi();
      for (const store of stores) {
        const cacheKey = `store_company:${store.store_id}`;
        const mapping: StoreCompanyMapping = {
          store_id: store.store_id,
          company_id: store.company_id,
          cached_at: new Date().toISOString(),
        };
        pipeline.setEx(
          cacheKey,
          this.STORE_COMPANY_TTL,
          JSON.stringify(mapping),
        );
      }
      await pipeline.exec();
    } catch (error) {
      console.error(
        "[PermissionCache] Failed to warm store-company cache:",
        error,
      );
    }
  }

  /**
   * Get cache metrics for monitoring
   */
  getMetrics(): typeof this.metrics & { hitRate: string } {
    const total =
      this.metrics.storeCompanyHits +
      this.metrics.storeCompanyMisses +
      this.metrics.userScopeHits +
      this.metrics.userScopeMisses;

    const hits = this.metrics.storeCompanyHits + this.metrics.userScopeHits;
    const hitRate = total > 0 ? ((hits / total) * 100).toFixed(2) : "0.00";

    return {
      ...this.metrics,
      hitRate: `${hitRate}%`,
    };
  }

  /**
   * Reset metrics (for testing or periodic reset)
   */
  resetMetrics(): void {
    this.metrics = {
      storeCompanyHits: 0,
      storeCompanyMisses: 0,
      userScopeHits: 0,
      userScopeMisses: 0,
    };
  }
}

// Export singleton
export const permissionCacheService = new PermissionCacheService();
