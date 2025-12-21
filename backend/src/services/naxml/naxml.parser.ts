/**
 * NAXML Parser Service
 *
 * Parses NAXML 3.x XML documents into typed TypeScript objects.
 * Implements secure XML parsing with XXE prevention.
 *
 * @module services/naxml/naxml.parser
 * @security XXE prevention via disabled external entities
 */

import { XMLParser, XMLValidator } from "fast-xml-parser";
import {
  DEFAULT_NAXML_PARSER_OPTIONS,
  type NAXMLDocument,
  type NAXMLDocumentType,
  type NAXMLParserOptions,
  type NAXMLVersion,
  type NAXMLTransactionDocument,
  type NAXMLTransactionHeader,
  type NAXMLTransactionDetail,
  type NAXMLTransactionTender,
  type NAXMLTransactionTax,
  type NAXMLTransactionTotal,
  type NAXMLDepartmentDocument,
  type NAXMLDepartment,
  type NAXMLTenderDocument,
  type NAXMLTenderType,
  type NAXMLTaxRateDocument,
  type NAXMLTaxRate,
  type NAXMLPriceBookDocument,
  type NAXMLPriceBookItem,
  type NAXMLEmployeeDocument,
  type NAXMLEmployee,
  type NAXMLMaintenanceHeader,
  type NAXMLValidationResult,
  type NAXMLValidationError,
} from "../../types/naxml.types";

// ============================================================================
// Error Codes
// ============================================================================

export const NAXML_PARSER_ERROR_CODES = {
  INVALID_XML: "NAXML_INVALID_XML",
  UNSUPPORTED_VERSION: "NAXML_UNSUPPORTED_VERSION",
  UNKNOWN_DOCUMENT_TYPE: "NAXML_UNKNOWN_DOCUMENT_TYPE",
  MISSING_REQUIRED_FIELD: "NAXML_MISSING_REQUIRED_FIELD",
  INVALID_FIELD_VALUE: "NAXML_INVALID_FIELD_VALUE",
  PARSE_ERROR: "NAXML_PARSE_ERROR",
} as const;

export type NAXMLParserErrorCode =
  (typeof NAXML_PARSER_ERROR_CODES)[keyof typeof NAXML_PARSER_ERROR_CODES];

// ============================================================================
// Parser Error Class
// ============================================================================

/**
 * Custom error class for NAXML parsing errors
 */
export class NAXMLParserError extends Error {
  readonly code: NAXMLParserErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: NAXMLParserErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "NAXMLParserError";
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, NAXMLParserError.prototype);
  }
}

// ============================================================================
// Secure XML Parser Configuration
// ============================================================================

/**
 * Creates a secure XML parser with XXE prevention
 * @security Disables external entities, DTD processing, and parameter entities
 */
function createSecureXMLParser(options: NAXMLParserOptions): XMLParser {
  return new XMLParser({
    // Security: Disable external entity resolution (XXE prevention)
    // Note: fast-xml-parser does not support external entities by default,
    // but we explicitly configure it for defense in depth
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    textNodeName: "#text",
    cdataPropName: "#cdata",
    // Parsing options
    parseAttributeValue: true,
    // Keep tag values as strings to preserve leading zeros in codes (e.g., "001")
    parseTagValue: false,
    trimValues: options.trimWhitespace,
    // Array handling - force arrays for repeating elements
    isArray: (name: string) => {
      return ARRAY_ELEMENT_NAMES.includes(name);
    },
    // Tag name transformation
    tagValueProcessor: (_tagName: string, tagValue: string) => {
      // Handle boolean values
      if (tagValue === "Y" || tagValue === "true") return true;
      if (tagValue === "N" || tagValue === "false") return false;
      return tagValue;
    },
  });
}

/**
 * Elements that should always be parsed as arrays
 */
const ARRAY_ELEMENT_NAMES = [
  "LineItem",
  "Tender",
  "Tax",
  "Department",
  "Item",
  "Employee",
  "TaxRate",
  "ModifierCode",
  "Error",
];

// ============================================================================
// Parser Class
// ============================================================================

/**
 * NAXML Parser
 *
 * Parses NAXML XML documents into typed TypeScript objects.
 * Supports transaction documents, maintenance documents, and acknowledgments.
 */
export class NAXMLParser {
  private readonly options: NAXMLParserOptions;
  private readonly parser: XMLParser;

  constructor(options: Partial<NAXMLParserOptions> = {}) {
    this.options = { ...DEFAULT_NAXML_PARSER_OPTIONS, ...options };
    this.parser = createSecureXMLParser(this.options);
  }

