/**
 * NAXML Service
 *
 * Main service for NAXML document processing.
 * Provides a unified interface for parsing, building, and validating
 * NAXML documents for POS data exchange.
 *
 * @module services/naxml/naxml.service
 * @security Integrates with audit service for compliance
 */

import { createHash } from "crypto";
import type {
  NAXMLDocument,
  NAXMLVersion,
  NAXMLParserOptions,
  NAXMLBuilderOptions,
  NAXMLValidationResult,
  NAXMLTransactionDocument,
  NAXMLDepartmentDocument,
  NAXMLTenderDocument,
  NAXMLTaxRateDocument,
  NAXMLPriceBookDocument,
  NAXMLEmployeeDocument,
  NAXMLDepartment,
  NAXMLTenderType,
  NAXMLTaxRate,
  NAXMLPriceBookItem,
  NAXMLEmployee,
  NAXMLImportResult,
} from "../../types/naxml.types";
import {
  NAXMLParser,
  NAXMLParserError,
  createNAXMLParser,
} from "./naxml.parser";
import {
  NAXMLBuilder,
  NAXMLBuilderError,
  createNAXMLBuilder,
} from "./naxml.builder";
import {
  NAXMLValidator,
  NAXMLValidationOptions,
  createNAXMLValidator,
} from "./naxml.validator";
import type {
  POSDepartment,
  POSTenderType,
  POSCashier,
  POSTaxRate,
  POSTransaction,
  POSTransactionLineItem,
  POSTransactionPayment,
} from "../../types/pos-integration.types";

// ============================================================================
// Service Configuration
// ============================================================================

/**
 * NAXML service configuration
 */
export interface NAXMLServiceConfig {
  /** NAXML version to use */
  version: NAXMLVersion;
  /** Parser options */
  parserOptions?: Partial<NAXMLParserOptions>;
  /** Builder options */
  builderOptions?: Partial<NAXMLBuilderOptions>;
  /** Validation options */
  validationOptions?: Partial<NAXMLValidationOptions>;
  /** Whether to validate on parse */
  validateOnParse: boolean;
  /** Whether to validate on build */
  validateOnBuild: boolean;
  /** Logger function */
  logger?: (
    level: "info" | "warn" | "error",
    message: string,
    data?: Record<string, unknown>,
  ) => void;
}

const DEFAULT_SERVICE_CONFIG: NAXMLServiceConfig = {
  version: "3.4",
  validateOnParse: true,
  validateOnBuild: false,
};

// ============================================================================
// NAXML Service Class
// ============================================================================

/**
 * NAXML Service
 *
 * Provides a unified interface for NAXML document processing:
 * - Parsing XML to typed objects
 * - Building XML from typed objects
 * - Validating documents
 * - Converting between NAXML and internal POS types
 */
export class NAXMLService {
  private readonly config: NAXMLServiceConfig;
  private readonly parser: NAXMLParser;
  private readonly builder: NAXMLBuilder;
  private readonly validator: NAXMLValidator;

  constructor(config: Partial<NAXMLServiceConfig> = {}) {
    this.config = { ...DEFAULT_SERVICE_CONFIG, ...config };

    // Initialize components
    this.parser = createNAXMLParser({
      version: this.config.version,
      ...this.config.parserOptions,
    });

    this.builder = createNAXMLBuilder({
      version: this.config.version,
      ...this.config.builderOptions,
    });

    this.validator = createNAXMLValidator(this.config.validationOptions);
  }

  // ============================================================================
  // Parsing Methods
  // ============================================================================

  /**
   * Parse an NAXML XML string into a typed document
   *
   * @param xml - The XML string to parse
   * @returns Parsed and validated document
   * @throws NAXMLParserError on parsing failure
   */
  parse<T = unknown>(xml: string): NAXMLDocument<T> {
    const document = this.parser.parse<T>(xml);

    if (this.config.validateOnParse) {
      const validation = this.validator.validate(document);
      if (!validation.isValid) {
        const errorMessages = validation.errors
          .map((e) => e.message)
          .join("; ");
        throw new NAXMLParserError(
          "NAXML_INVALID_XML",
          `Validation failed: ${errorMessages}`,
          { errors: validation.errors },
        );
      }
    }

    return document;
  }

  /**
   * Parse a transaction document
   */
  parseTransaction(xml: string): NAXMLDocument<NAXMLTransactionDocument> {
    return this.parse<NAXMLTransactionDocument>(xml);
  }

  /**
   * Parse a department maintenance document
   */
  parseDepartments(xml: string): NAXMLDocument<NAXMLDepartmentDocument> {
    return this.parse<NAXMLDepartmentDocument>(xml);
  }

  /**
   * Parse a tender maintenance document
   */
  parseTenders(xml: string): NAXMLDocument<NAXMLTenderDocument> {
    return this.parse<NAXMLTenderDocument>(xml);
  }

