/**
 * Document Scanning Types
 *
 * Type definitions for the OCR document scanning feature.
 * Implements enterprise-grade type safety for document processing.
 *
 * Enterprise coding standards applied:
 * - SEC-014: Strict input validation schemas with Zod
 * - API-001: Typed request/response interfaces
 * - DB-006: Tenant isolation through store_id scoping
 *
 * @module document-scanning.types
 */

import { z } from "zod";

// ============================================================================
// DOCUMENT TYPE REGISTRY
// ============================================================================

/**
 * Supported document types for OCR scanning.
 * Each type has specific extraction rules and field mappings.
 *
 * SEC-014: Strict allowlist for document types - no arbitrary document processing
 */
export const DocumentType = {
  /** Daily lottery sales report - extracts wizard fields + full data */
  LOTTERY_SALES_REPORT: "LOTTERY_SALES_REPORT",
  /** Weekly lottery invoice report - analytics only */
  LOTTERY_INVOICE_REPORT: "LOTTERY_INVOICE_REPORT",
  /** Gaming machine report - future implementation */
  GAMING_REPORT: "GAMING_REPORT",
} as const;

export type DocumentType = (typeof DocumentType)[keyof typeof DocumentType];

/**
 * Storage provider types for scanned documents.
 * Flexible architecture allows switching providers via environment config.
 */
export const StorageProvider = {
  /** Amazon S3 - production recommendation */
  S3: "S3",
  /** Cloudflare R2 - S3-compatible alternative */
  R2: "R2",
  /** Local filesystem - development only */
  LOCAL: "LOCAL",
  /** Azure Blob Storage - enterprise alternative */
  AZURE: "AZURE",
} as const;

export type StorageProvider =
  (typeof StorageProvider)[keyof typeof StorageProvider];

/**
 * OCR processing status for tracking document processing lifecycle.
 */
export const OCRStatus = {
  /** Document received, awaiting preprocessing */
  PENDING: "PENDING",
  /** Image preprocessing in progress */
  PREPROCESSING: "PREPROCESSING",
  /** OCR extraction in progress */
  EXTRACTING: "EXTRACTING",
  /** Awaiting user verification */
  AWAITING_VERIFICATION: "AWAITING_VERIFICATION",
  /** User confirmed extracted data */
  VERIFIED: "VERIFIED",
  /** Processing failed - see error details */
  FAILED: "FAILED",
  /** Document rejected by user */
  REJECTED: "REJECTED",
} as const;

export type OCRStatus = (typeof OCRStatus)[keyof typeof OCRStatus];

/**
 * Entry method for how data was captured.
 */
export const EntryMethod = {
  /** Data extracted via OCR scanning */
  SCAN: "SCAN",
  /** Data entered manually by user */
  MANUAL: "MANUAL",
} as const;

export type EntryMethod = (typeof EntryMethod)[keyof typeof EntryMethod];

// ============================================================================
// LOTTERY REPORT STRUCTURE
// ============================================================================

/**
 * Online Summary section from lottery report.
 * Matches exact field names from Georgia Lottery terminal reports.
 */
export interface LotteryOnlineSummary {
  /** Number of sales transactions */
  salesCount: number;
  /** Total sales amount */
  salesAmount: number;
  /** Number of cancelled transactions */
  cancelsCount: number;
  /** Total cancellation amount (negative) */
  cancelsAmount: number;
  /** Number of free ticket redemptions */
  freeTicketsCount: number;
  /** Free tickets amount */
  freeTicketsAmount: number;
  /** Number of promo free tickets */
  promoFreeTicketsCount: number;
  /** Promo free tickets amount (negative) */
  promoFreeTicketsAmount: number;
  /** Number of promo discounts */
  promoDiscountsCount: number;
  /** Promo discounts amount */
  promoDiscountsAmount: number;
  /** NET SALES - primary wizard field for online sales */
  netSales: number;
  /** Number of cashes/redemptions */
  cashesCount: number;
  /** CASHES amount - primary wizard field for online cashes (negative on report) */
  cashesAmount: number;
  /** Number of promo cash prizes */
  promoCashPrizesCount: number;
  /** Promo cash prizes amount */
  promoCashPrizesAmount: number;
  /** Sales commission (negative) */
  salesCommission: number;
  /** Net online total */
  netOnline: number;
}

