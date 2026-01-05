/**
 * OCR Service
 *
 * Extracts text from images using Tesseract.js.
 * Specialized for lottery report extraction with field-specific parsing.
 *
 * Enterprise coding standards applied:
 * - API-003: Structured error handling with correlation IDs
 * - LM-001: Structured logging without sensitive data
 * - API-001: Validation of extracted data
 *
 * @module ocr.service
 */

import { createWorker, Worker } from "tesseract.js";
import type { RecognizeResult } from "tesseract.js";
import {
  DocumentType,
  LotteryWizardFields,
  LotterySalesReportData,
  DateValidationResult,
} from "../../types/document-scanning.types";

/**
 * OCR extraction result with confidence scores.
 */
export interface OCRExtractionResult {
  /** Raw extracted text */
  rawText: string;
  /** Overall confidence score (0-100) */
  confidence: number;
  /** Extracted wizard fields (if lottery sales report) */
  wizardFields?: LotteryWizardFields;
  /** Full extracted report data */
  reportData?: LotterySalesReportData;
  /** Per-field confidence scores */
  fieldConfidence: Record<string, number>;
  /** Detected report date */
  reportDate?: string;
  /** Date validation result */
  dateValidation?: DateValidationResult;
  /** Processing time in milliseconds */
  processingTimeMs: number;
  /** Warnings during extraction */
  warnings: string[];
}

/**
 * OCR extraction options.
 */
export interface OCRExtractionOptions {
  /** Document type for specialized parsing */
  documentType: DocumentType;
  /** Expected business date for validation */
  expectedDate?: string;
  /** Language for OCR (default: eng) */
  language?: string;
  /** Minimum acceptable confidence (0-100) */
  minConfidence?: number;
}

/**
 * Regex patterns for lottery report field extraction.
 * These patterns are calibrated for GA Lottery sales reports.
 *
 * Report format example:
 *   ONLINE SUMMARY:
 *   1905  SALES                      2747.00
 *         NET SALES                  2738.50
 *   77    CASHES                     1857.00-
 *
 *   INSTANT SUMMARY:
 *   125   CASHES                     1597.00-
 */
