/**
 * POS File Watcher Auto-Start Service
 *
 * Enterprise-grade service for automatically starting file watchers for active
 * POS integrations. This service is called on server startup and when POS
 * integrations are created/updated.
 *
 * Coding Standards Applied:
 * - DB-001: ORM_USAGE - Uses Prisma ORM with parameterized queries
 * - DB-006: TENANT_ISOLATION - Queries are scoped by store_id
 * - API-003: ERROR_HANDLING - Comprehensive error handling with logging
 * - SEC-006: SQL_INJECTION - No raw SQL, all queries via Prisma ORM
 *
 * @module services/pos/file-watcher-autostart.service
 */

import { prisma } from "../../utils/db";
import {
  getFileWatcherService,
  type StoreContext,
} from "./file-watcher.service";
import type { NAXMLFileWatcherConfig } from "../../types/naxml.types";

// ============================================================================
// Constants
// ============================================================================

/**
 * Default file patterns for Gilbarco NAXML files
 * Covers all document types exported by Gilbarco Passport POS
 */
export const GILBARCO_FILE_PATTERNS = [
  // Transaction and Journal files
  "PJR*.xml", // POS Journal Report - Individual transactions
  "TLog*.xml", // Transaction Log
  "Trans*.xml", // Transaction files

  // Movement Reports (Sales summaries)
  "FGM*.xml", // Fuel Grade Movement
  "TLM*.xml", // Tax Level Movement
  "ISM*.xml", // Item Sales Movement
  "MCM*.xml", // Merchandise Code Movement
  "MSM*.xml", // Merchandise Sales Movement
  "TPM*.xml", // Tender Payment Movement
  "FPM*.xml", // Fuel Product Movement

  // Maintenance/Configuration files
  "DeptMaint*.xml", // Department Maintenance
  "Department*.xml", // Department files
  "TenderMaint*.xml", // Tender Type Maintenance
  "MOP*.xml", // Method of Payment
  "TaxMaint*.xml", // Tax Rate Maintenance
  "TaxRate*.xml", // Tax Rate files
  "EmpMaint*.xml", // Employee Maintenance
  "Employee*.xml", // Employee files
  "Cashier*.xml", // Cashier files

  // Acknowledgments
  "Ack*.xml", // Acknowledgment files
  "*_Ack.xml", // Acknowledgment suffix pattern
];

/**
 * Default polling interval in seconds
 * 15 minutes = 900 seconds for production
 * Can be overridden per-store via watcher config
 */
export const DEFAULT_POLL_INTERVAL_SECONDS = 900; // 15 minutes

// ============================================================================
// Types
// ============================================================================

export interface AutoStartResult {
  storeId: string;
  success: boolean;
  message: string;
  watchPath?: string;
  pollIntervalSeconds?: number;
}

export interface AutoStartSummary {
  totalActive: number;
  started: number;
  failed: number;
  skipped: number;
  results: AutoStartResult[];
}

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Start file watcher for a single POS integration
 *
 * DB-001: Uses Prisma ORM for all queries
 * DB-006: Query is scoped to specific store_id
 *
 * @param storeId - Store UUID to start watcher for
 * @returns Promise resolving to start result
 */
