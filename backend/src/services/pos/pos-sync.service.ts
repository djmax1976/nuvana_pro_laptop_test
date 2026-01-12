/**
 * POS Sync Service
 *
 * Orchestrates synchronization between POS systems and Nuvana.
 * Handles:
 * - Initial store onboarding (full sync)
 * - Periodic sync updates
 * - Entity resolution during transactions
 * - Credential encryption/decryption
 *
 * @module services/pos/pos-sync.service
 * @security All POS credentials are encrypted at rest
 */

import crypto from "crypto";
import { prisma } from "../../utils/db";
import { getPOSAdapter, hasPOSAdapter } from "./adapter-registry";
import type {
  POSConnectionConfig,
  POSSyncResult,
  POSDepartment,
  POSTenderType,
  POSTaxRate,
  POSEntitySyncResult,
  POSSyncError,
  TriggerSyncOptions,
  EncryptedCredentials,
  CreatePOSIntegrationInput,
  UpdatePOSIntegrationInput,
  POSConnectionTestResult,
  POSCredentials,
  POSFuelSalesSummary,
  POSPJRTransaction,
  POSPJRLineItem,
} from "../../types/pos-integration.types";
import { Decimal } from "@prisma/client/runtime/library";
import type {
  POSIntegration,
  POSSystemType,
  POSSyncTrigger,
  POSSyncStatus,
  POSAuthType,
  TenderType,
  Department,
  TransactionItemType,
} from "@prisma/client";

/**
 * Encryption key from environment (must be 32 bytes for AES-256)
 */
const ENCRYPTION_KEY =
  process.env.POS_CREDENTIALS_KEY || process.env.JWT_SECRET || "";

/**
 * POS Sync Service
 */
export class POSSyncService {
  /**
   * Encryption algorithm
   */
  private readonly algorithm = "aes-256-gcm";

  /**
   * IV length for AES-GCM
   */
  private readonly ivLength = 16;

  // ============================================================================
  // Connection Management
  // ============================================================================

  /**
   * Create a new POS integration for a store
   */
  async createIntegration(
    input: CreatePOSIntegrationInput,
    createdBy?: string,
  ): Promise<POSIntegration> {
    // Verify store exists
    const store = await prisma.store.findUnique({
      where: { store_id: input.storeId },
    });

    if (!store) {
      throw new Error(`Store not found: ${input.storeId}`);
    }

    // Check if integration already exists
    const existing = await prisma.pOSIntegration.findUnique({
      where: { store_id: input.storeId },
    });

    if (existing) {
      throw new Error(
        `POS integration already exists for store: ${input.storeId}`,
      );
    }

    // Note: We allow creating integrations for any POS type (for future adapter support)
    // The adapter check is only enforced during sync operations

    // Encrypt credentials if provided
    let encryptedCredentials: EncryptedCredentials | null = null;
    if (input.authCredentials) {
      encryptedCredentials = this.encryptCredentials(input.authCredentials);
    }

    // Create integration
    const integration = await prisma.pOSIntegration.create({
      data: {
        store_id: input.storeId,
        pos_type: input.posType,
        pos_name: input.posName,
        host: input.host,
        port: input.port ?? 8080,
        use_ssl: input.useSsl ?? true,
        timeout: input.timeout ?? 30000,
        auth_type: input.authType,
        auth_credentials: encryptedCredentials as any,
        sync_enabled: input.syncEnabled ?? true,
        sync_interval_mins: input.syncIntervalMins ?? 1, // Default: 1 minute for near real-time sync
        sync_departments: input.syncDepartments ?? true,
        sync_tender_types: input.syncTenderTypes ?? true,
        sync_cashiers: input.syncCashiers ?? true,
        sync_tax_rates: input.syncTaxRates ?? true,
        created_by: createdBy,
        next_sync_at: new Date(), // Trigger initial sync
      },
    });

    console.log(
      `[POSSyncService] Created POS integration for store ${input.storeId}:`,
      {
        posType: input.posType,
        host: input.host,
        port: input.port,
      },
    );

    return integration;
  }

  /**
   * Update an existing POS integration
   */
  async updateIntegration(
    integrationId: string,
    input: UpdatePOSIntegrationInput,
  ): Promise<POSIntegration> {
    const existing = await prisma.pOSIntegration.findUnique({
      where: { pos_integration_id: integrationId },
    });

    if (!existing) {
      throw new Error(`POS integration not found: ${integrationId}`);
    }

    // Encrypt credentials if provided
    let encryptedCredentials: EncryptedCredentials | undefined;
    if (input.authCredentials) {
      encryptedCredentials = this.encryptCredentials(input.authCredentials);
    }

    const integration = await prisma.pOSIntegration.update({
      where: { pos_integration_id: integrationId },
      data: {
        pos_name: input.posName,
        host: input.host,
        port: input.port,
        use_ssl: input.useSsl,
        timeout: input.timeout,
        auth_type: input.authType,
        auth_credentials: encryptedCredentials as any,
        xml_gateway_path: input.xmlGatewayPath,
        sync_enabled: input.syncEnabled,
        sync_interval_mins: input.syncIntervalMins,
        sync_departments: input.syncDepartments,
        sync_tender_types: input.syncTenderTypes,
        sync_cashiers: input.syncCashiers,
        sync_tax_rates: input.syncTaxRates,
        is_active: input.isActive,
      },
    });

    return integration;
  }

  /**
   * Test a POS connection
   */
  async testConnection(
    integrationId: string,
  ): Promise<POSConnectionTestResult> {
    const integration = await prisma.pOSIntegration.findUnique({
      where: { pos_integration_id: integrationId },
    });

    if (!integration) {
      throw new Error(`POS integration not found: ${integrationId}`);
    }

    const adapter = getPOSAdapter(integration.pos_type);
    const config = this.buildConnectionConfig(integration);

    return adapter.testConnection(config);
  }

