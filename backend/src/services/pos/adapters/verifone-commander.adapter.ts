/**
 * Verifone Commander Adapter
 *
 * Implements NAXML file-based exchange for Verifone Commander
 * POS systems used in convenience stores.
 *
 * Commander is Verifone's flagship c-store POS system supporting:
 * - NAXML 3.4 file-based data exchange
 * - Fuel controller integration
 * - Multi-lane/multi-register support
 * - Age verification and restricted item handling
 *
 * File Exchange Structure:
 * - Inbound (to POS): C:\Commander\Import
 * - Outbound (from POS): C:\Commander\Export
 *
 * @module services/pos/adapters/verifone-commander.adapter
 * @see https://www.verifone.com/en/solutions/convenience-retail/commander
 * @security File paths are validated to prevent path traversal attacks
 */

import * as path from "path";
import { promises as fs } from "fs";
import { BasePOSAdapter } from "../base-adapter";
import { NAXMLService, createNAXMLService } from "../../naxml/naxml.service";
import type {
  POSConnectionConfig,
  POSConnectionTestResult,
  POSDepartment,
  POSTenderType,
  POSCashier,
  POSTaxRate,
  POSTransaction,
  POSAdapterCapabilities,
} from "../../../types/pos-integration.types";
import type {
  NAXMLVersion,
  NAXMLPriceBookItem,
  NAXMLExportResult,
  NAXMLImportResult,
} from "../../../types/naxml.types";
import type { POSSystemType, POSDataCategory } from "@prisma/client";
import { withAuditTracking, type StoreContext } from "../audit.middleware";

// ============================================================================
// Configuration Types
// ============================================================================

/**
 * Verifone Commander adapter configuration
 * Extends POSConnectionConfig with Commander-specific settings
 */
export interface VerifoneCommanderConfig extends POSConnectionConfig {
  /** Base path for Commander data exchange (e.g., C:\Commander) */
  commanderBasePath: string;
  /** NAXML version to use */
  naxmlVersion: NAXMLVersion;
  /** Whether to generate acknowledgment files */
  generateAcknowledgments: boolean;
  /** Store location ID for NAXML documents */
  storeLocationId: string;
  /** Whether to archive processed files */
  archiveProcessedFiles: boolean;
  /** Archive path (optional, defaults to Export/Processed) */
  archivePath?: string;
  /** Error path (optional, defaults to Export/Error) */
  errorPath?: string;
  /** Site ID for multi-site deployments */
  siteId?: string;
  /** Controller ID for fuel integration */
  controllerId?: string;
}

/**
 * Result of processing acknowledgment files
 */
export interface AcknowledgmentResult {
  /** Original document ID */
  documentId: string;
  /** Document type */
  documentType: string;
  /** Acknowledgment status */
  status: "Received" | "Processed" | "Rejected" | "PartiallyProcessed";
  /** Records processed */
  recordsProcessed: number;
  /** Records failed */
  recordsFailed: number;
  /** Error messages */
  errors: string[];
  /** Acknowledgment file path */
  ackFilePath: string;
}

/**
 * Import result with file information
 */
export interface FileImportResult<T> extends NAXMLImportResult<T> {
  /** Source file path */
  sourceFilePath: string;
  /** Whether file was archived */
  archived: boolean;
  /** Archive path if archived */
  archivePath?: string;
}

// ============================================================================
// Error Codes
// ============================================================================

export const VERIFONE_COMMANDER_ERROR_CODES = {
  INVALID_CONFIG: "VERIFONE_COMMANDER_INVALID_CONFIG",
  PATH_TRAVERSAL: "VERIFONE_COMMANDER_PATH_TRAVERSAL",
  DIRECTORY_NOT_FOUND: "VERIFONE_COMMANDER_DIRECTORY_NOT_FOUND",
  FILE_READ_ERROR: "VERIFONE_COMMANDER_FILE_READ_ERROR",
  FILE_WRITE_ERROR: "VERIFONE_COMMANDER_FILE_WRITE_ERROR",
  PARSE_ERROR: "VERIFONE_COMMANDER_PARSE_ERROR",
  NO_FILES_FOUND: "VERIFONE_COMMANDER_NO_FILES_FOUND",
  CONTROLLER_ERROR: "VERIFONE_COMMANDER_CONTROLLER_ERROR",
} as const;

