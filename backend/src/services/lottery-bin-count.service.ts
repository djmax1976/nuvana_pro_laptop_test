/**
 * Lottery Bin Count Service
 *
 * Enterprise-grade service for managing store lottery bin count configuration.
 * Handles the synchronization between the configured bin count and actual bin rows.
 *
 * @enterprise-standards
 * - DB-001: ORM_USAGE - All database operations via Prisma ORM
 * - DB-006: TENANT_ISOLATION - Store-level isolation enforced
 * - SEC-006: SQL_INJECTION - Parameterized queries via Prisma
 * - API-003: ERROR_HANDLING - Centralized error handling with safe messages
 *
 * Business Rules:
 * - Increasing bin count: Creates new bin rows (Bin N+1, Bin N+2, etc.)
 * - Decreasing bin count: Soft-deletes empty bins from highest number down
 * - Bins with active packs cannot be removed (throws error)
 * - Reactivating bins: If increasing and soft-deleted bins exist, reactivate them first
 */

import { prisma, TRANSACTION_TIMEOUTS } from "../utils/db";
import {
  MIN_LOTTERY_BIN_COUNT,
  MAX_LOTTERY_BIN_COUNT,
  LotteryBinCountResponse,
} from "../schemas/lottery-bin-count.schema";

/**
 * Result of bin count sync operation
 */
export interface BinCountSyncResult {
  /** Previous bin count (null if not set) */
  previous_count: number | null;
  /** New bin count */
  new_count: number;
  /** Number of bins created */
  bins_created: number;
  /** Number of bins reactivated (previously soft-deleted) */
  bins_reactivated: number;
  /** Number of bins soft-deleted */
  bins_deactivated: number;
  /** Any bins that couldn't be deactivated (have active packs) */
  bins_with_packs_count: number;
}

/**
 * Lottery Bin Count Service
 * Manages the configuration and synchronization of lottery bins for stores
 */
export class LotteryBinCountService {
  /**
   * Get the current bin count configuration for a store
   * @param storeId - Store UUID
   * @returns Bin count response with statistics
   * @throws Error if store not found
   */
  async getBinCount(storeId: string): Promise<LotteryBinCountResponse> {
    // Validate UUID format
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(storeId)) {
      throw new Error("Invalid store ID format");
    }

    // Get store with bin count
    const store = await prisma.store.findUnique({
      where: { store_id: storeId },
      select: {
        store_id: true,
        lottery_bin_count: true,
      },
    });

    if (!store) {
      throw new Error(`Store with ID ${storeId} not found`);
    }

    // Get bin statistics
    const [activeBins, binsWithPacks] = await Promise.all([
      // Count active bins
      prisma.lotteryBin.count({
        where: {
          store_id: storeId,
          is_active: true,
        },
      }),
      // Count bins with active packs
      prisma.lotteryBin.count({
        where: {
          store_id: storeId,
          is_active: true,
          packs: {
            some: {
              status: "ACTIVE",
            },
          },
        },
      }),
    ]);

