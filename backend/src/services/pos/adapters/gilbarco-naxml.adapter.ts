/**
 * Gilbarco NAXML Adapter
 *
 * Implements NAXML file-based exchange for Gilbarco Passport
 * systems that use the XMLGateway folder structure.
 *
 * Supports:
 * - Reading transaction exports from BOOutbox
 * - Reading department/tender/tax-rate/cashier data from BOOutbox
 * - Writing price book updates to BOInbox
 * - Writing department/tender/tax-rate maintenance to BOInbox
 * - Sync acknowledgment handling
 *
 * @module services/pos/adapters/gilbarco-naxml.adapter
 * @see https://www.gilbarco.com/us/products/point-of-sale/passport
 * @security File paths are validated to prevent path traversal attacks
 */

import * as path from "path";
import { promises as fs } from "fs";
import { BasePOSAdapter } from "../base-adapter";
import { NAXMLService, createNAXMLService } from "../../naxml/naxml.service";
import type {
  POSConnectionConfig,
  POSConnectionTestResult,
  POSDataPreview,
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
 * Gilbarco NAXML adapter configuration
 * Extends POSConnectionConfig with NAXML-specific settings
 */
export interface GilbarcoNAXMLConfig extends POSConnectionConfig {
  /** Path to XMLGateway folder (e.g., C:\Passport\XMLGateway) */
  xmlGatewayPath: string;
  /** NAXML version to use */
  naxmlVersion: NAXMLVersion;
  /** Whether to generate acknowledgment files */
  generateAcknowledgments: boolean;
  /** Store location ID for NAXML documents */
  storeLocationId: string;
  /** Whether to archive processed files */
  archiveProcessedFiles: boolean;
  /** Archive path (optional, defaults to BOOutbox/Processed) */
  archivePath?: string;
  /** Error path (optional, defaults to BOOutbox/Error) */
  errorPath?: string;
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

export const GILBARCO_NAXML_ERROR_CODES = {
  INVALID_CONFIG: "GILBARCO_NAXML_INVALID_CONFIG",
  PATH_TRAVERSAL: "GILBARCO_NAXML_PATH_TRAVERSAL",
  DIRECTORY_NOT_FOUND: "GILBARCO_NAXML_DIRECTORY_NOT_FOUND",
  FILE_READ_ERROR: "GILBARCO_NAXML_FILE_READ_ERROR",
  FILE_WRITE_ERROR: "GILBARCO_NAXML_FILE_WRITE_ERROR",
  PARSE_ERROR: "GILBARCO_NAXML_PARSE_ERROR",
  NO_FILES_FOUND: "GILBARCO_NAXML_NO_FILES_FOUND",
} as const;

export type GilbarcoNAXMLErrorCode =
  (typeof GILBARCO_NAXML_ERROR_CODES)[keyof typeof GILBARCO_NAXML_ERROR_CODES];

/**
 * Custom error class for Gilbarco NAXML adapter errors
 */
export class GilbarcoNAXMLError extends Error {
  readonly code: GilbarcoNAXMLErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: GilbarcoNAXMLErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "GilbarcoNAXMLError";
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, GilbarcoNAXMLError.prototype);
  }
}

// ============================================================================
// Gilbarco NAXML Adapter Class
// ============================================================================

/**
 * Gilbarco NAXML Adapter
 *
 * Implements file-based NAXML exchange for Gilbarco Passport POS systems.
 * Uses the XMLGateway folder structure:
 * - BOInbox: Files TO the POS (exports from Nuvana)
 * - BOOutbox: Files FROM the POS (imports to Nuvana)
 */
export class GilbarcoNAXMLAdapter extends BasePOSAdapter {
  readonly posType: POSSystemType = "GILBARCO_NAXML";
  readonly displayName = "Gilbarco Passport (NAXML File Exchange)";

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
   * Get the BOInbox path (files TO the POS)
   */
  private getInboxPath(config: GilbarcoNAXMLConfig): string {
    return path.join(config.xmlGatewayPath, "BOInbox");
  }

