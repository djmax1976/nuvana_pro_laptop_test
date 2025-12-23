/**
 * NAXML 3.4 Type Definitions
 *
 * Type definitions for NAXML (NACS XML) data exchange format.
 * Based on Conexxus NAXML specification for convenience store POS systems.
 *
 * Supports NAXML versions 3.2, 3.4, and 4.0.
 *
 * @module types/naxml.types
 * @see https://www.conexxus.org/retail-merchandise-data-exchange
 */

// ============================================================================
// NAXML Document Types
// ============================================================================

/**
 * Supported NAXML versions
 */
export type NAXMLVersion = "3.2" | "3.4" | "4.0";

/**
 * NAXML document types for different data exchanges
 */
export type NAXMLDocumentType =
  | "PriceBookMaintenance"
  | "TransactionDocument"
  | "InventoryMovement"
  | "EmployeeMaintenance"
  | "TenderMaintenance"
  | "DepartmentMaintenance"
  | "TaxRateMaintenance"
  | "Acknowledgment";

/**
 * NAXML maintenance action types
 */
export type NAXMLMaintenanceAction = "Add" | "Update" | "Delete" | "AddUpdate";

/**
 * NAXML transaction types
 */
export type NAXMLTransactionType =
  | "Sale"
  | "Refund"
  | "VoidSale"
  | "NoSale"
  | "PaidOut"
  | "PaidIn"
  | "SafeDrop"
  | "EndOfShift";

// ============================================================================
// NAXML Document Structures
// ============================================================================

/**
 * Base interface for all NAXML documents
 */
export interface NAXMLDocument<T = unknown> {
  /** Type of NAXML document */
  documentType: NAXMLDocumentType;
  /** NAXML version */
  version: NAXMLVersion;
  /** Document generation timestamp */
  timestamp: Date;
  /** Store location identifier */
  storeLocationId: string;
  /** Document data payload */
  data: T;
  /** Optional namespace URI */
  namespace?: string;
}

/**
 * NAXML parser options
 */
export interface NAXMLParserOptions {
  /** NAXML version to parse */
  version: NAXMLVersion;
  /** Whether to perform strict XSD validation */
  strictValidation: boolean;
  /** Whether to throw on unknown elements */
  throwOnUnknown: boolean;
  /** Whether to trim whitespace from values */
  trimWhitespace: boolean;
  /** Encoding (default: UTF-8) */
  encoding?: "UTF-8" | "ISO-8859-1";
}

/**
 * Default parser options
 */
export const DEFAULT_NAXML_PARSER_OPTIONS: NAXMLParserOptions = {
  version: "3.4",
  strictValidation: true,
  throwOnUnknown: false,
  trimWhitespace: true,
  encoding: "UTF-8",
};

/**
 * NAXML builder options
 */
export interface NAXMLBuilderOptions {
  /** NAXML version to generate */
  version: NAXMLVersion;
  /** Whether to include XML declaration */
  includeDeclaration: boolean;
  /** Whether to format with indentation */
  prettyPrint: boolean;
  /** Indentation string (default: 2 spaces) */
  indent?: string;
  /** Whether to include namespace */
  includeNamespace: boolean;
}

/**
 * Default builder options
 */
export const DEFAULT_NAXML_BUILDER_OPTIONS: NAXMLBuilderOptions = {
  version: "3.4",
  includeDeclaration: true,
  prettyPrint: true,
  indent: "  ",
  includeNamespace: true,
};

// ============================================================================
// Transaction Document Types
// ============================================================================

/**
 * NAXML Transaction Document structure
 */
export interface NAXMLTransactionDocument {
  /** Transaction header information */
  transactionHeader: NAXMLTransactionHeader;
  /** Line item details */
  transactionDetail: NAXMLTransactionDetail[];
  /** Tender/payment information */
  transactionTender: NAXMLTransactionTender[];
  /** Tax breakdown */
  transactionTax: NAXMLTransactionTax[];
  /** Transaction totals */
  transactionTotal: NAXMLTransactionTotal;
}

/**
 * Transaction header information
 */
export interface NAXMLTransactionHeader {
  /** Store location identifier */
  storeLocationId: string;
  /** Terminal/register identifier */
  terminalId: string;
  /** Unique transaction identifier */
  transactionId: string;
  /** Business date (YYYY-MM-DD) */
  businessDate: string;
  /** Full transaction timestamp (ISO 8601) */
  transactionDate: string;
  /** Type of transaction */
  transactionType: NAXMLTransactionType;
  /** Cashier identifier */
  cashierId?: string;
  /** Operator identifier */
  operatorId?: string;
  /** Shift number */
  shiftNumber?: string;
  /** Customer identifier */
  customerId?: string;
}

/**
 * Transaction line item detail
 */