export type VerifoneCommanderErrorCode =
  (typeof VERIFONE_COMMANDER_ERROR_CODES)[keyof typeof VERIFONE_COMMANDER_ERROR_CODES];

/**
 * Custom error class for Verifone Commander adapter errors
 */
export class VerifoneCommanderError extends Error {
  readonly code: VerifoneCommanderErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: VerifoneCommanderErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "VerifoneCommanderError";
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, VerifoneCommanderError.prototype);
  }
}

// ============================================================================
// Verifone Commander Adapter Class
// ============================================================================

/**
 * Verifone Commander Adapter
 *
 * Implements file-based NAXML exchange for Verifone Commander POS systems.
 * Uses the Commander folder structure:
 * - Import: Files TO the POS (exports from Nuvana)
 * - Export: Files FROM the POS (imports to Nuvana)
 *
 * Commander supports NAXML 3.4 and provides additional fuel-specific data.
 */
export class VerifoneCommanderAdapter extends BasePOSAdapter {
  readonly posType: POSSystemType = "VERIFONE_COMMANDER";
  readonly displayName = "Verifone Commander (NAXML File Exchange)";

  private readonly naxmlService: NAXMLService;

  constructor() {
    super();
    this.naxmlService = createNAXMLService({
      version: "3.4",
      validateOnParse: true,
      validateOnBuild: false,
    });
  }

  // ============================================================================
  // Path Management
  // ============================================================================

  /**
   * Get the Import path (files TO the POS)
   */
  private getImportPath(config: VerifoneCommanderConfig): string {
    return path.join(config.commanderBasePath, "Import");
  }

  /**
   * Get the Export path (files FROM the POS)
   */
  private getExportPath(config: VerifoneCommanderConfig): string {
    return path.join(config.commanderBasePath, "Export");
  }

  /**
   * Get the archive path for processed files
   */
  private getArchivePath(config: VerifoneCommanderConfig): string {
    return (
      config.archivePath ||
      path.join(config.commanderBasePath, "Export", "Processed")
    );
  }

  /**
   * Get the error path for failed files
   */
  private getErrorPath(config: VerifoneCommanderConfig): string {
    return (
      config.errorPath || path.join(config.commanderBasePath, "Export", "Error")
    );
  }

  /**
   * Validate path for security (prevent path traversal)
   * @security Prevents directory traversal attacks
   */
  private validatePath(basePath: string, targetPath: string): void {
    const normalizedBase = path.normalize(basePath);
    const normalizedTarget = path.normalize(targetPath);

    if (!normalizedTarget.startsWith(normalizedBase)) {
      throw new VerifoneCommanderError(
        VERIFONE_COMMANDER_ERROR_CODES.PATH_TRAVERSAL,
        "Path traversal attempt detected",
        { basePath: normalizedBase, targetPath: normalizedTarget },
      );
    }
  }

  // ============================================================================
  // Adapter Interface Implementation
  // ============================================================================

  /**
   * Get adapter capabilities
   */
  getCapabilities(): POSAdapterCapabilities {
    return {
      syncDepartments: true,
      syncTenderTypes: true,
      syncCashiers: true,
      syncTaxRates: true,
      syncProducts: false, // Price book export only
      realTimeTransactions: false, // File-based, not real-time
      webhookSupport: false,
    };
  }

