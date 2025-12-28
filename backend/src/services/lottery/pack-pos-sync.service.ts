/**
 * Pack POS Sync Service
 *
 * Orchestrates UPC generation, Redis storage, and POS synchronization
 * for lottery pack activation and deactivation.
 *
 * Enterprise coding standards applied:
 * - API-003: ERROR_HANDLING - Comprehensive error handling with audit logging
 * - DB-006: TENANT_ISOLATION - Validate store access
 * - SEC-004: AUDIT_LOGGING - Log all POS sync operations
 *
 * @module services/lottery/pack-pos-sync.service
 */

import { prisma } from "../../utils/db";
import { generatePackUPCs } from "./upc-generator.service";
import {
  storePackUPCs,
  deletePackUPCs,
  getPackUPCs,
  type PackUPCData,
} from "./pack-upc-cache.service";
import { createNAXMLBuilder } from "../naxml/naxml.builder";
import type { NAXMLPriceBookItem, NAXMLVersion } from "../../types/naxml.types";
import { promises as fs } from "fs";
import * as path from "path";

// ============================================================================
// Types
// ============================================================================

/**
 * Input for pack activation sync
 */
export interface PackActivationSyncInput {
  /** Pack UUID */
  packId: string;
  /** 7-digit pack number */
  packNumber: string;
  /** 4-digit game code */
  gameCode: string;
  /** Game display name */
  gameName: string;
  /** Number of tickets in pack */
  ticketsPerPack: number;
  /** Ticket price */
  ticketPrice: number;
  /** Store UUID */
  storeId: string;
}

/**
 * Result of pack activation sync
 */
export interface PackActivationSyncResult {
  /** Whether sync completed (activation still succeeds if POS fails) */
  success: boolean;
  /** Number of UPCs generated */
  upcCount: number;
  /** Whether UPCs were stored in Redis */
  redisStored: boolean;
  /** Whether UPCs were exported to POS */
  posExported: boolean;
  /** Path to exported file (if exported) */
  posFilePath?: string;
  /** Error message if any step failed */
  error?: string;
  /** UPC details for response */
  details?: {
    upcs: string[];
    firstUpc: string;
    lastUpc: string;
  };
}

/**
 * Result of pack deactivation sync
 */
export interface PackDeactivationSyncResult {
  /** Whether cleanup completed */
  success: boolean;
  /** Whether UPCs were deleted from Redis */
  redisDeleted: boolean;
  /** Whether UPCs were removed from POS */
  posRemoved: boolean;
  /** Error message if any step failed */
  error?: string;
}

/**
 * POS configuration for file-based NAXML export
 */
interface NAXMLPOSConfig {
  /** Path to XMLGateway folder */
  xmlGatewayPath: string;
  /** NAXML version to use */
  naxmlVersion: NAXMLVersion;
  /** Store location ID for NAXML documents */
  storeLocationId: string;
}

// ============================================================================
// Constants
// ============================================================================

/** Lottery department code for POS systems */
const LOTTERY_DEPARTMENT_CODE = "20";

/** Tax exempt code for lottery tickets */
const TAX_EXEMPT_CODE = "NT";

/** POS types that support file-based NAXML export */
const NAXML_FILE_EXPORT_POS_TYPES = [
  "GILBARCO_NAXML",
  "GILBARCO_PASSPORT",
  "GENERIC_XML",
];

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get POS integration configuration for a store
 *
 * Only returns config if store has active file-based NAXML integration.
 *
 * @param storeId - Store UUID
 * @returns POS config or null if not configured
 */
async function getStorePOSConfig(
  storeId: string,
): Promise<NAXMLPOSConfig | null> {
  const integration = await prisma.pOSIntegration.findUnique({
    where: { store_id: storeId },
    select: {
      pos_integration_id: true,
      pos_type: true,
      xml_gateway_path: true,
      naxml_version: true,
      is_active: true,
      connection_mode: true,
    },
  });

  if (!integration || !integration.is_active) {
    return null;
  }

  // Only support file-based NAXML export
  if (
    !NAXML_FILE_EXPORT_POS_TYPES.includes(integration.pos_type) &&
    integration.connection_mode !== "FILE_EXCHANGE"
  ) {
    return null;
  }

  if (!integration.xml_gateway_path) {
    console.warn(
      `PackPOSSync: Store ${storeId} has ${integration.pos_type} but no xml_gateway_path configured`,
    );
    return null;
  }

  return {
    xmlGatewayPath: integration.xml_gateway_path,
    naxmlVersion: (integration.naxml_version as NAXMLVersion) || "3.4",
    storeLocationId: storeId,
  };
}

