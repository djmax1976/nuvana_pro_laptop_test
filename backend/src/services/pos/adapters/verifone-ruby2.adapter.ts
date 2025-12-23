/**
 * Verifone Ruby2 Adapter
 *
 * Implements NAXML file-based exchange for Verifone Ruby2/Ruby SuperSystem
 * POS systems commonly used in smaller convenience stores.
 *
 * Ruby2 is Verifone's mid-range c-store POS system supporting:
 * - NAXML 3.4 file-based data exchange
 * - Basic fuel controller integration
 * - Single or dual-lane support
 * - Age verification for restricted items
 *
 * File Exchange Structure:
 * - Inbound (to POS): C:\RubyCI\SSXML\In
 * - Outbound (from POS): C:\RubyCI\SSXML\Out
 *
 * @module services/pos/adapters/verifone-ruby2.adapter
 * @see https://www.verifone.com/en/solutions/convenience-retail
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
 * Verifone Ruby2 adapter configuration
 * Extends POSConnectionConfig with Ruby2-specific settings
 */
export interface VerifoneRuby2Config extends POSConnectionConfig {
  /** Base path for Ruby2 data exchange (e.g., C:\RubyCI\SSXML) */
  rubyBasePath: string;
  /** NAXML version to use */
  naxmlVersion: NAXMLVersion;
  /** Whether to generate acknowledgment files */
  generateAcknowledgments: boolean;
  /** Store location ID for NAXML documents */
  storeLocationId: string;
  /** Whether to archive processed files */
  archiveProcessedFiles: boolean;
  /** Archive path (optional, defaults to Out/Processed) */
  archivePath?: string;
  /** Error path (optional, defaults to Out/Error) */
  errorPath?: string;
  /** Ruby2 site number */
  siteNumber?: string;
  /** Ruby2 register number */
  registerNumber?: string;
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

export const VERIFONE_RUBY2_ERROR_CODES = {
  INVALID_CONFIG: "VERIFONE_RUBY2_INVALID_CONFIG",
  PATH_TRAVERSAL: "VERIFONE_RUBY2_PATH_TRAVERSAL",
  DIRECTORY_NOT_FOUND: "VERIFONE_RUBY2_DIRECTORY_NOT_FOUND",
  FILE_READ_ERROR: "VERIFONE_RUBY2_FILE_READ_ERROR",
  FILE_WRITE_ERROR: "VERIFONE_RUBY2_FILE_WRITE_ERROR",
  PARSE_ERROR: "VERIFONE_RUBY2_PARSE_ERROR",
  NO_FILES_FOUND: "VERIFONE_RUBY2_NO_FILES_FOUND",
  REGISTER_ERROR: "VERIFONE_RUBY2_REGISTER_ERROR",
} as const;

export type VerifoneRuby2ErrorCode =
  (typeof VERIFONE_RUBY2_ERROR_CODES)[keyof typeof VERIFONE_RUBY2_ERROR_CODES];

/**
 * Custom error class for Verifone Ruby2 adapter errors
 */
export class VerifoneRuby2Error extends Error {
  readonly code: VerifoneRuby2ErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: VerifoneRuby2ErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "VerifoneRuby2Error";
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, VerifoneRuby2Error.prototype);
  }
}

// ============================================================================
// Verifone Ruby2 Adapter Class
// ============================================================================

/**
 * Verifone Ruby2 Adapter
 *
 * Implements file-based NAXML exchange for Verifone Ruby2/Ruby SuperSystem
 * POS systems. Uses the RubyCI folder structure:
 * - In: Files TO the POS (exports from Nuvana)
 * - Out: Files FROM the POS (imports to Nuvana)
 *
 * Ruby2 supports NAXML 3.4 with some Ruby-specific conventions.
 */
export class VerifoneRuby2Adapter extends BasePOSAdapter {
  readonly posType: POSSystemType = "VERIFONE_RUBY2";
  readonly displayName = "Verifone Ruby2 (NAXML File Exchange)";

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
   * Get the In path (files TO the POS)
   */
  private getInPath(config: VerifoneRuby2Config): string {
    return path.join(config.rubyBasePath, "In");
  }

  /**
   * Get the Out path (files FROM the POS)
   */
  private getOutPath(config: VerifoneRuby2Config): string {
    return path.join(config.rubyBasePath, "Out");
  }

  /**
   * Get the archive path for processed files
   */
  private getArchivePath(config: VerifoneRuby2Config): string {
    return (
      config.archivePath || path.join(config.rubyBasePath, "Out", "Processed")
    );
  }