  /**
   * Test a POS connection with provided config (before saving)
   *
   * SEC-014: INPUT_VALIDATION - Parameters validated at route level before calling this method
   * API-003: ERROR_HANDLING - Returns structured error responses
   *
   * Supports both:
   * - Network-based POS systems (uses host/port)
   * - File-based POS systems (uses host as xmlGatewayPath for Gilbarco NAXML)
   */
  async testConnectionConfig(
    posType: POSSystemType,
    host: string,
    port: number,
    useSsl: boolean,
    authType: POSAuthType,
    credentials: Record<string, unknown>,
  ): Promise<POSConnectionTestResult> {
    if (!hasPOSAdapter(posType)) {
      return {
        success: false,
        message: `No adapter available for POS type: ${posType}`,
        errorCode: "NO_ADAPTER",
      };
    }

    const adapter = getPOSAdapter(posType);

    // Build base connection config
    const config: POSConnectionConfig & Record<string, unknown> = {
      host,
      port,
      useSsl,
      timeoutMs: 30000,
      authType,
      credentials: this.buildCredentialsObject(authType, credentials),
    };

    // For file-based POS systems, map host to xmlGatewayPath
    // This enables the adapter's testConnection method to find the correct path
    // GILBARCO_PASSPORT uses NAXML file exchange
    // GILBARCO_NAXML uses NAXML file exchange (same as PASSPORT but explicit)
    // GILBARCO_COMMANDER also uses NAXML file exchange
    // VERIFONE_* systems also use file-based exchange
    const fileBased: POSSystemType[] = [
      "GILBARCO_PASSPORT",
      "GILBARCO_NAXML",
      "GILBARCO_COMMANDER",
      "VERIFONE_RUBY2",
      "VERIFONE_COMMANDER",
      "VERIFONE_SAPPHIRE",
      "GENERIC_XML",
    ];

    if (fileBased.includes(posType)) {
      // For file-based systems:
      // - host contains the export path (BOOutbox - POS writes, Nuvana reads)
      // The adapter needs exportPath set directly for proper operation
      config.exportPath = host;
      config.importPath = host; // Will be overridden with proper import path on save
      config.xmlGatewayPath = host; // Kept for backwards compatibility
      // Also set NAXML-specific defaults for Gilbarco
      if (
        posType === "GILBARCO_PASSPORT" ||
        posType === "GILBARCO_NAXML" ||
        posType === "GILBARCO_COMMANDER"
      ) {
        config.naxmlVersion = "3.4";
        config.generateAcknowledgments = true;
        config.storeLocationId = ""; // Will be set from store on actual save
        config.archiveProcessedFiles = false;
      }
    }

    return adapter.testConnection(config as POSConnectionConfig);
  }

  // ============================================================================
  // Sync Operations
  // ============================================================================

  /**
   * Trigger a sync for a store
   */
  async triggerSync(
    storeId: string,
    options: TriggerSyncOptions = {},
  ): Promise<POSSyncResult> {
    const integration = await prisma.pOSIntegration.findUnique({
      where: { store_id: storeId },
      include: { store: true },
    });

    if (!integration) {
      throw new Error(`No POS integration found for store: ${storeId}`);
    }

    if (!integration.is_active) {
      throw new Error(`POS integration is inactive for store: ${storeId}`);
    }

    return this.performSync(
      integration,
      options.triggeredBy ? "MANUAL" : "SCHEDULED",
      options,
    );
  }