  /**
   * Parse a tax rate maintenance document
   */
  parseTaxRates(xml: string): NAXMLDocument<NAXMLTaxRateDocument> {
    return this.parse<NAXMLTaxRateDocument>(xml);
  }

  /**
   * Parse a price book document
   */
  parsePriceBook(xml: string): NAXMLDocument<NAXMLPriceBookDocument> {
    return this.parse<NAXMLPriceBookDocument>(xml);
  }

  /**
   * Parse an employee maintenance document
   */
  parseEmployees(xml: string): NAXMLDocument<NAXMLEmployeeDocument> {
    return this.parse<NAXMLEmployeeDocument>(xml);
  }

  // ============================================================================
  // Building Methods
  // ============================================================================

  /**
   * Build an NAXML XML string from a typed document
   *
   * @param document - The document to build
   * @returns XML string
   */
  build<T>(document: NAXMLDocument<T>): string {
    if (this.config.validateOnBuild) {
      const validation = this.validator.validate(document);
      if (!validation.isValid) {
        const errorMessages = validation.errors
          .map((e) => e.message)
          .join("; ");
        throw new NAXMLBuilderError(
          "NAXML_MISSING_REQUIRED_DATA",
          `Validation failed: ${errorMessages}`,
          { errors: validation.errors },
        );
      }
    }

    return this.builder.build(document);
  }

  /**
   * Build a department maintenance document
   */
  buildDepartmentDocument(
    storeLocationId: string,
    departments: NAXMLDepartment[],
    maintenanceType: "Full" | "Incremental" = "Full",
  ): string {
    return this.builder.buildDepartmentDocument(
      storeLocationId,
      departments,
      maintenanceType,
    );
  }

  /**
   * Build a tender maintenance document
   */
  buildTenderDocument(
    storeLocationId: string,
    tenders: NAXMLTenderType[],
    maintenanceType: "Full" | "Incremental" = "Full",
  ): string {
    return this.builder.buildTenderDocument(
      storeLocationId,
      tenders,
      maintenanceType,
    );
  }

  /**
   * Build a tax rate maintenance document
   */
  buildTaxRateDocument(
    storeLocationId: string,
    taxRates: NAXMLTaxRate[],
    maintenanceType: "Full" | "Incremental" = "Full",
  ): string {
    return this.builder.buildTaxRateDocument(
      storeLocationId,
      taxRates,
      maintenanceType,
    );
  }

  /**
   * Build a price book maintenance document
   */
  buildPriceBookDocument(
    storeLocationId: string,
    items: NAXMLPriceBookItem[],
    maintenanceType: "Full" | "Incremental" = "Full",
  ): string {
    return this.builder.buildPriceBookDocument(
      storeLocationId,
      items,
      maintenanceType,
    );
  }

  // ============================================================================
  // Validation Methods
  // ============================================================================

  /**
   * Validate an NAXML document
   */
  validate<T>(document: NAXMLDocument<T>): NAXMLValidationResult {
    return this.validator.validate(document);
  }

  /**
   * Validate an XML string without full parsing
   */
  validateXml(xml: string): NAXMLValidationResult {
    return this.parser.validate(xml);
  }

  /**
   * Quick validation check
   */
  isValid<T>(document: NAXMLDocument<T>): boolean {
    return this.validator.quickValidate(document);
  }

  // ============================================================================
  // Conversion Methods: NAXML -> Internal Types
  // ============================================================================

  /**
   * Convert NAXML departments to internal POS departments
   */
  convertDepartments(naxmlDepartments: NAXMLDepartment[]): POSDepartment[] {
    return naxmlDepartments.map((dept) => ({
      posCode: dept.departmentCode,
      displayName: dept.description,
      isTaxable: dept.isTaxable,
      minimumAge: dept.minimumAge,
      isLottery: this.isDepartmentLottery(dept),
      isActive: dept.isActive,
      sortOrder: dept.sortOrder,
      description: dept.description,
    }));
  }

  /**
   * Convert NAXML tender types to internal POS tender types
   */
  convertTenderTypes(naxmlTenders: NAXMLTenderType[]): POSTenderType[] {
    return naxmlTenders.map((tender) => ({
      posCode: tender.tenderCode,
      displayName: tender.description,
      isCashEquivalent: tender.isCashEquivalent,
      isElectronic: tender.isElectronic,
      affectsCashDrawer: tender.affectsCashDrawer,
      requiresReference: tender.requiresReference,
      isActive: tender.isActive,
      sortOrder: tender.sortOrder,
      description: tender.description,
    }));
  }