/**
 * Instant Summary section from lottery report.
 * Tracks scratch-off ticket activity.
 */
export interface LotteryInstantSummary {
  /** Number of pack settlements */
  settlementsCount: number;
  /** Total settlements amount */
  settlementsAmount: number;
  /** Number of cashes/redemptions */
  cashesCount: number;
  /** CASHES amount - primary wizard field for instant cashes (negative on report) */
  cashesAmount: number;
  /** Number of promo credits */
  promoCreditCount: number;
  /** Promo credit amount */
  promoCreditAmount: number;
  /** Number of returns */
  returnsCount: number;
  /** Returns amount */
  returnsAmount: number;
  /** Sales commission (negative) */
  salesCommission: number;
  /** Net instant total */
  netInstant: number;
}

/**
 * Cashless Summary section from lottery report.
 */
export interface LotteryCashlessSummary {
  /** Online cashless sales debit count */
  onlCashlessDebitCount: number;
  /** Online cashless sales debit amount */
  onlCashlessDebitAmount: number;
  /** Online cashless sales commission */
  onlCashlessComm: number;
  /** Online cashless sales credit */
  onlCashlessCredit: number;
  /** Instant cashless sales credit count */
  insCashlessCreditCount: number;
  /** Instant cashless sales credit amount */
  insCashlessCreditAmount: number;
  /** Net cashless total */
  netCashless: number;
}

/**
 * Totals section from lottery report.
 */
export interface LotteryTotals {
  /** Adjustments amount */
  adjustments: number;
  /** Service fee (invoice report only) */
  serviceFee?: number;
  /** Total net due */
  totalNetDue: number;
  /** Total EFT amount (invoice report only) */
  totalEftAmount?: number;
  /** Sweep date (invoice report only) */
  sweepDate?: string;
}

/**
 * Report header/metadata from lottery report.
 */
export interface LotteryReportHeader {
  /** Report type identifier */
  reportType: "SALES_REPORT" | "INVOICE_REPORT";
  /** Report date/time from header */
  reportDate: string;
  /** Week ending date (invoice report) */
  weekEnding?: string;
  /** Retailer ID from terminal */
  retailerId: string;
}

/**
 * Complete extracted lottery report data.
 * Contains all sections for analytics storage.
 */
export interface ExtractedLotteryReport {
  /** Report header/metadata */
  header: LotteryReportHeader;
  /** Online games summary */
  onlineSummary: LotteryOnlineSummary;
  /** Instant/scratch-off summary */
  instantSummary: LotteryInstantSummary;
  /** Cashless transactions summary */
  cashlessSummary: LotteryCashlessSummary;
  /** Report totals */
  totals: LotteryTotals;
}

/**
 * Wizard fields extracted from lottery sales report.
 * These are the 3 fields that populate the Day Close wizard.
 */
export interface LotteryWizardFields {
  /** NET SALES from Online Summary */
  onlineSales: number;
  /** CASHES from Online Summary (absolute value) */
  onlineCashes: number;
  /** CASHES from Instant Summary (absolute value) */
  instantCashes: number;
}

// ============================================================================
// DOCUMENT TYPE CONFIGURATION
// ============================================================================

/**
 * Configuration for a specific document type.
 * Defines extraction rules, field mappings, and validation.
 */
