/**
 * Data Integrity Utilities
 *
 * Provides utility functions for detecting and cleaning up orphaned
 * database records that may have been left behind due to improper
 * cascade deletion or other data integrity issues.
 *
 * @module data-integrity.utils
 */

import { prisma } from "./db";

/**
 * Result of orphaned API key check
 */
export interface OrphanedApiKeyCheckResult {
  /** Number of orphaned API keys found */
  orphanedCount: number;
  /** Whether cleanup was performed */
  cleanedUp: boolean;
  /** IDs of orphaned API keys (if any) */
  orphanedIds: string[];
}

/**
 * Check for orphaned API keys that reference non-existent stores or companies.
 *
 * Orphaned records can occur when:
 * - deleteMany() was used instead of delete() (bypasses onDelete: Cascade)
 * - Manual database operations bypassed application logic
 * - Incomplete transactions left partial data
 *
 * @param cleanup - If true, delete orphaned records
 * @returns Promise with check results
 *
 * @example
 * ```typescript
 * // Check only (no cleanup)
 * const result = await checkOrphanedApiKeys(false);
 * if (result.orphanedCount > 0) {
 *   console.warn(`Found ${result.orphanedCount} orphaned API keys`);
 * }
 *
 * // Check and cleanup
 * const result = await checkOrphanedApiKeys(true);
 * console.log(`Cleaned up ${result.orphanedCount} orphaned API keys`);
 * ```
 */
export async function checkOrphanedApiKeys(
  cleanup: boolean = false
): Promise<OrphanedApiKeyCheckResult> {
  // Find API keys where the store or company no longer exists
  const orphaned = await prisma.$queryRaw<Array<{ api_key_id: string }>>`
    SELECT ak.api_key_id
    FROM api_keys ak
    LEFT JOIN stores s ON ak.store_id = s.store_id
    LEFT JOIN companies c ON ak.company_id = c.company_id
    WHERE s.store_id IS NULL OR c.company_id IS NULL
  `;

  const orphanedIds = orphaned.map((o) => o.api_key_id);

  if (cleanup && orphanedIds.length > 0) {
    // Delete in correct order (children first)
    await prisma.apiKeySyncSession.deleteMany({
      where: { api_key_id: { in: orphanedIds } },
    });

    await prisma.apiKeyAuditEvent.deleteMany({
      where: { api_key_id: { in: orphanedIds } },
    });

    await prisma.apiKey.deleteMany({
      where: { api_key_id: { in: orphanedIds } },
    });

    return {
      orphanedCount: orphanedIds.length,
      cleanedUp: true,
      orphanedIds,
    };
  }

  return {
    orphanedCount: orphanedIds.length,
    cleanedUp: false,
    orphanedIds,
  };
}

/**
 * Result of comprehensive data integrity check
 */
export interface DataIntegrityCheckResult {
  /** Whether all checks passed */
  healthy: boolean;
  /** Results of individual checks */
  checks: {
    orphanedApiKeys: OrphanedApiKeyCheckResult;
  };
  /** Timestamp of the check */
  checkedAt: Date;
}

/**
 * Run comprehensive data integrity check.
 *
 * Checks for:
 * - Orphaned API keys
 * - (Future: Other orphaned records)
 *
 * @returns Promise with comprehensive check results
 */
export async function runDataIntegrityCheck(): Promise<DataIntegrityCheckResult> {
  const orphanedApiKeys = await checkOrphanedApiKeys(false);

  return {
    healthy: orphanedApiKeys.orphanedCount === 0,
    checks: {
      orphanedApiKeys,
    },
    checkedAt: new Date(),
  };
}

/**
 * Run data integrity cleanup.
 *
 * Cleans up:
 * - Orphaned API keys
 * - (Future: Other orphaned records)
 *
 * @returns Promise with cleanup results
 */
export async function runDataIntegrityCleanup(): Promise<DataIntegrityCheckResult> {
  const orphanedApiKeys = await checkOrphanedApiKeys(true);

  return {
    healthy: orphanedApiKeys.orphanedCount === 0,
    checks: {
      orphanedApiKeys,
    },
    checkedAt: new Date(),
  };
}