  /**
   * Get the error path for failed files
   */
  private getErrorPath(config: VerifoneRuby2Config): string {
    return config.errorPath || path.join(config.rubyBasePath, "Out", "Error");
  }

  /**
   * Validate path for security (prevent path traversal)
   * @security Prevents directory traversal attacks
   */
  private validatePath(basePath: string, targetPath: string): void {
    const normalizedBase = path.normalize(basePath);
    const normalizedTarget = path.normalize(targetPath);

    if (!normalizedTarget.startsWith(normalizedBase)) {
      throw new VerifoneRuby2Error(
        VERIFONE_RUBY2_ERROR_CODES.PATH_TRAVERSAL,
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
   * Test connection to Verifone Ruby2 via file exchange
   * Verifies that the Ruby2 directories exist and are accessible
   */
  async testConnection(
    config: POSConnectionConfig,
  ): Promise<POSConnectionTestResult> {
    const startTime = Date.now();
    const rubyConfig = config as VerifoneRuby2Config;

    try {
      // Validate configuration
      if (!rubyConfig.rubyBasePath) {
        return {
          success: false,
          message: "Ruby2 base path is not configured",
          errorCode: VERIFONE_RUBY2_ERROR_CODES.INVALID_CONFIG,
        };
      }

      // Check In directory exists and is writable
      const inPath = this.getInPath(rubyConfig);
      try {
        await fs.access(inPath, fs.constants.R_OK | fs.constants.W_OK);
      } catch {
        return {
          success: false,
          message: `In directory not accessible: ${inPath}`,
          errorCode: VERIFONE_RUBY2_ERROR_CODES.DIRECTORY_NOT_FOUND,
        };
      }

      // Check Out directory exists and is readable
      const outPath = this.getOutPath(rubyConfig);
      try {
        await fs.access(outPath, fs.constants.R_OK);
      } catch {
        return {
          success: false,
          message: `Out directory not accessible: ${outPath}`,
          errorCode: VERIFONE_RUBY2_ERROR_CODES.DIRECTORY_NOT_FOUND,
        };
      }

      // Create archive/error directories if they don't exist
      if (rubyConfig.archiveProcessedFiles) {
        await this.ensureDirectoryExists(this.getArchivePath(rubyConfig));
        await this.ensureDirectoryExists(this.getErrorPath(rubyConfig));
      }

      return {
        success: true,
        message: `Connected to Verifone Ruby2 at ${rubyConfig.rubyBasePath}`,
        posVersion: rubyConfig.naxmlVersion || "3.4",
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
          error instanceof VerifoneRuby2Error ? error.code : "CONNECTION_ERROR",
        latencyMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Sync departments from Out folder
   * Reads department maintenance files from the POS
   */
  async syncDepartments(config: POSConnectionConfig): Promise<POSDepartment[]> {
    const rubyConfig = config as VerifoneRuby2Config;
    this.log("info", "Syncing departments from Ruby2");

    const outPath = this.getOutPath(rubyConfig);
    const files = await this.getXmlFiles(outPath, [
      "DeptMaint*.xml",
      "Department*.xml",
      "DEPT*.xml",
      "dept*.xml",
    ]);

    if (files.length === 0) {
      this.log("warn", "No department files found in Out folder");
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
          if (rubyConfig.archiveProcessedFiles) {
            await this.archiveFile(filePath, this.getArchivePath(rubyConfig));
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
          if (rubyConfig.archiveProcessedFiles) {
            await this.moveToError(filePath, this.getErrorPath(rubyConfig));
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
   * Sync tender types from Out folder
   */
  async syncTenderTypes(config: POSConnectionConfig): Promise<POSTenderType[]> {
    const rubyConfig = config as VerifoneRuby2Config;
    this.log("info", "Syncing tender types from Ruby2");

    const outPath = this.getOutPath(rubyConfig);
    const files = await this.getXmlFiles(outPath, [
      "TenderMaint*.xml",
      "MOP*.xml",
      "TENDER*.xml",
      "mop*.xml",
    ]);

    if (files.length === 0) {
      this.log("warn", "No tender type files found in Out folder");
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

          if (rubyConfig.archiveProcessedFiles) {
            await this.archiveFile(filePath, this.getArchivePath(rubyConfig));
          }
        } else {
          this.log(
            "error",
            `Failed to import tender types from ${path.basename(filePath)}`,
            {
              errors: result.errors,
            },
          );

          if (rubyConfig.archiveProcessedFiles) {
            await this.moveToError(filePath, this.getErrorPath(rubyConfig));
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
   * Sync cashiers from Out folder
   */
  async syncCashiers(config: POSConnectionConfig): Promise<POSCashier[]> {
    const rubyConfig = config as VerifoneRuby2Config;
    this.log("info", "Syncing cashiers from Ruby2");

    const outPath = this.getOutPath(rubyConfig);
    const files = await this.getXmlFiles(outPath, [
      "EmpMaint*.xml",
      "Employee*.xml",
      "Cashier*.xml",
      "EMPL*.xml",
      "cashier*.xml",
    ]);

    if (files.length === 0) {
      this.log("warn", "No cashier/employee files found in Out folder");
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

        if (rubyConfig.archiveProcessedFiles) {
          await this.archiveFile(filePath, this.getArchivePath(rubyConfig));
        }
      } catch (error) {
        this.log("error", `Error processing cashier file ${filePath}`, {
          error: error instanceof Error ? error.message : "Unknown error",
        });

        if (rubyConfig.archiveProcessedFiles) {
          await this.moveToError(filePath, this.getErrorPath(rubyConfig));
        }
      }
    }

    this.log("info", `Total cashiers synced: ${allCashiers.length}`);
    return allCashiers;
  }

  /**
   * Sync tax rates from Out folder
   */
  async syncTaxRates(config: POSConnectionConfig): Promise<POSTaxRate[]> {
    const rubyConfig = config as VerifoneRuby2Config;
    this.log("info", "Syncing tax rates from Ruby2");

    const outPath = this.getOutPath(rubyConfig);
    const files = await this.getXmlFiles(outPath, [
      "TaxMaint*.xml",
      "TaxRate*.xml",
      "TAX*.xml",
      "tax*.xml",
    ]);

    if (files.length === 0) {
      this.log("warn", "No tax rate files found in Out folder");
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

          if (rubyConfig.archiveProcessedFiles) {
            await this.archiveFile(filePath, this.getArchivePath(rubyConfig));
          }
        } else {
          this.log(
            "error",
            `Failed to import tax rates from ${path.basename(filePath)}`,
            {
              errors: result.errors,
            },
          );

          if (rubyConfig.archiveProcessedFiles) {
            await this.moveToError(filePath, this.getErrorPath(rubyConfig));
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
   * Import transactions from Out folder
   * Reads transaction log files (TLog*.xml) from the POS
   */
  async importTransactions(
    config: VerifoneRuby2Config,
  ): Promise<FileImportResult<POSTransaction>[]> {
    this.log("info", "Importing transactions from Ruby2");

    const outPath = this.getOutPath(config);
    const files = await this.getXmlFiles(outPath, [
      "TLog*.xml",
      "Trans*.xml",
      "TLOG*.xml",
      "tlog*.xml",
    ]);

    if (files.length === 0) {
      this.log("info", "No transaction files found in Out folder");
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
   * Export departments to In folder
   */
  async exportDepartments(
    config: VerifoneRuby2Config,
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
   * Export tender types to In folder
   */
  async exportTenderTypes(
    config: VerifoneRuby2Config,
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
   * Export tax rates to In folder
   */
  async exportTaxRates(
    config: VerifoneRuby2Config,
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
   * Export price book to In folder
   */
  async exportPriceBook(
    config: VerifoneRuby2Config,
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
    config: VerifoneRuby2Config,
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
    const inPath = this.getInPath(config);
    const filePath = path.join(inPath, fileName);

    // Validate path
    this.validatePath(inPath, filePath);

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
    config: VerifoneRuby2Config,
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
        sourceIdentifier: this.getOutPath(config),
        accessReason: "Ruby2 transaction file import",
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
    config: VerifoneRuby2Config,
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
        destinationIdentifier: this.getInPath(config),
        accessReason: "Ruby2 department export to POS",
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
    config: VerifoneRuby2Config,
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
        destinationIdentifier: this.getInPath(config),
        accessReason: "Ruby2 tender types export to POS",
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
    config: VerifoneRuby2Config,
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
        destinationIdentifier: this.getInPath(config),
        accessReason: "Ruby2 tax rates export to POS",
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
    config: VerifoneRuby2Config,
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
        destinationIdentifier: this.getInPath(config),
        accessReason: "Ruby2 price book export to POS",
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
    config: VerifoneRuby2Config,
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
        accessReason: `Ruby2 file import: ${fileName}`,
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
 * Create a new Verifone Ruby2 adapter instance
 */
export function createVerifoneRuby2Adapter(): VerifoneRuby2Adapter {
  return new VerifoneRuby2Adapter();
}