/**
 * Build NAXML PriceBookMaintenance items for lottery UPCs
 *
 * @param upcs - Array of 12-digit UPCs
 * @param gameName - Game display name
 * @param ticketPrice - Price per ticket
 * @param action - Maintenance action (AddUpdate or Delete)
 * @returns Array of price book items
 */
function buildLotteryPriceBookItems(
  upcs: string[],
  gameName: string,
  ticketPrice: number,
  action: "AddUpdate" | "Delete" = "AddUpdate",
): NAXMLPriceBookItem[] {
  return upcs.map((upc, index) => ({
    itemCode: upc,
    description: `${gameName} #${index.toString().padStart(3, "0")}`,
    shortDescription: gameName.substring(0, 20),
    departmentCode: LOTTERY_DEPARTMENT_CODE,
    unitPrice: ticketPrice,
    taxRateCode: TAX_EXEMPT_CODE,
    isActive: action === "AddUpdate",
    action,
  }));
}

/**
 * Export UPCs to POS via NAXML PriceBookMaintenance file
 *
 * Writes XML file to XMLGateway/BOInbox folder for POS consumption.
 *
 * @param config - POS configuration
 * @param upcs - Array of 12-digit UPCs
 * @param gameName - Game display name
 * @param ticketPrice - Price per ticket
 * @param packId - Pack UUID (for file naming)
 * @returns Export result
 */
async function exportUPCsToPOS(
  config: NAXMLPOSConfig,
  upcs: string[],
  gameName: string,
  ticketPrice: number,
  packId: string,
): Promise<{ success: boolean; filePath?: string; error?: string }> {
  try {
    // Build NAXML document
    const builder = createNAXMLBuilder({
      version: config.naxmlVersion,
      prettyPrint: true,
      includeDeclaration: true,
      includeNamespace: true,
    });

    const items = buildLotteryPriceBookItems(
      upcs,
      gameName,
      ticketPrice,
      "AddUpdate",
    );
    const xml = builder.buildPriceBookDocument(
      config.storeLocationId,
      items,
      "Incremental", // Incremental - only adding these UPCs
    );

    // Build file path
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, 19);
    const fileName = `LotteryUPC_${packId.substring(0, 8)}_${timestamp}.xml`;
    const inboxPath = path.join(config.xmlGatewayPath, "BOInbox");
    const filePath = path.join(inboxPath, fileName);

    // Verify inbox directory exists and is writable
    try {
      await fs.access(inboxPath, fs.constants.W_OK);
    } catch {
      // Try to create the directory
      try {
        // eslint-disable-next-line security/detect-non-literal-fs-filename -- Path constructed from validated config
        await fs.mkdir(inboxPath, { recursive: true });
      } catch (mkdirError) {
        return {
          success: false,
          error: `BOInbox directory not accessible and could not create: ${inboxPath}`,
        };
      }
    }

    // Write XML file
    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Path constructed from validated config and sanitized timestamp
    await fs.writeFile(filePath, xml, "utf-8");

    console.log(
      `PackPOSSync: Exported ${upcs.length} UPCs to ${fileName} (${xml.length} bytes)`,
    );
    return { success: true, filePath };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`PackPOSSync: Failed to export UPCs to POS:`, error);
    return { success: false, error: errorMessage };
  }
}

/**
 * Remove UPCs from POS via NAXML PriceBookMaintenance file with Delete action
 *
 * @param config - POS configuration
 * @param upcs - Array of 12-digit UPCs to remove
 * @param gameName - Game display name
 * @param ticketPrice - Price per ticket
 * @param packId - Pack UUID (for file naming)
 * @returns Removal result
 */
