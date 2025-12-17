import { getRedisClient } from "../utils/redis";
import { prisma } from "../utils/db";

/**
 * User Access Map - Complete snapshot of user's accessible resources
 *
 * This structure captures all scope information needed for permission checks
 * without requiring database queries after initial population.
 *
 * @security Only contains IDs, no sensitive data (names, emails, etc.)
 */
export interface UserAccessMap {
  userId: string;
  isSystemAdmin: boolean;
  companyIds: string[];
  storeIds: string[];
  roleScopes: Array<{
    roleCode: string;
    scope: "SYSTEM" | "COMPANY" | "STORE" | "CLIENT";
    companyId: string | null;
    storeId: string | null;
  }>;
  cachedAt: string;
}

/**
 * User Access Cache Service
 *
 * Provides high-performance caching for user's accessible resources (companies, stores).
 * This eliminates database queries on every permission check by caching the user's
 * complete access map in Redis.
 *
 * Key optimizations:
 * 1. Complete access snapshot: Caches user's companies, stores, and role scopes
 * 2. Zero DB queries on cache hit for scoped permission checks
 * 3. TTL-based expiration: 10 minutes (balances freshness vs performance)
 * 4. Graceful degradation: Falls back to JWT claims when cache unavailable
 *
 * Cache invalidation triggers:
 * - Role assignment (POST /api/admin/users/:userId/roles)
 * - Role revocation (DELETE /api/admin/users/:userId/roles/:userRoleId)
 * - User deletion (DELETE /api/admin/users/:userId)
 * - User status change (PATCH /api/admin/users/:userId/status)
 *
 * @production Monitor cache hit rates via getMetrics()
 */
class UserAccessCacheService {
  // Cache TTL: 10 minutes (roles change less frequently than sessions)
  private readonly USER_ACCESS_TTL = 600;

  // Cache key prefix
  private readonly KEY_PREFIX = "user_access:";

  // Metrics tracking
  private metrics = {
    hits: 0,
    misses: 0,
    populateCount: 0,
    invalidateCount: 0,
    errors: 0,
  };

  /**
   * Get user access map from cache or database
   *
   * @param userId - User ID to fetch access map for
   * @returns UserAccessMap if found/fetched, null if user doesn't exist
   */
  async getUserAccessMap(userId: string): Promise<UserAccessMap | null> {
    // Try cache first
    const redis = await getRedisClient();
    if (redis) {
      try {
        const cacheKey = `${this.KEY_PREFIX}${userId}`;
        const cached = await redis.get(cacheKey);

        if (cached) {
          this.metrics.hits++;
          return JSON.parse(cached) as UserAccessMap;
        }
      } catch (error) {
        this.metrics.errors++;
        console.warn(
          "[UserAccessCache] Redis read error, falling back to DB:",
          error,
        );
      }
    }

    // Cache miss - fetch from database and populate cache
    this.metrics.misses++;
    return this.fetchAndCacheUserAccessMap(userId);
  }

  /**
   * Fetch user access map from database and cache it
   *
   * This is called on cache miss or when explicitly populating the cache.
   *
   * @param userId - User ID to fetch
   * @returns UserAccessMap or null if user not found
   */
  async fetchAndCacheUserAccessMap(
    userId: string,
  ): Promise<UserAccessMap | null> {
    try {
      // Fetch user roles with scope information
      // Uses explicit user_id filter to bypass RLS (direct query)
      const userRoles = await prisma.userRole.findMany({
        where: { user_id: userId },
        select: {
          company_id: true,
          store_id: true,
          role: {
            select: {
              code: true,
              scope: true,
            },
          },
        },
      });

      if (userRoles.length === 0) {
        // User exists but has no roles, or user doesn't exist
        // Return null to indicate no access map available
        return null;
      }

      // Build the access map
      const isSystemAdmin = userRoles.some(
        (ur) => ur.role.code === "SUPERADMIN" && ur.role.scope === "SYSTEM",
      );

      const companyIds = Array.from(
        new Set(
          userRoles
            .map((ur) => ur.company_id)
            .filter((id): id is string => id !== null),
        ),
      );

      const storeIds = Array.from(
        new Set(
          userRoles
            .map((ur) => ur.store_id)
            .filter((id): id is string => id !== null),
        ),
      );

      const roleScopes = userRoles.map((ur) => ({
        roleCode: ur.role.code,
        scope: ur.role.scope as "SYSTEM" | "COMPANY" | "STORE" | "CLIENT",
        companyId: ur.company_id,
        storeId: ur.store_id,
      }));

      const accessMap: UserAccessMap = {
        userId,
        isSystemAdmin,
        companyIds,
        storeIds,
        roleScopes,
        cachedAt: new Date().toISOString(),
      };

      // Cache the result
      await this.cacheUserAccessMap(accessMap);

      return accessMap;
    } catch (error) {
      this.metrics.errors++;
      console.error(
        "[UserAccessCache] Failed to fetch user access map:",
        error,
      );
      return null;
    }
  }

  /**
   * Cache a user access map
   *
   * @param accessMap - The access map to cache
   */
  async cacheUserAccessMap(accessMap: UserAccessMap): Promise<void> {
    const redis = await getRedisClient();
    if (!redis) {
      return;
    }

    try {
      const cacheKey = `${this.KEY_PREFIX}${accessMap.userId}`;
      await redis.setEx(
        cacheKey,
        this.USER_ACCESS_TTL,
        JSON.stringify(accessMap),
      );
      this.metrics.populateCount++;
    } catch (error) {
      this.metrics.errors++;
      console.warn("[UserAccessCache] Failed to cache user access map:", error);
    }
  }