export interface NAXMLTransactionDetail {
  /** Line number in transaction */
  lineNumber: number;
  /** Item/product code (UPC, PLU, or SKU) */
  itemCode: string;
  /** Item description */
  description: string;
  /** Department code */
  departmentCode: string;
  /** Quantity sold */
  quantity: number;
  /** Unit of measure */
  unitOfMeasure?: string;
  /** Unit price */
  unitPrice: number;
  /** Extended price (quantity * unit price) */
  extendedPrice: number;
  /** Tax code applicable to this item */
  taxCode?: string;
  /** Tax amount for this line */
  taxAmount: number;
  /** Discount amount applied */
  discountAmount?: number;
  /** Discount reason code */
  discountReasonCode?: string;
  /** Modifier codes (e.g., food stamp eligible) */
  modifierCodes?: string[];
  /** Whether this is a void line */
  isVoid?: boolean;
  /** Whether this is a refund line */
  isRefund?: boolean;
  /** Cost of goods (for margin calculation) */
  costAmount?: number;
}

/**
 * Transaction tender/payment
 */
export interface NAXMLTransactionTender {
  /** Tender type code */
  tenderCode: string;
  /** Tender type description */
  tenderDescription: string;
  /** Amount paid with this tender */
  amount: number;
  /** Reference number (e.g., check number, auth code) */
  referenceNumber?: string;
  /** Card type for electronic payments */
  cardType?: string;
  /** Last 4 digits of card (masked) */
  cardLast4?: string;
  /** Whether change was given */
  changeGiven?: number;
}

/**
 * Transaction tax breakdown
 */
export interface NAXMLTransactionTax {
  /** Tax code */
  taxCode: string;
  /** Tax description */
  taxDescription: string;
  /** Taxable amount */
  taxableAmount: number;
  /** Tax amount */
  taxAmount: number;
  /** Tax rate percentage */
  taxRate: number;
  /** Tax jurisdiction */
  jurisdiction?: string;
}

/**
 * Transaction totals
 */
export interface NAXMLTransactionTotal {
  /** Subtotal before tax */
  subtotal: number;
  /** Total tax amount */
  taxTotal: number;
  /** Grand total */
  grandTotal: number;
  /** Total discount applied */
  discountTotal?: number;
  /** Change due to customer */
  changeDue?: number;
  /** Number of items sold */
  itemCount?: number;
}

// ============================================================================
// Price Book Types
// ============================================================================

/**
 * NAXML Price Book maintenance document
 */
export interface NAXMLPriceBookDocument {
  /** Maintenance header */
  maintenanceHeader: NAXMLMaintenanceHeader;
  /** Price book items */
  items: NAXMLPriceBookItem[];
}

/**
 * Maintenance header for NAXML maintenance documents
 */
export interface NAXMLMaintenanceHeader {
  /** Store location ID */
  storeLocationId: string;
  /** Maintenance timestamp */
  maintenanceDate: string;
  /** Type of maintenance (Full, Incremental) */
  maintenanceType: "Full" | "Incremental";
  /** Effective date for changes */
  effectiveDate?: string;
  /** Sequence number for ordering */
  sequenceNumber?: number;
}

/**
 * Price book item definition
 */
export interface NAXMLPriceBookItem {
  /** Item code (UPC, PLU, or SKU) */
  itemCode: string;
  /** Item description */
  description: string;
  /** Short description for receipt */
  shortDescription?: string;
  /** Department code */
  departmentCode: string;
  /** Unit price */
  unitPrice: number;
  /** Tax rate code */
  taxRateCode: string;
  /** Whether item is active */
  isActive: boolean;
  /** Date when price becomes effective */
  effectiveDate?: string;
  /** Date when price expires */
  expirationDate?: string;
  /** Unit of measure */
  unitOfMeasure?: string;
  /** Pack size */
  packSize?: number;
  /** Item category */
  category?: string;
  /** Subcategory */
  subcategory?: string;
  /** Minimum age requirement */
  minimumAge?: number;
  /** Food stamp eligible */
  foodStampEligible?: boolean;
  /** Vendor code */
  vendorCode?: string;
  /** Cost price */
  costPrice?: number;
  /** Maintenance action */
  action?: NAXMLMaintenanceAction;
}

// ============================================================================
// Department Types
// ============================================================================

/**
 * NAXML Department maintenance document
 */
export interface NAXMLDepartmentDocument {
  /** Maintenance header */
  maintenanceHeader: NAXMLMaintenanceHeader;
  /** Departments */
  departments: NAXMLDepartment[];
}

/**
 * Department definition
 */