  /**
   * Perform the actual sync operation
   */
  private async performSync(
    integration: POSIntegration & { store?: { company_id: string } },
    triggerType: POSSyncTrigger,
    options: TriggerSyncOptions = {},
  ): Promise<POSSyncResult> {
    const startTime = Date.now();

    // Create sync log
    const syncLog = await prisma.pOSSyncLog.create({
      data: {
        pos_integration_id: integration.pos_integration_id,
        started_at: new Date(),
        status: "IN_PROGRESS",
        trigger_type: triggerType,
        triggered_by: options.triggeredBy,
      },
    });

    try {
      const adapter = getPOSAdapter(integration.pos_type);
      const config = this.buildConnectionConfig(integration);
      const errors: POSSyncError[] = [];
      let created = 0;
      let updated = 0;
      let deactivated = 0;

      const result: POSSyncResult = {
        success: true,
        status: "SUCCESS",
        durationMs: 0,
        errors: [],
      };

      // Get store and company info
      const store =
        integration.store ||
        (await prisma.store.findUnique({
          where: { store_id: integration.store_id },
        }));

      if (!store) {
        throw new Error("Store not found");
      }

      // Sync departments
      if (integration.sync_departments && options.departments !== false) {
        try {
          const posDepts = await adapter.syncDepartments(config);
          const deptResult = await this.syncDepartments(
            posDepts,
            integration.store_id,
            store.company_id,
            integration.pos_type,
          );
          result.departments = deptResult;
          created += deptResult.created;
          updated += deptResult.updated;
          deactivated += deptResult.deactivated;
          errors.push(...deptResult.errors);
        } catch (error) {
          errors.push({
            entityType: "department",
            posCode: "*",
            error: error instanceof Error ? error.message : "Unknown error",
            errorCode: "SYNC_FAILED",
          });
        }
      }

      // Sync tender types
      if (integration.sync_tender_types && options.tenderTypes !== false) {
        try {
          const posTenders = await adapter.syncTenderTypes(config);
          const tenderResult = await this.syncTenderTypes(
            posTenders,
            integration.store_id,
            store.company_id,
            integration.pos_type,
          );
          result.tenderTypes = tenderResult;
          created += tenderResult.created;
          updated += tenderResult.updated;
          deactivated += tenderResult.deactivated;
          errors.push(...tenderResult.errors);
        } catch (error) {
          errors.push({
            entityType: "tender_type",
            posCode: "*",
            error: error instanceof Error ? error.message : "Unknown error",
            errorCode: "SYNC_FAILED",
          });
        }
      }

      // Sync tax rates
      if (integration.sync_tax_rates && options.taxRates !== false) {
        try {
          const posTaxes = await adapter.syncTaxRates(config);
          const taxResult = await this.syncTaxRates(
            posTaxes,
            integration.store_id,
            store.company_id,
            integration.pos_type,
          );
          result.taxRates = taxResult;
          created += taxResult.created;
          updated += taxResult.updated;
          deactivated += taxResult.deactivated;
          errors.push(...taxResult.errors);
        } catch (error) {
          errors.push({
            entityType: "tax_rate",
            posCode: "*",
            error: error instanceof Error ? error.message : "Unknown error",
            errorCode: "SYNC_FAILED",
          });
        }
      }

      // Note: Cashier sync is handled separately due to PIN complexity
      // POS cashiers don't map directly to our cashier model

      // Sync fuel sales (FGM files) for Gilbarco systems
      // Both GILBARCO_PASSPORT and GILBARCO_NAXML use FGM files for fuel data
      if (
        integration.pos_type === "GILBARCO_PASSPORT" ||
        integration.pos_type === "GILBARCO_NAXML"
      ) {
        try {
          // Check if adapter has syncFuelSales method
          const gilbarcoAdapter = adapter as {
            syncFuelSales?: (
              config: POSConnectionConfig,
            ) => Promise<POSFuelSalesSummary[]>;
          };
          if (gilbarcoAdapter.syncFuelSales) {
            const fuelSales = await gilbarcoAdapter.syncFuelSales(config);
            if (fuelSales.length > 0) {
              await this.syncFuelSalesToDaySummary(
                fuelSales,
                integration.store_id,
              );
              console.log(
                `[POSSyncService] Synced fuel sales for ${fuelSales.length} business dates`,
              );
            }
          }
        } catch (error) {
          console.error(
            "[POSSyncService] Error syncing fuel sales:",
            error instanceof Error ? error.message : "Unknown error",
          );
          errors.push({
            entityType: "department", // No fuel entity type, use department
            posCode: "FGM",
            error: error instanceof Error ? error.message : "Unknown error",
            errorCode: "FUEL_SYNC_FAILED",
          });
        }

        // Sync PJR transactions for real-time data (Phase 5.6)
        try {
          const gilbarcoAdapter = adapter as {
            extractPJRTransactions?: (
              config: POSConnectionConfig,
              businessDateFilter?: string,
            ) => Promise<POSPJRTransaction[]>;
          };
          if (gilbarcoAdapter.extractPJRTransactions) {
            const transactions = await gilbarcoAdapter.extractPJRTransactions(
              config,
              undefined, // Process all dates, not just today
            );

            if (transactions.length > 0) {
              const txResult = await this.syncTransactions(
                transactions,
                integration.store_id,
                integration.pos_integration_id,
              );

              console.log(
                `[POSSyncService] Synced transactions: ${txResult.inserted} inserted, ${txResult.skipped} skipped, ${txResult.errors} errors`,
              );

              // Add errors if any
              if (txResult.errors > 0) {
                errors.push({
                  entityType: "department", // No transaction entity type
                  posCode: "PJR",
                  error: `Transaction sync errors: ${txResult.errorDetails.slice(0, 3).join("; ")}`,
                  errorCode: "TRANSACTION_SYNC_PARTIAL",
                });
              }
            }
          }
        } catch (error) {
          console.error(
            "[POSSyncService] Error syncing transactions:",
            error instanceof Error ? error.message : "Unknown error",
          );
          errors.push({
            entityType: "department",
            posCode: "PJR",
            error: error instanceof Error ? error.message : "Unknown error",
            errorCode: "TRANSACTION_SYNC_FAILED",
          });
        }
      }

      // Determine final status
      let status: POSSyncStatus = "SUCCESS";
      if (errors.length > 0) {
        status =
          result.departments || result.tenderTypes || result.taxRates
            ? "PARTIAL_SUCCESS"
            : "FAILED";
      }

      result.status = status;
      result.success = status !== "FAILED";
      result.durationMs = Date.now() - startTime;
      result.errors = errors;

      // Update sync log
      await prisma.pOSSyncLog.update({
        where: { sync_log_id: syncLog.sync_log_id },
        data: {
          completed_at: new Date(),
          duration_ms: result.durationMs,
          status,
          departments_synced: result.departments?.received || 0,
          tender_types_synced: result.tenderTypes?.received || 0,
          tax_rates_synced: result.taxRates?.received || 0,
          entities_created: created,
          entities_updated: updated,
          entities_deactivated: deactivated,
          error_message:
            errors.length > 0 ? errors.map((e) => e.error).join("; ") : null,
        },
      });

      // Update integration
      await prisma.pOSIntegration.update({
        where: { pos_integration_id: integration.pos_integration_id },
        data: {
          last_sync_at: new Date(),
          last_sync_status: status,
          last_sync_error: errors.length > 0 ? errors[0].error : null,
          next_sync_at: new Date(
            Date.now() + integration.sync_interval_mins * 60000,
          ),
        },
      });

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      // Update sync log with failure
      await prisma.pOSSyncLog.update({
        where: { sync_log_id: syncLog.sync_log_id },
        data: {
          completed_at: new Date(),
          duration_ms: Date.now() - startTime,
          status: "FAILED",
          error_message: errorMessage,
        },
      });

      // Update integration
      await prisma.pOSIntegration.update({
        where: { pos_integration_id: integration.pos_integration_id },
        data: {
          last_sync_at: new Date(),
          last_sync_status: "FAILED",
          last_sync_error: errorMessage,
          next_sync_at: new Date(
            Date.now() + integration.sync_interval_mins * 60000,
          ),
        },
      });

      return {
        success: false,
        status: "FAILED",
        durationMs: Date.now() - startTime,
        errors: [
          {
            entityType: "department",
            posCode: "*",
            error: errorMessage,
            errorCode: "SYNC_FAILED",
          },
        ],
        errorMessage,
      };
    }
  }

  // ============================================================================
  // Entity Sync Methods
  // ============================================================================