  /**
   * Test connection to Verifone Commander via file exchange
   * Verifies that the Commander directories exist and are accessible
   */
  async testConnection(
    config: POSConnectionConfig,
  ): Promise<POSConnectionTestResult> {
    const startTime = Date.now();
    const commanderConfig = config as VerifoneCommanderConfig;

    try {
      // Validate configuration
      if (!commanderConfig.commanderBasePath) {
        return {
          success: false,
          message: "Commander base path is not configured",
          errorCode: VERIFONE_COMMANDER_ERROR_CODES.INVALID_CONFIG,
        };
      }

      // Check Import directory exists and is writable
      const importPath = this.getImportPath(commanderConfig);
      try {
        await fs.access(importPath, fs.constants.R_OK | fs.constants.W_OK);
      } catch {
        return {
          success: false,
          message: `Import directory not accessible: ${importPath}`,
          errorCode: VERIFONE_COMMANDER_ERROR_CODES.DIRECTORY_NOT_FOUND,
        };
      }

      // Check Export directory exists and is readable
      const exportPath = this.getExportPath(commanderConfig);
      try {
        await fs.access(exportPath, fs.constants.R_OK);
      } catch {
        return {
          success: false,
          message: `Export directory not accessible: ${exportPath}`,
          errorCode: VERIFONE_COMMANDER_ERROR_CODES.DIRECTORY_NOT_FOUND,
        };
      }

      // Create archive/error directories if they don't exist
      if (commanderConfig.archiveProcessedFiles) {
        await this.ensureDirectoryExists(this.getArchivePath(commanderConfig));
        await this.ensureDirectoryExists(this.getErrorPath(commanderConfig));
      }

      return {
        success: true,
        message: `Connected to Verifone Commander at ${commanderConfig.commanderBasePath}`,
        posVersion: commanderConfig.naxmlVersion || "3.4",
        latencyMs: Date.now() - startTime,
      };
    } catch (error) {
      this.log("error", "Connection test failed", {
        error: error instanceof Error ? error.message : "Unknown error",
      });

      return {
        success: false,
        message: error instanceof Error ? error.message : "Connection failed",
        errorCode:
          error instanceof VerifoneCommanderError
            ? error.code
            : "CONNECTION_ERROR",
        latencyMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Sync departments from Export folder
   * Reads department maintenance files from the POS
   */
  async syncDepartments(config: POSConnectionConfig): Promise<POSDepartment[]> {
    const commanderConfig = config as VerifoneCommanderConfig;
    this.log("info", "Syncing departments from Commander");

    const exportPath = this.getExportPath(commanderConfig);
    const files = await this.getXmlFiles(exportPath, [
      "DeptMaint*.xml",
      "Department*.xml",
      "DEPT*.xml",
    ]);

    if (files.length === 0) {
      this.log("warn", "No department files found in Export folder");
      return [];
    }

    const allDepartments: POSDepartment[] = [];

    for (const filePath of files) {
      try {
        const xml = await fs.readFile(filePath, "utf-8");
        const result = this.naxmlService.importDepartments(xml);

        if (result.success) {
          allDepartments.push(...result.data);
          this.log(
            "info",
            `Imported ${result.data.length} departments from ${path.basename(filePath)}`,
          );

          // Archive processed file
          if (commanderConfig.archiveProcessedFiles) {
            await this.archiveFile(
              filePath,
              this.getArchivePath(commanderConfig),
            );
          }
        } else {
          this.log(
            "error",
            `Failed to import departments from ${path.basename(filePath)}`,
            {
              errors: result.errors,
            },
          );

          // Move to error folder
          if (commanderConfig.archiveProcessedFiles) {
            await this.moveToError(
              filePath,
              this.getErrorPath(commanderConfig),
            );
          }
        }
      } catch (error) {
        this.log("error", `Error processing department file ${filePath}`, {
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    this.log("info", `Total departments synced: ${allDepartments.length}`);
    return allDepartments;
  }

  /**
   * Sync tender types from Export folder
   */
  async syncTenderTypes(config: POSConnectionConfig): Promise<POSTenderType[]> {
    const commanderConfig = config as VerifoneCommanderConfig;
    this.log("info", "Syncing tender types from Commander");

    const exportPath = this.getExportPath(commanderConfig);
    const files = await this.getXmlFiles(exportPath, [
      "TenderMaint*.xml",
      "MOP*.xml",
      "TENDER*.xml",
    ]);

    if (files.length === 0) {
      this.log("warn", "No tender type files found in Export folder");
      return [];
    }

    const allTenders: POSTenderType[] = [];

    for (const filePath of files) {
      try {
        const xml = await fs.readFile(filePath, "utf-8");
        const result = this.naxmlService.importTenderTypes(xml);

        if (result.success) {
          allTenders.push(...result.data);
          this.log(
            "info",
            `Imported ${result.data.length} tender types from ${path.basename(filePath)}`,
          );

          if (commanderConfig.archiveProcessedFiles) {
            await this.archiveFile(
              filePath,
              this.getArchivePath(commanderConfig),
            );
          }
        } else {
          this.log(
            "error",
            `Failed to import tender types from ${path.basename(filePath)}`,
            {
              errors: result.errors,
            },
          );

          if (commanderConfig.archiveProcessedFiles) {
            await this.moveToError(
              filePath,
              this.getErrorPath(commanderConfig),
            );
          }
        }
      } catch (error) {
        this.log("error", `Error processing tender file ${filePath}`, {
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    this.log("info", `Total tender types synced: ${allTenders.length}`);
    return allTenders;
  }

  /**
   * Sync cashiers from Export folder
   */
  async syncCashiers(config: POSConnectionConfig): Promise<POSCashier[]> {
    const commanderConfig = config as VerifoneCommanderConfig;
    this.log("info", "Syncing cashiers from Commander");

    const exportPath = this.getExportPath(commanderConfig);
    const files = await this.getXmlFiles(exportPath, [
      "EmpMaint*.xml",
      "Employee*.xml",
      "Cashier*.xml",
      "EMPL*.xml",
    ]);

    if (files.length === 0) {
      this.log("warn", "No cashier/employee files found in Export folder");
      return [];
    }

    const allCashiers: POSCashier[] = [];

    for (const filePath of files) {
      try {
        const xml = await fs.readFile(filePath, "utf-8");
        const document = this.naxmlService.parseEmployees(xml);
        const cashiers = this.naxmlService.convertCashiers(
          document.data.employees,
        );

        allCashiers.push(...cashiers);
        this.log(
          "info",
          `Imported ${cashiers.length} cashiers from ${path.basename(filePath)}`,
        );

        if (commanderConfig.archiveProcessedFiles) {
          await this.archiveFile(
            filePath,
            this.getArchivePath(commanderConfig),
          );
        }
      } catch (error) {
        this.log("error", `Error processing cashier file ${filePath}`, {
          error: error instanceof Error ? error.message : "Unknown error",
        });

        if (commanderConfig.archiveProcessedFiles) {
          await this.moveToError(filePath, this.getErrorPath(commanderConfig));
        }
      }
    }

    this.log("info", `Total cashiers synced: ${allCashiers.length}`);
    return allCashiers;
  }

  /**
   * Sync tax rates from Export folder
   */
  async syncTaxRates(config: POSConnectionConfig): Promise<POSTaxRate[]> {
    const commanderConfig = config as VerifoneCommanderConfig;
    this.log("info", "Syncing tax rates from Commander");

    const exportPath = this.getExportPath(commanderConfig);
    const files = await this.getXmlFiles(exportPath, [
      "TaxMaint*.xml",
      "TaxRate*.xml",
      "TAX*.xml",
    ]);

    if (files.length === 0) {
      this.log("warn", "No tax rate files found in Export folder");
      return [];
    }

    const allTaxRates: POSTaxRate[] = [];

    for (const filePath of files) {
      try {
        const xml = await fs.readFile(filePath, "utf-8");
        const result = this.naxmlService.importTaxRates(xml);

        if (result.success) {
          allTaxRates.push(...result.data);
          this.log(
            "info",
            `Imported ${result.data.length} tax rates from ${path.basename(filePath)}`,
          );

          if (commanderConfig.archiveProcessedFiles) {
            await this.archiveFile(
              filePath,
              this.getArchivePath(commanderConfig),
            );
          }
        } else {
          this.log(
            "error",
            `Failed to import tax rates from ${path.basename(filePath)}`,
            {
              errors: result.errors,
            },
          );

          if (commanderConfig.archiveProcessedFiles) {
            await this.moveToError(
              filePath,
              this.getErrorPath(commanderConfig),
            );
          }
        }
      } catch (error) {
        this.log("error", `Error processing tax rate file ${filePath}`, {
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    this.log("info", `Total tax rates synced: ${allTaxRates.length}`);
    return allTaxRates;
  }

  // ============================================================================
  // Transaction Import Methods
  // ============================================================================

  /**
   * Import transactions from Export folder
   * Reads transaction log files (TLog*.xml) from the POS
   */
  async importTransactions(
    config: VerifoneCommanderConfig,
  ): Promise<FileImportResult<POSTransaction>[]> {
    this.log("info", "Importing transactions from Commander");

    const exportPath = this.getExportPath(config);
    const files = await this.getXmlFiles(exportPath, [
      "TLog*.xml",
      "Trans*.xml",
      "TLOG*.xml",
    ]);

    if (files.length === 0) {
      this.log("info", "No transaction files found in Export folder");
      return [];
    }

    const results: FileImportResult<POSTransaction>[] = [];

    for (const filePath of files) {
      try {
        const xml = await fs.readFile(filePath, "utf-8");
        const importResult = this.naxmlService.importTransactions(xml);

        const fileResult: FileImportResult<POSTransaction> = {
          ...importResult,
          sourceFilePath: filePath,
          archived: false,
        };

        if (importResult.success && config.archiveProcessedFiles) {
          const archivePath = await this.archiveFile(
            filePath,
            this.getArchivePath(config),
          );
          fileResult.archived = true;
          fileResult.archivePath = archivePath;
        } else if (!importResult.success && config.archiveProcessedFiles) {
          await this.moveToError(filePath, this.getErrorPath(config));
        }

        results.push(fileResult);
        this.log(
          "info",
          `Processed transaction file: ${path.basename(filePath)}`,
          {
            success: importResult.success,
            recordCount: importResult.recordCount,
          },
        );
      } catch (error) {
        this.log("error", `Error processing transaction file ${filePath}`, {
          error: error instanceof Error ? error.message : "Unknown error",
        });

        results.push({
          success: false,
          documentType: "TransactionDocument",
          recordCount: 0,
          successCount: 0,
          failedCount: 1,
          data: [],
          errors: [
            {
              errorCode: "FILE_PROCESSING_ERROR",
              errorMessage:
                error instanceof Error ? error.message : "Unknown error",
            },
          ],
          durationMs: 0,
          sourceFilePath: filePath,
          archived: false,
        });
      }
    }

    return results;
  }

  // ============================================================================
  // Export Methods (TO POS)
  // ============================================================================

  /**
   * Export departments to Import folder
   */
  async exportDepartments(
    config: VerifoneCommanderConfig,
    departments: POSDepartment[],
    maintenanceType: "Full" | "Incremental" = "Full",
  ): Promise<NAXMLExportResult> {
    return this.exportData(
      config,
      "DeptMaint",
      () => {
        const naxmlDepts = this.naxmlService.toNAXMLDepartments(departments);
        return this.naxmlService.buildDepartmentDocument(
          config.storeLocationId,
          naxmlDepts,
          maintenanceType,
        );
      },
      departments.length,
    );
  }

  /**
   * Export tender types to Import folder
   */
  async exportTenderTypes(
    config: VerifoneCommanderConfig,
    tenderTypes: POSTenderType[],
    maintenanceType: "Full" | "Incremental" = "Full",
  ): Promise<NAXMLExportResult> {
    return this.exportData(
      config,
      "TenderMaint",
      () => {
        const naxmlTenders = this.naxmlService.toNAXMLTenderTypes(tenderTypes);
        return this.naxmlService.buildTenderDocument(
          config.storeLocationId,
          naxmlTenders,
          maintenanceType,
        );
      },
      tenderTypes.length,
    );
  }

  /**
   * Export tax rates to Import folder
   */
  async exportTaxRates(
    config: VerifoneCommanderConfig,
    taxRates: POSTaxRate[],
    maintenanceType: "Full" | "Incremental" = "Full",
  ): Promise<NAXMLExportResult> {
    return this.exportData(
      config,
      "TaxMaint",
      () => {
        const naxmlRates = this.naxmlService.toNAXMLTaxRates(taxRates);
        return this.naxmlService.buildTaxRateDocument(
          config.storeLocationId,
          naxmlRates,
          maintenanceType,
        );
      },
      taxRates.length,
    );
  }

  /**
   * Export price book to Import folder
   */
  async exportPriceBook(
    config: VerifoneCommanderConfig,
    items: NAXMLPriceBookItem[],
    maintenanceType: "Full" | "Incremental" = "Full",
  ): Promise<NAXMLExportResult> {
    return this.exportData(
      config,
      "PriceBook",
      () => {
        return this.naxmlService.buildPriceBookDocument(
          config.storeLocationId,
          items,
          maintenanceType,
        );
      },
      items.length,
    );
  }

  /**
   * Generic export data method
   */
  private async exportData(
    config: VerifoneCommanderConfig,
    filePrefix: string,
    buildXml: () => string,
    recordCount: number,
  ): Promise<NAXMLExportResult> {
    const startTime = Date.now();
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, 19);
    const fileName = `${filePrefix}_${timestamp}.xml`;
    const importPath = this.getImportPath(config);
    const filePath = path.join(importPath, fileName);

    // Validate path
    this.validatePath(importPath, filePath);

    try {
      // Build XML
      const xml = buildXml();
      const fileHash = this.naxmlService.calculateHash(xml);

      // Write file
      await fs.writeFile(filePath, xml, "utf-8");
      const stats = await fs.stat(filePath);

      this.log("info", `Exported ${filePrefix} to ${fileName}`, {
        recordCount,
        fileSize: stats.size,
      });

      return {
        success: true,
        documentType: this.getDocumentTypeFromPrefix(filePrefix),
        recordCount,
        filePath,
        fileName,
        fileSizeBytes: stats.size,
        fileHash,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      this.log("error", `Failed to export ${filePrefix}`, {
        error: errorMessage,
      });

      return {
        success: false,
        documentType: this.getDocumentTypeFromPrefix(filePrefix),
        recordCount: 0,
        filePath: "",
        fileName: "",
        fileSizeBytes: 0,
        fileHash: "",
        durationMs: Date.now() - startTime,
        errorMessage,
      };
    }
  }

  // ============================================================================
  // Audited Operations (with full audit trail)
  // ============================================================================

  /**
   * Import transactions with full audit trail
   * MANDATORY: Use this method for production transaction imports
   */
  async importTransactionsWithAudit(
    config: VerifoneCommanderConfig,
    context: StoreContext,
  ): Promise<FileImportResult<POSTransaction>[]> {
    return withAuditTracking(
      context,
      "FILE_IMPORT",
      "TRANSACTION",
      "INBOUND",
      this.posType,
      async () => this.importTransactions(config),
      {
        sourceIdentifier: this.getExportPath(config),
        accessReason: "Commander transaction file import",
        containsFinancial: true,
        getRecordCount: (results) =>
          results.reduce((sum, r) => sum + r.recordCount, 0),
      },
    );
  }

  /**
   * Export departments with full audit trail
   */
  async exportDepartmentsWithAudit(
    config: VerifoneCommanderConfig,
    context: StoreContext,
    departments: POSDepartment[],
    maintenanceType: "Full" | "Incremental" = "Full",
  ): Promise<NAXMLExportResult> {
    return withAuditTracking(
      context,
      "FILE_EXPORT",
      "DEPARTMENT",
      "OUTBOUND",
      "NUVANA",
      async () => this.exportDepartments(config, departments, maintenanceType),
      {
        destinationSystem: this.posType,
        destinationIdentifier: this.getImportPath(config),
        accessReason: "Commander department export to POS",
        getRecordCount: (result) => result.recordCount,
        getDataSize: (result) => result.fileSizeBytes,
        getFileHash: (result) => result.fileHash,
      },
    );
  }

  /**
   * Export tender types with full audit trail
   */
  async exportTenderTypesWithAudit(
    config: VerifoneCommanderConfig,
    context: StoreContext,
    tenderTypes: POSTenderType[],
    maintenanceType: "Full" | "Incremental" = "Full",
  ): Promise<NAXMLExportResult> {
    return withAuditTracking(
      context,
      "FILE_EXPORT",
      "TENDER_TYPE",
      "OUTBOUND",
      "NUVANA",
      async () => this.exportTenderTypes(config, tenderTypes, maintenanceType),
      {
        destinationSystem: this.posType,
        destinationIdentifier: this.getImportPath(config),
        accessReason: "Commander tender types export to POS",
        containsFinancial: true,
        getRecordCount: (result) => result.recordCount,
        getDataSize: (result) => result.fileSizeBytes,
        getFileHash: (result) => result.fileHash,
      },
    );
  }

  /**
   * Export tax rates with full audit trail
   */
  async exportTaxRatesWithAudit(
    config: VerifoneCommanderConfig,
    context: StoreContext,
    taxRates: POSTaxRate[],
    maintenanceType: "Full" | "Incremental" = "Full",
  ): Promise<NAXMLExportResult> {
    return withAuditTracking(
      context,
      "FILE_EXPORT",
      "TAX_RATE",
      "OUTBOUND",
      "NUVANA",
      async () => this.exportTaxRates(config, taxRates, maintenanceType),
      {
        destinationSystem: this.posType,
        destinationIdentifier: this.getImportPath(config),
        accessReason: "Commander tax rates export to POS",
        getRecordCount: (result) => result.recordCount,
        getDataSize: (result) => result.fileSizeBytes,
        getFileHash: (result) => result.fileHash,
      },
    );
  }

  /**
   * Export price book with full audit trail
   */
  async exportPriceBookWithAudit(
    config: VerifoneCommanderConfig,
    context: StoreContext,
    items: NAXMLPriceBookItem[],
    maintenanceType: "Full" | "Incremental" = "Full",
  ): Promise<NAXMLExportResult> {
    return withAuditTracking(
      context,
      "FILE_EXPORT",
      "PRICEBOOK",
      "OUTBOUND",
      "NUVANA",
      async () => this.exportPriceBook(config, items, maintenanceType),
      {
        destinationSystem: this.posType,
        destinationIdentifier: this.getImportPath(config),
        accessReason: "Commander price book export to POS",
        getRecordCount: (result) => result.recordCount,
        getDataSize: (result) => result.fileSizeBytes,
        getFileHash: (result) => result.fileHash,
      },
    );
  }

  /**
   * Process a single file with full audit trail
   */
  async processFileWithAudit(
    filePath: string,
    config: VerifoneCommanderConfig,
    context: StoreContext,
    dataCategory: POSDataCategory = "TRANSACTION",
  ): Promise<FileImportResult<unknown>> {
    const fileName = path.basename(filePath);

    return withAuditTracking(
      context,
      "FILE_IMPORT",
      dataCategory,
      "INBOUND",
      this.posType,
      async () => {
        const xml = await fs.readFile(filePath, "utf-8");
        const fileHash = this.naxmlService.calculateHash(xml);
        await fs.stat(filePath); // Verify file exists

        // Detect document type from content
        const validation = this.naxmlService.validateXml(xml);

        if (!validation.isValid) {
          return {
            success: false,
            documentType: validation.documentType || "TransactionDocument",
            recordCount: 0,
            successCount: 0,
            failedCount: 1,
            data: [],
            errors: validation.errors.map((e) => ({
              errorCode: e.code,
              errorMessage: e.message,
            })),
            durationMs: 0,
            sourceFilePath: filePath,
            archived: false,
            sourceFile: filePath,
            fileHash,
          };
        }

        // Process based on document type
        let result: NAXMLImportResult<unknown>;
        const docType = validation.documentType;

        if (docType === "TransactionDocument") {
          result = this.naxmlService.importTransactions(xml);
        } else if (docType === "DepartmentMaintenance") {
          result = this.naxmlService.importDepartments(xml);
        } else if (docType === "TenderMaintenance") {
          result = this.naxmlService.importTenderTypes(xml);
        } else if (docType === "TaxRateMaintenance") {
          result = this.naxmlService.importTaxRates(xml);
        } else {
          result = {
            success: false,
            documentType: docType || "TransactionDocument",
            recordCount: 0,
            successCount: 0,
            failedCount: 1,
            data: [],
            errors: [
              {
                errorCode: "UNSUPPORTED_DOCUMENT_TYPE",
                errorMessage: `Document type ${docType} is not supported for import`,
              },
            ],
            durationMs: 0,
          };
        }

        // Archive if successful
        let archived = false;
        let archivePath: string | undefined;

        if (result.success && config.archiveProcessedFiles) {
          archivePath = await this.archiveFile(
            filePath,
            this.getArchivePath(config),
          );
          archived = true;
        } else if (!result.success && config.archiveProcessedFiles) {
          await this.moveToError(filePath, this.getErrorPath(config));
        }

        return {
          ...result,
          sourceFilePath: filePath,
          archived,
          archivePath,
          sourceFile: filePath,
          fileHash,
        };
      },
      {
        sourceIdentifier: filePath,
        accessReason: `Commander file import: ${fileName}`,
        containsFinancial: dataCategory === "TRANSACTION",
        metadata: { fileName },
        getRecordCount: (result) => result.recordCount,
        getDataSize: () => 0,
      },
    );
  }

  // ============================================================================
  // File Utility Methods
  // ============================================================================

  /**
   * Get XML files matching patterns
   */
  private async getXmlFiles(
    directory: string,
    patterns: string[],
  ): Promise<string[]> {
    const files: string[] = [];

    try {
      const entries = await fs.readdir(directory, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isFile()) continue;

        const fileName = entry.name.toLowerCase();

        // Check if file matches any pattern
        const matches = patterns.some((pattern) => {
          const regex = this.globToRegex(pattern);
          return regex.test(fileName);
        });

        if (matches) {
          const filePath = path.join(directory, entry.name);
          this.validatePath(directory, filePath);
          files.push(filePath);
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        this.log("warn", `Directory not found: ${directory}`);
        return [];
      }
      throw error;
    }

    return files.sort();
  }

  /**
   * Archive a processed file
   */
  private async archiveFile(
    sourcePath: string,
    archiveDir: string,
  ): Promise<string> {
    await this.ensureDirectoryExists(archiveDir);

    const fileName = path.basename(sourcePath);
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, 19);
    const archiveName = `${timestamp}_${fileName}`;
    const archivePath = path.join(archiveDir, archiveName);

    this.validatePath(archiveDir, archivePath);

    try {
      await fs.rename(sourcePath, archivePath);
    } catch (error) {
      // If rename fails (cross-device), copy and delete
      if ((error as NodeJS.ErrnoException).code === "EXDEV") {
        await fs.copyFile(sourcePath, archivePath);
        await fs.unlink(sourcePath);
      } else {
        throw error;
      }
    }

    return archivePath;
  }

  /**
   * Move a failed file to error directory
   */
  private async moveToError(
    sourcePath: string,
    errorDir: string,
  ): Promise<string> {
    await this.ensureDirectoryExists(errorDir);

    const fileName = path.basename(sourcePath);
    const timestamp = new Date()
      .toISOString()
      .replace(/[:.]/g, "-")
      .slice(0, 19);
    const errorName = `${timestamp}_ERROR_${fileName}`;
    const errorPath = path.join(errorDir, errorName);

    this.validatePath(errorDir, errorPath);

    try {
      await fs.rename(sourcePath, errorPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EXDEV") {
        await fs.copyFile(sourcePath, errorPath);
        await fs.unlink(sourcePath);
      } else {
        throw error;
      }
    }

    return errorPath;
  }

  /**
   * Ensure a directory exists
   */
  private async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") {
        throw error;
      }
    }
  }

  /**
   * Convert glob pattern to regex
   * Pattern is sanitized by escaping all regex special characters except * and ?
   * which are converted to their regex equivalents (safe glob-to-regex conversion)
   */
  private globToRegex(pattern: string): RegExp {
    const escaped = pattern
      .toLowerCase()
      .replace(/[.+^${}()|[\]\\]/g, "\\$&")
      .replace(/\*/g, ".*")
      .replace(/\?/g, ".");
    // eslint-disable-next-line security/detect-non-literal-regexp -- Pattern is sanitized above
    return new RegExp(`^${escaped}$`, "i");
  }

  /**
   * Get document type from file prefix
   */
  private getDocumentTypeFromPrefix(
    prefix: string,
  ): NAXMLExportResult["documentType"] {
    const mapping: Record<string, NAXMLExportResult["documentType"]> = {
      DeptMaint: "DepartmentMaintenance",
      TenderMaint: "TenderMaintenance",
      TaxMaint: "TaxRateMaintenance",
      PriceBook: "PriceBookMaintenance",
      EmpMaint: "EmployeeMaintenance",
    };
    return mapping[prefix] || "PriceBookMaintenance";
  }
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new Verifone Commander adapter instance
 */
export function createVerifoneCommanderAdapter(): VerifoneCommanderAdapter {
  return new VerifoneCommanderAdapter();
}