  /**
   * Convert NAXML employees to internal POS cashiers
   */
  convertCashiers(naxmlEmployees: NAXMLEmployee[]): POSCashier[] {
    return naxmlEmployees.map((emp) => ({
      posCode: emp.employeeId,
      firstName: emp.firstName,
      lastName: emp.lastName,
      pinHash: emp.pinHash,
      isActive: emp.isActive,
      employeeId: emp.employeeId,
    }));
  }

  /**
   * Convert NAXML tax rates to internal POS tax rates
   */
  convertTaxRates(naxmlTaxRates: NAXMLTaxRate[]): POSTaxRate[] {
    return naxmlTaxRates.map((rate) => ({
      posCode: rate.taxRateCode,
      displayName: rate.description,
      rate: rate.rate,
      isActive: rate.isActive,
      jurisdictionCode: rate.jurisdictionCode,
      description: rate.description,
    }));
  }

  /**
   * Convert NAXML transaction to internal POS transaction
   */
  convertTransaction(
    naxmlTransaction: NAXMLTransactionDocument,
  ): POSTransaction {
    const header = naxmlTransaction.transactionHeader;
    const total = naxmlTransaction.transactionTotal;

    return {
      posTransactionId: header.transactionId,
      timestamp: new Date(header.transactionDate),
      cashierCode: header.cashierId || "",
      terminalId: header.terminalId,
      subtotal: total.subtotal,
      tax: total.taxTotal,
      total: total.grandTotal,
      lineItems: naxmlTransaction.transactionDetail.map(
        (detail): POSTransactionLineItem => ({
          departmentCode: detail.departmentCode,
          sku: detail.itemCode,
          description: detail.description,
          quantity: detail.quantity,
          unitPrice: detail.unitPrice,
          taxAmount: detail.taxAmount,
          lineTotal: detail.extendedPrice,
        }),
      ),
      payments: naxmlTransaction.transactionTender.map(
        (tender): POSTransactionPayment => ({
          tenderCode: tender.tenderCode,
          amount: tender.amount,
          reference: tender.referenceNumber,
        }),
      ),
    };
  }

  // ============================================================================
  // Conversion Methods: Internal Types -> NAXML
  // ============================================================================

  /**
   * Convert internal POS departments to NAXML departments
   */
  toNAXMLDepartments(departments: POSDepartment[]): NAXMLDepartment[] {
    return departments.map((dept) => ({
      departmentCode: dept.posCode,
      description: dept.displayName,
      isTaxable: dept.isTaxable,
      minimumAge: dept.minimumAge,
      isActive: dept.isActive,
      sortOrder: dept.sortOrder,
      action: "AddUpdate",
    }));
  }

  /**
   * Convert internal POS tender types to NAXML tender types
   */
  toNAXMLTenderTypes(tenderTypes: POSTenderType[]): NAXMLTenderType[] {
    return tenderTypes.map((tender) => ({
      tenderCode: tender.posCode,
      description: tender.displayName,
      isCashEquivalent: tender.isCashEquivalent,
      isElectronic: tender.isElectronic,
      affectsCashDrawer: tender.affectsCashDrawer,
      requiresReference: tender.requiresReference,
      isActive: tender.isActive,
      sortOrder: tender.sortOrder,
      action: "AddUpdate",
    }));
  }

  /**
   * Convert internal POS tax rates to NAXML tax rates
   */
  toNAXMLTaxRates(taxRates: POSTaxRate[]): NAXMLTaxRate[] {
    return taxRates.map((rate) => ({
      taxRateCode: rate.posCode,
      description: rate.displayName,
      rate: rate.rate,
      isActive: rate.isActive,
      jurisdictionCode: rate.jurisdictionCode,
      action: "AddUpdate",
    }));
  }

  // ============================================================================
  // Import Methods
  // ============================================================================