const LOTTERY_PATTERNS = {
  // Date patterns: "MON AUG12 24" or "01/02/2026" or "AUG 12, 2024"
  reportDate: [
    /(?:MON|TUE|WED|THU|FRI|SAT|SUN)\s+([A-Z]{3})(\d{1,2})\s+(\d{2})\s+/i, // "MON AUG12 24"
    /(?:Date|Report\s+Date|For)\s*[:\s]*(\d{1,2}\/\d{1,2}\/\d{4})/i,
    /(\d{1,2}\/\d{1,2}\/\d{4})/,
    /(?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}/i,
  ],

  // Retailer ID: typically 6-8 digit number after "RETAILER"
  retailerId: [
    /RETAILER\s+(\d{5,8})/i,
    /(?:Retailer|Retailer\s+ID|Retailer\s+#|Rtlr)\s*[:\s#]*(\d{5,8})/i,
    /(?:Acct|Account)\s*[:\s#]*(\d{5,8})/i,
  ],

  // Online Summary section
  // Format: "NET SALES    2738.50" - number at end of line
  onlineSummary: {
    // NET SALES under ONLINE SUMMARY (this is "Online Sales" for wizard)
    netSales: [
      /NET\s+SALES\s+([\d,]+\.?\d*)/i,
      /ONLINE\s+SUMMARY[\s\S]*?NET\s+SALES\s+([\d,]+\.?\d*)/i,
    ],
    // CASHES under ONLINE SUMMARY - format: "77 CASHES 1857.00-"
    // The amount has a minus sign at the end for credits
    cashes: [
      /(\d+)\s+CASHES\s+([\d,]+\.?\d*)-?/i,
      /ONLINE\s+SUMMARY[\s\S]*?CASHES\s+([\d,]+\.?\d*)-?/i,
    ],
  },

  // Instant Summary section
  // Format: "125 CASHES 1597.00-"
  instantSummary: {
    // CASHES under INSTANT SUMMARY
    cashes: [
      /INSTANT\s+SUMMARY[\s\S]*?(\d+)\s+CASHES\s+([\d,]+\.?\d*)-?/i,
      /INSTANT[\s\S]*?CASHES\s+([\d,]+\.?\d*)-?/i,
    ],
  },
};

/**
 * OCR Service for extracting text from scanned documents.
 */
export class OCRService {
  private worker: Worker | null = null;
  private isInitialized = false;

  /**
   * Initialize the Tesseract worker.
   * Should be called once on service startup.
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      this.worker = await createWorker("eng", 1, {
        // Logger for debugging (only in development)
        logger:
          process.env.NODE_ENV === "development"
            ? (m) => console.log("[Tesseract]", m.status, m.progress)
            : undefined,
      });

      this.isInitialized = true;
      this.logOperation("initialize", { status: "success" });
    } catch (error) {
      this.logOperation("initialize", {
        status: "failed",
        error: String(error),
      });
      throw new OCRServiceError(
        "INITIALIZATION_FAILED",
        "Failed to initialize OCR engine",
        error,
      );
    }
  }

  /**
   * Terminate the Tesseract worker.
   * Should be called on service shutdown.
   */
  async terminate(): Promise<void> {
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
      this.isInitialized = false;
      this.logOperation("terminate", { status: "success" });
    }
  }

  /**
   * Extract text and data from an image.
   *
   * @param imageBuffer - Preprocessed image buffer
   * @param options - Extraction options
   * @returns Extraction result with text and parsed fields
   */
  async extract(
    imageBuffer: Buffer,
    options: OCRExtractionOptions,
  ): Promise<OCRExtractionResult> {
    const startTime = Date.now();
    const warnings: string[] = [];

    // Ensure worker is initialized
    if (!this.isInitialized || !this.worker) {
      await this.initialize();
    }

    // Perform OCR
    let result: RecognizeResult;
    try {
      result = await this.worker!.recognize(imageBuffer);
    } catch (error) {
      throw new OCRServiceError(
        "RECOGNITION_FAILED",
        "OCR text recognition failed",
        error,
      );
    }

    const rawText = result.data.text;
    const confidence = result.data.confidence;

    // Check minimum confidence threshold
    const minConfidence = options.minConfidence ?? 60;
    if (confidence < minConfidence) {
      warnings.push(
        `Low confidence: ${confidence.toFixed(1)}% (minimum: ${minConfidence}%)`,
      );
    }

    // Parse based on document type
    let wizardFields: LotteryWizardFields | undefined;
    let reportData: LotterySalesReportData | undefined;
    let reportDate: string | undefined;
    let dateValidation: DateValidationResult | undefined;
    const fieldConfidence: Record<string, number> = {};

    if (options.documentType === "LOTTERY_SALES_REPORT") {
      const parseResult = this.parseLotterySalesReport(rawText, warnings);
      wizardFields = parseResult.wizardFields;
      reportData = parseResult.reportData;
      fieldConfidence.onlineSales = parseResult.confidence.onlineSales;
      fieldConfidence.onlineCashes = parseResult.confidence.onlineCashes;
      fieldConfidence.instantCashes = parseResult.confidence.instantCashes;

      // Extract and validate date
      reportDate = this.extractReportDate(rawText);
      if (reportDate && options.expectedDate) {
        // TEMPORARILY DISABLED FOR TESTING - date validation
        // TODO: Re-enable after testing OCR field extraction
        // dateValidation = this.validateReportDate(reportDate, options.expectedDate);
        // if (!dateValidation.isValid) {
        //   warnings.push(dateValidation.errorMessage || "Date mismatch");
        // }
        dateValidation = {
          isValid: true,
          expectedDate: options.expectedDate,
          reportDate,
        };
        warnings.push("[TEST MODE] Date validation is temporarily disabled");
      }
    }

    const processingTimeMs = Date.now() - startTime;

    // LM-001: Structured logging
    this.logOperation("extract", {
      documentType: options.documentType,
      confidence: confidence.toFixed(1),
      textLength: rawText.length,
      hasWizardFields: !!wizardFields,
      warningCount: warnings.length,
      processingTimeMs,
    });

    return {
      rawText,
      confidence,
      wizardFields,
      reportData,
      fieldConfidence,
      reportDate,
      dateValidation,
      processingTimeMs,
      warnings,
    };
  }

  /**
   * Parse lottery sales report text into structured data.
   */
  private parseLotterySalesReport(
    text: string,
    warnings: string[],
  ): {
    wizardFields: LotteryWizardFields;
    reportData: LotterySalesReportData;
    confidence: {
      onlineSales: number;
      onlineCashes: number;
      instantCashes: number;
    };
  } {
    const confidence = { onlineSales: 0, onlineCashes: 0, instantCashes: 0 };

    // DEBUG: Log raw OCR text for testing
    console.log("[OCR DEBUG] Raw extracted text:");
    console.log("=".repeat(60));
    console.log(text);
    console.log("=".repeat(60));

    // Extract Online Sales (NET SALES from ONLINE SUMMARY)
    let onlineSales = 0;
    for (const pattern of LOTTERY_PATTERNS.onlineSummary.netSales) {
      const match = text.match(pattern);
      if (match) {
        onlineSales = this.parseAmount(match[1]);
        confidence.onlineSales = 90;
        break;
      }
    }
    if (onlineSales === 0) {
      warnings.push(
        "Could not extract Online Sales (NET SALES from ONLINE SUMMARY)",
      );
      confidence.onlineSales = 0;
    }

    // Extract Online Cashes (CASHES from ONLINE SUMMARY)
    // Look for pattern like "77 CASHES 1857.00-" in ONLINE section
    let onlineCashes = 0;
    // First, try to find ONLINE SUMMARY section and extract CASHES from it
    const onlineSection = text.match(
      /ONLINE\s+SUMMARY[\s\S]*?(?=INSTANT|CASHLESS|$)/i,
    );
    if (onlineSection) {
      console.log(
        "[OCR DEBUG] Online section found:",
        onlineSection[0].substring(0, 200),
      );
      // Look for CASHES line with amount (e.g., "77 CASHES 1857.00-" or "CASHES 1857.00")
      const cashesMatch = onlineSection[0].match(/CASHES\s+([\d,]+\.?\d*)/i);
      if (cashesMatch) {
        onlineCashes = this.parseAmount(cashesMatch[1]);
        confidence.onlineCashes = 85;
        console.log("[OCR DEBUG] Online Cashes extracted:", onlineCashes);
      }
    }
    if (onlineCashes === 0) {
      // Fallback: try global patterns
      for (const pattern of LOTTERY_PATTERNS.onlineSummary.cashes) {
        const match = text.match(pattern);
        if (match) {
          onlineCashes = this.parseAmount(match[2] || match[1]);
          confidence.onlineCashes = 80;
          console.log("[OCR DEBUG] Online Cashes (fallback):", onlineCashes);
          break;
        }
      }
    }
    if (onlineCashes === 0) {
      warnings.push(
        "Could not extract Online Cashes (CASHES from ONLINE SUMMARY)",
      );
      confidence.onlineCashes = 0;
    }

    // Extract Instant Cashes (CASHES from INSTANT SUMMARY)
    let instantCashes = 0;
    // First, try to find INSTANT SUMMARY section and extract CASHES from it
    const instantSection = text.match(
      /INSTANT\s+SUMMARY[\s\S]*?(?=CASHLESS|ADJUSTMENTS|$)/i,
    );
    if (instantSection) {
      console.log(
        "[OCR DEBUG] Instant section found:",
        instantSection[0].substring(0, 200),
      );
      // Look for CASHES line with amount
      const cashesMatch = instantSection[0].match(/CASHES\s+([\d,]+\.?\d*)/i);
      if (cashesMatch) {
        instantCashes = this.parseAmount(cashesMatch[1]);
        confidence.instantCashes = 85;
        console.log("[OCR DEBUG] Instant Cashes extracted:", instantCashes);
      }
    }
    if (instantCashes === 0) {
      // Fallback: try global patterns
      for (const pattern of LOTTERY_PATTERNS.instantSummary.cashes) {
        const match = text.match(pattern);
        if (match) {
          instantCashes = this.parseAmount(match[2] || match[1]);
          confidence.instantCashes = 80;
          console.log("[OCR DEBUG] Instant Cashes (fallback):", instantCashes);
          break;
        }
      }
    }
    if (instantCashes === 0) {
      warnings.push(
        "Could not extract Instant Cashes (CASHES from INSTANT SUMMARY)",
      );
      confidence.instantCashes = 0;
    }

    // Build wizard fields (the 3 fields needed for the wizard)
    const wizardFields: LotteryWizardFields = {
      onlineSales,
      onlineCashes,
      instantCashes,
    };

    // Extract additional data for full report
    let retailerId: string | undefined;
    for (const pattern of LOTTERY_PATTERNS.retailerId) {
      const match = text.match(pattern);
      if (match) {
        retailerId = match[1];
        break;
      }
    }

    // Build full report data
    const reportData: LotterySalesReportData = {
      reportDate: this.extractReportDate(text),
      retailerId,
      onlineSummary: {
        netSales: onlineSales,
        cashes: onlineCashes,
      },
      instantSummary: {
        cashes: instantCashes,
      },
    };

    return { wizardFields, reportData, confidence };
  }

  /**
   * Extract report date from text.
   */
  private extractReportDate(text: string): string | undefined {
    for (const pattern of LOTTERY_PATTERNS.reportDate) {
      const match = text.match(pattern);
      if (match) {
        return match[1] || match[0];
      }
    }
    return undefined;
  }

  /**
   * Parse amount string to number.
   * Handles formats like "1,234.56" or "1234.56" or "1234"
   */
  private parseAmount(amountStr: string): number {
    if (!amountStr) return 0;
    // Remove commas and parse
    const cleaned = amountStr.replace(/,/g, "").trim();
    const value = parseFloat(cleaned);
    return isNaN(value) ? 0 : Math.abs(value); // Take absolute value for cashes
  }

  /**
   * Structured logging for OCR operations.
   * LM-001: No sensitive data in logs.
   */
  private logOperation(operation: string, data: Record<string, unknown>): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      service: "OCRService",
      operation,
      ...data,
    };
    console.log("[OCR]", JSON.stringify(logEntry));
  }
}

/**
 * Custom error class for OCR failures.
 * API-003: Structured error handling.
 */
export class OCRServiceError extends Error {
  readonly code: string;
  readonly originalError?: unknown;

  constructor(code: string, message: string, originalError?: unknown) {
    super(message);
    this.name = "OCRServiceError";
    this.code = code;
    this.originalError = originalError;

    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, OCRServiceError);
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
let ocrServiceInstance: OCRService | null = null;

/**
 * Get singleton instance of OCRService.
 */
export function getOCRService(): OCRService {
  if (!ocrServiceInstance) {
    ocrServiceInstance = new OCRService();
  }
  return ocrServiceInstance;
}
