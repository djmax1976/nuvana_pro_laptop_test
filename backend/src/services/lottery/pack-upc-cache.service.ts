/**
 * Pack UPC Retry Cache Service
 *
 * Redis storage layer for lottery pack UPCs - RETRY ONLY.
 *
 * This cache is TEMPORARY and used only when POS push fails:
 * - On successful POS push: Cache entry is DELETED immediately
 * - On failed POS push: Cache entry stored with 1-hour TTL for retry
 * - The POS system is the source of truth, NOT this cache
 *
 * Enterprise coding standards applied:
 * - API-003: ERROR_HANDLING - Graceful degradation when Redis unavailable
 * - DB-006: TENANT_ISOLATION - Keys include packId for isolation
 *
 * @module services/lottery/pack-upc-cache.service
 */

import { getRedisClient, isRedisConnected } from "../../utils/redis";

// ============================================================================
// Constants
// ============================================================================

/**
 * TTL for pack UPC retry data (1 hour)
 *
 * This is the RETRY WINDOW for failed POS push operations:
 * - Entry is deleted immediately on successful POS push
 * - Entry expires after 1 hour if retry also fails
 * - Short TTL because UPCs can be regenerated from pack data if needed
 */
export const PACK_UPC_TTL_SECONDS = 60 * 60; // 1 hour (retry window only)

/**
 * Cache key prefix for pack UPC retry entries
 */
export const PACK_UPC_KEY_PREFIX = "pack:upc:pending";

// ============================================================================
// Types
// ============================================================================

/**
 * Data structure stored in Redis for pack UPCs
 */
export interface PackUPCData {
  /** Pack UUID */
  packId: string;
  /** Store UUID (for context/debugging) */
  storeId: string;
  /** 4-digit game code */
  gameCode: string;
  /** Game display name */
  gameName: string;
  /** 7-digit pack number (zero-padded) */
  packNumber: string;
  /** Price per ticket */
  ticketPrice: number;
  /** Array of 12-digit UPCs */
  upcs: string[];
  /** ISO timestamp when UPCs were generated */
  generatedAt: string;
  /** ISO timestamp when Redis entry expires */
  expiresAt: string;
}

// ============================================================================
// Cache Key Functions
// ============================================================================

/**
 * Cache key builder for pack UPC retry entries
 */
export const PackUPCCacheKeys = {
  /**
   * Build cache key for pending pack UPC retry
   * Format: pack:upc:pending:{packId}
   *
   * @param packId - Pack UUID
   * @returns Cache key
   */
  packUpc: (packId: string): string => `${PACK_UPC_KEY_PREFIX}:${packId}`,

  /**
   * Pattern for finding all pending pack UPC retries
   * Format: pack:upc:pending:*
   *
   * Use with SCAN for iteration, never KEYS in production.
   */
  allPackUpcs: (): string => `${PACK_UPC_KEY_PREFIX}:*`,

  /**
   * Pattern for finding pending retries by store
   * Note: Since packId is in the key, you'd need to iterate and check values.
   * Provided for documentation purposes.
   */
  storePackUpcs: (_storeId: string): string => `${PACK_UPC_KEY_PREFIX}:*`,
};

// ============================================================================
// Cache Operations
// ============================================================================

/**
 * Store pack UPCs in Redis for retry after failed POS push
 *
 * Only call this when POS push fails. On successful push, do NOT store.
 * Entry will be deleted automatically after 1 hour if not retried.
 *
 * @param data - Pack UPC data to store
 * @returns True if stored successfully, false if Redis unavailable or error
 *
 * @example
 * // Store UPCs for retry after failed POS push
 * const stored = await storePackUPCs({
 *   packId: "uuid",
 *   storeId: "uuid",
 *   gameCode: "0033",
 *   gameName: "Lucky 7s",
 *   packNumber: "5633005",
 *   ticketPrice: 20,
 *   upcs: ["035633005000", "035633005001", ...],
 *   generatedAt: new Date().toISOString(),
 *   expiresAt: new Date(Date.now() + 3600000).toISOString(), // 1 hour
 * });
 */
export async function storePackUPCs(data: PackUPCData): Promise<boolean> {
  if (!isRedisConnected()) {
    console.warn(
      `PackUPCCache: Redis unavailable, UPCs not cached for pack ${data.packId}`,
    );
    return false;
  }

  try {
    const client = await getRedisClient();
    if (!client) {
      return false;
    }

    const key = PackUPCCacheKeys.packUpc(data.packId);
    const serialized = JSON.stringify(data);

    await client.setEx(key, PACK_UPC_TTL_SECONDS, serialized);

    console.log(
      `PackUPCCache: Stored ${data.upcs.length} UPCs for pack ${data.packId} (game: ${data.gameName})`,
    );
    return true;
  } catch (error) {
    console.error(
      `PackUPCCache: Failed to store UPCs for pack ${data.packId}:`,
      error,
    );
    return false;
  }
}

