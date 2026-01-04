/**
 * Document Scanning Service
 *
 * Orchestrates the complete document scanning workflow:
 * 1. Image validation and preprocessing
 * 2. OCR text extraction
 * 3. Field parsing and validation
 * 4. Storage to S3/cloud
 * 5. Database record creation
 *
 * Enterprise coding standards applied:
 * - SEC-015: File security with validation and secure storage
 * - API-003: Structured error handling
 * - LM-001: Structured logging with audit trail
 * - DB-006: Tenant isolation via store_id
 *
 * @module document-scanning.service
 */

import { randomUUID } from "crypto";
import {
  DocumentType,
  OCRStatus,
  LotteryWizardFields,
  DocumentScanResult,
  DOCUMENT_TYPE_REGISTRY,
} from "../../types/document-scanning.types";
import {
  ImagePreprocessingService,
  PreprocessingResult,
  getImagePreprocessingService,
} from "./image-preprocessing.service";
import { OCRService, OCRExtractionResult, getOCRService } from "./ocr.service";
import { getStorageProvider, generateStorageKey } from "../storage";

/**
 * Scan context with all traceability information.
 * DB-006: Complete tenant context for RLS.
 */
export interface ScanContext {
  /** Store UUID for tenant isolation */
  storeId: string;
  /** Company UUID for company-level queries */
  companyId: string;
  /** Business date for this scan (YYYY-MM-DD) */
  businessDate: string;
  /** User ID who initiated the scan */
  userId: string;
  /** Current shift ID (if any) */
  shiftId?: string;
  /** Cashier ID (if authenticated via PIN) */
  cashierId?: string;
  /** Cashier session ID */
  cashierSessionId?: string;
  /** Terminal ID (device being used) */
  terminalId?: string;
  /** Day summary ID (if day close in progress) */
  daySummaryId?: string;
  /** Lottery day ID (if lottery day active) */
  lotteryDayId?: string;
  /** Client IP address */
  clientIpAddress?: string;
  /** Client user agent */
  clientUserAgent?: string;
}

/**
 * Document scanning service for OCR processing.
 */
export class DocumentScanningService {
  private preprocessingService: ImagePreprocessingService;
  private ocrService: OCRService;

  constructor() {
    this.preprocessingService = getImagePreprocessingService();
    this.ocrService = getOCRService();
  }

  /**
   * Initialize the service (call on app startup).
   */
  async initialize(): Promise<void> {
    await this.ocrService.initialize();
    this.logOperation("initialize", { status: "success" });
  }

  /**
   * Shutdown the service (call on app shutdown).
   */
  async shutdown(): Promise<void> {
    await this.ocrService.terminate();
    this.logOperation("shutdown", { status: "success" });
  }