  /**
   * Get the BOOutbox path (files FROM the POS)
   */
  private getOutboxPath(config: GilbarcoNAXMLConfig): string {
    return path.join(config.xmlGatewayPath, "BOOutbox");
  }

  /**
   * Get the archive path for processed files
   */
  private getArchivePath(config: GilbarcoNAXMLConfig): string {
    return (
      config.archivePath ||
      path.join(config.xmlGatewayPath, "BOOutbox", "Processed")
    );
  }

  /**
   * Get the error path for failed files
   */
  private getErrorPath(config: GilbarcoNAXMLConfig): string {
    return (
      config.errorPath || path.join(config.xmlGatewayPath, "BOOutbox", "Error")
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
      throw new GilbarcoNAXMLError(
        GILBARCO_NAXML_ERROR_CODES.PATH_TRAVERSAL,
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
   * Test connection to Gilbarco Passport via XMLGateway
   * Verifies that the XMLGateway directories exist and are accessible
   */
  async testConnection(
    config: POSConnectionConfig,
  ): Promise<POSConnectionTestResult> {
    const startTime = Date.now();
    const naxmlConfig = config as GilbarcoNAXMLConfig;

    try {
      // Validate configuration
      if (!naxmlConfig.xmlGatewayPath) {
        return {
          success: false,
          message: "XMLGateway path is not configured",
          errorCode: GILBARCO_NAXML_ERROR_CODES.INVALID_CONFIG,
        };
      }

      // Check BOInbox exists and is writable
      const inboxPath = this.getInboxPath(naxmlConfig);
      try {
        await fs.access(inboxPath, fs.constants.R_OK | fs.constants.W_OK);
      } catch {
        return {
          success: false,
          message: `BOInbox directory not accessible: ${inboxPath}`,
          errorCode: GILBARCO_NAXML_ERROR_CODES.DIRECTORY_NOT_FOUND,
        };
      }

      // Check BOOutbox exists and is readable
      const outboxPath = this.getOutboxPath(naxmlConfig);
      try {
        await fs.access(outboxPath, fs.constants.R_OK);
      } catch {
        return {
          success: false,
          message: `BOOutbox directory not accessible: ${outboxPath}`,
          errorCode: GILBARCO_NAXML_ERROR_CODES.DIRECTORY_NOT_FOUND,
        };
      }

      // Create archive/error directories if they don't exist
      if (naxmlConfig.archiveProcessedFiles) {
        await this.ensureDirectoryExists(this.getArchivePath(naxmlConfig));
        await this.ensureDirectoryExists(this.getErrorPath(naxmlConfig));
      }

      // Fetch preview data on successful connection (non-blocking)
      const preview = await this.fetchPreviewData(naxmlConfig);

      return {
        success: true,
        message: `Connected to Gilbarco Passport XMLGateway at ${naxmlConfig.xmlGatewayPath}`,
        posVersion: naxmlConfig.naxmlVersion || "3.4",
        latencyMs: Date.now() - startTime,
        preview,
      };
    } catch (error) {
      this.log("error", "Connection test failed", {
        error: error instanceof Error ? error.message : "Unknown error",
      });

      return {
        success: false,
        message: error instanceof Error ? error.message : "Connection failed",
        errorCode:
          error instanceof GilbarcoNAXMLError ? error.code : "CONNECTION_ERROR",
        latencyMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Fetch preview data from the POS for display during setup wizard.
   * This reads ALL files and returns ALL items for user selection.
   * Files are read without archiving (preview only).
   *
   * @param config - NAXML configuration
   * @returns All available departments, tenders, and tax rates for selection
   */
  private async fetchPreviewData(
    config: GilbarcoNAXMLConfig,
  ): Promise<POSDataPreview | undefined> {
    try {
      const outboxPath = this.getOutboxPath(config);
      const preview: POSDataPreview = {};

      // Fetch ALL departments from ALL matching files
      const deptFiles = await this.getXmlFiles(outboxPath, [
        "DeptMaint*.xml",
        "Department*.xml",
      ]);
      if (deptFiles.length > 0) {
        const departments: POSDepartment[] = [];
        for (const filePath of deptFiles) {
          try {
            const xml = await fs.readFile(filePath, "utf-8");
            const result = this.naxmlService.importDepartments(xml);
            if (result.success) {
              departments.push(...result.data);
            }
          } catch {
            // Skip files that fail to parse
          }
        }
        if (departments.length > 0) {
          // Return ALL items - user will select which to import
          preview.departments = {
            count: departments.length,
            items: departments.map((d) => ({
              posCode: d.posCode,
              displayName: d.displayName,
              isTaxable: d.isTaxable,
            })),
          };
        }
      }

      // Fetch ALL tender types from ALL matching files
      const tenderFiles = await this.getXmlFiles(outboxPath, [
        "TenderMaint*.xml",
        "MOP*.xml",
      ]);
      if (tenderFiles.length > 0) {
        const tenders: POSTenderType[] = [];
        for (const filePath of tenderFiles) {
          try {
            const xml = await fs.readFile(filePath, "utf-8");
            const result = this.naxmlService.importTenderTypes(xml);
            if (result.success) {
              tenders.push(...result.data);
            }
          } catch {
            // Skip files that fail to parse
          }
        }
        if (tenders.length > 0) {
          // Return ALL items - user will select which to import
          preview.tenderTypes = {
            count: tenders.length,
            items: tenders.map((t) => ({
              posCode: t.posCode,
              displayName: t.displayName,
              isElectronic: t.isElectronic,
            })),
          };
        }
      }

      // Fetch ALL tax rates from ALL matching files
      const taxFiles = await this.getXmlFiles(outboxPath, [
        "TaxMaint*.xml",
        "TaxRate*.xml",
      ]);
      if (taxFiles.length > 0) {
        const taxRates: POSTaxRate[] = [];
        for (const filePath of taxFiles) {
          try {
            const xml = await fs.readFile(filePath, "utf-8");
            const result = this.naxmlService.importTaxRates(xml);
            if (result.success) {
              taxRates.push(...result.data);
            }
          } catch {
            // Skip files that fail to parse
          }
        }
        if (taxRates.length > 0) {
          // Return ALL items - user will select which to import
          preview.taxRates = {
            count: taxRates.length,
            items: taxRates.map((t) => ({
              posCode: t.posCode,
              name: t.displayName,
              rate: t.rate,
              jurisdiction: t.jurisdictionCode,
            })),
          };
        }
      }

      // Only return preview if we have at least some data
      if (preview.departments || preview.tenderTypes || preview.taxRates) {
        return preview;
      }

      return undefined;
    } catch (error) {
      this.log("warn", "Failed to fetch preview data", {
        error: error instanceof Error ? error.message : "Unknown error",
      });
      return undefined;
    }
  }

  /**
   * Sync departments from BOOutbox
   * Reads department maintenance files from the POS
   */
  async syncDepartments(config: POSConnectionConfig): Promise<POSDepartment[]> {
    const naxmlConfig = config as GilbarcoNAXMLConfig;
    this.log("info", "Syncing departments from Passport NAXML");

    const outboxPath = this.getOutboxPath(naxmlConfig);
    const files = await this.getXmlFiles(outboxPath, [
      "DeptMaint*.xml",
      "Department*.xml",
    ]);

    if (files.length === 0) {
      this.log("warn", "No department files found in BOOutbox");
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
          if (naxmlConfig.archiveProcessedFiles) {
            await this.archiveFile(filePath, this.getArchivePath(naxmlConfig));
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
          if (naxmlConfig.archiveProcessedFiles) {
            await this.moveToError(filePath, this.getErrorPath(naxmlConfig));
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
   * Sync tender types from BOOutbox
   */
  async syncTenderTypes(config: POSConnectionConfig): Promise<POSTenderType[]> {
    const naxmlConfig = config as GilbarcoNAXMLConfig;
    this.log("info", "Syncing tender types from Passport NAXML");

    const outboxPath = this.getOutboxPath(naxmlConfig);
    const files = await this.getXmlFiles(outboxPath, [
      "TenderMaint*.xml",
      "MOP*.xml",
    ]);

    if (files.length === 0) {
      this.log("warn", "No tender type files found in BOOutbox");
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

          if (naxmlConfig.archiveProcessedFiles) {
            await this.archiveFile(filePath, this.getArchivePath(naxmlConfig));
          }
        } else {
          this.log(
            "error",
            `Failed to import tender types from ${path.basename(filePath)}`,
            {
              errors: result.errors,
            },
          );

          if (naxmlConfig.archiveProcessedFiles) {
            await this.moveToError(filePath, this.getErrorPath(naxmlConfig));
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
   * Sync cashiers from BOOutbox
   */
  async syncCashiers(config: POSConnectionConfig): Promise<POSCashier[]> {
    const naxmlConfig = config as GilbarcoNAXMLConfig;
    this.log("info", "Syncing cashiers from Passport NAXML");

    const outboxPath = this.getOutboxPath(naxmlConfig);
    const files = await this.getXmlFiles(outboxPath, [
      "EmpMaint*.xml",
      "Employee*.xml",
      "Cashier*.xml",
    ]);

    if (files.length === 0) {
      this.log("warn", "No cashier/employee files found in BOOutbox");
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

        if (naxmlConfig.archiveProcessedFiles) {
          await this.archiveFile(filePath, this.getArchivePath(naxmlConfig));
        }
      } catch (error) {
        this.log("error", `Error processing cashier file ${filePath}`, {
          error: error instanceof Error ? error.message : "Unknown error",
        });

        if (naxmlConfig.archiveProcessedFiles) {
          await this.moveToError(filePath, this.getErrorPath(naxmlConfig));
        }
      }
    }

    this.log("info", `Total cashiers synced: ${allCashiers.length}`);
    return allCashiers;
  }

  /**
   * Sync tax rates from BOOutbox
   */
  async syncTaxRates(config: POSConnectionConfig): Promise<POSTaxRate[]> {
    const naxmlConfig = config as GilbarcoNAXMLConfig;
    this.log("info", "Syncing tax rates from Passport NAXML");

    const outboxPath = this.getOutboxPath(naxmlConfig);
    const files = await this.getXmlFiles(outboxPath, [
      "TaxMaint*.xml",
      "TaxRate*.xml",
    ]);

    if (files.length === 0) {
      this.log("warn", "No tax rate files found in BOOutbox");
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

          if (naxmlConfig.archiveProcessedFiles) {
            await this.archiveFile(filePath, this.getArchivePath(naxmlConfig));
          }
        } else {
          this.log(
            "error",
            `Failed to import tax rates from ${path.basename(filePath)}`,
            {
              errors: result.errors,
            },
          );

          if (naxmlConfig.archiveProcessedFiles) {
            await this.moveToError(filePath, this.getErrorPath(naxmlConfig));
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
   * Import transactions from BOOutbox
   * Reads transaction log files (TLog*.xml) from the POS
   */
  async importTransactions(
    config: GilbarcoNAXMLConfig,
  ): Promise<FileImportResult<POSTransaction>[]> {
    this.log("info", "Importing transactions from Passport NAXML");

    const outboxPath = this.getOutboxPath(config);
    const files = await this.getXmlFiles(outboxPath, [
      "TLog*.xml",
      "Trans*.xml",
    ]);

    if (files.length === 0) {
      this.log("info", "No transaction files found in BOOutbox");
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
   * Export departments to BOInbox
   */
  async exportDepartments(
    config: GilbarcoNAXMLConfig,
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
   * Export tender types to BOInbox
   */
  async exportTenderTypes(
    config: GilbarcoNAXMLConfig,
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
   * Export tax rates to BOInbox
   */
  async exportTaxRates(
    config: GilbarcoNAXMLConfig,
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
   * Export price book to BOInbox
   */
  async exportPriceBook(
    config: GilbarcoNAXMLConfig,
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
    config: GilbarcoNAXMLConfig,
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
    const inboxPath = this.getInboxPath(config);
    const filePath = path.join(inboxPath, fileName);

    // Validate path
    this.validatePath(inboxPath, filePath);

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
  // Acknowledgment Handling
  // ============================================================================

  /**
   * Check for acknowledgment files in BOOutbox
   */
  async checkAcknowledgments(
    config: GilbarcoNAXMLConfig,
  ): Promise<AcknowledgmentResult[]> {
    const outboxPath = this.getOutboxPath(config);
    const files = await this.getXmlFiles(outboxPath, ["Ack*.xml", "*_Ack.xml"]);

    const results: AcknowledgmentResult[] = [];

    for (const filePath of files) {
      try {
        const xml = await fs.readFile(filePath, "utf-8");
        const document = this.naxmlService.parse(xml);

        // Extract acknowledgment data
        const ackData = document.data as Record<string, unknown>;

        results.push({
          documentId: String(ackData.originalDocumentId || ""),
          documentType: String(ackData.originalDocumentType || ""),
          status:
            (ackData.status as AcknowledgmentResult["status"]) || "Received",
          recordsProcessed: Number(ackData.recordsProcessed || 0),
          recordsFailed: Number(ackData.recordsFailed || 0),
          errors: Array.isArray(ackData.errors)
            ? ackData.errors.map((e: unknown) => String(e))
            : [],
          ackFilePath: filePath,
        });

        // Archive acknowledgment file
        if (config.archiveProcessedFiles) {
          await this.archiveFile(filePath, this.getArchivePath(config));
        }
      } catch (error) {
        this.log("error", `Error processing acknowledgment file ${filePath}`, {
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    return results;
  }

  // ============================================================================
  // Audited Operations (with full audit trail)
  // ============================================================================

  /**
   * Import transactions with full audit trail
   * MANDATORY: Use this method for production transaction imports
   *
   * @param config - Gilbarco NAXML configuration
   * @param context - Store context for audit tracking
   * @returns Array of import results with audit tracking
   */
  async importTransactionsWithAudit(
    config: GilbarcoNAXMLConfig,
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
        sourceIdentifier: this.getOutboxPath(config),
        accessReason: "NAXML transaction file import",
        containsFinancial: true,
        getRecordCount: (results) =>
          results.reduce((sum, r) => sum + r.recordCount, 0),
      },
    );
  }

  /**
   * Export departments with full audit trail
   *
   * @param config - Gilbarco NAXML configuration
   * @param context - Store context for audit tracking
   * @param departments - Departments to export
   * @param maintenanceType - Full or Incremental
   */
  async exportDepartmentsWithAudit(
    config: GilbarcoNAXMLConfig,
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
        destinationIdentifier: this.getInboxPath(config),
        accessReason: "NAXML department export to POS",
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
    config: GilbarcoNAXMLConfig,
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
        destinationIdentifier: this.getInboxPath(config),
        accessReason: "NAXML tender types export to POS",
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
    config: GilbarcoNAXMLConfig,
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
        destinationIdentifier: this.getInboxPath(config),
        accessReason: "NAXML tax rates export to POS",
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
    config: GilbarcoNAXMLConfig,
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
        destinationIdentifier: this.getInboxPath(config),
        accessReason: "NAXML price book export to POS",
        getRecordCount: (result) => result.recordCount,
        getDataSize: (result) => result.fileSizeBytes,
        getFileHash: (result) => result.fileHash,
      },
    );
  }

  /**
   * Process a single file with full audit trail
   * Use this for manual file imports from the file watcher
   */
  async processFileWithAudit(
    filePath: string,
    config: GilbarcoNAXMLConfig,
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
        accessReason: `NAXML file import: ${fileName}`,
        containsFinancial: dataCategory === "TRANSACTION",
        metadata: { fileName },
        getRecordCount: (result) => result.recordCount,
        // Data size is calculated from the import result context
        getDataSize: () => 0, // File size handled in audit context
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
 * Create a new Gilbarco NAXML adapter instance
 */
export function createGilbarcoNAXMLAdapter(): GilbarcoNAXMLAdapter {
  return new GilbarcoNAXMLAdapter();
}