  /**
   * Invalidate cache for a specific user
   *
   * Call this when user's roles change (assignment/revocation)
   *
   * @param userId - User ID to invalidate cache for
   */
  async invalidateUserCache(userId: string): Promise<void> {
    const redis = await getRedisClient();
    if (!redis) {
      return;
    }

    try {
      const cacheKey = `${this.KEY_PREFIX}${userId}`;
      await redis.del(cacheKey);
      this.metrics.invalidateCount++;
      console.log(`[UserAccessCache] Invalidated cache for user ${userId}`);
    } catch (error) {
      this.metrics.errors++;
      console.error(
        "[UserAccessCache] Failed to invalidate user cache:",
        error,
      );
    }
  }

  /**
   * Batch invalidate cache for multiple users
   *
   * Useful when company/store changes affect multiple users
   *
   * @param userIds - Array of user IDs to invalidate
   */
  async invalidateMultipleUsers(userIds: string[]): Promise<void> {
    if (userIds.length === 0) {
      return;
    }

    const redis = await getRedisClient();
    if (!redis) {
      return;
    }

    try {
      const keys = userIds.map((id) => `${this.KEY_PREFIX}${id}`);
      await redis.del(keys);
      this.metrics.invalidateCount += userIds.length;
      console.log(
        `[UserAccessCache] Invalidated cache for ${userIds.length} users`,
      );
    } catch (error) {
      this.metrics.errors++;
      console.error(
        "[UserAccessCache] Failed to batch invalidate user cache:",
        error,
      );
    }
  }

  /**
   * Pre-populate cache for a user (called on login)
   *
   * This proactively caches the user's access map to avoid
   * database queries on the first permission check after login.
   *
   * @param userId - User ID to populate cache for
   * @param accessMapData - Pre-computed access map data (optional, from login flow)
   */
  async populateOnLogin(
    userId: string,
    accessMapData?: {
      isSystemAdmin: boolean;
      companyIds: string[];
      storeIds: string[];
      roleScopes: UserAccessMap["roleScopes"];
    },
  ): Promise<void> {
    if (accessMapData) {
      // Use pre-computed data from login flow (avoids extra DB query)
      const accessMap: UserAccessMap = {
        userId,
        ...accessMapData,
        cachedAt: new Date().toISOString(),
      };
      await this.cacheUserAccessMap(accessMap);
    } else {
      // Fetch fresh from database
      await this.fetchAndCacheUserAccessMap(userId);
    }
  }

  /**
   * Check if user has access to a specific store
   *
   * Uses cached access map for zero-DB-query verification.
   * Falls back to JWT-based check if cache unavailable.
   *
   * @param userId - User ID
   * @param storeId - Store ID to check access for
   * @param jwtStoreIds - Store IDs from JWT (fallback)
   * @param jwtCompanyIds - Company IDs from JWT (fallback for company-level access)
   * @returns true if user has access to the store
   */
  async hasStoreAccess(
    userId: string,
    storeId: string,
    jwtStoreIds: string[],
    _jwtCompanyIds: string[], // Company-level access handled via verifyStoreCompanyAccessFromJWT in middleware
  ): Promise<{ hasAccess: boolean; fromCache: boolean }> {
    const accessMap = await this.getUserAccessMap(userId);

    if (accessMap) {
      // System admin has access to everything
      if (accessMap.isSystemAdmin) {
        return { hasAccess: true, fromCache: true };
      }

      // Direct store access
      if (accessMap.storeIds.includes(storeId)) {
        return { hasAccess: true, fromCache: true };
      }

      // Note: Company-level store access requires store->company lookup
      // which is handled by PermissionCacheService.verifyStoreCompanyAccess
      return { hasAccess: false, fromCache: true };
    }

    // Cache miss - fall back to JWT claims
    // Direct store access from JWT
    if (jwtStoreIds.includes(storeId)) {
      return { hasAccess: true, fromCache: false };
    }

    return { hasAccess: false, fromCache: false };
  }

  /**
   * Check if user has access to a specific company
   *
   * Uses cached access map for zero-DB-query verification.
   * Falls back to JWT-based check if cache unavailable.
   *
   * @param userId - User ID
   * @param companyId - Company ID to check access for
   * @param jwtCompanyIds - Company IDs from JWT (fallback)
   * @returns true if user has access to the company
   */
  async hasCompanyAccess(
    userId: string,
    companyId: string,
    jwtCompanyIds: string[],
  ): Promise<{ hasAccess: boolean; fromCache: boolean }> {
    const accessMap = await this.getUserAccessMap(userId);

    if (accessMap) {
      // System admin has access to everything
      if (accessMap.isSystemAdmin) {
        return { hasAccess: true, fromCache: true };
      }

      // Direct company access
      if (accessMap.companyIds.includes(companyId)) {
        return { hasAccess: true, fromCache: true };
      }

      return { hasAccess: false, fromCache: true };
    }

    // Cache miss - fall back to JWT claims
    if (jwtCompanyIds.includes(companyId)) {
      return { hasAccess: true, fromCache: false };
    }

    return { hasAccess: false, fromCache: false };
  }

  /**
   * Get cache metrics for monitoring
   */
  getMetrics(): typeof this.metrics & { hitRate: string } {
    const total = this.metrics.hits + this.metrics.misses;
    const hitRate =
      total > 0 ? ((this.metrics.hits / total) * 100).toFixed(2) : "0.00";

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
      hits: 0,
      misses: 0,
      populateCount: 0,
      invalidateCount: 0,
      errors: 0,
    };
  }
}

// Export singleton
export const userAccessCacheService = new UserAccessCacheService();