  /**
   * Process a scanned document.
   * Main entry point for the scanning workflow.
   *
   * @param imageBuffer - Raw image buffer from upload
   * @param originalFilename - Original filename for extension detection
   * @param mimeType - MIME type from upload
   * @param documentType - Expected document type
   * @param context - Scan context with traceability info
   * @returns Scan result with extracted data
   */
  async scanDocument(
    imageBuffer: Buffer,
    originalFilename: string,
    mimeType: string,
    documentType: DocumentType,
    context: ScanContext,
  ): Promise<DocumentScanResult> {
    const startTime = Date.now();
    const documentId = randomUUID();
    const warnings: string[] = [];

    try {
      // 1. Validate document type
      const typeConfig = DOCUMENT_TYPE_REGISTRY[documentType];
      if (!typeConfig) {
        throw new DocumentScanningError(
          "INVALID_DOCUMENT_TYPE",
          `Unknown document type: ${documentType}`,
        );
      }

      // 2. Validate MIME type
      if (!this.preprocessingService.isAllowedMimeType(mimeType)) {
        throw new DocumentScanningError(
          "INVALID_MIME_TYPE",
          `File type ${mimeType} is not allowed. Supported types: JPEG, PNG, WebP, TIFF, BMP`,
        );
      }

      // 3. Validate image (magic bytes, size, dimensions)
      const validation = await this.preprocessingService.validateImage(
        imageBuffer,
        typeConfig.maxFileSizeBytes,
      );
      if (!validation.isValid) {
        throw new DocumentScanningError(
          "IMAGE_VALIDATION_FAILED",
          validation.error || "Image validation failed",
        );
      }

      // 4. Preprocess image for OCR
      let preprocessingResult: PreprocessingResult;
      try {
        preprocessingResult = await this.preprocessingService.preprocess(
          imageBuffer,
          {
            grayscale: true,
            contrastLevel: 1.2,
            sharpenLevel: 1.0,
            denoise: true,
            outputFormat: "png",
          },
        );
      } catch (error) {
        throw new DocumentScanningError(
          "PREPROCESSING_FAILED",
          "Image preprocessing failed",
          error,
        );
      }

      // 5. Perform OCR extraction
      let ocrResult: OCRExtractionResult;
      try {
        ocrResult = await this.ocrService.extract(preprocessingResult.buffer, {
          documentType,
          expectedDate: context.businessDate,
          minConfidence: 50,
        });
      } catch (error) {
        throw new DocumentScanningError(
          "OCR_EXTRACTION_FAILED",
          "Text extraction failed",
          error,
        );
      }

      // Collect warnings from OCR
      warnings.push(...ocrResult.warnings);

      // 6. Check date validation
      let dateValidationPassed: boolean | undefined;
      let dateValidationError: string | undefined;
      if (ocrResult.dateValidation) {
        dateValidationPassed = ocrResult.dateValidation.isValid;
        if (!ocrResult.dateValidation.isValid) {
          dateValidationError = ocrResult.dateValidation.errorMessage;
          // Don't throw - let the user verify and confirm
          warnings.push(`Date mismatch: ${dateValidationError}`);
        }
      }

      // 7. Upload to cloud storage
      const storageProvider = getStorageProvider();
      const storageKey = generateStorageKey(
        context.storeId,
        documentId,
        originalFilename,
      );

      let storageResult;
      try {
        storageResult = await storageProvider.upload(
          storageKey,
          preprocessingResult.buffer, // Upload preprocessed image
          preprocessingResult.mimeType,
        );
      } catch (error) {
        throw new DocumentScanningError(
          "STORAGE_UPLOAD_FAILED",
          "Failed to upload document to storage",
          error,
        );
      }

      // 8. Calculate file hash for integrity (of preprocessed image)
      const fileHash = preprocessingResult.fileHash;

      // 9. Build the scan result
      const totalProcessingTime = Date.now() - startTime;

      const result: DocumentScanResult = {
        success: true,
        documentId,
        documentType,
        status: ocrResult.wizardFields ? "AWAITING_VERIFICATION" : "FAILED",
        storageInfo: {
          provider: storageResult.provider,
          bucket: storageResult.bucket || "",
          path: storageResult.key,
          region: storageResult.region,
        },
        fileInfo: {
          originalFilename,
          fileSizeBytes: imageBuffer.length,
          mimeType: preprocessingResult.mimeType,
          fileHash,
          imageWidth: preprocessingResult.processedWidth,
          imageHeight: preprocessingResult.processedHeight,
        },
        ocrResult: {
          confidence: ocrResult.confidence,
          rawTextLength: ocrResult.rawText.length,
          wizardFields: ocrResult.wizardFields,
          fieldConfidence: ocrResult.fieldConfidence,
          reportDate: ocrResult.reportDate,
        },
        dateValidation: ocrResult.dateValidation,
        processingTimeMs: totalProcessingTime,
        preprocessingOperations: preprocessingResult.operations,
        warnings,
        traceability: {
          storeId: context.storeId,
          companyId: context.companyId,
          businessDate: context.businessDate,
          shiftId: context.shiftId,
          cashierId: context.cashierId,
          cashierSessionId: context.cashierSessionId,
          terminalId: context.terminalId,
          daySummaryId: context.daySummaryId,
          lotteryDayId: context.lotteryDayId,
          scannedByUserId: context.userId,
          scannedAt: new Date().toISOString(),
        },
      };

      // LM-001: Log successful scan
      this.logOperation("scanDocument", {
        documentId,
        documentType,
        storeId: context.storeId,
        status: result.status,
        confidence: ocrResult.confidence.toFixed(1),
        hasWizardFields: !!ocrResult.wizardFields,
        dateValidationPassed,
        processingTimeMs: totalProcessingTime,
        warningCount: warnings.length,
      });

      return result;
    } catch (error) {
      // LM-001: Log failed scan
      this.logOperation("scanDocument", {
        documentId,
        documentType,
        storeId: context.storeId,
        status: "FAILED",
        error: error instanceof Error ? error.message : String(error),
        processingTimeMs: Date.now() - startTime,
      });

      if (error instanceof DocumentScanningError) {
        throw error;
      }
      throw new DocumentScanningError(
        "SCAN_FAILED",
        "Document scanning failed unexpectedly",
        error,
      );
    }
  }