export interface DocumentTypeConfig {
  /** Unique document type identifier */
  type: DocumentType;
  /** Human-readable name */
  name: string;
  /** Description of the document */
  description: string;
  /** Expected scanning frequency */
  frequency: "daily" | "weekly" | "monthly" | "on_demand";
  /** Fields to extract for wizard population */
  wizardFields: string[];
  /** Whether to save full extracted data for analytics */
  saveFullData: boolean;
  /** Report sections to extract */
  sections: string[];
  /** MIME types allowed for this document */
  allowedMimeTypes: string[];
  /** Maximum file size in bytes */
  maxFileSizeBytes: number;
}

/**
 * Document type registry - configuration for all supported document types.
 * SEC-014: Strict allowlist of document configurations
 */
export const DOCUMENT_TYPE_CONFIGS: Record<DocumentType, DocumentTypeConfig> = {
  [DocumentType.LOTTERY_SALES_REPORT]: {
    type: DocumentType.LOTTERY_SALES_REPORT,
    name: "Lottery Sales Report",
    description: "Daily lottery terminal sales report",
    frequency: "daily",
    wizardFields: ["onlineSales", "onlineCashes", "instantCashes"],
    saveFullData: true,
    sections: [
      "ONLINE_SUMMARY",
      "INSTANT_SUMMARY",
      "CASHLESS_SUMMARY",
      "TOTALS",
    ],
    allowedMimeTypes: [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
    ],
    maxFileSizeBytes: 10 * 1024 * 1024, // 10MB
  },
  [DocumentType.LOTTERY_INVOICE_REPORT]: {
    type: DocumentType.LOTTERY_INVOICE_REPORT,
    name: "Lottery Invoice Report",
    description: "Weekly lottery terminal invoice report",
    frequency: "weekly",
    wizardFields: [], // No wizard fields - analytics only
    saveFullData: true,
    sections: [
      "ONLINE_SUMMARY",
      "INSTANT_SUMMARY",
      "CASHLESS_SUMMARY",
      "TOTALS",
      "EFT",
    ],
    allowedMimeTypes: [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
    ],
    maxFileSizeBytes: 10 * 1024 * 1024, // 10MB
  },
  [DocumentType.GAMING_REPORT]: {
    type: DocumentType.GAMING_REPORT,
    name: "Gaming Report",
    description: "Gaming machine activity report",
    frequency: "daily",
    wizardFields: ["gamingSales", "gamingPayouts"],
    saveFullData: true,
    sections: ["GAMING_SUMMARY"],
    allowedMimeTypes: [
      "image/jpeg",
      "image/png",
      "image/webp",
      "application/pdf",
    ],
    maxFileSizeBytes: 10 * 1024 * 1024, // 10MB
  },
};

// ============================================================================
// API REQUEST/RESPONSE TYPES
// ============================================================================

/**
 * Request to initiate document scanning.
 * SEC-014: Validated via Zod schema
 * Includes full traceability context.
 */
export interface ScanDocumentRequest {
  /** Store ID for tenant isolation */
  storeId: string;
  /** Document type being scanned */
  documentType: DocumentType;
  /** Base64-encoded image data or presigned URL */
  imageData: string;
  /** Original filename (sanitized) */
  filename: string;
  /** MIME type of the image */
  mimeType: string;
  /** File size in bytes */
  fileSizeBytes: number;
  /** Day summary ID to link to (for wizard integration) */
  daySummaryId?: string;
  /** Shift ID - which shift is open during scanning */
  shiftId?: string;
  /** Cashier ID - which cashier is performing the scan */
  cashierId?: string;
  /** Business date for the report (YYYY-MM-DD format) */
  businessDate: string;
}

/**
 * Response from document scanning initiation.
 */
export interface ScanDocumentResponse {
  /** Success indicator */
  success: boolean;
  /** Scanned document record ID */
  documentId: string;
  /** Current processing status */
  status: OCRStatus;
  /** Extracted wizard fields (if successful) */
  wizardFields?: LotteryWizardFields;
  /** Full extracted data (if successful and configured) */
  extractedData?: ExtractedLotteryReport;
  /** OCR confidence score (0-100) */
  confidenceScore?: number;
  /** Presigned URL to view the scanned image */
  imageUrl?: string;
  /** Date validation result - critical for ensuring correct report */
  dateValidation?: DateValidationResult;
  /** Error message if failed */
  error?: string;
  /** Error code for programmatic handling */
  errorCode?: DocumentScanErrorCode;
}