    return {
      store_id: store.store_id,
      bin_count: store.lottery_bin_count,
      active_bins: activeBins,
      bins_with_packs: binsWithPacks,
      empty_bins: activeBins - binsWithPacks,
    };
  }

  /**
   * Update the bin count for a store and sync bin rows
   * @param storeId - Store UUID
   * @param newCount - New bin count (0-200)
   * @param userId - User performing the operation (for audit)
   * @returns Sync result with details of changes
   * @throws Error if store not found, validation fails, or bins with packs would be removed
   */
  async updateBinCount(
    storeId: string,
    newCount: number,
    userId: string,
  ): Promise<BinCountSyncResult> {
    // Validate UUID format
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(storeId)) {
      throw new Error("Invalid store ID format");
    }
    if (!uuidRegex.test(userId)) {
      throw new Error("Invalid user ID format");
    }

    // Validate bin count range
    if (
      !Number.isInteger(newCount) ||
      newCount < MIN_LOTTERY_BIN_COUNT ||
      newCount > MAX_LOTTERY_BIN_COUNT
    ) {
      throw new Error(
        `Bin count must be an integer between ${MIN_LOTTERY_BIN_COUNT} and ${MAX_LOTTERY_BIN_COUNT}`,
      );
    }

    // Execute in transaction for atomicity
    // Use longer timeout for bulk operations (creating up to 200 bins)
    return await prisma.$transaction(
      async (tx) => {
        // Get current store state
        const store = await tx.store.findUnique({
          where: { store_id: storeId },
          select: {
            store_id: true,
            lottery_bin_count: true,
          },
        });

        if (!store) {
          throw new Error(`Store with ID ${storeId} not found`);
        }

        const previousCount = store.lottery_bin_count;

        // Get all bins for this store (both active and inactive)
        const allBins = await tx.lotteryBin.findMany({
          where: { store_id: storeId },
          include: {
            packs: {
              where: { status: "ACTIVE" },
              select: { pack_id: true },
            },
          },
          orderBy: { display_order: "asc" },
        });

        const activeBins = allBins.filter((b) => b.is_active);
        const inactiveBins = allBins.filter((b) => !b.is_active);
        const currentActiveCount = activeBins.length;

        let binsCreated = 0;
        let binsReactivated = 0;
        let binsDeactivated = 0;
        let binsWithPacksCount = 0;

        if (newCount > currentActiveCount) {
          // INCREASING: Need to add more bins
          const binsToAdd = newCount - currentActiveCount;

          // First, try to reactivate soft-deleted bins using bulk update
          const binsToReactivate = inactiveBins
            .slice(0, binsToAdd)
            .sort((a, b) => a.display_order - b.display_order);

          if (binsToReactivate.length > 0) {
            const binIdsToReactivate = binsToReactivate.map((b) => b.bin_id);
            await tx.lotteryBin.updateMany({
              where: { bin_id: { in: binIdsToReactivate } },
              data: { is_active: true },
            });
            binsReactivated = binsToReactivate.length;
          }

          // If we still need more bins, create new ones using bulk insert
          const remainingToCreate = binsToAdd - binsReactivated;
          if (remainingToCreate > 0) {
            // Find the highest display_order among all bins
            const maxDisplayOrder =
              allBins.length > 0
                ? Math.max(...allBins.map((b) => b.display_order))
                : -1;

            // Prepare bin data for bulk creation
            const binsToCreate = Array.from(
              { length: remainingToCreate },
              (_, i) => {
                const displayOrder = maxDisplayOrder + 1 + i;
                return {
                  store_id: storeId,
                  name: `Bin ${displayOrder + 1}`, // 1-indexed display name
                  display_order: displayOrder,
                  is_active: true,
                };
              },
            );

            // Bulk insert all bins at once (much faster than individual creates)
            await tx.lotteryBin.createMany({
              data: binsToCreate,
            });
            binsCreated = remainingToCreate;
          }
        } else if (newCount < currentActiveCount) {
          // DECREASING: Need to remove bins
          const binsToRemove = currentActiveCount - newCount;

          // Sort active bins by display_order DESC (remove highest first)
          const sortedActiveBins = [...activeBins].sort(
            (a, b) => b.display_order - a.display_order,
          );

          // Separate bins with and without packs
          const emptyBinsToDeactivate: string[] = [];
          for (const bin of sortedActiveBins) {
            if (emptyBinsToDeactivate.length >= binsToRemove) break;

            // Check if bin has active packs
            if (bin.packs.length > 0) {
              binsWithPacksCount++;
              continue; // Skip bins with active packs
            }

            emptyBinsToDeactivate.push(bin.bin_id);
          }

          // If we couldn't find enough empty bins, throw error before making changes
          if (emptyBinsToDeactivate.length < binsToRemove) {
            const cannotRemove = binsToRemove - emptyBinsToDeactivate.length;
            throw new Error(
              `Cannot reduce bin count: ${cannotRemove} bin(s) have active packs. ` +
                `Remove or deplete the packs first, then try again.`,
            );
          }

          // Bulk deactivate all empty bins at once
          if (emptyBinsToDeactivate.length > 0) {
            await tx.lotteryBin.updateMany({
              where: { bin_id: { in: emptyBinsToDeactivate } },
              data: { is_active: false },
            });
            binsDeactivated = emptyBinsToDeactivate.length;
          }
        }

        // Update the store's lottery_bin_count
        await tx.store.update({
          where: { store_id: storeId },
          data: { lottery_bin_count: newCount },
        });

        return {
          previous_count: previousCount,
          new_count: newCount,
          bins_created: binsCreated,
          bins_reactivated: binsReactivated,
          bins_deactivated: binsDeactivated,
          bins_with_packs_count: binsWithPacksCount,
        };
      },
      {
        // TRANSACTION_TIMEOUTS.BULK (120s) for bulk bin operations (up to 200 bins)
        timeout: TRANSACTION_TIMEOUTS.BULK,
      },
    );
  }

  /**
   * Validate if a bin count change is allowed
   * Used for pre-flight check before showing confirmation dialog
   * @param storeId - Store UUID
   * @param newCount - Proposed new bin count
   * @returns Validation result with details
   */
  async validateBinCountChange(
    storeId: string,
    newCount: number,
  ): Promise<{
    allowed: boolean;
    current_count: number;
    bins_to_add: number;
    bins_to_remove: number;
    bins_with_packs_blocking: number;
    message: string;
  }> {
    // Validate UUID format
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(storeId)) {
      throw new Error("Invalid store ID format");
    }

    // Get current active bin count and bins with packs
    const [activeBinCount, binsWithPacks] = await Promise.all([
      prisma.lotteryBin.count({
        where: {
          store_id: storeId,
          is_active: true,
        },
      }),
      prisma.lotteryBin.findMany({
        where: {
          store_id: storeId,
          is_active: true,
          packs: {
            some: {
              status: "ACTIVE",
            },
          },
        },
        select: {
          display_order: true,
        },
        orderBy: { display_order: "desc" },
      }),
    ]);

    const binsToAdd = Math.max(0, newCount - activeBinCount);
    const binsToRemove = Math.max(0, activeBinCount - newCount);

    // Check if any bins with packs would be removed
    let binsWithPacksBlocking = 0;
    if (binsToRemove > 0) {
      // We remove from highest display_order down
      // Check how many of those have packs
      const lowestKeptDisplayOrder = newCount - 1; // 0-indexed
      binsWithPacksBlocking = binsWithPacks.filter(
        (b) => b.display_order > lowestKeptDisplayOrder,
      ).length;
    }

    const allowed = binsWithPacksBlocking === 0;
    let message: string;

    if (binsToAdd > 0) {
      message = `Will add ${binsToAdd} new bin${binsToAdd > 1 ? "s" : ""}.`;
    } else if (binsToRemove > 0) {
      if (allowed) {
        message = `Will remove ${binsToRemove} empty bin${binsToRemove > 1 ? "s" : ""}.`;
      } else {
        message =
          `Cannot remove ${binsWithPacksBlocking} bin${binsWithPacksBlocking > 1 ? "s" : ""} ` +
          `because ${binsWithPacksBlocking > 1 ? "they have" : "it has"} active packs.`;
      }
    } else {
      message = "No changes needed.";
    }

    return {
      allowed,
      current_count: activeBinCount,
      bins_to_add: binsToAdd,
      bins_to_remove: binsToRemove,
      bins_with_packs_blocking: binsWithPacksBlocking,
      message,
    };
  }
}

// Export singleton instance
export const lotteryBinCountService = new LotteryBinCountService();