export interface NAXMLDepartment {
  /** Department code */
  departmentCode: string;
  /** Department description */
  description: string;
  /** Whether items are taxable by default */
  isTaxable: boolean;
  /** Default tax rate code */
  taxRateCode?: string;
  /** Minimum age requirement for purchase */
  minimumAge?: number;
  /** Whether department is active */
  isActive: boolean;
  /** Display sort order */
  sortOrder?: number;
  /** Parent department code (for hierarchies) */
  parentDepartmentCode?: string;
  /** Department type/category */
  departmentType?: string;
  /** Negative department (for refunds) */
  isNegative?: boolean;
  /** Maintenance action */
  action?: NAXMLMaintenanceAction;
}

// ============================================================================
// Tender Type Types
// ============================================================================

/**
 * NAXML Tender maintenance document
 */
export interface NAXMLTenderDocument {
  /** Maintenance header */
  maintenanceHeader: NAXMLMaintenanceHeader;
  /** Tender types */
  tenders: NAXMLTenderType[];
}

/**
 * Tender type definition
 */
export interface NAXMLTenderType {
  /** Tender code */
  tenderCode: string;
  /** Tender description */
  description: string;
  /** Whether this is cash or cash equivalent */
  isCashEquivalent: boolean;
  /** Whether this is an electronic payment */
  isElectronic: boolean;
  /** Whether this affects cash drawer */
  affectsCashDrawer: boolean;
  /** Whether a reference number is required */
  requiresReference: boolean;
  /** Whether this tender type is active */
  isActive: boolean;
  /** Display sort order */
  sortOrder?: number;
  /** Maximum amount allowed */
  maxAmount?: number;
  /** Minimum amount allowed */
  minAmount?: number;
  /** Maintenance action */
  action?: NAXMLMaintenanceAction;
}

// ============================================================================
// Tax Rate Types
// ============================================================================

/**
 * NAXML Tax Rate maintenance document
 */
export interface NAXMLTaxRateDocument {
  /** Maintenance header */
  maintenanceHeader: NAXMLMaintenanceHeader;
  /** Tax rates */
  taxRates: NAXMLTaxRate[];
}

/**
 * Tax rate definition
 */
export interface NAXMLTaxRate {
  /** Tax rate code */
  taxRateCode: string;
  /** Tax rate description */
  description: string;
  /** Tax rate as decimal (e.g., 0.0825 for 8.25%) */
  rate: number;
  /** Whether this tax rate is active */
  isActive: boolean;
  /** Jurisdiction code */
  jurisdictionCode?: string;
  /** Tax type (Sales, Use, Excise, etc.) */
  taxType?: string;
  /** Effective date */
  effectiveDate?: string;
  /** Expiration date */
  expirationDate?: string;
  /** Maintenance action */
  action?: NAXMLMaintenanceAction;
}

// ============================================================================
// Employee/Cashier Types
// ============================================================================

/**
 * NAXML Employee maintenance document
 */
export interface NAXMLEmployeeDocument {
  /** Maintenance header */
  maintenanceHeader: NAXMLMaintenanceHeader;
  /** Employees */
  employees: NAXMLEmployee[];
}

/**
 * Employee definition
 */
export interface NAXMLEmployee {
  /** Employee/Cashier ID */
  employeeId: string;
  /** First name */
  firstName: string;
  /** Last name */
  lastName: string;
  /** Whether this employee is active */
  isActive: boolean;
  /** Employee PIN (hashed in transit) */
  pinHash?: string;
  /** Job title/role */
  jobTitle?: string;
  /** Hire date */
  hireDate?: string;
  /** Termination date */
  terminationDate?: string;
  /** Access level */
  accessLevel?: number;
  /** Maintenance action */
  action?: NAXMLMaintenanceAction;
}

// ============================================================================
// Acknowledgment Types
// ============================================================================

/**
 * NAXML Acknowledgment document
 */
export interface NAXMLAcknowledgment {
  /** Original document ID being acknowledged */
  originalDocumentId: string;
  /** Original document type */
  originalDocumentType: NAXMLDocumentType;
  /** Acknowledgment status */
  status: "Received" | "Processed" | "Rejected" | "PartiallyProcessed";
  /** Timestamp of acknowledgment */
  timestamp: string;
  /** Number of records processed */
  recordsProcessed?: number;
  /** Number of records failed */
  recordsFailed?: number;
  /** Error messages if any */
  errors?: NAXMLAcknowledgmentError[];
}

/**
 * Acknowledgment error detail
 */
export interface NAXMLAcknowledgmentError {
  /** Error code */
  errorCode: string;
  /** Error message */
  errorMessage: string;
  /** Line number or record that caused error */
  lineNumber?: number;
  /** Field name that caused error */
  fieldName?: string;
  /** Invalid value that was rejected */
  rejectedValue?: string;
}

// ============================================================================
// Validation Types
// ============================================================================