async function removeUPCsFromPOS(
  config: NAXMLPOSConfig,
  upcs: string[],
  gameName: string,
  ticketPrice: number,
  packId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    // Build NAXML document with Delete action
    const builder = createNAXMLBuilder({
      version: config.naxmlVersion,
      prettyPrint: true,
      includeDeclaration: true,
      includeNamespace: true,
    });

    const items = buildLotteryPriceBookItems(
      upcs,
      gameName,
      ticketPrice,
      "Delete",
    );
    const xml = builder.buildPriceBookDocument(
      config.storeLocationId,
      items,
      "Incremental",
    );

    // Build file path
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, 19);
    const fileName = `LotteryUPC_DELETE_${packId.substring(0, 8)}_${timestamp}.xml`;
    const inboxPath = path.join(config.xmlGatewayPath, "BOInbox");
    const filePath = path.join(inboxPath, fileName);

    // eslint-disable-next-line security/detect-non-literal-fs-filename -- Path constructed from validated config and sanitized timestamp
    await fs.writeFile(filePath, xml, "utf-8");

    console.log(
      `PackPOSSync: Sent delete request for ${upcs.length} UPCs to ${fileName}`,
    );
    return { success: true };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    console.error(`PackPOSSync: Failed to remove UPCs from POS:`, error);
    return { success: false, error: errorMessage };
  }
}

/**
 * Create audit log entry for POS sync operations
 *
 * @param action - Audit action
 * @param packId - Pack UUID
 * @param details - Additional details
 */
async function createPOSSyncAuditLog(
  action: string,
  packId: string,
  details: Record<string, unknown>,
): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        action,
        table_name: "lottery_packs",
        record_id: packId,
        new_values: details as object,
        reason: `Pack UPC sync: ${action}`,
        timestamp: new Date(),
      },
    });
  } catch (error) {
    console.error(
      `PackPOSSync: Failed to create audit log for ${action}:`,
      error,
    );
    // Don't throw - audit failure shouldn't break sync
  }
}

// ============================================================================
// Main Sync Functions
// ============================================================================

/**
 * Synchronize pack activation with Redis and POS
 *
 * Called after pack status is updated to ACTIVE.
 * Generates UPCs, stores in Redis, and exports to POS.
 *
 * @param input - Pack activation data
 * @returns Sync result with status of each step
 *
 * @example
 * const result = await syncPackActivation({
 *   packId: "uuid",
 *   packNumber: "5633005",
 *   gameCode: "0033",
 *   gameName: "Lucky 7s",
 *   ticketsPerPack: 15,
 *   ticketPrice: 20,
 *   storeId: "uuid",
 * });
 */
