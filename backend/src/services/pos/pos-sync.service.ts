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
} from "../../types/pos-integration.types";
import type {
  POSIntegration,
  POSSystemType,
  POSSyncTrigger,
  POSSyncStatus,
  POSAuthType,
  TenderType,
  Department,
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
        sync_interval_mins: input.syncIntervalMins ?? 60,
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
      // For file-based systems, host contains the XMLGateway or exchange folder path
      config.xmlGatewayPath = host;
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
          // Update existing
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
          updated++;
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
          // Update existing
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
          updated++;
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
          // Update existing
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
          updated++;
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
      // For file-based systems, host contains the XMLGateway or exchange folder path
      baseConfig.xmlGatewayPath = integration.host;
      // Also set NAXML-specific defaults for Gilbarco
      if (
        integration.pos_type === "GILBARCO_PASSPORT" ||
        integration.pos_type === "GILBARCO_NAXML" ||
        integration.pos_type === "GILBARCO_COMMANDER"
      ) {
        baseConfig.naxmlVersion = "3.4";
        baseConfig.generateAcknowledgments = true;
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
}

/**
 * Singleton instance
 */
export const posSyncService = new POSSyncService();