  /**
   * Sync departments from POS
   */
  private async syncDepartments(
    posDepts: POSDepartment[],
    storeId: string,
    companyId: string,
    posType: POSSystemType,
  ): Promise<POSEntitySyncResult> {
    let created = 0;
    let updated = 0;
    let deactivated = 0;
    const errors: POSSyncError[] = [];
    const syncedCodes = new Set<string>();

    for (const posDept of posDepts) {
      try {
        syncedCodes.add(posDept.posCode);

        // Find existing by POS code for this store
        const existing = await prisma.department.findFirst({
          where: {
            pos_code: posDept.posCode,
            store_id: storeId,
          },
        });

        if (existing) {
          // Check if any data actually changed
          // Handle null/undefined comparison carefully
          const existingMinAge = existing.minimum_age ?? null;
          const posMinAge = posDept.minimumAge ?? null;

          const hasChanges =
            existing.display_name !== posDept.displayName ||
            existing.is_taxable !== posDept.isTaxable ||
            existingMinAge !== posMinAge ||
            existing.is_lottery !== posDept.isLottery ||
            existing.is_active !== posDept.isActive ||
            existing.pos_source !== posType;

          // Debug: log what's being compared
          if (hasChanges) {
            console.log(
              `[POSSyncService] Department ${posDept.posCode} has changes:`,
              {
                display_name:
                  existing.display_name !== posDept.displayName
                    ? `"${existing.display_name}" -> "${posDept.displayName}"`
                    : "same",
                is_taxable:
                  existing.is_taxable !== posDept.isTaxable
                    ? `${existing.is_taxable} -> ${posDept.isTaxable}`
                    : "same",
                minimum_age:
                  existingMinAge !== posMinAge
                    ? `${existingMinAge} -> ${posMinAge}`
                    : "same",
                is_lottery:
                  existing.is_lottery !== posDept.isLottery
                    ? `${existing.is_lottery} -> ${posDept.isLottery}`
                    : "same",
                is_active:
                  existing.is_active !== posDept.isActive
                    ? `${existing.is_active} -> ${posDept.isActive}`
                    : "same",
                pos_source:
                  existing.pos_source !== posType
                    ? `"${existing.pos_source}" -> "${posType}"`
                    : "same",
              },
            );
          }

          // Always update last_synced_at, but only count as "updated" if data changed
          await prisma.department.update({
            where: { department_id: existing.department_id },
            data: {
              display_name: posDept.displayName,
              is_taxable: posDept.isTaxable,
              minimum_age: posDept.minimumAge,
              is_lottery: posDept.isLottery,
              is_active: posDept.isActive,
              sort_order: posDept.sortOrder ?? existing.sort_order,
              pos_source: posType,
              last_synced_at: new Date(),
            },
          });
          if (hasChanges) {
            updated++;
          }
        } else {
          // Create new
          await prisma.department.create({
            data: {
              code: this.generateCode(posDept.displayName, posDept.posCode),
              display_name: posDept.displayName,
              description: posDept.description,
              is_taxable: posDept.isTaxable,
              minimum_age: posDept.minimumAge,
              is_lottery: posDept.isLottery,
              is_active: posDept.isActive,
              sort_order: posDept.sortOrder ?? 0,
              client_id: companyId,
              store_id: storeId,
              pos_code: posDept.posCode,
              pos_source: posType,
              last_synced_at: new Date(),
              is_system: false,
            },
          });
          created++;
        }
      } catch (error) {
        errors.push({
          entityType: "department",
          posCode: posDept.posCode,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    // Deactivate entities not in POS anymore
    try {
      const result = await prisma.department.updateMany({
        where: {
          store_id: storeId,
          pos_code: { notIn: Array.from(syncedCodes) },
          pos_source: posType,
          is_active: true,
        },
        data: {
          is_active: false,
          last_synced_at: new Date(),
        },
      });
      deactivated = result.count;
    } catch (error) {
      errors.push({
        entityType: "department",
        posCode: "*",
        error: `Failed to deactivate: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }

    return { received: posDepts.length, created, updated, deactivated, errors };
  }

  /**
   * Sync tender types from POS
   */
  private async syncTenderTypes(
    posTenders: POSTenderType[],
    storeId: string,
    companyId: string,
    posType: POSSystemType,
  ): Promise<POSEntitySyncResult> {
    let created = 0;
    let updated = 0;
    let deactivated = 0;
    const errors: POSSyncError[] = [];
    const syncedCodes = new Set<string>();

    for (const posTender of posTenders) {
      try {
        syncedCodes.add(posTender.posCode);

        // Find existing by POS code for this store
        const existing = await prisma.tenderType.findFirst({
          where: {
            pos_code: posTender.posCode,
            store_id: storeId,
          },
        });

        if (existing) {
          // Check if any data actually changed
          const hasChanges =
            existing.display_name !== posTender.displayName ||
            existing.is_cash_equivalent !== posTender.isCashEquivalent ||
            existing.is_electronic !== posTender.isElectronic ||
            existing.affects_cash_drawer !== posTender.affectsCashDrawer ||
            existing.requires_reference !== posTender.requiresReference ||
            existing.is_active !== posTender.isActive ||
            existing.pos_source !== posType;

          // Always update last_synced_at, but only count as "updated" if data changed
          await prisma.tenderType.update({
            where: { tender_type_id: existing.tender_type_id },
            data: {
              display_name: posTender.displayName,
              is_cash_equivalent: posTender.isCashEquivalent,
              is_electronic: posTender.isElectronic,
              affects_cash_drawer: posTender.affectsCashDrawer,
              requires_reference: posTender.requiresReference,
              is_active: posTender.isActive,
              sort_order: posTender.sortOrder ?? existing.sort_order,
              pos_source: posType,
              last_synced_at: new Date(),
            },
          });
          if (hasChanges) {
            updated++;
          }
        } else {
          // Create new
          await prisma.tenderType.create({
            data: {
              code: this.generateCode(posTender.displayName, posTender.posCode),
              display_name: posTender.displayName,
              description: posTender.description,
              is_cash_equivalent: posTender.isCashEquivalent,
              is_electronic: posTender.isElectronic,
              affects_cash_drawer: posTender.affectsCashDrawer,
              requires_reference: posTender.requiresReference,
              is_active: posTender.isActive,
              sort_order: posTender.sortOrder ?? 0,
              client_id: companyId,
              store_id: storeId,
              pos_code: posTender.posCode,
              pos_source: posType,
              last_synced_at: new Date(),
              is_system: false,
            },
          });
          created++;
        }
      } catch (error) {
        errors.push({
          entityType: "tender_type",
          posCode: posTender.posCode,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    // Deactivate entities not in POS anymore
    try {
      const result = await prisma.tenderType.updateMany({
        where: {
          store_id: storeId,
          pos_code: { notIn: Array.from(syncedCodes) },
          pos_source: posType,
          is_active: true,
        },
        data: {
          is_active: false,
          last_synced_at: new Date(),
        },
      });
      deactivated = result.count;
    } catch (error) {
      errors.push({
        entityType: "tender_type",
        posCode: "*",
        error: `Failed to deactivate: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }

    return {
      received: posTenders.length,
      created,
      updated,
      deactivated,
      errors,
    };
  }

  /**
   * Sync tax rates from POS
   */
  private async syncTaxRates(
    posTaxes: POSTaxRate[],
    storeId: string,
    companyId: string,
    posType: POSSystemType,
  ): Promise<POSEntitySyncResult> {
    let created = 0;
    let updated = 0;
    let deactivated = 0;
    const errors: POSSyncError[] = [];
    const syncedCodes = new Set<string>();

    for (const posTax of posTaxes) {
      try {
        syncedCodes.add(posTax.posCode);

        // Find existing by POS code for this store
        const existing = await prisma.taxRate.findFirst({
          where: {
            pos_code: posTax.posCode,
            store_id: storeId,
          },
        });

        if (existing) {
          // Check if any data actually changed
          const hasChanges =
            existing.display_name !== posTax.displayName ||
            existing.rate.toNumber() !== posTax.rate ||
            existing.is_active !== posTax.isActive ||
            existing.pos_source !== posType;

          // Always update last_synced_at, but only count as "updated" if data changed
          await prisma.taxRate.update({
            where: { tax_rate_id: existing.tax_rate_id },
            data: {
              display_name: posTax.displayName,
              rate: posTax.rate,
              is_active: posTax.isActive,
              pos_source: posType,
              last_synced_at: new Date(),
            },
          });
          if (hasChanges) {
            updated++;
          }
        } else {
          // Create new
          await prisma.taxRate.create({
            data: {
              code: this.generateCode(posTax.displayName, posTax.posCode),
              display_name: posTax.displayName,
              description: posTax.description,
              rate: posTax.rate,
              rate_type: "PERCENTAGE",
              jurisdiction_level: "STATE",
              jurisdiction_code: posTax.jurisdictionCode,
              effective_from: new Date(),
              is_active: posTax.isActive,
              client_id: companyId,
              store_id: storeId,
              pos_code: posTax.posCode,
              pos_source: posType,
              last_synced_at: new Date(),
              is_system: false,
            },
          });
          created++;
        }
      } catch (error) {
        errors.push({
          entityType: "tax_rate",
          posCode: posTax.posCode,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    // Deactivate entities not in POS anymore
    try {
      const result = await prisma.taxRate.updateMany({
        where: {
          store_id: storeId,
          pos_code: { notIn: Array.from(syncedCodes) },
          pos_source: posType,
          is_active: true,
        },
        data: {
          is_active: false,
          last_synced_at: new Date(),
        },
      });
      deactivated = result.count;
    } catch (error) {
      errors.push({
        entityType: "tax_rate",
        posCode: "*",
        error: `Failed to deactivate: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }

    return { received: posTaxes.length, created, updated, deactivated, errors };
  }

  // ============================================================================
  // Entity Resolution
  // ============================================================================

  /**
   * Resolve a POS tender code to a Nuvana TenderType ID
   */
  async resolveTenderType(
    posCode: string,
    storeId: string,
  ): Promise<TenderType | null> {
    // First try store-specific
    let tenderType = await prisma.tenderType.findFirst({
      where: {
        pos_code: posCode,
        store_id: storeId,
        is_active: true,
      },
    });

    if (tenderType) return tenderType;

    // Fall back to client-level
    const store = await prisma.store.findUnique({
      where: { store_id: storeId },
    });

    if (store) {
      tenderType = await prisma.tenderType.findFirst({
        where: {
          code: posCode.toUpperCase(),
          client_id: store.company_id,
          store_id: null,
          is_active: true,
        },
      });

      if (tenderType) return tenderType;
    }

    // Fall back to system default
    return prisma.tenderType.findFirst({
      where: {
        code: posCode.toUpperCase(),
        client_id: null,
        store_id: null,
        is_system: true,
        is_active: true,
      },
    });
  }

  /**
   * Resolve a POS department code to a Nuvana Department ID
   */
  async resolveDepartment(
    posCode: string,
    storeId: string,
  ): Promise<Department | null> {
    // First try store-specific
    let department = await prisma.department.findFirst({
      where: {
        pos_code: posCode,
        store_id: storeId,
        is_active: true,
      },
    });

    if (department) return department;

    // Fall back to client-level
    const store = await prisma.store.findUnique({
      where: { store_id: storeId },
    });

    if (store) {
      department = await prisma.department.findFirst({
        where: {
          code: posCode.toUpperCase(),
          client_id: store.company_id,
          store_id: null,
          is_active: true,
        },
      });

      if (department) return department;
    }

    // Fall back to system default
    return prisma.department.findFirst({
      where: {
        code: posCode.toUpperCase(),
        client_id: null,
        store_id: null,
        is_system: true,
        is_active: true,
      },
    });
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Build connection config from integration record
   *
   * For file-based POS systems (GILBARCO_*, VERIFONE_*, GENERIC_XML),
   * the host field contains the XMLGateway folder path and must be
   * mapped to xmlGatewayPath for the adapter to function correctly.
   */
  private buildConnectionConfig(
    integration: POSIntegration,
  ): POSConnectionConfig {
    // Decrypt credentials
    let credentials: POSCredentials = { type: "NONE" };

    if (integration.auth_credentials) {
      const encrypted =
        integration.auth_credentials as unknown as EncryptedCredentials;
      const decrypted = this.decryptCredentials(encrypted);
      credentials = this.buildCredentialsObject(
        integration.auth_type,
        decrypted,
      );
    }

    const baseConfig: POSConnectionConfig & Record<string, unknown> = {
      host: integration.host,
      port: integration.port,
      useSsl: integration.use_ssl,
      timeoutMs: integration.timeout,
      authType: integration.auth_type,
      credentials,
    };

    // For file-based POS systems, map host to xmlGatewayPath
    // This enables the adapter's sync methods to find the correct path
    const fileBased: POSSystemType[] = [
      "GILBARCO_PASSPORT",
      "GILBARCO_NAXML",
      "GILBARCO_COMMANDER",
      "VERIFONE_RUBY2",
      "VERIFONE_COMMANDER",
      "VERIFONE_SAPPHIRE",
      "GENERIC_XML",
    ];

    if (fileBased.includes(integration.pos_type)) {
      // For file-based systems:
      // - xml_gateway_path contains the export path (BOOutbox - POS writes, Nuvana reads)
      // - host contains the import path (BOInbox - Nuvana writes, POS reads)
      // The adapter needs both paths directly for proper operation
      baseConfig.exportPath = integration.xml_gateway_path || integration.host;
      baseConfig.importPath = integration.host;
      // xmlGatewayPath is kept for backwards compatibility
      baseConfig.xmlGatewayPath =
        integration.xml_gateway_path || integration.host;
      // Also set NAXML-specific defaults for Gilbarco
      if (
        integration.pos_type === "GILBARCO_PASSPORT" ||
        integration.pos_type === "GILBARCO_NAXML" ||
        integration.pos_type === "GILBARCO_COMMANDER"
      ) {
        baseConfig.naxmlVersion = integration.naxml_version || "3.4";
        baseConfig.generateAcknowledgments =
          integration.generate_acknowledgments ?? true;
        baseConfig.storeLocationId = integration.store_id;
        baseConfig.archiveProcessedFiles = true; // Enable archiving for sync operations
      }
    }

    return baseConfig as POSConnectionConfig;
  }

  /**
   * Build credentials object from auth type and raw credentials
   */
  private buildCredentialsObject(
    authType: POSAuthType,
    creds: Record<string, unknown>,
  ): POSCredentials {
    switch (authType) {
      case "API_KEY":
        return {
          type: "API_KEY",
          apiKey: String(creds.apiKey || creds.api_key || ""),
          headerName: creds.headerName as string | undefined,
        };

      case "BASIC_AUTH":
        return {
          type: "BASIC_AUTH",
          username: String(creds.username || ""),
          password: String(creds.password || ""),
        };

      case "OAUTH2":
        return {
          type: "OAUTH2",
          clientId: String(creds.clientId || creds.client_id || ""),
          clientSecret: String(creds.clientSecret || creds.client_secret || ""),
          tokenUrl: String(creds.tokenUrl || creds.token_url || ""),
          accessToken: creds.accessToken as string | undefined,
          tokenExpiresAt: creds.tokenExpiresAt
            ? new Date(creds.tokenExpiresAt as string)
            : undefined,
        };

      case "CERTIFICATE":
        return {
          type: "CERTIFICATE",
          certPath: String(creds.certPath || creds.cert_path || ""),
          keyPath: String(creds.keyPath || creds.key_path || ""),
          passphrase: creds.passphrase as string | undefined,
        };

      case "NONE":
      default:
        return { type: "NONE" };
    }
  }

  /**
   * Generate a code from display name
   */
  private generateCode(displayName: string, posCode?: string): string {
    // If POS code is a simple alphanumeric, use it
    if (posCode && /^[A-Z0-9_]+$/i.test(posCode)) {
      return posCode.toUpperCase().substring(0, 50);
    }

    // Otherwise, generate from display name
    return displayName
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "_")
      .replace(/^_|_$/g, "")
      .substring(0, 50);
  }

  /**
   * Encrypt credentials for storage
   */
  private encryptCredentials(
    credentials: Record<string, unknown>,
  ): EncryptedCredentials {
    const key = this.getEncryptionKey();
    const iv = crypto.randomBytes(this.ivLength);
    const cipher = crypto.createCipheriv(this.algorithm, key, iv);

    const jsonData = JSON.stringify(credentials);
    let encrypted = cipher.update(jsonData, "utf8", "base64");
    encrypted += cipher.final("base64");

    const authTag = cipher.getAuthTag();

    return {
      version: 1,
      encryptedData: encrypted,
      iv: iv.toString("base64"),
      authTag: authTag.toString("base64"),
    };
  }

  /**
   * Decrypt credentials from storage
   */
  private decryptCredentials(
    encrypted: EncryptedCredentials,
  ): Record<string, unknown> {
    const key = this.getEncryptionKey();
    const iv = Buffer.from(encrypted.iv, "base64");
    const authTag = Buffer.from(encrypted.authTag, "base64");
    const decipher = crypto.createDecipheriv(this.algorithm, key, iv, {
      authTagLength: 16,
    });
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted.encryptedData, "base64", "utf8");
    decrypted += decipher.final("utf8");

    return JSON.parse(decrypted);
  }

  /**
   * Get encryption key (32 bytes for AES-256)
   */
  private getEncryptionKey(): Buffer {
    if (!ENCRYPTION_KEY) {
      throw new Error("POS_CREDENTIALS_KEY or JWT_SECRET must be set");
    }

    // Use SHA-256 to derive a 32-byte key from the secret
    return crypto.createHash("sha256").update(ENCRYPTION_KEY).digest();
  }

  // ============================================================================
  // Fuel Sales Sync
  // ============================================================================

  /**
   * Sync fuel sales data to DaySummary table
   *
   * Updates or creates DaySummary records with fuel sales and gallons data
   * from FGM (Fuel Grade Movement) files. Uses upsert pattern for idempotency.
   *
   * @param fuelSales - Array of fuel sales summaries by business date
   * @param storeId - Store UUID to sync fuel sales for
   *
   * @security Uses parameterized queries via Prisma ORM
   * @performance Batches operations using Promise.all for concurrent execution
   */
  private async syncFuelSalesToDaySummary(
    fuelSales: POSFuelSalesSummary[],
    storeId: string,
  ): Promise<void> {
    if (fuelSales.length === 0) {
      return;
    }

    // Get store to validate it exists
    const store = await prisma.store.findUnique({
      where: { store_id: storeId },
      select: { store_id: true, company_id: true },
    });

    if (!store) {
      throw new Error(`Store not found: ${storeId}`);
    }

    // Process each business date's fuel sales
    const upsertOperations = fuelSales.map(async (sales) => {
      const businessDate = new Date(sales.businessDate);

      // Find existing DaySummary for this store and date
      const existing = await prisma.daySummary.findFirst({
        where: {
          store_id: storeId,
          business_date: businessDate,
        },
      });

      if (existing) {
        // Update existing record with fuel data
        await prisma.daySummary.update({
          where: { day_summary_id: existing.day_summary_id },
          data: {
            fuel_sales: new Decimal(sales.totalSalesAmount.toFixed(2)),
            fuel_gallons: new Decimal(sales.totalVolume.toFixed(3)),
            updated_at: new Date(),
          },
        });

        console.log(
          `[POSSyncService] Updated DaySummary fuel data for ${sales.businessDate}: ` +
            `$${sales.totalSalesAmount.toFixed(2)}, ${sales.totalVolume.toFixed(3)} gal`,
        );
      } else {
        // Create new DaySummary with fuel data
        // Initialize other fields to zero - they'll be updated by other sync processes
        await prisma.daySummary.create({
          data: {
            store_id: storeId,
            business_date: businessDate,
            fuel_sales: new Decimal(sales.totalSalesAmount.toFixed(2)),
            fuel_gallons: new Decimal(sales.totalVolume.toFixed(3)),
            net_sales: new Decimal(0),
            gross_sales: new Decimal(0),
            tax_collected: new Decimal(0),
            transaction_count: 0,
          },
        });

        console.log(
          `[POSSyncService] Created DaySummary with fuel data for ${sales.businessDate}: ` +
            `$${sales.totalSalesAmount.toFixed(2)}, ${sales.totalVolume.toFixed(3)} gal`,
        );
      }
    });

    // Execute all upserts concurrently
    await Promise.all(upsertOperations);

    console.log(
      `[POSSyncService] Fuel sales sync complete: ${fuelSales.length} business dates processed`,
    );
  }

  // ============================================================================
  // Transaction Sync (Phase 5.6)
  // ============================================================================

  /**
   * Sync PJR transactions to database
   *
   * Stores complete transaction data from PJR files into the Transaction table
   * with full line item and payment details for reporting.
   *
   * Uses upsert pattern with source_file_hash for idempotent deduplication.
   * Transactions are linked to store via pos_store_id for tenant isolation.
   *
   * @param transactions - Array of POSPJRTransaction objects from adapter
   * @param storeId - Internal store UUID for tenant scoping
   * @param integrationId - POS integration UUID for tracking
   * @returns Sync result with counts
   *
   * @security Uses Prisma ORM for parameterized queries (DB-001)
   * @security Enforces tenant isolation via store_id (DB-006)
   * @enterprise Batch processing with Prisma transactions for atomicity
   */
  async syncTransactions(
    transactions: POSPJRTransaction[],
    storeId: string,
    _integrationId: string,
  ): Promise<{
    inserted: number;
    skipped: number;
    errors: number;
    errorDetails: string[];
  }> {
    console.log(
      `[POSSyncService] Starting transaction sync: ${transactions.length} transactions for store ${storeId}`,
    );

    if (transactions.length === 0) {
      return { inserted: 0, skipped: 0, errors: 0, errorDetails: [] };
    }

    // Get store context for validation
    const store = await prisma.store.findUnique({
      where: { store_id: storeId },
      select: {
        store_id: true,
        company_id: true,
      },
    });

    if (!store) {
      throw new Error(`Store not found: ${storeId}`);
    }

    // Get or find default shift for transactions
    // In real implementation, we'd match transactions to shifts by time
    // For now, get the most recent open shift or create a placeholder
    const defaultShift = await this.getOrCreateDefaultShift(storeId);

    // Get default cashier (system user for POS imports)
    const defaultCashier = await this.getOrCreateSystemUser(store.company_id);

    // Check existing file hashes for deduplication
    const fileHashes = transactions.map((t) => t.sourceFileHash);
    const existingHashes = await prisma.transaction.findMany({
      where: {
        store_id: storeId,
        source_file_hash: { in: fileHashes },
      },
      select: { source_file_hash: true },
    });
    const existingHashSet = new Set(
      existingHashes.map((t) => t.source_file_hash),
    );

    let inserted = 0;
    let skipped = 0;
    let errors = 0;
    const errorDetails: string[] = [];

    // Process transactions in batches for memory efficiency
    const BATCH_SIZE = 50;
    for (let i = 0; i < transactions.length; i += BATCH_SIZE) {
      const batch = transactions.slice(i, i + BATCH_SIZE);

      for (const pjrTx of batch) {
        // Skip if already imported (dedupe by file hash)
        if (existingHashSet.has(pjrTx.sourceFileHash)) {
          skipped++;
          continue;
        }

        try {
          // Create transaction with line items and payments in a single transaction
          await prisma.$transaction(async (tx) => {
            // Generate unique public ID for transaction
            const publicId = this.generatePublicId(pjrTx.posTransactionId);

            // Map item types to Prisma enum
            const mapItemType = (
              itemType: POSPJRLineItem["itemType"],
            ): TransactionItemType => {
              switch (itemType) {
                case "fuel":
                  return "FUEL";
                case "lottery":
                  return "LOTTERY";
                case "prepay":
                  return "PREPAY";
                case "merchandise":
                default:
                  return "MERCHANDISE";
              }
            };

            // Create the transaction
            const transaction = await tx.transaction.create({
              data: {
                store_id: storeId,
                shift_id: defaultShift.shift_id,
                cashier_id: defaultCashier.user_id,
                timestamp: pjrTx.timestamp,
                subtotal: new Decimal(pjrTx.netAmount.toFixed(2)),
                tax: new Decimal(pjrTx.taxAmount.toFixed(2)),
                discount: new Decimal(0),
                total: new Decimal(pjrTx.grandTotal.toFixed(2)),
                public_id: publicId,

                // POS identification fields
                pos_transaction_id: pjrTx.posTransactionId,
                pos_store_id: pjrTx.posStoreId,
                business_date: new Date(pjrTx.businessDate),
                pos_register_id: pjrTx.registerId,
                pos_till_id: pjrTx.tillId,
                pos_cashier_code: pjrTx.cashierId,

                // POS flags
                is_training_mode: pjrTx.isTrainingMode,
                is_outside_sale: pjrTx.isOutsideSale,
                is_offline: pjrTx.isOffline,
                is_suspended: pjrTx.isSuspended,

                // Linked transaction
                linked_transaction_id: pjrTx.linkedTransactionId || null,
                link_reason: pjrTx.linkReason || null,

                // File tracking
                source_file: pjrTx.sourceFile,
                source_file_hash: pjrTx.sourceFileHash,
              },
            });

            // Create line items (filter out tax and tender lines)
            const productLines = pjrTx.lineItems.filter(
              (li) => li.itemType !== "tax" && li.itemType !== "tender",
            );

            if (productLines.length > 0) {
              await tx.transactionLineItem.createMany({
                data: productLines.map((li) => ({
                  transaction_id: transaction.transaction_id,
                  name: li.description || li.itemType.toUpperCase(),
                  sku: li.merchandiseCode || null,
                  quantity: new Decimal((li.quantity || 1).toFixed(3)),
                  unit_price: new Decimal((li.unitPrice || 0).toFixed(4)),
                  discount: new Decimal(0),
                  tax_amount: new Decimal(0),
                  line_total: new Decimal((li.salesAmount || 0).toFixed(2)),
                  item_type: mapItemType(li.itemType),
                  pos_merchandise_code: li.merchandiseCode || null,
                  pos_fuel_grade_id: li.fuelGradeId || null,
                  pos_fuel_position_id: li.fuelPositionId || null,
                  fuel_service_level: li.fuelServiceLevel || null,
                  fuel_price_tier: li.fuelPriceTier || null,
                  fuel_regular_price: li.regularPrice
                    ? new Decimal(li.regularPrice.toFixed(4))
                    : null,
                  line_status: li.status,
                })),
              });
            }

            // Create payments
            if (pjrTx.payments.length > 0) {
              await tx.transactionPayment.createMany({
                data: pjrTx.payments
                  .filter((p) => !p.isChange) // Exclude change lines
                  .map((p) => ({
                    transaction_id: transaction.transaction_id,
                    method: p.tenderCode,
                    tender_code: p.tenderCode,
                    amount: new Decimal(p.amount.toFixed(2)),
                    reference: p.reference || null,
                  })),
              });
            }
          });

          inserted++;
          existingHashSet.add(pjrTx.sourceFileHash); // Mark as processed
        } catch (error) {
          errors++;
          const errMsg =
            error instanceof Error ? error.message : "Unknown error";
          errorDetails.push(`Transaction ${pjrTx.posTransactionId}: ${errMsg}`);
          console.error(
            `[POSSyncService] Error inserting transaction ${pjrTx.posTransactionId}:`,
            error,
          );
        }
      }
    }

    console.log(
      `[POSSyncService] Transaction sync complete: ${inserted} inserted, ${skipped} skipped, ${errors} errors`,
    );

    return { inserted, skipped, errors, errorDetails };
  }

  /**
   * Get or create a default shift for POS imports
   * @enterprise Uses store context for tenant isolation
   */
  private async getOrCreateDefaultShift(
    storeId: string,
  ): Promise<{ shift_id: string }> {
    // Try to find an open shift
    const openShift = await prisma.shift.findFirst({
      where: {
        store_id: storeId,
        closed_at: null,
      },
      select: { shift_id: true },
      orderBy: { opened_at: "desc" },
    });

    if (openShift) {
      return openShift;
    }

    // Find the most recent shift
    const recentShift = await prisma.shift.findFirst({
      where: { store_id: storeId },
      select: { shift_id: true },
      orderBy: { opened_at: "desc" },
    });

    if (recentShift) {
      return recentShift;
    }

    // No shifts exist - need to handle this edge case
    throw new Error(
      `No shifts found for store ${storeId}. Please create a shift before importing transactions.`,
    );
  }

  /**
   * Get or create system user for POS imports
   * @enterprise Uses company scope for tenant isolation
   */
  private async getOrCreateSystemUser(
    companyId: string,
  ): Promise<{ user_id: string }> {
    // Try to find an existing system user for POS imports
    const systemUser = await prisma.user.findFirst({
      where: {
        email: `pos-import@system.internal`,
        is_client_user: true,
      },
      select: { user_id: true },
    });

    if (systemUser) {
      return systemUser;
    }

    // Find the company owner as fallback
    const company = await prisma.company.findUnique({
      where: { company_id: companyId },
      select: { owner_user_id: true },
    });

    if (company?.owner_user_id) {
      return { user_id: company.owner_user_id };
    }

    // Find any client user with a role in this company as last resort
    const userWithRole = await prisma.userRole.findFirst({
      where: {
        company_id: companyId,
      },
      select: { user_id: true },
    });

    if (userWithRole) {
      return { user_id: userWithRole.user_id };
    }

    throw new Error(
      `No users found for company ${companyId}. Please create a user before importing transactions.`,
    );
  }

  /**
   * Generate a unique public ID for transactions
   */
  private generatePublicId(posTransactionId: string): string {
    const timestamp = Date.now().toString(36);
    const posIdPart = posTransactionId.slice(-4).padStart(4, "0");
    return `POS-${posIdPart}-${timestamp}`.toUpperCase();
  }
}

/**
 * Singleton instance
 */
export const posSyncService = new POSSyncService();