/**
 * Request to verify/confirm extracted data.
 */
export interface VerifyDocumentRequest {
  /** Scanned document ID */
  documentId: string;
  /** User-confirmed wizard fields */
  confirmedWizardFields: LotteryWizardFields;
  /** Whether to accept or reject the scan */
  action: "accept" | "reject";
  /** Rejection reason (if rejected) */
  rejectionReason?: string;
}

/**
 * Response from document verification.
 */
export interface VerifyDocumentResponse {
  /** Success indicator */
  success: boolean;
  /** Final document status */
  status: OCRStatus;
  /** Confirmed wizard fields (if accepted) */
  wizardFields?: LotteryWizardFields;
  /** Error message if failed */
  error?: string;
}

/**
 * Request to retrieve a scanned document.
 */
export interface GetDocumentRequest {
  /** Scanned document ID */
  documentId: string;
  /** Store ID for tenant isolation verification */
  storeId: string;
}

/**
 * Full scanned document record for retrieval.
 * Includes complete traceability: who, when, which shift, which cashier.
 */
export interface ScannedDocumentRecord {
  /** Document ID */
  documentId: string;
  /** Store ID - tenant isolation */
  storeId: string;
  /** Document type */
  documentType: DocumentType;
  /** Day summary ID (if linked to day close) */
  daySummaryId?: string;
  /** Shift ID - which shift was open when scanned */
  shiftId?: string;
  /** Cashier ID - which cashier performed the scan (if authenticated via PIN) */
  cashierId?: string;
  /** Business date this report belongs to */
  businessDate: Date;
  /** Processing status */
  status: OCRStatus;
  /** Storage provider used */
  storageProvider: StorageProvider;
  /** Storage path/key in cloud storage */
  storagePath: string;
  /** S3 bucket name (for future multi-bucket support) */
  storageBucket?: string;
  /** Original filename (sanitized) */
  originalFilename: string;
  /** File size in bytes */
  fileSizeBytes: number;
  /** MIME type */
  mimeType: string;
  /** SHA-256 hash of file for integrity verification */
  fileHash?: string;
  /** OCR-extracted wizard fields (raw from OCR) */
  ocrWizardFields?: LotteryWizardFields;
  /** User-confirmed wizard fields (after verification) */
  confirmedWizardFields?: LotteryWizardFields;
  /** Full extracted report data for analytics */
  extractedData?: ExtractedLotteryReport;
  /** OCR confidence score (0-100) */
  confidenceScore?: number;
  /** Entry method */
  entryMethod: EntryMethod;
  /** Report date extracted from the scanned document */
  reportDate?: Date;
  /** Retailer ID extracted from the scanned document */
  retailerId?: string;

  // ========== AUDIT TRAIL ==========
  /** User ID who initiated the scan */
  scannedByUserId: string;
  /** Timestamp when scan was initiated */
  scannedAt: Date;
  /** User ID who verified/confirmed the data */
  verifiedByUserId?: string;
  /** Timestamp when data was verified */
  verifiedAt?: Date;
  /** Rejection reason if document was rejected */
  rejectionReason?: string;

  // ========== TIMESTAMPS ==========
  /** Created timestamp */
  createdAt: Date;
  /** Updated timestamp */
  updatedAt: Date;
}

// ============================================================================
// ZOD VALIDATION SCHEMAS
// ============================================================================

/**
 * Zod schema for document type validation.
 * SEC-014: Strict allowlist validation
 */
export const DocumentTypeSchema = z.enum([
  DocumentType.LOTTERY_SALES_REPORT,
  DocumentType.LOTTERY_INVOICE_REPORT,
  DocumentType.GAMING_REPORT,
]);

