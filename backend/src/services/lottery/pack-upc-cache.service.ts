/**
 * Pack UPC Cache Service
 *
 * Redis storage layer for lottery pack UPCs.
 *
 * BLOCKING WORKFLOW:
 * - UPCs are stored BEFORE attempting POS export
 * - On successful POS export: Cache entry is DELETED immediately
 * - On failed POS export: Cache entry PERSISTS (no TTL) until retry succeeds
 * - User must manually retry activation if POS export fails
 *
 * Enterprise coding standards applied:
 * - API-003: ERROR_HANDLING - Graceful degradation when Redis unavailable
 * - DB-006: TENANT_ISOLATION - Keys include packId for isolation
 * - SEC-004: AUDIT_LOGGING - Operations are logged for debugging
 *
 * @module services/lottery/pack-upc-cache.service
 */

import { getRedisClient, isRedisConnected } from "../../utils/redis";

// ============================================================================
// Constants
// ============================================================================

/**
 * Cache key prefix for pack UPC entries
 *
 * Keys are stored WITHOUT TTL - they persist until:
 * 1. POS export succeeds (deleted immediately)
 * 2. Manually cleaned up by admin
 *
 * This ensures UPCs are never lost during failed activation attempts.
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
 * Store pack UPCs in Redis BEFORE attempting POS export
 *
 * UPCs are stored WITHOUT TTL - they persist until:
 * 1. POS export succeeds (explicitly deleted)
 * 2. Manually cleaned up
 *
 * This ensures UPCs are never lost during failed activation attempts
 * and can be used for retry.
 *
 * @param data - Pack UPC data to store
 * @returns True if stored successfully, false if Redis unavailable or error
 *
 * @example
 * const stored = await storePackUPCs({
 *   packId: "uuid",
 *   storeId: "uuid",
 *   gameCode: "0033",
 *   gameName: "Lucky 7s",
 *   packNumber: "5633005",
 *   ticketPrice: 20,
 *   upcs: ["356330050004", "356330050012", ...],
 *   generatedAt: new Date().toISOString(),
 *   expiresAt: "", // No expiration
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

    // Store WITHOUT TTL - persists until explicitly deleted after successful POS export
    await client.set(key, serialized);

    console.log(
      `PackUPCCache: Stored ${data.upcs.length} UPCs for pack ${data.packId} (game: ${data.gameName}) - NO TTL`,
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
 * Retrieve pack UPCs from cache
 *
 * Used during:
 * 1. Retry attempts after a failed POS export
 * 2. Pack deactivation to get UPCs for POS removal
 *
 * Returns null if no cached UPCs exist.
 *
 * @param packId - Pack UUID
 * @returns Pack UPC data or null if not found/unavailable
 *
 * @example
 * const cachedData = await getPackUPCs("uuid");
 * if (cachedData) {
 *   // Retry POS export with cached UPCs
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
 * Delete pack UPCs from cache
 *
 * Called after:
 * - Successful POS export (cache no longer needed)
 * - Pack status changes to DEPLETED or RETURNED
 *
 * IMPORTANT: Only delete after SUCCESSFUL POS export.
 * If POS export fails, keep cached for retry.
 *
 * @param packId - Pack UUID
 * @returns True if deleted (or key didn't exist), false on error
 *
 * @example
 * // After successful POS export
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
 * Get creation timestamp for cached UPCs
 *
 * Useful for monitoring how long UPCs have been waiting for retry.
 * Since we no longer use TTL, this helps identify stale entries.
 *
 * @param packId - Pack UUID
 * @returns ISO timestamp string or null if not found
 */
export async function getPackUPCCreatedAt(
  packId: string,
): Promise<string | null> {
  const data = await getPackUPCs(packId);
  return data?.generatedAt || null;
}