  /**
   * Import transactions from NAXML XML
   */
  importTransactions(xml: string): NAXMLImportResult<POSTransaction> {
    const startTime = Date.now();

    try {
      const document = this.parseTransaction(xml);
      const transaction = this.convertTransaction(document.data);

      return {
        success: true,
        documentType: "TransactionDocument",
        recordCount: 1,
        successCount: 1,
        failedCount: 0,
        data: [transaction],
        errors: [],
        durationMs: Date.now() - startTime,
        fileHash: this.calculateHash(xml),
      };
    } catch (error) {
      return {
        success: false,
        documentType: "TransactionDocument",
        recordCount: 0,
        successCount: 0,
        failedCount: 1,
        data: [],
        errors: [
          {
            errorCode:
              error instanceof NAXMLParserError ? error.code : "IMPORT_ERROR",
            errorMessage:
              error instanceof Error ? error.message : "Unknown error",
          },
        ],
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Import departments from NAXML XML
   */
  importDepartments(xml: string): NAXMLImportResult<POSDepartment> {
    const startTime = Date.now();

    try {
      const document = this.parseDepartments(xml);
      const departments = this.convertDepartments(document.data.departments);

      return {
        success: true,
        documentType: "DepartmentMaintenance",
        recordCount: departments.length,
        successCount: departments.length,
        failedCount: 0,
        data: departments,
        errors: [],
        durationMs: Date.now() - startTime,
        fileHash: this.calculateHash(xml),
      };
    } catch (error) {
      return {
        success: false,
        documentType: "DepartmentMaintenance",
        recordCount: 0,
        successCount: 0,
        failedCount: 1,
        data: [],
        errors: [
          {
            errorCode:
              error instanceof NAXMLParserError ? error.code : "IMPORT_ERROR",
            errorMessage:
              error instanceof Error ? error.message : "Unknown error",
          },
        ],
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Import tender types from NAXML XML
   */
  importTenderTypes(xml: string): NAXMLImportResult<POSTenderType> {
    const startTime = Date.now();

    try {
      const document = this.parseTenders(xml);
      const tenders = this.convertTenderTypes(document.data.tenders);

      return {
        success: true,
        documentType: "TenderMaintenance",
        recordCount: tenders.length,
        successCount: tenders.length,
        failedCount: 0,
        data: tenders,
        errors: [],
        durationMs: Date.now() - startTime,
        fileHash: this.calculateHash(xml),
      };
    } catch (error) {
      return {
        success: false,
        documentType: "TenderMaintenance",
        recordCount: 0,
        successCount: 0,
        failedCount: 1,
        data: [],
        errors: [
          {
            errorCode:
              error instanceof NAXMLParserError ? error.code : "IMPORT_ERROR",
            errorMessage:
              error instanceof Error ? error.message : "Unknown error",
          },
        ],
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Import tax rates from NAXML XML
   */
  importTaxRates(xml: string): NAXMLImportResult<POSTaxRate> {
    const startTime = Date.now();

    try {
      const document = this.parseTaxRates(xml);
      const taxRates = this.convertTaxRates(document.data.taxRates);

      return {
        success: true,
        documentType: "TaxRateMaintenance",
        recordCount: taxRates.length,
        successCount: taxRates.length,
        failedCount: 0,
        data: taxRates,
        errors: [],
        durationMs: Date.now() - startTime,
        fileHash: this.calculateHash(xml),
      };
    } catch (error) {
      return {
        success: false,
        documentType: "TaxRateMaintenance",
        recordCount: 0,
        successCount: 0,
        failedCount: 1,
        data: [],
        errors: [
          {
            errorCode:
              error instanceof NAXMLParserError ? error.code : "IMPORT_ERROR",
            errorMessage:
              error instanceof Error ? error.message : "Unknown error",
          },
        ],
        durationMs: Date.now() - startTime,
      };
    }
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Calculate SHA-256 hash of content
   */
  calculateHash(content: string | Buffer): string {
    return createHash("sha256").update(content).digest("hex");
  }

  /**
   * Determine if a department is a lottery department based on common conventions
   */
  private isDepartmentLottery(dept: NAXMLDepartment): boolean {
    const lotteryIndicators = ["lottery", "lotto", "scratch", "ticket"];
    const description = dept.description.toLowerCase();
    const code = dept.departmentCode.toLowerCase();

    return (
      lotteryIndicators.some(
        (indicator) =>
          description.includes(indicator) || code.includes(indicator),
      ) ||
      dept.departmentCode === "20" || // Common lottery department code
      dept.departmentCode === "LOTTERY"
    );
  }
}

// ============================================================================
// Factory Functions
// ============================================================================

/**
 * Create a new NAXML service instance
 */
export function createNAXMLService(
  config?: Partial<NAXMLServiceConfig>,
): NAXMLService {
  return new NAXMLService(config);
}

// ============================================================================
// Re-exports
// ============================================================================

export {
  NAXMLParser,
  NAXMLParserError,
  createNAXMLParser,
  parseNAXML,
} from "./naxml.parser";

export {
  NAXMLBuilder,
  NAXMLBuilderError,
  createNAXMLBuilder,
  buildNAXML,
} from "./naxml.builder";

export {
  NAXMLValidator,
  createNAXMLValidator,
  validateNAXMLDocument,
} from "./naxml.validator";

// Re-export types
export type {
  NAXMLDocument,
  NAXMLDocumentType,
  NAXMLVersion,
  NAXMLParserOptions,
  NAXMLBuilderOptions,
  NAXMLValidationResult,
  NAXMLTransactionDocument,
  NAXMLDepartmentDocument,
  NAXMLTenderDocument,
  NAXMLTaxRateDocument,
  NAXMLPriceBookDocument,
  NAXMLEmployeeDocument,
  NAXMLDepartment,
  NAXMLTenderType,
  NAXMLTaxRate,
  NAXMLPriceBookItem,
  NAXMLEmployee,
  NAXMLImportResult,
  NAXMLExportResult,
} from "../../types/naxml.types";