  /**
   * Verify and confirm extracted wizard fields.
   * Called after user reviews and possibly corrects OCR results.
   *
   * @param documentId - Document UUID
   * @param confirmedFields - User-confirmed wizard fields
   * @param userId - User who verified
   * @returns Updated document record
   */
  async verifyDocument(
    documentId: string,
    confirmedFields: LotteryWizardFields,
    userId: string,
  ): Promise<{ success: boolean; documentId: string; status: OCRStatus }> {
    // This will be implemented to update the database record
    // For now, return success structure
    this.logOperation("verifyDocument", {
      documentId,
      verifiedByUserId: userId,
      fields: {
        onlineSales: confirmedFields.onlineSales,
        onlineCashes: confirmedFields.onlineCashes,
        instantCashes: confirmedFields.instantCashes,
      },
    });

    return {
      success: true,
      documentId,
      status: "VERIFIED",
    };
  }

  /**
   * Reject a scanned document.
   *
   * @param documentId - Document UUID
   * @param reason - Rejection reason
   * @param rejectionCode - Rejection code
   * @param userId - User who rejected
   */
  async rejectDocument(
    documentId: string,
    reason: string,
    rejectionCode: string,
    userId: string,
  ): Promise<{ success: boolean; documentId: string; status: OCRStatus }> {
    this.logOperation("rejectDocument", {
      documentId,
      rejectedByUserId: userId,
      rejectionCode,
      // Don't log the full reason as it might contain PII
      hasReason: !!reason,
    });

    return {
      success: true,
      documentId,
      status: "REJECTED",
    };
  }

  /**
   * Get a presigned URL for viewing a scanned document.
   *
   * @param storagePath - Storage path of the document
   * @param expiresInSeconds - URL expiration time (default: 1 hour)
   * @returns Presigned URL
   */
  async getDocumentUrl(
    storagePath: string,
    expiresInSeconds: number = 3600,
  ): Promise<string> {
    const storageProvider = getStorageProvider();
    return storageProvider.getPresignedUrl(storagePath, expiresInSeconds);
  }

  /**
   * Structured logging for document scanning operations.
   * LM-001: Audit trail without sensitive data.
   */
  private logOperation(operation: string, data: Record<string, unknown>): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      service: "DocumentScanningService",
      operation,
      ...data,
    };
    console.log("[DocumentScanning]", JSON.stringify(logEntry));
  }
}

/**
 * Custom error class for document scanning failures.
 * API-003: Structured error handling.
 */
export class DocumentScanningError extends Error {
  readonly code: string;
  readonly originalError?: unknown;

  constructor(code: string, message: string, originalError?: unknown) {
    super(message);
    this.name = "DocumentScanningError";
    this.code = code;
    this.originalError = originalError;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, DocumentScanningError);
    }
  }

  toClientError(): { code: string; message: string } {
    return {
      code: this.code,
      message: this.message,
    };
  }
}

// Singleton instance
let documentScanningServiceInstance: DocumentScanningService | null = null;

/**
 * Get singleton instance of DocumentScanningService.
 */
export function getDocumentScanningService(): DocumentScanningService {
  if (!documentScanningServiceInstance) {
    documentScanningServiceInstance = new DocumentScanningService();
  }
  return documentScanningServiceInstance;
}