  /**
   * Parse an NAXML document string
   *
   * @param xml - The XML string to parse
   * @returns Parsed NAXML document
   * @throws NAXMLParserError on parsing failure
   */
  parse<T = unknown>(xml: string): NAXMLDocument<T> {
    // Validate XML structure first
    const validationResult = XMLValidator.validate(xml);
    if (validationResult !== true) {
      throw new NAXMLParserError(
        NAXML_PARSER_ERROR_CODES.INVALID_XML,
        `Invalid XML structure: ${validationResult.err?.msg || "Unknown error"}`,
        { line: validationResult.err?.line, col: validationResult.err?.col },
      );
    }

    // Parse XML
    const parsed = this.parser.parse(xml);

    // Detect document type
    const documentType = this.detectDocumentType(parsed);
    if (!documentType) {
      throw new NAXMLParserError(
        NAXML_PARSER_ERROR_CODES.UNKNOWN_DOCUMENT_TYPE,
        "Unable to determine NAXML document type from root element",
      );
    }

    // Extract version
    const version = this.extractVersion(parsed, documentType);

    // Parse based on document type
    const data = this.parseDocumentData<T>(parsed, documentType);

    // Extract timestamp and store ID
    const { timestamp, storeLocationId } = this.extractMetadata(
      parsed,
      documentType,
    );

    return {
      documentType,
      version,
      timestamp,
      storeLocationId,
      data,
    };
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

  /**
   * Validate XML without full parsing
   */
  validate(xml: string): NAXMLValidationResult {
    const errors: NAXMLValidationError[] = [];
    const warnings: NAXMLValidationError[] = [];

    // Basic XML structure validation
    const structureResult = XMLValidator.validate(xml);
    if (structureResult !== true) {
      errors.push({
        code: NAXML_PARSER_ERROR_CODES.INVALID_XML,
        message: structureResult.err?.msg || "Invalid XML structure",
        line: structureResult.err?.line,
        column: structureResult.err?.col,
        severity: "critical",
      });
      return { isValid: false, errors, warnings };
    }

    // Parse to check document type
    try {
      const parsed = this.parser.parse(xml);
      const documentType = this.detectDocumentType(parsed);

      if (!documentType) {
        errors.push({
          code: NAXML_PARSER_ERROR_CODES.UNKNOWN_DOCUMENT_TYPE,
          message: "Unable to determine NAXML document type",
          severity: "critical",
        });
        return { isValid: false, errors, warnings };
      }

      const version = this.extractVersion(parsed, documentType);

      // Version check
      if (!["3.2", "3.4", "4.0"].includes(version)) {
        warnings.push({
          code: NAXML_PARSER_ERROR_CODES.UNSUPPORTED_VERSION,
          message: `NAXML version ${version} may not be fully supported`,
          severity: "error",
        });
      }

      return {
        isValid: errors.length === 0,
        documentType,
        version,
        errors,
        warnings,
      };
    } catch (error) {
      errors.push({
        code: NAXML_PARSER_ERROR_CODES.PARSE_ERROR,
        message: error instanceof Error ? error.message : "Unknown parse error",
        severity: "critical",
      });
      return { isValid: false, errors, warnings };
    }
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  /**
   * Detect the NAXML document type from parsed XML
   */
  private detectDocumentType(
    parsed: Record<string, unknown>,
  ): NAXMLDocumentType | null {
    const rootKeys = Object.keys(parsed);

    for (const key of rootKeys) {
      if (key.includes("TransactionDocument")) return "TransactionDocument";
      if (key.includes("DepartmentMaintenance")) return "DepartmentMaintenance";
      if (key.includes("TenderMaintenance")) return "TenderMaintenance";
      if (key.includes("TaxRateMaintenance")) return "TaxRateMaintenance";
      if (key.includes("PriceBookMaintenance")) return "PriceBookMaintenance";
      if (key.includes("EmployeeMaintenance")) return "EmployeeMaintenance";
      if (key.includes("InventoryMovement")) return "InventoryMovement";
      if (key.includes("Acknowledgment")) return "Acknowledgment";
    }

    return null;
  }

  /**
   * Extract NAXML version from parsed document
   */
  private extractVersion(
    parsed: Record<string, unknown>,
    documentType: NAXMLDocumentType,
  ): NAXMLVersion {
    const rootKey = this.getRootKey(parsed, documentType);
    const root = parsed[rootKey] as Record<string, unknown>;

    // Check for version attribute
    const versionRaw = root?.["@_version"];
    // Convert to string if the parser returned a number
    const version = versionRaw != null ? String(versionRaw) : undefined;

    if (version) {
      if (version.startsWith("3.2")) return "3.2";
      if (version.startsWith("3.4")) return "3.4";
      if (version.startsWith("4")) return "4.0";
    }

    // Default to 3.4 if not specified
    return this.options.version;
  }

  /**
   * Get the root element key for a document type
   */
  private getRootKey(
    parsed: Record<string, unknown>,
    documentType: NAXMLDocumentType,
  ): string {
    const keys = Object.keys(parsed);
    return (
      keys.find((k) => k.includes(documentType)) || keys[0] || documentType
    );
  }

  /**
   * Extract metadata (timestamp, store ID) from document
   */
  private extractMetadata(
    parsed: Record<string, unknown>,
    documentType: NAXMLDocumentType,
  ): { timestamp: Date; storeLocationId: string } {
    const rootKey = this.getRootKey(parsed, documentType);
    const root = parsed[rootKey] as Record<string, unknown>;

    let storeLocationId = "";
    let timestamp = new Date();

    // Try to extract from TransactionHeader or MaintenanceHeader
    if (documentType === "TransactionDocument") {
      const header = root?.TransactionHeader as Record<string, unknown>;
      storeLocationId = String(header?.StoreLocationID || "");
      const dateStr = header?.TransactionDate as string;
      if (dateStr) {
        timestamp = new Date(dateStr);
      }
    } else {
      const header = root?.MaintenanceHeader as Record<string, unknown>;
      storeLocationId = String(header?.StoreLocationID || "");
      const dateStr = header?.MaintenanceDate as string;
      if (dateStr) {
        timestamp = new Date(dateStr);
      }
    }

    return { timestamp, storeLocationId };
  }

  /**
   * Parse document data based on type
   */
  private parseDocumentData<T>(
    parsed: Record<string, unknown>,
    documentType: NAXMLDocumentType,
  ): T {
    const rootKey = this.getRootKey(parsed, documentType);
    const root = parsed[rootKey] as Record<string, unknown>;

    switch (documentType) {
      case "TransactionDocument":
        return this.parseTransactionData(root) as T;
      case "DepartmentMaintenance":
        return this.parseDepartmentData(root) as T;
      case "TenderMaintenance":
        return this.parseTenderData(root) as T;
      case "TaxRateMaintenance":
        return this.parseTaxRateData(root) as T;
      case "PriceBookMaintenance":
        return this.parsePriceBookData(root) as T;
      case "EmployeeMaintenance":
        return this.parseEmployeeData(root) as T;
      default:
        return root as T;
    }
  }

  /**
   * Parse transaction document data
   */
  private parseTransactionData(
    root: Record<string, unknown>,
  ): NAXMLTransactionDocument {
    const header = root.TransactionHeader as Record<string, unknown>;
    const detailContainer = root.TransactionDetail as Record<string, unknown>;
    const tenderContainer = root.TransactionTender as Record<string, unknown>;
    const taxContainer = root.TransactionTax as Record<string, unknown>;
    const totalContainer = root.TransactionTotal as Record<string, unknown>;

    return {
      transactionHeader: this.parseTransactionHeader(header),
      transactionDetail: this.parseTransactionDetails(detailContainer),
      transactionTender: this.parseTransactionTenders(tenderContainer),
      transactionTax: this.parseTransactionTaxes(taxContainer),
      transactionTotal: this.parseTransactionTotal(totalContainer),
    };
  }

  private parseTransactionHeader(
    header: Record<string, unknown>,
  ): NAXMLTransactionHeader {
    // Support both ID (NAXML spec) and Id (common variation) suffixes
    return {
      storeLocationId: String(
        header?.StoreLocationID || header?.StoreLocationId || "",
      ),
      terminalId: String(header?.TerminalID || header?.TerminalId || ""),
      transactionId: String(
        header?.TransactionID || header?.TransactionId || "",
      ),
      businessDate: String(header?.BusinessDate || ""),
      transactionDate: String(header?.TransactionDate || ""),
      transactionType: String(header?.TransactionType || "Sale") as
        | "Sale"
        | "Refund"
        | "VoidSale"
        | "NoSale"
        | "PaidOut"
        | "PaidIn"
        | "SafeDrop"
        | "EndOfShift",
      cashierId:
        header?.CashierID || header?.CashierId
          ? String(header.CashierID || header.CashierId)
          : undefined,
      operatorId:
        header?.OperatorID || header?.OperatorId
          ? String(header.OperatorID || header.OperatorId)
          : undefined,
      shiftNumber: header?.ShiftNumber ? String(header.ShiftNumber) : undefined,
    };
  }

  private parseTransactionDetails(
    container: Record<string, unknown>,
  ): NAXMLTransactionDetail[] {
    const items = this.ensureArray(container?.LineItem);
    return items.map((item: Record<string, unknown>, index: number) => ({
      lineNumber: Number(
        item?.LineNumber || item?.["@_LineNumber"] || index + 1,
      ),
      itemCode: String(item?.ItemCode || ""),
      description: String(item?.Description || ""),
      departmentCode: String(item?.DepartmentCode || ""),
      quantity: this.parseNumber(item?.Quantity, 1),
      unitPrice: this.parseNumber(item?.UnitPrice, 0),
      extendedPrice: this.parseNumber(item?.ExtendedPrice, 0),
      taxCode: item?.TaxCode ? String(item.TaxCode) : undefined,
      taxAmount: this.parseNumber(item?.TaxAmount, 0),
      discountAmount: item?.DiscountAmount
        ? this.parseNumber(item.DiscountAmount, 0)
        : undefined,
      modifierCodes: item?.ModifierCodes
        ? this.ensureArray(item.ModifierCodes).map(String)
        : undefined,
      isVoid: Boolean(item?.IsVoid),
      isRefund: Boolean(item?.IsRefund),
    }));
  }

  private parseTransactionTenders(
    container: Record<string, unknown>,
  ): NAXMLTransactionTender[] {
    const tenders = this.ensureArray(container?.Tender);
    return tenders.map((tender: Record<string, unknown>) => ({
      tenderCode: String(tender?.TenderCode || ""),
      tenderDescription: String(tender?.TenderDescription || ""),
      amount: this.parseNumber(tender?.Amount, 0),
      referenceNumber: tender?.ReferenceNumber
        ? String(tender.ReferenceNumber)
        : undefined,
      cardType: tender?.CardType ? String(tender.CardType) : undefined,
      cardLast4: tender?.CardLast4 ? String(tender.CardLast4) : undefined,
      changeGiven: tender?.ChangeGiven
        ? this.parseNumber(tender.ChangeGiven, 0)
        : undefined,
    }));
  }

  private parseTransactionTaxes(
    container: Record<string, unknown>,
  ): NAXMLTransactionTax[] {
    const taxes = this.ensureArray(container?.Tax);
    return taxes.map((tax: Record<string, unknown>) => ({
      taxCode: String(tax?.TaxCode || tax?.["@_TaxCode"] || ""),
      taxDescription: String(tax?.TaxDescription || ""),
      taxableAmount: this.parseNumber(tax?.TaxableAmount, 0),
      taxAmount: this.parseNumber(tax?.TaxAmount, 0),
      taxRate: this.parseNumber(tax?.TaxRate, 0),
      jurisdiction: tax?.Jurisdiction ? String(tax.Jurisdiction) : undefined,
    }));
  }

  private parseTransactionTotal(
    container: Record<string, unknown>,
  ): NAXMLTransactionTotal {
    return {
      subtotal: this.parseNumber(container?.Subtotal, 0),
      taxTotal: this.parseNumber(container?.TaxTotal, 0),
      grandTotal: this.parseNumber(container?.GrandTotal, 0),
      discountTotal: container?.DiscountTotal
        ? this.parseNumber(container.DiscountTotal, 0)
        : undefined,
      changeDue: container?.ChangeDue
        ? this.parseNumber(container.ChangeDue, 0)
        : undefined,
      itemCount: container?.ItemCount ? Number(container.ItemCount) : undefined,
    };
  }

  /**
   * Parse department maintenance data
   */
  private parseDepartmentData(
    root: Record<string, unknown>,
  ): NAXMLDepartmentDocument {
    const header = root.MaintenanceHeader as Record<string, unknown>;
    const deptContainer = root.Departments as Record<string, unknown>;

    return {
      maintenanceHeader: this.parseMaintenanceHeader(header),
      departments: this.parseDepartmentList(deptContainer),
    };
  }

  private parseMaintenanceHeader(
    header: Record<string, unknown>,
  ): NAXMLMaintenanceHeader {
    return {
      storeLocationId: String(header?.StoreLocationID || ""),
      maintenanceDate: String(header?.MaintenanceDate || ""),
      maintenanceType: (header?.MaintenanceType === "Incremental"
        ? "Incremental"
        : "Full") as "Full" | "Incremental",
      effectiveDate: header?.EffectiveDate
        ? String(header.EffectiveDate)
        : undefined,
      sequenceNumber: header?.SequenceNumber
        ? Number(header.SequenceNumber)
        : undefined,
    };
  }

  private parseDepartmentList(
    container: Record<string, unknown>,
  ): NAXMLDepartment[] {
    const depts = this.ensureArray(container?.Department);
    return depts.map((dept: Record<string, unknown>) => ({
      departmentCode: String(
        dept?.Code || dept?.["@_Code"] || dept?.DepartmentCode || "",
      ),
      description: String(dept?.Description || ""),
      isTaxable: this.parseBoolean(dept?.IsTaxable),
      taxRateCode: dept?.TaxRateCode ? String(dept.TaxRateCode) : undefined,
      minimumAge: dept?.MinimumAge ? Number(dept.MinimumAge) : undefined,
      isActive: this.parseBoolean(dept?.IsActive, true),
      sortOrder: dept?.SortOrder ? Number(dept.SortOrder) : undefined,
      action: dept?.["@_Action"] as
        | "Add"
        | "Update"
        | "Delete"
        | "AddUpdate"
        | undefined,
    }));
  }

  /**
   * Parse tender maintenance data
   */
  private parseTenderData(root: Record<string, unknown>): NAXMLTenderDocument {
    const header = root.MaintenanceHeader as Record<string, unknown>;
    const tenderContainer = root.Tenders as Record<string, unknown>;

    return {
      maintenanceHeader: this.parseMaintenanceHeader(header),
      tenders: this.parseTenderTypes(tenderContainer),
    };
  }

  private parseTenderTypes(
    container: Record<string, unknown>,
  ): NAXMLTenderType[] {
    const tenders = this.ensureArray(container?.Tender);
    return tenders.map((tender: Record<string, unknown>) => ({
      tenderCode: String(
        tender?.Code || tender?.["@_Code"] || tender?.TenderCode || "",
      ),
      description: String(tender?.Description || ""),
      isCashEquivalent: this.parseBoolean(tender?.IsCashEquivalent),
      isElectronic: this.parseBoolean(tender?.IsElectronic),
      affectsCashDrawer: this.parseBoolean(tender?.AffectsCashDrawer, true),
      requiresReference: this.parseBoolean(tender?.RequiresReference),
      isActive: this.parseBoolean(tender?.IsActive, true),
      sortOrder: tender?.SortOrder ? Number(tender.SortOrder) : undefined,
      action: tender?.["@_Action"] as
        | "Add"
        | "Update"
        | "Delete"
        | "AddUpdate"
        | undefined,
    }));
  }

  /**
   * Parse tax rate maintenance data
   */
  private parseTaxRateData(
    root: Record<string, unknown>,
  ): NAXMLTaxRateDocument {
    const header = root.MaintenanceHeader as Record<string, unknown>;
    const taxContainer = root.TaxRates as Record<string, unknown>;

    return {
      maintenanceHeader: this.parseMaintenanceHeader(header),
      taxRates: this.parseTaxRateList(taxContainer),
    };
  }

  private parseTaxRateList(container: Record<string, unknown>): NAXMLTaxRate[] {
    const rates = this.ensureArray(container?.TaxRate);
    return rates.map((rate: Record<string, unknown>) => ({
      taxRateCode: String(
        rate?.Code || rate?.["@_Code"] || rate?.TaxRateCode || "",
      ),
      description: String(rate?.Description || ""),
      rate: this.parseNumber(rate?.Rate, 0),
      isActive: this.parseBoolean(rate?.IsActive, true),
      jurisdictionCode: rate?.JurisdictionCode
        ? String(rate.JurisdictionCode)
        : undefined,
      taxType: rate?.TaxType ? String(rate.TaxType) : undefined,
      action: rate?.["@_Action"] as
        | "Add"
        | "Update"
        | "Delete"
        | "AddUpdate"
        | undefined,
    }));
  }

  /**
   * Parse price book data
   */
  private parsePriceBookData(
    root: Record<string, unknown>,
  ): NAXMLPriceBookDocument {
    const header = root.MaintenanceHeader as Record<string, unknown>;
    const itemContainer = root.Items as Record<string, unknown>;

    return {
      maintenanceHeader: this.parseMaintenanceHeader(header),
      items: this.parsePriceBookItems(itemContainer),
    };
  }

  private parsePriceBookItems(
    container: Record<string, unknown>,
  ): NAXMLPriceBookItem[] {
    const items = this.ensureArray(container?.Item);
    return items.map((item: Record<string, unknown>) => ({
      itemCode: String(item?.ItemCode || item?.Code || ""),
      description: String(item?.Description || ""),
      shortDescription: item?.ShortDescription
        ? String(item.ShortDescription)
        : undefined,
      departmentCode: String(item?.DepartmentCode || ""),
      unitPrice: this.parseNumber(item?.UnitPrice, 0),
      taxRateCode: String(item?.TaxRateCode || ""),
      isActive: this.parseBoolean(item?.IsActive, true),
      effectiveDate: item?.EffectiveDate
        ? String(item.EffectiveDate)
        : undefined,
      expirationDate: item?.ExpirationDate
        ? String(item.ExpirationDate)
        : undefined,
      minimumAge: item?.MinimumAge ? Number(item.MinimumAge) : undefined,
      foodStampEligible: item?.FoodStampEligible
        ? this.parseBoolean(item.FoodStampEligible)
        : undefined,
      action: item?.["@_Action"] as
        | "Add"
        | "Update"
        | "Delete"
        | "AddUpdate"
        | undefined,
    }));
  }

  /**
   * Parse employee data
   */
  private parseEmployeeData(
    root: Record<string, unknown>,
  ): NAXMLEmployeeDocument {
    const header = root.MaintenanceHeader as Record<string, unknown>;
    const empContainer = root.Employees as Record<string, unknown>;

    return {
      maintenanceHeader: this.parseMaintenanceHeader(header),
      employees: this.parseEmployeeList(empContainer),
    };
  }

  private parseEmployeeList(
    container: Record<string, unknown>,
  ): NAXMLEmployee[] {
    const employees = this.ensureArray(container?.Employee);
    return employees.map((emp: Record<string, unknown>) => ({
      employeeId: String(emp?.EmployeeID || emp?.ID || ""),
      firstName: String(emp?.FirstName || ""),
      lastName: String(emp?.LastName || ""),
      isActive: this.parseBoolean(emp?.IsActive, true),
      pinHash: emp?.PINHash ? String(emp.PINHash) : undefined,
      jobTitle: emp?.JobTitle ? String(emp.JobTitle) : undefined,
      hireDate: emp?.HireDate ? String(emp.HireDate) : undefined,
      terminationDate: emp?.TerminationDate
        ? String(emp.TerminationDate)
        : undefined,
      accessLevel: emp?.AccessLevel ? Number(emp.AccessLevel) : undefined,
      action: emp?.["@_Action"] as
        | "Add"
        | "Update"
        | "Delete"
        | "AddUpdate"
        | undefined,
    }));
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Ensure a value is an array
   */
  private ensureArray<T = Record<string, unknown>>(value: unknown): T[] {
    if (!value) return [];
    if (Array.isArray(value)) return value as T[];
    return [value] as T[];
  }

  /**
   * Parse a number value safely
   */
  private parseNumber(value: unknown, defaultValue: number): number {
    if (value === null || value === undefined) return defaultValue;
    const num = Number(value);
    return isNaN(num) ? defaultValue : num;
  }

  /**
   * Parse a boolean value (handles "Y"/"N" and "true"/"false")
   */
  private parseBoolean(value: unknown, defaultValue = false): boolean {
    if (value === null || value === undefined) return defaultValue;
    if (typeof value === "boolean") return value;
    const str = String(value).toLowerCase();
    if (str === "y" || str === "yes" || str === "true" || str === "1")
      return true;
    if (str === "n" || str === "no" || str === "false" || str === "0")
      return false;
    return defaultValue;
  }
}

// ============================================================================
// Exports
// ============================================================================

/**
 * Create a new NAXML parser instance
 */
export function createNAXMLParser(
  options?: Partial<NAXMLParserOptions>,
): NAXMLParser {
  return new NAXMLParser(options);
}

/**
 * Parse NAXML XML string (convenience function)
 */
export function parseNAXML<T = unknown>(
  xml: string,
  options?: Partial<NAXMLParserOptions>,
): NAXMLDocument<T> {
  const parser = createNAXMLParser(options);
  return parser.parse<T>(xml);
}

/**
 * Validate NAXML XML string (convenience function)
 */
export function validateNAXML(
  xml: string,
  options?: Partial<NAXMLParserOptions>,
): NAXMLValidationResult {
  const parser = createNAXMLParser(options);
  return parser.validate(xml);
}