/**
 * Validation result for NAXML documents
 */
export interface NAXMLValidationResult {
  /** Whether document is valid */
  isValid: boolean;
  /** Document type detected */
  documentType?: NAXMLDocumentType;
  /** NAXML version detected */
  version?: NAXMLVersion;
  /** Validation errors */
  errors: NAXMLValidationError[];
  /** Validation warnings (non-fatal) */
  warnings: NAXMLValidationWarning[];
}

/**
 * Validation error
 */
export interface NAXMLValidationError {
  /** Error code */
  code: string;
  /** Human-readable error message */
  message: string;
  /** Line number in XML */
  line?: number;
  /** Column number in XML */
  column?: number;
  /** XPath to problematic element */
  path?: string;
  /** Severity level */
  severity: "error" | "critical";
}

/**
 * Validation warning
 */
export interface NAXMLValidationWarning {
  /** Warning code */
  code: string;
  /** Human-readable warning message */
  message: string;
  /** Line number in XML */
  line?: number;
  /** XPath to problematic element */
  path?: string;
}

// ============================================================================
// File Processing Types
// ============================================================================

/**
 * File processing status
 */
export type NAXMLFileStatus =
  | "PENDING"
  | "PROCESSING"
  | "SUCCESS"
  | "PARTIAL"
  | "FAILED"
  | "SKIPPED";

/**
 * File direction
 */
export type NAXMLFileDirection = "IMPORT" | "EXPORT";

/**
 * NAXML file log entry
 */
export interface NAXMLFileLogEntry {
  /** Unique identifier */
  fileLogId: string;
  /** Store identifier */
  storeId: string;
  /** POS integration identifier */
  posIntegrationId: string;
  /** Original file name */
  fileName: string;
  /** File type (document type) */
  fileType: NAXMLDocumentType;
  /** Direction (import/export) */
  direction: NAXMLFileDirection;
  /** Processing status */
  status: NAXMLFileStatus;
  /** Number of records in file */
  recordCount?: number;
  /** Error message if failed */
  errorMessage?: string;
  /** SHA-256 hash for duplicate detection */
  fileHash: string;
  /** File size in bytes */
  fileSizeBytes: number;
  /** When file was processed */
  processedAt?: Date;
  /** When record was created */
  createdAt: Date;
}

/**
 * File watcher configuration
 */
export interface NAXMLFileWatcherConfig {
  /** Configuration identifier (auto-generated if not provided) */
  configId?: string;
  /** Store identifier */
  storeId: string;
  /** POS integration identifier */
  posIntegrationId: string;
  /** Path to watch for files */
  watchPath: string;
  /** Path to move processed files */
  processedPath?: string;
  /** Path to move error files */
  errorPath?: string;
  /** Poll interval in seconds */
  pollIntervalSeconds: number;
  /** Whether watcher is active */
  isActive: boolean;
  /** File patterns to watch (glob) */
  filePatterns: string[];
  /** Last poll timestamp */
  lastPollAt?: Date;
  /** Record timestamps (auto-set if not provided) */
  createdAt?: Date;
  updatedAt?: Date;
}

// ============================================================================
// Import/Export Result Types
// ============================================================================

/**
 * Result of importing NAXML data
 */
export interface NAXMLImportResult<T = unknown> {
  /** Whether import was successful */
  success: boolean;
  /** Document type that was imported */
  documentType: NAXMLDocumentType;
  /** Number of records processed */
  recordCount: number;
  /** Number of records successfully imported */
  successCount: number;
  /** Number of records that failed */
  failedCount: number;
  /** Imported data */
  data: T[];
  /** Errors encountered */
  errors: NAXMLImportError[];
  /** Processing duration in milliseconds */
  durationMs: number;
  /** Source file path */
  sourceFile?: string;
  /** File hash */
  fileHash?: string;
}

/**
 * Import error detail
 */
export interface NAXMLImportError {
  /** Line/record number */
  lineNumber?: number;
  /** Record identifier (e.g., item code) */
  recordId?: string;
  /** Error code */
  errorCode: string;
  /** Error message */
  errorMessage: string;
  /** Raw data that caused error */
  rawData?: string;
}

/**
 * Result of exporting NAXML data
 */
export interface NAXMLExportResult {
  /** Whether export was successful */
  success: boolean;
  /** Document type that was exported */
  documentType: NAXMLDocumentType;
  /** Number of records exported */
  recordCount: number;
  /** Generated file path */
  filePath: string;
  /** Generated file name */
  fileName: string;
  /** File size in bytes */
  fileSizeBytes: number;
  /** File hash */
  fileHash: string;
  /** Export duration in milliseconds */
  durationMs: number;
  /** Error message if failed */
  errorMessage?: string;
}