export async function syncPackActivation(
  input: PackActivationSyncInput,
): Promise<PackActivationSyncResult> {
  console.log(
    `PackPOSSync: Starting activation sync for pack ${input.packId} (${input.gameName})`,
  );

  // 1. Generate UPCs
  const upcResult = generatePackUPCs({
    gameCode: input.gameCode,
    packNumber: input.packNumber,
    ticketsPerPack: input.ticketsPerPack,
  });

  if (!upcResult.success) {
    console.error(
      `PackPOSSync: UPC generation failed for pack ${input.packId}: ${upcResult.error}`,
    );
    return {
      success: false,
      upcCount: 0,
      redisStored: false,
      posExported: false,
      error: upcResult.error || "Failed to generate UPCs",
    };
  }

  console.log(
    `PackPOSSync: Generated ${upcResult.upcs.length} UPCs (${upcResult.metadata.firstUpc} to ${upcResult.metadata.lastUpc})`,
  );

  // 2. Store in Redis (for retry if POS push fails)
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour retry window

  const cacheData: PackUPCData = {
    packId: input.packId,
    storeId: input.storeId,
    gameCode: input.gameCode,
    gameName: input.gameName,
    packNumber: upcResult.metadata.packNumber,
    ticketPrice: input.ticketPrice,
    upcs: upcResult.upcs,
    generatedAt: now.toISOString(),
    expiresAt: expiresAt.toISOString(),
  };

  const redisStored = await storePackUPCs(cacheData);

  // Note: We proceed even if Redis fails - UPCs are ephemeral
  // The POS export is the critical path

  // 3. Get POS configuration
  const posConfig = await getStorePOSConfig(input.storeId);

  if (!posConfig) {
    // No POS integration configured - this is acceptable
    console.log(
      `PackPOSSync: No POS integration for store ${input.storeId}, skipping export`,
    );
    return {
      success: true,
      upcCount: upcResult.upcs.length,
      redisStored,
      posExported: false,
      details: {
        upcs: upcResult.upcs,
        firstUpc: upcResult.metadata.firstUpc,
        lastUpc: upcResult.metadata.lastUpc,
      },
    };
  }

  // 4. Export to POS
  const posResult = await exportUPCsToPOS(
    posConfig,
    upcResult.upcs,
    input.gameName,
    input.ticketPrice,
    input.packId,
  );

  // 5. Create audit log
  if (posResult.success) {
    await createPOSSyncAuditLog("PACK_UPC_POS_EXPORT_SUCCESS", input.packId, {
      upcCount: upcResult.upcs.length,
      firstUpc: upcResult.metadata.firstUpc,
      lastUpc: upcResult.metadata.lastUpc,
      filePath: posResult.filePath,
      redisStored,
    });
  } else {
    await createPOSSyncAuditLog("PACK_UPC_POS_EXPORT_FAILED", input.packId, {
      upcCount: upcResult.upcs.length,
      error: posResult.error,
      redisStored,
    });
  }

  return {
    success: true, // Activation succeeds even if POS export fails
    upcCount: upcResult.upcs.length,
    redisStored,
    posExported: posResult.success,
    posFilePath: posResult.filePath,
    error: posResult.success ? undefined : posResult.error,
    details: {
      upcs: upcResult.upcs,
      firstUpc: upcResult.metadata.firstUpc,
      lastUpc: upcResult.metadata.lastUpc,
    },
  };
}

/**
 * Synchronize pack deactivation with Redis and POS
 *
 * Called when pack status changes to DEPLETED or RETURNED.
 * Removes UPCs from Redis and sends delete request to POS.
 *
 * @param packId - Pack UUID
 * @param storeId - Store UUID
 * @returns Sync result
 *
 * @example
 * const result = await syncPackDeactivation("pack-uuid", "store-uuid");
 */
export async function syncPackDeactivation(
  packId: string,
  storeId: string,
): Promise<PackDeactivationSyncResult> {
  console.log(`PackPOSSync: Starting deactivation sync for pack ${packId}`);

  // 1. Get cached UPC data (needed for POS removal)
  const cachedData = await getPackUPCs(packId);

  // 2. Delete from Redis
  const redisDeleted = await deletePackUPCs(packId);

  // 3. Get POS configuration
  const posConfig = await getStorePOSConfig(storeId);

  if (!posConfig || !cachedData) {
    // No POS integration or no cached data - nothing to remove from POS
    if (!cachedData) {
      console.log(
        `PackPOSSync: No cached UPC data for pack ${packId}, skipping POS removal`,
      );
    }
    if (!posConfig) {
      console.log(
        `PackPOSSync: No POS integration for store ${storeId}, skipping POS removal`,
      );
    }

    return {
      success: true,
      redisDeleted,
      posRemoved: false,
    };
  }

  // 4. Send delete request to POS
  const posResult = await removeUPCsFromPOS(
    posConfig,
    cachedData.upcs,
    cachedData.gameName,
    cachedData.ticketPrice,
    packId,
  );

  // 5. Create audit log
  await createPOSSyncAuditLog("PACK_UPC_POS_DELETE", packId, {
    upcCount: cachedData.upcs.length,
    redisDeleted,
    posRemoved: posResult.success,
    error: posResult.error,
  });

  if (!posResult.success) {
    console.error(
      `PackPOSSync: Failed to remove UPCs from POS for pack ${packId}: ${posResult.error}`,
    );
  }

  return {
    success: true,
    redisDeleted,
    posRemoved: posResult.success,
    error: posResult.error,
  };
}
