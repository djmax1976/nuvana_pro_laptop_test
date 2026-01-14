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
  POSTransactionPayment,
  POSAdapterCapabilities,
  POSFuelSalesSummary,
  POSFuelGradeSales,
  POSFuelTenderSales,
  POSPJRTransaction,
  POSPJRLineItem,
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
  /**
   * Path to XMLGateway folder (e.g., C:\Passport\XMLGateway)
   * Can also be the direct path to BOOutbox if exportPath/importPath are set
   */
  xmlGatewayPath: string;
  /**
   * Direct path to BOOutbox (POS exports here, Nuvana reads)
   * If set, this overrides xmlGatewayPath + "/BOOutbox"
   */
  exportPath?: string;
  /**
   * Direct path to BOInbox (Nuvana writes here, POS reads)
   * If set, this overrides xmlGatewayPath + "/BOInbox"
   */
  importPath?: string;
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
   * Uses importPath if set, otherwise falls back to xmlGatewayPath + "/BOInbox"
   */
  private getInboxPath(config: GilbarcoNAXMLConfig): string {
    if (config.importPath) {
      return config.importPath;
    }
    return path.join(config.xmlGatewayPath, "BOInbox");
  }

  /**
   * Get the BOOutbox path (files FROM the POS)
   * Uses exportPath if set, otherwise falls back to xmlGatewayPath + "/BOOutbox"
   */
  private getOutboxPath(config: GilbarcoNAXMLConfig): string {
    if (config.exportPath) {
      return config.exportPath;
    }
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
   * Gilbarco Passport uses Movement Report files (not Maintenance files):
   * - MCM*.xml (MerchandiseCodeMovement) - Departments/merchandise codes
   * - MSM*.xml (MiscellaneousSummaryMovement) - Tender types
   * - TLM*.xml (TaxLevelMovement) - Tax levels
   * - PJR*.xml (POSJournal) - Individual transactions with embedded data
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

      // Fetch departments from MCM (MerchandiseCodeMovement) and PJR (POSJournal) files
      const departments = await this.extractDepartmentsFromFiles(outboxPath);
      if (departments.length > 0) {
        // Deduplicate by posCode
        const uniqueDepts = this.deduplicateByKey(departments, "posCode");
        preview.departments = {
          count: uniqueDepts.length,
          items: uniqueDepts.map((d) => ({
            posCode: d.posCode,
            displayName: d.displayName,
            isTaxable: d.isTaxable,
          })),
        };
      }

      // Fetch tender types from MSM (MiscellaneousSummaryMovement) and PJR files
      const tenders = await this.extractTendersFromFiles(outboxPath);
      if (tenders.length > 0) {
        // Deduplicate by posCode
        const uniqueTenders = this.deduplicateByKey(tenders, "posCode");
        preview.tenderTypes = {
          count: uniqueTenders.length,
          items: uniqueTenders.map((t) => ({
            posCode: t.posCode,
            displayName: t.displayName,
            isElectronic: t.isElectronic,
          })),
        };
      }

      // Fetch tax rates from TLM (TaxLevelMovement) files
      const taxRates = await this.extractTaxRatesFromFiles(outboxPath);
      if (taxRates.length > 0) {
        // Deduplicate by posCode
        const uniqueTaxRates = this.deduplicateByKey(taxRates, "posCode");
        preview.taxRates = {
          count: uniqueTaxRates.length,
          items: uniqueTaxRates.map((t) => ({
            posCode: t.posCode,
            name: t.displayName,
            rate: t.rate,
            jurisdiction: t.jurisdictionCode,
          })),
        };
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
   * Deduplicate array by a key property
   * @security Uses Map for O(n) deduplication without injection risk
   */
  private deduplicateByKey<T, K extends keyof T>(items: T[], key: K): T[] {
    const seen = new Map<T[K], T>();
    for (const item of items) {
      const keyValue = item[key];
      if (!seen.has(keyValue)) {
        seen.set(keyValue, item);
      }
    }
    return Array.from(seen.values());
  }

  /**
   * Extract departments from MCM and PJR files
   * @security File paths validated via getXmlFiles
   */
  private async extractDepartmentsFromFiles(
    outboxPath: string,
  ): Promise<POSDepartment[]> {
    const departments: POSDepartment[] = [];

    // Extract from MCM (MerchandiseCodeMovement) files
    const mcmFiles = await this.getXmlFiles(outboxPath, ["MCM*.xml"]);
    for (const filePath of mcmFiles) {
      try {
        const xml = await fs.readFile(filePath, "utf-8");
        const extracted = this.extractDepartmentsFromMCM(xml);
        departments.push(...extracted);
      } catch {
        // Skip files that fail to parse
      }
    }

    // Also extract from PJR (POSJournal) transaction files
    const pjrFiles = await this.getXmlFiles(outboxPath, ["PJR*.xml"]);
    // Limit to most recent 50 files to avoid excessive processing
    const recentPjrFiles = pjrFiles.slice(-50);
    for (const filePath of recentPjrFiles) {
      try {
        const xml = await fs.readFile(filePath, "utf-8");
        const extracted = this.extractDepartmentsFromPJR(xml);
        departments.push(...extracted);
      } catch {
        // Skip files that fail to parse
      }
    }

    return departments;
  }

  /**
   * Extract tender types from MSM and PJR files
   * @security File paths validated via getXmlFiles
   */
  private async extractTendersFromFiles(
    outboxPath: string,
  ): Promise<POSTenderType[]> {
    const tenders: POSTenderType[] = [];

    // Extract from MSM (MiscellaneousSummaryMovement) files
    const msmFiles = await this.getXmlFiles(outboxPath, ["MSM*.xml"]);
    for (const filePath of msmFiles) {
      try {
        const xml = await fs.readFile(filePath, "utf-8");
        const extracted = this.extractTendersFromMSM(xml);
        tenders.push(...extracted);
      } catch {
        // Skip files that fail to parse
      }
    }

    // Also extract from PJR (POSJournal) transaction files
    const pjrFiles = await this.getXmlFiles(outboxPath, ["PJR*.xml"]);
    // Limit to most recent 50 files to avoid excessive processing
    const recentPjrFiles = pjrFiles.slice(-50);
    for (const filePath of recentPjrFiles) {
      try {
        const xml = await fs.readFile(filePath, "utf-8");
        const extracted = this.extractTendersFromPJR(xml);
        tenders.push(...extracted);
      } catch {
        // Skip files that fail to parse
      }
    }

    return tenders;
  }

  /**
   * Extract tax rates from TLM files
   * @security File paths validated via getXmlFiles
   */
  private async extractTaxRatesFromFiles(
    outboxPath: string,
  ): Promise<POSTaxRate[]> {
    const taxRates: POSTaxRate[] = [];

    // Extract from TLM (TaxLevelMovement) files
    const tlmFiles = await this.getXmlFiles(outboxPath, ["TLM*.xml"]);
    for (const filePath of tlmFiles) {
      try {
        const xml = await fs.readFile(filePath, "utf-8");
        const extracted = this.extractTaxRatesFromTLM(xml);
        taxRates.push(...extracted);
      } catch {
        // Skip files that fail to parse
      }
    }

    return taxRates;
  }

  /**
   * Extract departments from MCM (MerchandiseCodeMovement) XML
   * MCM files contain MCMDetail elements with MerchandiseCode and MerchandiseCodeDescription
   * @security Uses DOM parsing, no string interpolation
   */
  private extractDepartmentsFromMCM(xml: string): POSDepartment[] {
    const departments: POSDepartment[] = [];

    try {
      const document = this.naxmlService.parse(xml);
      const data = document.data as Record<string, unknown>;
      const mcmMovement = data.MerchandiseCodeMovement as Record<
        string,
        unknown
      >;
      if (!mcmMovement) return [];

      const mcmDetails = this.ensureArray(mcmMovement.MCMDetail);
      for (const detail of mcmDetails) {
        const detailRecord = detail as Record<string, unknown>;
        const code = String(detailRecord.MerchandiseCode || "");
        const description = String(
          detailRecord.MerchandiseCodeDescription || "",
        );

        if (code) {
          departments.push({
            posCode: code,
            displayName: description || `Department ${code}`,
            description: description,
            isTaxable: true, // Default, MCM doesn't specify taxability
            isLottery: this.isLotteryDepartment(code, description),
            isActive: true,
          });
        }
      }
    } catch {
      // Parse error, return empty
    }

    return departments;
  }

  /**
   * Extract departments from PJR (POSJournal) transaction XML
   * PJR files contain MerchandiseCodeLine elements within SaleEvent elements
   * Structure: NAXML-POSJournal > JournalReport > SaleEvent > TransactionDetailGroup > TransactionLine > MerchandiseCodeLine
   * @security Uses DOM parsing, no string interpolation
   */
  private extractDepartmentsFromPJR(xml: string): POSDepartment[] {
    const departments: POSDepartment[] = [];

    try {
      const document = this.naxmlService.parse(xml);
      const data = document.data as Record<string, unknown>;

      // PJR files have JournalReport at root level after parsing
      const journalReport = (data.JournalReport || data) as Record<
        string,
        unknown
      >;

      // Look for SaleEvent elements (actual transaction events)
      const saleEvents = this.ensureArray(journalReport.SaleEvent);
      for (const event of saleEvents) {
        const eventRecord = event as Record<string, unknown>;

        // TransactionDetailGroup contains TransactionLine elements
        const detailGroup = eventRecord.TransactionDetailGroup as Record<
          string,
          unknown
        >;
        if (!detailGroup) continue;

        const transactionLines = this.ensureArray(detailGroup.TransactionLine);
        for (const txLine of transactionLines) {
          const line = txLine as Record<string, unknown>;

          // MerchandiseCodeLine contains department info
          const merchandiseCodeLine = line.MerchandiseCodeLine as Record<
            string,
            unknown
          >;
          if (!merchandiseCodeLine) continue;

          const code = String(merchandiseCodeLine.MerchandiseCode || "");
          const description = String(merchandiseCodeLine.Description || "");

          if (code) {
            departments.push({
              posCode: code,
              displayName: description || `Department ${code}`,
              description: description,
              isTaxable: true,
              isLottery: this.isLotteryDepartment(code, description),
              isActive: true,
            });
          }
        }
      }
    } catch {
      // Parse error, return empty
    }

    return departments;
  }

  /**
   * Determine if a department is lottery-related based on code or description
   */
  private isLotteryDepartment(code: string, description: string): boolean {
    const lotteryIndicators = [
      "lottery",
      "lotto",
      "scratch",
      "ticket",
      "powerball",
      "megamillion",
    ];
    const lowerDesc = description.toLowerCase();
    const lowerCode = code.toLowerCase();

    return lotteryIndicators.some(
      (indicator) =>
        lowerDesc.includes(indicator) || lowerCode.includes(indicator),
    );
  }

  /**
   * Extract tender types from MSM (MiscellaneousSummaryMovement) XML
   * MSM files contain MSMDetail elements with Tender sub-elements
   * @security Uses DOM parsing, no string interpolation
   */
  private extractTendersFromMSM(xml: string): POSTenderType[] {
    const tenders: POSTenderType[] = [];

    try {
      const document = this.naxmlService.parse(xml);
      const data = document.data as Record<string, unknown>;
      const msmMovement = data.MiscellaneousSummaryMovement as Record<
        string,
        unknown
      >;
      if (!msmMovement) return [];

      const msmDetails = this.ensureArray(msmMovement.MSMDetail);
      for (const detailItem of msmDetails) {
        const detail = detailItem as Record<string, unknown>;
        const salesTotals = detail.MSMSalesTotals as Record<string, unknown>;
        if (!salesTotals) continue;

        // Tender is always an array due to parser configuration
        const tenderItems = this.ensureArray(salesTotals.Tender);
        for (const tender of tenderItems) {
          const tenderRecord = tender as Record<string, unknown>;
          if (!tenderRecord) continue;

          const tenderCode = String(tenderRecord.TenderCode || "").trim();
          const tenderSubCode = String(tenderRecord.TenderSubCode || "").trim();

          if (tenderCode) {
            const posCode = tenderSubCode
              ? `${tenderCode}:${tenderSubCode}`
              : tenderCode;
            const displayName = this.formatTenderDisplayName(
              tenderCode,
              tenderSubCode,
            );
            const isElectronic = this.isElectronicTender(tenderCode);

            tenders.push({
              posCode,
              displayName,
              isElectronic,
              isCashEquivalent: tenderCode === "cash",
              affectsCashDrawer:
                tenderCode === "cash" || tenderCode === "check",
              requiresReference: isElectronic,
              isActive: true,
            });
          }
        }
      }
    } catch {
      // Parse error, return empty
    }

    return tenders;
  }

  /**
   * Extract tender types from PJR (POSJournal) transaction XML
   * Structure: NAXML-POSJournal > JournalReport > SaleEvent > TransactionDetailGroup > TransactionLine > TenderInfo > Tender
   * @security Uses DOM parsing, no string interpolation
   */
  private extractTendersFromPJR(xml: string): POSTenderType[] {
    const tenders: POSTenderType[] = [];

    try {
      const document = this.naxmlService.parse(xml);
      const data = document.data as Record<string, unknown>;

      // PJR files have JournalReport at root level after parsing
      const journalReport = (data.JournalReport || data) as Record<
        string,
        unknown
      >;

      // Look for SaleEvent elements
      const saleEvents = this.ensureArray(journalReport.SaleEvent);
      for (const event of saleEvents) {
        const eventRecord = event as Record<string, unknown>;

        // TransactionDetailGroup contains TransactionLine elements
        const detailGroup = eventRecord.TransactionDetailGroup as Record<
          string,
          unknown
        >;
        if (!detailGroup) continue;

        const transactionLines = this.ensureArray(detailGroup.TransactionLine);
        for (const txLine of transactionLines) {
          const line = txLine as Record<string, unknown>;

          // TenderInfo contains Tender with TenderCode
          const tenderInfo = line.TenderInfo as Record<string, unknown>;
          if (!tenderInfo) continue;

          // Tender can be an array or single object
          const tenderItems = this.ensureArray(tenderInfo.Tender);
          for (const tenderItem of tenderItems) {
            const tender = tenderItem as Record<string, unknown>;
            if (!tender) continue;

            const tenderCode = String(tender.TenderCode || "").trim();
            const tenderSubCode = String(tender.TenderSubCode || "").trim();

            if (tenderCode) {
              const posCode = tenderSubCode
                ? `${tenderCode}:${tenderSubCode}`
                : tenderCode;
              const displayName = this.formatTenderDisplayName(
                tenderCode,
                tenderSubCode,
              );
              const isElectronic = this.isElectronicTender(tenderCode);

              tenders.push({
                posCode,
                displayName,
                isElectronic,
                isCashEquivalent: tenderCode === "cash",
                affectsCashDrawer:
                  tenderCode === "cash" || tenderCode === "check",
                requiresReference: isElectronic,
                isActive: true,
              });
            }
          }
        }
      }
    } catch {
      // Parse error, return empty
    }

    return tenders;
  }

  /**
   * Extract tax rates from TLM (TaxLevelMovement) XML
   * TLM files contain TLMDetail elements with TaxLevelID
   * @security Uses DOM parsing, no string interpolation
   */
  private extractTaxRatesFromTLM(xml: string): POSTaxRate[] {
    const taxRates: POSTaxRate[] = [];

    try {
      const document = this.naxmlService.parse(xml);
      const data = document.data as Record<string, unknown>;
      const tlmMovement = data.TaxLevelMovement as Record<string, unknown>;
      if (!tlmMovement) return [];

      const tlmDetails = this.ensureArray(tlmMovement.TLMDetail);
      for (const detailItem of tlmDetails) {
        const detail = detailItem as Record<string, unknown>;
        const taxLevelId = String(detail.TaxLevelID || "");
        const taxableSalesAmount = Number(detail.TaxableSalesAmount || 0);
        const taxCollectedAmount = Number(detail.TaxCollectedAmount || 0);

        if (taxLevelId) {
          // Calculate effective tax rate if we have taxable sales
          let rate = 0;
          if (taxableSalesAmount > 0 && taxCollectedAmount > 0) {
            rate = (taxCollectedAmount / taxableSalesAmount) * 100;
          }

          taxRates.push({
            posCode: taxLevelId,
            displayName: `Tax Level ${taxLevelId}`,
            rate: Math.round(rate * 1000) / 1000, // Round to 3 decimal places
            jurisdictionCode: undefined,
            isActive: true,
          });
        }
      }
    } catch {
      // Parse error, return empty
    }

    return taxRates;
  }

  /**
   * Format tender display name from code and subcode
   */
  private formatTenderDisplayName(code: string, subCode: string): string {
    const codeMap: Record<string, string> = {
      cash: "Cash",
      outsideCredit: "Outside Credit",
      outsideDebit: "Outside Debit",
      insideCredit: "Inside Credit",
      insideDebit: "Inside Debit",
      houseCharges: "House Charges",
      fleet: "Fleet",
      foodStamps: "Food Stamps",
      check: "Check",
    };

    const baseName = codeMap[code] || code;
    if (subCode && subCode !== "generic") {
      return `${baseName} (${subCode})`;
    }
    return baseName;
  }

  /**
   * Determine if tender is electronic based on code
   */
  private isElectronicTender(code: string): boolean {
    const electronicCodes = [
      "outsideCredit",
      "outsideDebit",
      "insideCredit",
      "insideDebit",
      "fleet",
    ];
    return electronicCodes.includes(code);
  }

  /**
   * Ensure value is an array
   */
  private ensureArray<T>(value: T | T[] | undefined): T[] {
    if (!value) return [];
    return Array.isArray(value) ? value : [value];
  }

  /**
   * Sync departments from BOOutbox
   * Reads MCM (MerchandiseCodeMovement) and PJR (POSJournal) files from Gilbarco Passport
   *
   * Gilbarco Passport exports department data in:
   * - MCM*.xml (MerchandiseCodeMovement) - Summary of merchandise code sales
   * - PJR*.xml (POSJournal) - Individual transactions with MerchandiseCodeLine
   *
   * @security File paths validated via getXmlFiles to prevent path traversal
   */
  async syncDepartments(config: POSConnectionConfig): Promise<POSDepartment[]> {
    const naxmlConfig = config as GilbarcoNAXMLConfig;
    this.log("info", "Syncing departments from Passport NAXML (MCM/PJR files)");

    const outboxPath = this.getOutboxPath(naxmlConfig);

    // Extract departments from all available sources
    const allDepartments = await this.extractDepartmentsFromFiles(outboxPath);

    if (allDepartments.length === 0) {
      this.log("warn", "No departments found in MCM or PJR files in BOOutbox");
      return [];
    }

    // Deduplicate by posCode
    const uniqueDepartments = this.deduplicateByKey(allDepartments, "posCode");

    this.log(
      "info",
      `Total unique departments synced: ${uniqueDepartments.length}`,
    );
    return uniqueDepartments;
  }

  /**
   * Sync tender types from BOOutbox
   * Reads MSM (MiscellaneousSummaryMovement) and PJR (POSJournal) files from Gilbarco Passport
   *
   * Gilbarco Passport exports tender data in:
   * - MSM*.xml (MiscellaneousSummaryMovement) - Contains Tender elements with TenderCode/TenderSubCode
   * - PJR*.xml (POSJournal) - Individual transactions with TenderInfo
   *
   * @security File paths validated via getXmlFiles to prevent path traversal
   */
  async syncTenderTypes(config: POSConnectionConfig): Promise<POSTenderType[]> {
    const naxmlConfig = config as GilbarcoNAXMLConfig;
    this.log(
      "info",
      "Syncing tender types from Passport NAXML (MSM/PJR files)",
    );

    const outboxPath = this.getOutboxPath(naxmlConfig);

    // Extract tenders from all available sources
    const allTenders = await this.extractTendersFromFiles(outboxPath);

    if (allTenders.length === 0) {
      this.log("warn", "No tender types found in MSM or PJR files in BOOutbox");
      return [];
    }

    // Deduplicate by posCode
    const uniqueTenders = this.deduplicateByKey(allTenders, "posCode");

    this.log(
      "info",
      `Total unique tender types synced: ${uniqueTenders.length}`,
    );
    return uniqueTenders;
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
   * Reads TLM (TaxLevelMovement) files from Gilbarco Passport
   *
   * Gilbarco Passport exports tax data in:
   * - TLM*.xml (TaxLevelMovement) - Contains TLMDetail elements with TaxLevelID
   *
   * @security File paths validated via getXmlFiles to prevent path traversal
   */
  async syncTaxRates(config: POSConnectionConfig): Promise<POSTaxRate[]> {
    const naxmlConfig = config as GilbarcoNAXMLConfig;
    this.log("info", "Syncing tax rates from Passport NAXML (TLM files)");

    const outboxPath = this.getOutboxPath(naxmlConfig);

    // Extract tax rates from TLM files
    const allTaxRates = await this.extractTaxRatesFromFiles(outboxPath);

    if (allTaxRates.length === 0) {
      this.log("warn", "No tax rates found in TLM files in BOOutbox");
      return [];
    }

    // Deduplicate by posCode
    const uniqueTaxRates = this.deduplicateByKey(allTaxRates, "posCode");

    this.log("info", `Total unique tax rates synced: ${uniqueTaxRates.length}`);
    return uniqueTaxRates;
  }

  // ============================================================================
  // Fuel Sales Sync Methods
  // ============================================================================

  /**
   * Sync fuel sales from FGM (Fuel Grade Movement) files
   * Returns fuel sales aggregated by business date
   *
   * @security File paths validated via getXmlFiles to prevent path traversal
   */
  async syncFuelSales(
    config: POSConnectionConfig,
  ): Promise<POSFuelSalesSummary[]> {
    const naxmlConfig = config as GilbarcoNAXMLConfig;
    this.log("info", "Syncing fuel sales from Passport NAXML (FGM files)");

    const outboxPath = this.getOutboxPath(naxmlConfig);

    // Get FGM files from main BOOutbox folder
    const mainFiles = await this.getXmlFiles(outboxPath, ["FGM*.xml"]);

    // Also check the Processed folder for already-processed FGM files
    // This ensures we capture all historical data including files that were
    // moved after initial processing
    const processedPath = path.join(outboxPath, "Processed");
    let processedFiles: string[] = [];
    try {
      const processedExists = await fs
        .access(processedPath)
        .then(() => true)
        .catch(() => false);
      if (processedExists) {
        processedFiles = await this.getXmlFiles(processedPath, ["FGM*.xml"]);
      }
    } catch {
      // Processed folder doesn't exist or not accessible, continue with main files only
    }

    const files = [...mainFiles, ...processedFiles];

    if (files.length === 0) {
      this.log("info", "No FGM files found in BOOutbox or Processed folder");
      return [];
    }

    // Aggregate by business date
    const dateAggregates = new Map<
      string,
      {
        totalSalesAmount: number;
        totalVolume: number;
        byGrade: Map<string, POSFuelGradeSales>;
        byTender: Map<string, POSFuelTenderSales>;
        files: string[];
      }
    >();

    for (const filePath of files) {
      try {
        const xml = await fs.readFile(filePath, "utf-8");
        const result = this.extractFuelSalesFromFGM(xml);

        if (result) {
          const existing = dateAggregates.get(result.businessDate) || {
            totalSalesAmount: 0,
            totalVolume: 0,
            byGrade: new Map<string, POSFuelGradeSales>(),
            byTender: new Map<string, POSFuelTenderSales>(),
            files: [],
          };

          existing.totalSalesAmount += result.totalSalesAmount;
          existing.totalVolume += result.totalVolume;
          existing.files.push(filePath);

          // Merge grade data
          for (const grade of result.byGrade) {
            const existingGrade = existing.byGrade.get(grade.gradeId);
            if (existingGrade) {
              existingGrade.salesAmount += grade.salesAmount;
              existingGrade.volume += grade.volume;
              existingGrade.discountAmount =
                (existingGrade.discountAmount || 0) +
                (grade.discountAmount || 0);
            } else {
              existing.byGrade.set(grade.gradeId, { ...grade });
            }
          }

          // Merge tender data
          for (const tender of result.byTender) {
            const key = `${tender.tenderCode}:${tender.tenderSubCode || ""}`;
            const existingTender = existing.byTender.get(key);
            if (existingTender) {
              existingTender.salesAmount += tender.salesAmount;
              existingTender.volume += tender.volume;
            } else {
              existing.byTender.set(key, { ...tender });
            }
          }

          dateAggregates.set(result.businessDate, existing);
        }
      } catch (error) {
        this.log("error", `Error processing FGM file ${filePath}`, {
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    // Convert to array
    const summaries: POSFuelSalesSummary[] = [];
    for (const [businessDate, data] of dateAggregates.entries()) {
      summaries.push({
        businessDate,
        totalSalesAmount: data.totalSalesAmount,
        totalVolume: data.totalVolume,
        byGrade: Array.from(data.byGrade.values()),
        byTender: Array.from(data.byTender.values()),
      });
    }

    this.log(
      "info",
      `Processed ${files.length} FGM files, ${summaries.length} business dates`,
    );
    return summaries;
  }

  /**
   * Extract fuel sales data from a single FGM XML file
   * @security Uses DOM parsing, no string interpolation
   * @note NAXMLService normalizes keys to camelCase
   */
  private extractFuelSalesFromFGM(xml: string): POSFuelSalesSummary | null {
    try {
      const document = this.naxmlService.parse(xml);
      const data = document.data as Record<string, unknown>;

      // Get movementHeader for business date (camelCase from NAXMLService)
      const movementHeader = data.movementHeader as Record<string, unknown>;
      if (!movementHeader?.businessDate) {
        return null;
      }

      // IMPORTANT: Gilbarco FGM businessDate is the PERIOD START date (11:59 PM)
      // The actual sales day is the NEXT calendar day when the period ends
      // Example: businessDate="2026-01-08" means period Jan 8 11:59 PM → Jan 9 11:59 PM
      // So the sales belong to January 9th, not January 8th
      const rawBusinessDate = new Date(String(movementHeader.businessDate));
      rawBusinessDate.setDate(rawBusinessDate.getDate() + 1);
      const businessDate = rawBusinessDate.toISOString().split("T")[0];
      let totalSalesAmount = 0;
      let totalVolume = 0;
      const byGrade: POSFuelGradeSales[] = [];
      const byTender: POSFuelTenderSales[] = [];

      // Process fgmDetails elements (camelCase from NAXMLService)
      const fgmDetails = this.ensureArray(data.fgmDetails);

      // All property names are camelCase from NAXMLService parser
      for (const detail of fgmDetails) {
        const detailRecord = detail as Record<string, unknown>;
        const gradeId = String(detailRecord.fuelGradeId || "");

        // Check for fgmTenderSummary (Period 2 - by tender breakdown)
        const tenderSummary = detailRecord.fgmTenderSummary as Record<
          string,
          unknown
        >;
        if (tenderSummary) {
          const tender = tenderSummary.tender as Record<string, unknown>;
          const tenderCode = String(tender?.tenderCode || "");
          const tenderSubCode = String(tender?.tenderSubCode || "");

          const sellPriceSummary = tenderSummary.fgmSellPriceSummary as Record<
            string,
            unknown
          >;
          const unitPrice = parseFloat(
            String(sellPriceSummary?.actualSalesPrice || "0"),
          );

          const serviceLevelSummary =
            sellPriceSummary?.fgmServiceLevelSummary as Record<string, unknown>;
          const salesTotals = serviceLevelSummary?.fgmSalesTotals as Record<
            string,
            unknown
          >;

          if (salesTotals) {
            const salesAmount = parseFloat(
              String(salesTotals.fuelGradeSalesAmount || "0"),
            );
            const volume = parseFloat(
              String(salesTotals.fuelGradeSalesVolume || "0"),
            );
            const discountAmount = parseFloat(
              String(salesTotals.discountAmount || "0"),
            );

            totalSalesAmount += salesAmount;
            totalVolume += volume;

            // Add to byGrade
            byGrade.push({
              gradeId,
              salesAmount,
              volume,
              unitPrice,
              discountAmount,
            });

            // Add to byTender
            if (tenderCode) {
              byTender.push({
                tenderCode,
                tenderSubCode,
                salesAmount,
                volume,
              });
            }
          }
        }

        // Check for fgmPositionSummary (Period 98 - by position)
        const positionSummary = detailRecord.fgmPositionSummary as Record<
          string,
          unknown
        >;
        if (positionSummary) {
          const priceTierSummaries = this.ensureArray(
            positionSummary.fgmPriceTierSummary,
          );
          for (const tier of priceTierSummaries) {
            const tierRecord = tier as Record<string, unknown>;
            const salesTotals = tierRecord.fgmSalesTotals as Record<
              string,
              unknown
            >;
            if (salesTotals) {
              const salesAmount = parseFloat(
                String(salesTotals.fuelGradeSalesAmount || "0"),
              );
              const volume = parseFloat(
                String(salesTotals.fuelGradeSalesVolume || "0"),
              );

              totalSalesAmount += salesAmount;
              totalVolume += volume;

              byGrade.push({
                gradeId,
                salesAmount,
                volume,
              });
            }
          }
        }
      }

      // Only return if we have actual sales data
      if (totalSalesAmount > 0 || totalVolume > 0) {
        return {
          businessDate,
          totalSalesAmount,
          totalVolume,
          byGrade,
          byTender,
        };
      }

      return null;
    } catch {
      return null;
    }
  }

  // ============================================================================
  // Transaction Import Methods
  // ============================================================================

  /**
   * Import transactions from BOOutbox
   * Reads PJR (POSJournal) files from Gilbarco Passport
   *
   * Gilbarco Passport exports transactions in:
   * - PJR*.xml (POSJournal) - Individual transaction records
   *
   * @security File paths validated via getXmlFiles to prevent path traversal
   */
  async importTransactions(
    config: GilbarcoNAXMLConfig,
  ): Promise<FileImportResult<POSTransaction>[]> {
    this.log("info", "Importing transactions from Passport NAXML (PJR files)");

    const outboxPath = this.getOutboxPath(config);
    const files = await this.getXmlFiles(outboxPath, ["PJR*.xml"]);

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
  // PJR Transaction Extraction (Phase 5.6)
  // ============================================================================

  /**
   * Extract complete transaction data from PJR (POSJournal) files
   * Parses ALL fields from PJR files for database storage
   *
   * Scans both main BOOutbox folder and Processed subfolder to capture
   * all transactions including historically processed files.
   *
   * @param config - Gilbarco NAXML configuration
   * @param businessDateFilter - Optional: Only extract transactions for specific date (YYYY-MM-DD)
   * @returns Array of complete PJR transaction objects with all fields
   *
   * @security File paths validated via getXmlFiles to prevent path traversal
   * @enterprise Full data capture for compliance and audit trail
   */
  async extractPJRTransactions(
    config: GilbarcoNAXMLConfig,
    businessDateFilter?: string,
  ): Promise<POSPJRTransaction[]> {
    this.log(
      "info",
      `Extracting PJR transactions${businessDateFilter ? ` for ${businessDateFilter}` : ""}`,
    );

    const outboxPath = this.getOutboxPath(config);

    // Get PJR files from main BOOutbox folder
    const mainFiles = await this.getXmlFiles(outboxPath, ["PJR*.xml"]);

    // Also check Processed folder for already-processed files
    const processedPath = path.join(outboxPath, "Processed");
    let processedFiles: string[] = [];
    try {
      const processedExists = await fs
        .access(processedPath)
        .then(() => true)
        .catch(() => false);
      if (processedExists) {
        processedFiles = await this.getXmlFiles(processedPath, ["PJR*.xml"]);
      }
    } catch {
      // Processed folder doesn't exist, continue with main files only
    }

    const allFiles = [...mainFiles, ...processedFiles];

    if (allFiles.length === 0) {
      this.log("info", "No PJR files found in BOOutbox or Processed folder");
      return [];
    }

    this.log("info", `Found ${allFiles.length} PJR files to process`);

    const transactions: POSPJRTransaction[] = [];
    let processedCount = 0;
    let errorCount = 0;

    for (const filePath of allFiles) {
      try {
        const xml = await fs.readFile(filePath, "utf-8");
        const fileHash = this.naxmlService.calculateHash(xml);

        const transaction = this.parsePJRTransaction(xml, filePath, fileHash);

        if (transaction) {
          // Apply business date filter if specified
          if (
            businessDateFilter &&
            transaction.businessDate !== businessDateFilter
          ) {
            continue;
          }

          transactions.push(transaction);
          processedCount++;
        }
      } catch (error) {
        errorCount++;
        this.log("warn", `Error parsing PJR file ${path.basename(filePath)}`, {
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    this.log(
      "info",
      `PJR extraction complete: ${processedCount} transactions, ${errorCount} errors`,
    );

    return transactions;
  }

  /**
   * Parse a single PJR XML file into a POSPJRTransaction object
   * Captures ALL fields from the PJR file for complete data preservation
   *
   * @security Uses DOM parsing via NAXMLService, no string interpolation
   * @enterprise Captures all fields for audit compliance
   */
  private parsePJRTransaction(
    xml: string,
    filePath: string,
    fileHash: string,
  ): POSPJRTransaction | null {
    try {
      const document = this.naxmlService.parse(xml);
      const data = document.data as Record<string, unknown>;

      // Get transmission header for store ID (PascalCase from XML parser)
      const transmissionHeader = data.TransmissionHeader as Record<
        string,
        unknown
      >;
      const posStoreId = String(transmissionHeader?.StoreLocationID || "");

      // Get JournalReport > SaleEvent (PascalCase from XML parser)
      const journalReport = (data.JournalReport || data) as Record<
        string,
        unknown
      >;
      const saleEvent = journalReport.SaleEvent as Record<string, unknown>;

      if (!saleEvent) {
        return null;
      }

      // Extract transaction identification (PascalCase)
      const posTransactionId = String(saleEvent.TransactionID || "");
      const businessDate = String(saleEvent.BusinessDate || "");

      // Build timestamp from EventStartDate + EventStartTime
      const eventStartDate = String(
        saleEvent.EventStartDate || saleEvent.BusinessDate || "",
      );
      const eventStartTime = String(saleEvent.EventStartTime || "00:00:00");
      // eslint-disable-next-line no-restricted-syntax -- parsing external XML timestamp, not generating business date
      const timestamp = new Date(`${eventStartDate}T${eventStartTime}`);

      // Build receipt timestamp
      const receiptDate = String(saleEvent.ReceiptDate || eventStartDate);
      const receiptTime = String(saleEvent.ReceiptTime || eventStartTime);
      // eslint-disable-next-line no-restricted-syntax -- parsing external XML timestamp, not generating business date
      const receiptTimestamp = new Date(`${receiptDate}T${receiptTime}`);

      // Extract register/cashier info (PascalCase)
      const cashierId = String(saleEvent.CashierID || "");
      const registerId = String(saleEvent.RegisterID || "");
      const tillId = String(saleEvent.TillID || "");

      // Extract flags (handle value attribute pattern)
      const trainingModeFlag = saleEvent.TrainingModeFlag as Record<
        string,
        unknown
      >;
      const outsideSalesFlag = saleEvent.OutsideSalesFlag as Record<
        string,
        unknown
      >;
      const offlineFlag = saleEvent.OfflineFlag as Record<string, unknown>;
      const suspendFlag = saleEvent.SuspendFlag as Record<string, unknown>;

      const isTrainingMode =
        String(
          trainingModeFlag?.["@_value"] ||
            trainingModeFlag?.value ||
            trainingModeFlag ||
            "",
        ) === "yes";
      const isOutsideSale =
        String(
          outsideSalesFlag?.["@_value"] ||
            outsideSalesFlag?.value ||
            outsideSalesFlag ||
            "",
        ) === "yes";
      const isOffline =
        String(
          offlineFlag?.["@_value"] || offlineFlag?.value || offlineFlag || "",
        ) === "yes";
      const isSuspended =
        String(
          suspendFlag?.["@_value"] || suspendFlag?.value || suspendFlag || "",
        ) === "yes";

      // Extract linked transaction info (PascalCase)
      const linkedTxInfo = saleEvent.LinkedTransactionInfo as Record<
        string,
        unknown
      >;
      const linkedTransactionId = linkedTxInfo
        ? String(linkedTxInfo.OriginalTransactionID || "")
        : undefined;
      const linkReason = linkedTxInfo
        ? String(linkedTxInfo.TransactionLinkReason || "")
        : undefined;

      // Extract transaction summary totals (PascalCase)
      const summary = saleEvent.TransactionSummary as Record<string, unknown>;
      const grossAmount = parseFloat(
        String(summary?.TransactionTotalGrossAmount || "0"),
      );
      const netAmount = parseFloat(
        String(summary?.TransactionTotalNetAmount || "0"),
      );
      const taxAmount = parseFloat(
        String(summary?.TransactionTotalTaxSalesAmount || "0"),
      );
      const taxExemptAmount = parseFloat(
        String(summary?.TransactionTotalTaxExemptAmount || "0"),
      );

      // Grand total - handle direction attribute
      const grandTotalObj = summary?.TransactionTotalGrandAmount as Record<
        string,
        unknown
      >;
      const grandTotal =
        typeof grandTotalObj === "object"
          ? parseFloat(String(grandTotalObj["#text"] || grandTotalObj || "0"))
          : parseFloat(String(grandTotalObj || "0"));

      // Parse line items and payments (PascalCase)
      const detailGroup = saleEvent.TransactionDetailGroup as Record<
        string,
        unknown
      >;
      const transactionLines = this.ensureArray(detailGroup?.TransactionLine);

      const lineItems: POSPJRLineItem[] = [];
      const payments: POSTransactionPayment[] = [];

      for (const txLine of transactionLines) {
        const line = txLine as Record<string, unknown>;
        const status = String(line["@_status"] || line.Status || "normal") as
          | "normal"
          | "cancel"
          | "void";

        // Check for FuelLine (PascalCase)
        const fuelLine = line.FuelLine as Record<string, unknown>;
        if (fuelLine) {
          lineItems.push({
            status,
            itemType: "fuel",
            fuelGradeId: String(fuelLine.FuelGradeID || ""),
            fuelPositionId: String(fuelLine.FuelPositionID || ""),
            fuelServiceLevel: String(fuelLine.ServiceLevelCode || ""),
            fuelPriceTier: String(fuelLine.PriceTierCode || ""),
            fuelTimeTier: String(fuelLine.TimeTierCode || ""),
            fuelEntryMethod: String(
              (fuelLine.EntryMethod as Record<string, unknown>)?.["@_method"] ||
                (fuelLine.EntryMethod as Record<string, unknown>)?.Method ||
                fuelLine.EntryMethod ||
                "",
            ),
            merchandiseCode: String(fuelLine.MerchandiseCode || ""),
            description: String(fuelLine.Description || ""),
            quantity: parseFloat(String(fuelLine.SalesQuantity || "0")),
            unitPrice: parseFloat(String(fuelLine.ActualSalesPrice || "0")),
            regularPrice: parseFloat(String(fuelLine.RegularSellPrice || "0")),
            salesAmount: parseFloat(String(fuelLine.SalesAmount || "0")),
            taxLevelId: String(
              (fuelLine.ItemTax as Record<string, unknown>)?.TaxLevelID || "",
            ),
          });
          continue;
        }

        // Check for MerchandiseCodeLine (PascalCase)
        const merchLine = line.MerchandiseCodeLine as Record<string, unknown>;
        if (merchLine) {
          const merchCode = String(merchLine.MerchandiseCode || "");
          const description = String(merchLine.Description || "");

          lineItems.push({
            status,
            itemType: this.classifyMerchandiseItem(merchCode, description),
            merchandiseCode: merchCode,
            description,
            quantity: parseFloat(String(merchLine.SalesQuantity || "1")),
            unitPrice: parseFloat(String(merchLine.ActualSalesPrice || "0")),
            regularPrice: parseFloat(String(merchLine.RegularSellPrice || "0")),
            salesAmount: parseFloat(String(merchLine.SalesAmount || "0")),
            taxLevelId: String(
              (merchLine.ItemTax as Record<string, unknown>)?.TaxLevelID || "",
            ),
          });
          continue;
        }

        // Check for FuelPrepayLine (PascalCase)
        const prepayLine = line.FuelPrepayLine as Record<string, unknown>;
        if (prepayLine) {
          lineItems.push({
            status,
            itemType: "prepay",
            prepayPositionId: String(prepayLine.FuelPositionID || ""),
            prepayAmount: parseFloat(String(prepayLine.SalesAmount || "0")),
          });
          continue;
        }

        // Check for TenderInfo (payment) (PascalCase)
        const tenderInfo = line.TenderInfo as Record<string, unknown>;
        if (tenderInfo) {
          const tender = tenderInfo.Tender as Record<string, unknown>;
          const tenderCode = String(tender?.TenderCode || "");
          const tenderSubCode = String(tender?.TenderSubCode || "");
          const amount = parseFloat(String(tenderInfo.TenderAmount || "0"));
          const changeFlag = tenderInfo.ChangeFlag as Record<string, unknown>;
          const isChange =
            String(
              changeFlag?.["@_value"] || changeFlag?.value || changeFlag || "",
            ) === "yes";

          if (tenderCode) {
            payments.push({
              tenderCode,
              tenderSubCode,
              amount,
              isChange,
            });
          }
          continue;
        }

        // Check for TransactionTax (PascalCase)
        const taxInfo = line.TransactionTax as Record<string, unknown>;
        if (taxInfo) {
          lineItems.push({
            status,
            itemType: "tax",
            taxTaxLevelId: String(taxInfo.TaxLevelID || ""),
            taxableSalesAmount: parseFloat(
              String(taxInfo.TaxableSalesAmount || "0"),
            ),
            taxCollectedAmount: parseFloat(
              String(taxInfo.TaxCollectedAmount || "0"),
            ),
          });
          continue;
        }
      }

      return {
        posTransactionId,
        posStoreId,
        businessDate,
        timestamp,
        receiptTimestamp,
        cashierId,
        registerId,
        tillId,
        isTrainingMode,
        isOutsideSale,
        isOffline,
        isSuspended,
        linkedTransactionId,
        linkReason,
        grossAmount,
        netAmount,
        taxAmount,
        taxExemptAmount,
        grandTotal,
        lineItems,
        payments,
        sourceFile: path.basename(filePath),
        sourceFileHash: fileHash,
      };
    } catch (error) {
      this.log(
        "warn",
        `Error parsing PJR transaction: ${path.basename(filePath)}`,
        {
          error: error instanceof Error ? error.message : "Unknown error",
        },
      );
      return null;
    }
  }

  /**
   * Classify merchandise item type based on code and description
   * Maps to POSPJRLineItem.itemType values
   * @enterprise Supports lottery detection for compliance
   */
  private classifyMerchandiseItem(
    _code: string,
    description: string,
  ): POSPJRLineItem["itemType"] {
    const lowerDesc = description.toLowerCase();

    // Lottery detection
    if (
      lowerDesc.includes("lottery") ||
      lowerDesc.includes("lotto") ||
      lowerDesc.includes("scratch") ||
      lowerDesc.includes("powerball") ||
      lowerDesc.includes("mega")
    ) {
      return "lottery";
    }

    // Note: Tobacco and alcohol are classified as "merchandise" since
    // POSPJRLineItem.itemType doesn't have separate values for them
    // They can be identified by merchandise code or description if needed
    return "merchandise";
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