export async function startWatcherForStore(
  storeId: string,
): Promise<AutoStartResult> {
  const watcherService = getFileWatcherService();

  try {
    // Check if already watching
    if (watcherService.isWatching(storeId)) {
      return {
        storeId,
        success: true,
        message: "Watcher already running",
      };
    }

    // Fetch POS integration with file watcher config
    // DB-006: Query is tenant-scoped by store_id
    const integration = await prisma.pOSIntegration.findUnique({
      where: { store_id: storeId },
      include: {
        store: {
          select: {
            company_id: true,
          },
        },
        file_watcher_configs: true,
      },
    });

    if (!integration) {
      return {
        storeId,
        success: false,
        message: "No POS integration found for store",
      };
    }

    if (!integration.is_active) {
      return {
        storeId,
        success: false,
        message: "POS integration is inactive",
      };
    }

    if (!integration.sync_enabled) {
      return {
        storeId,
        success: false,
        message: "Sync is disabled for this integration",
      };
    }

    // Determine watch path - prefer xml_gateway_path, fall back to host
    const watchPath = integration.xml_gateway_path || integration.host;

    if (!watchPath) {
      return {
        storeId,
        success: false,
        message: "No watch path configured (xml_gateway_path or host required)",
      };
    }

    // Build watcher configuration
    // Use existing file watcher config if available, otherwise use defaults
    // file_watcher_configs is an array, we use the first active one
    const existingConfig =
      integration.file_watcher_configs?.find((c) => c.is_active) ||
      integration.file_watcher_configs?.[0];
    const pollIntervalSeconds =
      existingConfig?.poll_interval_seconds || DEFAULT_POLL_INTERVAL_SECONDS;

    const watcherConfig: NAXMLFileWatcherConfig = {
      storeId,
      posIntegrationId: integration.pos_integration_id,
      watchPath: existingConfig?.watch_path || watchPath,
      processedPath: existingConfig?.processed_path || `${watchPath}/Processed`,
      errorPath: existingConfig?.error_path || `${watchPath}/Error`,
      filePatterns: existingConfig?.file_patterns
        ? (existingConfig.file_patterns as string[])
        : GILBARCO_FILE_PATTERNS,
      pollIntervalSeconds,
      isActive: true,
    };

    // Build store context for audit tracking
    const storeContext: StoreContext = {
      storeId,
      posIntegrationId: integration.pos_integration_id,
      companyId: integration.store.company_id,
    };

    // Start the watcher
    await watcherService.startWatching(watcherConfig, storeContext);

    // Update file watcher config in database if it doesn't exist
    if (!existingConfig) {
      await prisma.pOSFileWatcherConfig.create({
        data: {
          store_id: storeId,
          pos_integration_id: integration.pos_integration_id,
          watch_path: watcherConfig.watchPath,
          processed_path: watcherConfig.processedPath,
          error_path: watcherConfig.errorPath,
          file_patterns: watcherConfig.filePatterns,
          poll_interval_seconds: pollIntervalSeconds,
          is_active: true,
        },
      });
    }

    console.log(
      `[FileWatcherAutoStart] Started watcher for store ${storeId} - polling every ${pollIntervalSeconds}s`,
    );

    return {
      storeId,
      success: true,
      message: "Watcher started successfully",
      watchPath: watcherConfig.watchPath,
      pollIntervalSeconds,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(
      `[FileWatcherAutoStart] Failed to start watcher for store ${storeId}: ${errorMessage}`,
    );

    return {
      storeId,
      success: false,
      message: `Failed to start watcher: ${errorMessage}`,
    };
  }
}

/**
 * Stop file watcher for a store
 *
 * @param storeId - Store UUID to stop watcher for
 * @returns Promise resolving when stopped
 */
export async function stopWatcherForStore(storeId: string): Promise<void> {
  const watcherService = getFileWatcherService();

  if (watcherService.isWatching(storeId)) {
    await watcherService.stopWatching(storeId);
    console.log(`[FileWatcherAutoStart] Stopped watcher for store ${storeId}`);
  }
}

/**
 * Start file watchers for all active POS integrations
 *
 * Called on server startup to resume file watching for all stores
 * with active, sync-enabled POS integrations.
 *
 * DB-001: Uses Prisma ORM with parameterized queries
 * DB-006: Results include store context for proper tenant isolation
 *
 * @returns Promise resolving to summary of start results
 */
export async function startAllActiveWatchers(): Promise<AutoStartSummary> {
  console.log(
    "[FileWatcherAutoStart] Starting file watchers for all active integrations...",
  );

  const results: AutoStartResult[] = [];
  let started = 0;
  let failed = 0;
  let skipped = 0;

  try {
    // Fetch all active, sync-enabled POS integrations with file paths
    // DB-001: Parameterized query via Prisma ORM
    // Performance: Indexed query on (is_active, next_sync_at)
    const activeIntegrations = await prisma.pOSIntegration.findMany({
      where: {
        is_active: true,
        sync_enabled: true,
        // Only file-based connections (have xml_gateway_path)
        OR: [
          { xml_gateway_path: { not: null } },
          { connection_mode: "FILE_EXCHANGE" },
        ],
      },
      select: {
        store_id: true,
        pos_type: true,
        xml_gateway_path: true,
        connection_mode: true,
      },
    });

    console.log(
      `[FileWatcherAutoStart] Found ${activeIntegrations.length} active file-based integrations`,
    );

    // Start watchers for each integration
    for (const integration of activeIntegrations) {
      const result = await startWatcherForStore(integration.store_id);
      results.push(result);

      if (result.success) {
        if (result.message === "Watcher already running") {
          skipped++;
        } else {
          started++;
        }
      } else {
        failed++;
      }
    }

    const summary: AutoStartSummary = {
      totalActive: activeIntegrations.length,
      started,
      failed,
      skipped,
      results,
    };

    console.log(
      `[FileWatcherAutoStart] Completed: ${started} started, ${failed} failed, ${skipped} skipped`,
    );

    return summary;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(
      `[FileWatcherAutoStart] Failed to start watchers: ${errorMessage}`,
    );

    return {
      totalActive: 0,
      started: 0,
      failed: 1,
      skipped: 0,
      results: [
        {
          storeId: "system",
          success: false,
          message: `System error: ${errorMessage}`,
        },
      ],
    };
  }
}

/**
 * Stop all active file watchers
 *
 * Called on server shutdown for graceful cleanup.
 */
export async function stopAllWatchers(): Promise<void> {
  const watcherService = getFileWatcherService();
  await watcherService.stopAll();
  console.log("[FileWatcherAutoStart] All file watchers stopped");
}

/**
 * Restart watcher for a store with updated configuration
 *
 * Called when POS integration paths are updated.
 *
 * @param storeId - Store UUID to restart watcher for
 * @returns Promise resolving to restart result
 */
export async function restartWatcherForStore(
  storeId: string,
): Promise<AutoStartResult> {
  // Stop existing watcher if running
  await stopWatcherForStore(storeId);

  // Start with fresh config from database
  return startWatcherForStore(storeId);
}

/**
 * Update file watcher polling interval for a store
 *
 * @param storeId - Store UUID
 * @param pollIntervalSeconds - New polling interval in seconds
 * @returns Promise resolving when updated
 */
export async function updateWatcherPollInterval(
  storeId: string,
  pollIntervalSeconds: number,
): Promise<void> {
  // Validate interval (minimum 60 seconds, maximum 24 hours)
  const validatedInterval = Math.max(60, Math.min(86400, pollIntervalSeconds));

  // Update database
  await prisma.pOSFileWatcherConfig.updateMany({
    where: { store_id: storeId },
    data: { poll_interval_seconds: validatedInterval },
  });

  // Restart watcher with new interval
  await restartWatcherForStore(storeId);
}

// ============================================================================
// Exports
// ============================================================================

const fileWatcherAutostart = {
  startWatcherForStore,
  stopWatcherForStore,
  startAllActiveWatchers,
  stopAllWatchers,
  restartWatcherForStore,
  updateWatcherPollInterval,
  GILBARCO_FILE_PATTERNS,
  DEFAULT_POLL_INTERVAL_SECONDS,
};

export default fileWatcherAutostart;