/**
 * Retrieve pack UPCs from retry cache
 *
 * Used during retry attempts after a failed POS push.
 * Returns null if no pending retry exists.
 *
 * @param packId - Pack UUID
 * @returns Pack UPC data or null if not found/unavailable
 *
 * @example
 * const pendingData = await getPackUPCs("uuid");
 * if (pendingData) {
 *   // Retry POS push with cached UPCs
 * }
 */
export async function getPackUPCs(packId: string): Promise<PackUPCData | null> {
  if (!isRedisConnected()) {
    return null;
  }

  try {
    const client = await getRedisClient();
    if (!client) {
      return null;
    }

    const key = PackUPCCacheKeys.packUpc(packId);
    const data = await client.get(key);

    if (!data) {
      return null;
    }

    return JSON.parse(data) as PackUPCData;
  } catch (error) {
    console.error(
      `PackUPCCache: Failed to retrieve UPCs for pack ${packId}:`,
      error,
    );
    return null;
  }
}

/**
 * Delete pack UPCs from retry cache
 *
 * Called after:
 * - Successful POS push (clear pending retry)
 * - Pack status changes to DEPLETED or RETURNED
 *
 * @param packId - Pack UUID
 * @returns True if deleted (or key didn't exist), false on error
 *
 * @example
 * // After successful POS push
 * await deletePackUPCs("uuid");
 */
export async function deletePackUPCs(packId: string): Promise<boolean> {
  if (!isRedisConnected()) {
    console.warn(
      `PackUPCCache: Redis unavailable, cannot delete UPCs for pack ${packId}`,
    );
    return false;
  }

  try {
    const client = await getRedisClient();
    if (!client) {
      return false;
    }

    const key = PackUPCCacheKeys.packUpc(packId);
    await client.del(key);

    console.log(`PackUPCCache: Deleted UPCs for pack ${packId}`);
    return true;
  } catch (error) {
    console.error(
      `PackUPCCache: Failed to delete UPCs for pack ${packId}:`,
      error,
    );
    return false;
  }
}

/**
 * Check if pack UPCs exist in retry cache
 *
 * Use to determine if there's a pending retry for this pack.
 *
 * @param packId - Pack UUID
 * @returns True if pending retry exists, false otherwise
 */
export async function packUPCsExist(packId: string): Promise<boolean> {
  if (!isRedisConnected()) {
    return false;
  }

  try {
    const client = await getRedisClient();
    if (!client) {
      return false;
    }

    const key = PackUPCCacheKeys.packUpc(packId);
    const result = await client.exists(key);
    return result === 1;
  } catch (error) {
    console.error(
      `PackUPCCache: Failed to check existence for pack ${packId}:`,
      error,
    );
    return false;
  }
}

/**
 * Get remaining TTL for pending retry
 *
 * Useful for monitoring retry window status.
 *
 * @param packId - Pack UUID
 * @returns TTL in seconds, -1 if no expiry, -2 if no pending retry
 */
export async function getPackUPCTTL(packId: string): Promise<number> {
  if (!isRedisConnected()) {
    return -2;
  }

  try {
    const client = await getRedisClient();
    if (!client) {
      return -2;
    }

    const key = PackUPCCacheKeys.packUpc(packId);
    return await client.ttl(key);
  } catch (error) {
    console.error(`PackUPCCache: Failed to get TTL for pack ${packId}:`, error);
    return -2;
  }
}

/**
 * Refresh TTL for pending retry (extend retry window)
 *
 * Use sparingly - if retries keep failing, investigate the root cause.
 *
 * @param packId - Pack UUID
 * @returns True if TTL refreshed, false otherwise
 */
export async function refreshPackUPCTTL(packId: string): Promise<boolean> {
  if (!isRedisConnected()) {
    return false;
  }

  try {
    const client = await getRedisClient();
    if (!client) {
      return false;
    }

    const key = PackUPCCacheKeys.packUpc(packId);
    const result = await client.expire(key, PACK_UPC_TTL_SECONDS);
    return result;
  } catch (error) {
    console.error(
      `PackUPCCache: Failed to refresh TTL for pack ${packId}:`,
      error,
    );
    return false;
  }
}