/**
 * Zod schema for MIME type validation.
 * SEC-015: Strict allowlist for file types
 */
export const AllowedMimeTypeSchema = z.enum([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

/**
 * Zod schema for scan document request validation.
 * SEC-014: Comprehensive input validation
 * SEC-015: File security validation
 */
export const ScanDocumentRequestSchema = z.object({
  storeId: z.string().uuid("Invalid store ID format"),
  documentType: DocumentTypeSchema,
  imageData: z
    .string()
    .min(1, "Image data is required")
    .max(15 * 1024 * 1024, "Image data exceeds maximum size"), // ~10MB base64
  filename: z
    .string()
    .min(1, "Filename is required")
    .max(255, "Filename too long")
    .regex(/^[a-zA-Z0-9_\-. ]+$/, "Filename contains invalid characters"),
  mimeType: AllowedMimeTypeSchema,
  fileSizeBytes: z
    .number()
    .int()
    .positive()
    .max(10 * 1024 * 1024, "File size exceeds 10MB limit"),
  daySummaryId: z.string().uuid("Invalid day summary ID format").optional(),
  shiftId: z.string().uuid("Invalid shift ID format").optional(),
  cashierId: z.string().uuid("Invalid cashier ID format").optional(),
  cashierSessionId: z
    .string()
    .uuid("Invalid cashier session ID format")
    .optional(),
  terminalId: z.string().uuid("Invalid terminal ID format").optional(),
  lotteryDayId: z.string().uuid("Invalid lottery day ID format").optional(),
  businessDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Business date must be in YYYY-MM-DD format"),
});

/**
 * Zod schema for lottery wizard fields.
 */
export const LotteryWizardFieldsSchema = z.object({
  onlineSales: z.number().nonnegative("Online sales cannot be negative"),
  onlineCashes: z.number().nonnegative("Online cashes cannot be negative"),
  instantCashes: z.number().nonnegative("Instant cashes cannot be negative"),
});

/**
 * Zod schema for verify document request.
 * SEC-014: Input validation for verification endpoint
 */
export const VerifyDocumentRequestSchema = z.object({
  documentId: z.string().uuid("Invalid document ID format"),
  confirmedWizardFields: LotteryWizardFieldsSchema,
  action: z.enum(["accept", "reject"]),
  rejectionReason: z.string().max(500, "Rejection reason too long").optional(),
});

/**
 * Zod schema for get document request.
 */
export const GetDocumentRequestSchema = z.object({
  documentId: z.string().uuid("Invalid document ID format"),
  storeId: z.string().uuid("Invalid store ID format"),
});

// ============================================================================
// STORAGE PROVIDER TYPES
// ============================================================================

/**
 * Storage upload result from provider.
 */
export interface StorageUploadResult {
  /** Success indicator */
  success: boolean;
  /** Storage provider used */
  provider: StorageProvider;
  /** Storage bucket/container */
  bucket?: string;
  /** Storage key/path */
  key: string;
  /** Storage region */
  region?: string;
  /** Presigned URL for access (time-limited) */
  url?: string;
  /** Error message if failed */
  error?: string;
}

/**
 * Storage provider interface for abstraction.
 * Allows swapping between S3, R2, Azure, local, etc.
 */
export interface IStorageProvider {
  /** Provider identifier */
  readonly provider: StorageProvider;

  /**
   * Upload a file to storage.
   * @param key - Storage key/path
   * @param data - File data as Buffer
   * @param mimeType - MIME type for Content-Type header
   * @returns Upload result with path and optional URL
   */
  upload(
    key: string,
    data: Buffer,
    mimeType: string,
  ): Promise<StorageUploadResult>;

  /**
   * Generate a presigned URL for temporary access.
   * @param key - Storage key/path
   * @param expiresInSeconds - URL validity duration
   * @returns Presigned URL string
   */
  getPresignedUrl(key: string, expiresInSeconds: number): Promise<string>;

  /**
   * Delete a file from storage.
   * @param key - Storage key/path
   * @returns Success indicator
   */
  delete(key: string): Promise<boolean>;

  /**
   * Check if a file exists.
   * @param key - Storage key/path
   * @returns Existence indicator
   */
  exists(key: string): Promise<boolean>;
}

// ============================================================================
// OCR SERVICE TYPES
// ============================================================================

/**
 * OCR extraction result from processing.
 */
export interface OCRExtractionResult {
  /** Success indicator */
  success: boolean;
  /** Raw extracted text (for debugging) */
  rawText?: string;
  /** Structured extracted data */
  extractedData?: ExtractedLotteryReport;
  /** Wizard fields for quick access */
  wizardFields?: LotteryWizardFields;
  /** Confidence score (0-100) */
  confidenceScore: number;
  /** Processing time in milliseconds */
  processingTimeMs: number;
  /** Error message if failed */
  error?: string;
}

/**
 * Image preprocessing result.
 */
export interface ImagePreprocessResult {
  /** Success indicator */
  success: boolean;
  /** Processed image as Buffer */
  processedImage?: Buffer;
  /** New MIME type (after conversion if applicable) */
  mimeType: string;
  /** Processing operations applied */
  operationsApplied: string[];
  /** Error message if failed */
  error?: string;
}

// ============================================================================
// DATE VALIDATION TYPES
// ============================================================================

/**
 * Date validation result for scanned documents.
 * Ensures reports match the expected business date.
 */
export interface DateValidationResult {
  /** Whether the date is valid */
  isValid: boolean;
  /** Expected date from the system (business date being closed) */
  expectedDate: string;
  /** Date found on the scanned report */
  reportDate: string;
  /** Human-readable error message if invalid */
  errorMessage?: string;
}

/**
 * Date validation rules per document type.
 * Sales reports must match current business date.
 * Invoice reports must be from the Saturday of that week.
 */
export interface DateValidationRule {
  /** Document type */
  documentType: DocumentType;
  /** Description of the validation rule */
  description: string;
  /**
   * Validate the report date against expected date.
   * @param reportDate - Date extracted from the scanned report
   * @param expectedDate - Expected business date from the system
   * @returns Validation result
   */
  validate: (reportDate: Date, expectedDate: Date) => DateValidationResult;
}

/**
 * Generate user-friendly date mismatch error message.
 * @param documentType - Type of document being scanned
 * @param reportDate - Date found on the report
 * @param expectedDate - Expected date
 * @returns Formatted error message
 */
export function generateDateMismatchMessage(
  documentType: DocumentType,
  reportDate: string,
  expectedDate: string,
): string {
  if (documentType === DocumentType.LOTTERY_SALES_REPORT) {
    return `Date mismatch: This Sales Report is dated ${reportDate}, but you are closing ${expectedDate}. Please scan the Sales Report for ${expectedDate}.`;
  }
  if (documentType === DocumentType.LOTTERY_INVOICE_REPORT) {
    return `Date mismatch: This Invoice Report is for week ending ${reportDate}, but the expected week ending date is ${expectedDate}. Please scan the correct Invoice Report.`;
  }
  return `Date mismatch: Report date ${reportDate} does not match expected date ${expectedDate}. Please scan the correct report.`;
}

// ============================================================================
// ERROR TYPES
// ============================================================================

/**
 * Document scanning error codes.
 * API-003: Structured error codes for client handling
 */
export const DocumentScanErrorCode = {
  /** Invalid document type */
  INVALID_DOCUMENT_TYPE: "INVALID_DOCUMENT_TYPE",
  /** File type not allowed */
  INVALID_FILE_TYPE: "INVALID_FILE_TYPE",
  /** File size exceeds limit */
  FILE_TOO_LARGE: "FILE_TOO_LARGE",
  /** Image preprocessing failed */
  PREPROCESSING_FAILED: "PREPROCESSING_FAILED",
  /** OCR extraction failed */
  EXTRACTION_FAILED: "EXTRACTION_FAILED",
  /** Storage upload failed */
  STORAGE_FAILED: "STORAGE_FAILED",
  /** Document not found */
  DOCUMENT_NOT_FOUND: "DOCUMENT_NOT_FOUND",
  /** Access denied - tenant isolation violation */
  ACCESS_DENIED: "ACCESS_DENIED",
  /** Document already verified */
  ALREADY_VERIFIED: "ALREADY_VERIFIED",
  /** Invalid image data (magic bytes mismatch) */
  INVALID_IMAGE_DATA: "INVALID_IMAGE_DATA",
  /** Report date does not match expected business date */
  DATE_MISMATCH: "DATE_MISMATCH",
  /** Could not extract date from report */
  DATE_EXTRACTION_FAILED: "DATE_EXTRACTION_FAILED",
} as const;

export type DocumentScanErrorCode =
  (typeof DocumentScanErrorCode)[keyof typeof DocumentScanErrorCode];

/**
 * Custom error class for document scanning errors.
 * API-003: Structured error with code and context
 */
export class DocumentScanError extends Error {
  public readonly code: DocumentScanErrorCode;
  public readonly context?: Record<string, unknown>;

  constructor(
    code: DocumentScanErrorCode,
    message: string,
    context?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "DocumentScanError";
    this.code = code;
    this.context = context;
  }
}

// ============================================================================
// DOCUMENT TYPE REGISTRY (Alias for backward compatibility)
// ============================================================================

/**
 * Document type registry - alias for DOCUMENT_TYPE_CONFIGS.
 * Maps document types to their configuration.
 */
export const DOCUMENT_TYPE_REGISTRY = DOCUMENT_TYPE_CONFIGS;

// ============================================================================
// DOCUMENT SCAN RESULT (Service Response)
// ============================================================================

/**
 * Result from document scanning service.
 * Contains all processed information for frontend display.
 */
export interface DocumentScanResult {
  /** Success indicator */
  success: boolean;
  /** Document UUID */
  documentId: string;
  /** Document type */
  documentType: DocumentType;
  /** Current processing status */
  status: OCRStatus;
  /** Storage information */
  storageInfo: {
    provider: StorageProvider;
    bucket: string;
    path: string;
    region?: string;
  };
  /** File metadata */
  fileInfo: {
    originalFilename: string;
    fileSizeBytes: number;
    mimeType: string;
    fileHash: string;
    imageWidth: number;
    imageHeight: number;
  };
  /** OCR extraction results */
  ocrResult: {
    confidence: number;
    rawTextLength: number;
    wizardFields?: LotteryWizardFields;
    fieldConfidence: Record<string, number>;
    reportDate?: string;
  };
  /** Date validation result */
  dateValidation?: DateValidationResult;
  /** Total processing time in ms */
  processingTimeMs: number;
  /** Preprocessing operations applied */
  preprocessingOperations: string[];
  /** Warnings during processing */
  warnings: string[];
  /** Traceability information */
  traceability: {
    storeId: string;
    companyId: string;
    businessDate: string;
    shiftId?: string;
    cashierId?: string;
    cashierSessionId?: string;
    terminalId?: string;
    daySummaryId?: string;
    lotteryDayId?: string;
    scannedByUserId: string;
    scannedAt: string;
  };
  /** Error information if failed */
  error?: {
    code: string;
    message: string;
  };
}

// ============================================================================
// LOTTERY SALES REPORT DATA (Simplified for OCR)
// ============================================================================

/**
 * Simplified lottery sales report data structure for OCR extraction.
 * Contains the key fields needed for the wizard.
 */
export interface LotterySalesReportData {
  /** Report date extracted from document */
  reportDate?: string;
  /** Retailer ID */
  retailerId?: string;
  /** Online summary section */
  onlineSummary: {
    netSales: number;
    cashes: number;
  };
  /** Instant summary section */
  instantSummary: {
    cashes: number;
  };
}
