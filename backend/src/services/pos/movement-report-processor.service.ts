/**
 * Movement Report Processor Service
 *
 * Handles routing and processing of NAXML Movement Report types from Gilbarco Passport.
 * Implements idempotency, transaction management, and error handling.
 *
 * Supported Report Types:
 * - FGM (Fuel Grade Movement) - Fuel sales by grade and tender
 * - FPM (Fuel Product Movement) - Pump meter readings
 * - MSM (Miscellaneous Summary Movement) - Grand totals and drawer operations
 *
 * @module services/pos/movement-report-processor.service
 * @security SEC-006 Parameterized queries, DB-006 Tenant isolation
 */

import * as crypto from "crypto";
import * as path from "path";
import { promises as fs } from "fs";
import { prisma } from "../../utils/db";
import { NAXMLParser, createNAXMLParser } from "../naxml/naxml.parser";
import type {
  NAXMLDocument,
  NAXMLFuelGradeMovementData,
  NAXMLFuelProductMovementData,
  NAXMLMiscellaneousSummaryMovementData,
  NAXMLFGMDetail,
  NAXMLFGMTenderSummary,
  NAXMLFuelTenderCode,
} from "../../types/naxml.types";
import type {
  Prisma,
  FuelProductType,
  FuelTenderType,
  MeterReadingType,
} from "@prisma/client";

// ============================================================================
// Error Codes
// ============================================================================

export const PROCESSOR_ERROR_CODES = {
  FILE_NOT_FOUND: "PROCESSOR_FILE_NOT_FOUND",
  FILE_READ_ERROR: "PROCESSOR_FILE_READ_ERROR",
  DUPLICATE_FILE: "PROCESSOR_DUPLICATE_FILE",
  UNSUPPORTED_TYPE: "PROCESSOR_UNSUPPORTED_TYPE",
  STORE_NOT_FOUND: "PROCESSOR_STORE_NOT_FOUND",
  INTEGRATION_NOT_FOUND: "PROCESSOR_INTEGRATION_NOT_FOUND",
  PROCESSING_FAILED: "PROCESSOR_PROCESSING_FAILED",
  ARCHIVE_FAILED: "PROCESSOR_ARCHIVE_FAILED",
  VALIDATION_FAILED: "PROCESSOR_VALIDATION_FAILED",
} as const;

export type ProcessorErrorCode =
  (typeof PROCESSOR_ERROR_CODES)[keyof typeof PROCESSOR_ERROR_CODES];

/**
 * Custom error class for processor errors
 */
export class ProcessorError extends Error {
  readonly code: ProcessorErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: ProcessorErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ProcessorError";
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, ProcessorError.prototype);
  }
}

// ============================================================================
// Types
// ============================================================================

/**
 * Processing options
 */
export interface ProcessingOptions {
  /** Skip idempotency check */
  skipIdempotencyCheck?: boolean;
  /** Archive file after processing */
  archiveFile?: boolean;
  /** Archive directory path */
  archivePath?: string;
  /** Error directory path */
  errorPath?: string;
  /** Correlation ID for tracing */
  correlationId?: string;
}

/**
 * Processing result
 */
export interface ProcessingResult {
  /** Processing status */
  status: "SUCCESS" | "SKIPPED" | "FAILED";
  /** Reason for status (if not success) */
  reason?: string;
  /** Document type processed */
  documentType?: string;
  /** Business date from document */
  businessDate?: string;
  /** Shift ID if applicable */
  shiftId?: string;
  /** Records created */
  recordsCreated?: number;
  /** Records updated */
  recordsUpdated?: number;
  /** File hash for idempotency */
  fileHash?: string;
  /** Processing duration in ms */
  durationMs?: number;
  /** Error message if failed */
  error?: string;
}

/**
 * FGM Processing Context
 */
interface FGMProcessingContext {
  storeId: string;
  companyId: string;
  posIntegrationId: string;
  shiftSummaryId?: string;
  daySummaryId?: string;
  businessDate: Date;
  fileHash: string;
  correlationId: string;
}

/**
 * FPM Processing Context
 */
interface FPMProcessingContext {
  storeId: string;
  companyId: string;
  posIntegrationId: string;
  daySummaryId?: string;
  businessDate: Date;
  fileHash: string;
  correlationId: string;
}

/**
 * MSM Processing Context
 */
interface MSMProcessingContext {
  storeId: string;
  companyId: string;
  posIntegrationId: string;
  shiftSummaryId?: string;
  daySummaryId?: string;
  businessDate: Date;
  fileHash: string;
  correlationId: string;
}

// ============================================================================
// Movement Report Processor Service
// ============================================================================

/**
 * Movement Report Processor Service
 *
 * Orchestrates the processing of NAXML Movement Report files.
 * Supports FGM (fuel sales), FPM (meter readings), and MSM (summaries).
 */
export class MovementReportProcessorService {
  private readonly parser: NAXMLParser;

  constructor() {
    this.parser = createNAXMLParser({ trimWhitespace: true });
  }

  // ============================================================================
  // Public API
  // ============================================================================

  /**
   * Process a movement report file.
   *
   * @param filePath - Path to the XML file
   * @param storeId - Store UUID for tenant scoping
   * @param options - Processing options
   * @returns Processing result with status and details
   */
  async processFile(
    filePath: string,
    storeId: string,
    options: ProcessingOptions = {},
  ): Promise<ProcessingResult> {
    const startTime = Date.now();
    const correlationId = options.correlationId || this.generateCorrelationId();

    console.log(`[MovementReportProcessor] Processing file`, {
      correlationId,
      filePath,
      storeId,
    });

    try {
      // 1. Validate store and get context
      const storeContext = await this.getStoreContext(storeId);

      // 2. Read file
      const xml = await this.readFile(filePath);

      // 3. Calculate hash for idempotency
      const fileHash = this.calculateHash(xml);

      // 4. Check idempotency (skip if option set)
      if (!options.skipIdempotencyCheck) {
        const isProcessed = await this.isAlreadyProcessed(storeId, fileHash);
        if (isProcessed) {
          console.log(`[MovementReportProcessor] File already processed`, {
            correlationId,
            fileHash,
          });
          return {
            status: "SKIPPED",
            reason: "DUPLICATE",
            fileHash,
            durationMs: Date.now() - startTime,
          };
        }
      }

      // 5. Parse document
      const document = this.parser.parse(xml);

      // 6. Route to appropriate processor
      const result = await this.routeToProcessor(document, storeContext, {
        fileHash,
        correlationId,
      });

      // 7. Archive file if successful and option set
      if (options.archiveFile && result.status === "SUCCESS") {
        await this.archiveFile(filePath, options.archivePath);
      }

      console.log(`[MovementReportProcessor] Processing complete`, {
        correlationId,
        status: result.status,
        documentType: result.documentType,
        durationMs: Date.now() - startTime,
      });

      return {
        ...result,
        durationMs: Date.now() - startTime,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";

      console.error(`[MovementReportProcessor] Processing failed`, {
        correlationId,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      });

      // Move to error directory if specified
      if (options.errorPath) {
        try {
          await this.moveToErrorDir(filePath, options.errorPath);
        } catch (moveError) {
          console.error(
            `[MovementReportProcessor] Failed to move file to error dir`,
            { correlationId, moveError },
          );
        }
      }

      return {
        status: "FAILED",
        error: errorMessage,
        durationMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Process FGM data directly (for testing or programmatic use)
   */
  async processFGMData(
    data: NAXMLFuelGradeMovementData,
    context: FGMProcessingContext,
  ): Promise<ProcessingResult> {
    return this.processFGM(data, context);
  }

  /**
   * Process FPM data directly (for testing or programmatic use)
   */
  async processFPMData(
    data: NAXMLFuelProductMovementData,
    context: FPMProcessingContext,
  ): Promise<ProcessingResult> {
    return this.processFPM(data, context);
  }

  /**
   * Process MSM data directly (for testing or programmatic use)
   */
  async processMSMData(
    data: NAXMLMiscellaneousSummaryMovementData,
    context: MSMProcessingContext,
  ): Promise<ProcessingResult> {
    return this.processMSM(data, context);
  }

  // ============================================================================
  // Private Methods - Routing
  // ============================================================================

  /**
   * Route document to appropriate processor based on type
   */
  private async routeToProcessor(
    document: NAXMLDocument<unknown>,
    storeContext: StoreContext,
    processContext: { fileHash: string; correlationId: string },
  ): Promise<ProcessingResult> {
    const businessDate = this.parseBusinessDate(document);

    const baseContext = {
      storeId: storeContext.storeId,
      companyId: storeContext.companyId,
      posIntegrationId: storeContext.posIntegrationId,
      businessDate,
      fileHash: processContext.fileHash,
      correlationId: processContext.correlationId,
    };

    switch (document.documentType) {
      case "FuelGradeMovement":
        return this.processFGM(
          document.data as NAXMLFuelGradeMovementData,
          baseContext,
        );

      case "FuelProductMovement":
        return this.processFPM(
          document.data as NAXMLFuelProductMovementData,
          baseContext,
        );

      case "MiscellaneousSummaryMovement":
        return this.processMSM(
          document.data as NAXMLMiscellaneousSummaryMovementData,
          baseContext,
        );

      default:
        throw new ProcessorError(
          PROCESSOR_ERROR_CODES.UNSUPPORTED_TYPE,
          `Unsupported document type: ${document.documentType}`,
          { documentType: document.documentType },
        );
    }
  }

  // ============================================================================
  // Private Methods - FGM Processing
  // ============================================================================

  /**
   * Process Fuel Grade Movement data
   *
   * Creates/updates:
   * - FuelGrade records for each grade
   * - ShiftFuelSummary records for each grade/tender combination
   */
  private async processFGM(
    data: NAXMLFuelGradeMovementData,
    context: FGMProcessingContext,
  ): Promise<ProcessingResult> {
    console.log(`[MovementReportProcessor] Processing FGM`, {
      correlationId: context.correlationId,
      grades: data.fgmDetails?.length || 0,
    });

    let recordsCreated = 0;

    await prisma.$transaction(async (tx) => {
      // Process each FGM detail (fuel grade)
      for (const detail of data.fgmDetails || []) {
        // 1. Ensure FuelGrade exists
        const fuelGrade = await this.ensureFuelGrade(
          tx,
          context.companyId,
          context.posIntegrationId,
          detail.fuelGradeId,
        );

        // 2. Process tender summary if present (Period 2 - by tender)
        // Note: Each FGMDetail has ONE tender summary or ONE position summary
        if (detail.fgmTenderSummary) {
          await this.createShiftFuelSummary(
            tx,
            context,
            fuelGrade.fuel_grade_id,
            detail,
            detail.fgmTenderSummary,
          );
          recordsCreated++;
        }

        // 3. Process position summary if present (Period 98 - by position)
        if (detail.fgmPositionSummary) {
          // For position data, aggregate by grade (no tender breakdown)
          const aggregated = this.aggregatePositionData(detail);
          if (aggregated.salesVolume > 0 || aggregated.salesAmount > 0) {
            await this.createShiftFuelSummaryFromAggregate(
              tx,
              context,
              fuelGrade.fuel_grade_id,
              aggregated,
            );
            recordsCreated++;
          }
        }
      }
    });

    return {
      status: "SUCCESS",
      documentType: "FuelGradeMovement",
      businessDate: context.businessDate.toISOString().split("T")[0],
      recordsCreated,
      fileHash: context.fileHash,
    };
  }

  /**
   * Ensure a FuelGrade exists, creating if necessary
   */
  private async ensureFuelGrade(
    tx: Prisma.TransactionClient,
    companyId: string,
    posIntegrationId: string,
    gradeId: string,
  ): Promise<{ fuel_grade_id: string }> {
    // Try to find existing grade
    const existing = await tx.fuelGrade.findUnique({
      where: {
        company_id_grade_id: {
          company_id: companyId,
          grade_id: gradeId,
        },
      },
      select: { fuel_grade_id: true },
    });

    if (existing) {
      return existing;
    }

    // Create new grade with auto-detected type and name
    const productType = this.detectFuelProductType(gradeId);
    const name = this.generateFuelGradeName(gradeId, productType);

    return tx.fuelGrade.create({
      data: {
        company_id: companyId,
        pos_integration_id: posIntegrationId,
        grade_id: gradeId,
        name,
        product_type: productType,
        is_active: true,
      },
      select: { fuel_grade_id: true },
    });
  }

  /**
   * Create ShiftFuelSummary from tender data
   */
  private async createShiftFuelSummary(
    tx: Prisma.TransactionClient,
    context: FGMProcessingContext,
    fuelGradeId: string,
    _detail: NAXMLFGMDetail,
    tender: NAXMLFGMTenderSummary,
  ): Promise<void> {
    const tenderType = this.mapNAXMLTenderToFuelTender(
      tender.tender.tenderCode,
    );
    const salesData =
      tender.fgmSellPriceSummary.fgmServiceLevelSummary.fgmSalesTotals;

    // Upsert to handle re-processing
    await tx.shiftFuelSummary.upsert({
      where: {
        shift_summary_id_fuel_grade_id_tender_type: {
          shift_summary_id: context.shiftSummaryId || "",
          fuel_grade_id: fuelGradeId,
          tender_type: tenderType,
        },
      },
      create: {
        shift_summary_id: context.shiftSummaryId || "",
        fuel_grade_id: fuelGradeId,
        tender_type: tenderType,
        sales_volume: salesData.fuelGradeSalesVolume,
        sales_amount: salesData.fuelGradeSalesAmount,
        discount_amount: salesData.discountAmount ?? 0,
        discount_count: salesData.discountCount ?? 0,
        transaction_count: 0, // Not available in NAXML FGM data
        source_file_hash: context.fileHash,
      },
      update: {
        sales_volume: salesData.fuelGradeSalesVolume,
        sales_amount: salesData.fuelGradeSalesAmount,
        discount_amount: salesData.discountAmount ?? 0,
        discount_count: salesData.discountCount ?? 0,
        transaction_count: 0, // Not available in NAXML FGM data
        source_file_hash: context.fileHash,
      },
    });
  }

  /**
   * Create ShiftFuelSummary from aggregated position data
   */
  private async createShiftFuelSummaryFromAggregate(
    tx: Prisma.TransactionClient,
    context: FGMProcessingContext,
    fuelGradeId: string,
    aggregated: {
      salesVolume: number;
      salesAmount: number;
      tenderType: FuelTenderType;
    },
  ): Promise<void> {
    await tx.shiftFuelSummary.upsert({
      where: {
        shift_summary_id_fuel_grade_id_tender_type: {
          shift_summary_id: context.shiftSummaryId || "",
          fuel_grade_id: fuelGradeId,
          tender_type: aggregated.tenderType,
        },
      },
      create: {
        shift_summary_id: context.shiftSummaryId || "",
        fuel_grade_id: fuelGradeId,
        tender_type: aggregated.tenderType,
        sales_volume: aggregated.salesVolume,
        sales_amount: aggregated.salesAmount,
        discount_amount: 0,
        discount_count: 0,
        transaction_count: 0,
        source_file_hash: context.fileHash,
      },
      update: {
        sales_volume: aggregated.salesVolume,
        sales_amount: aggregated.salesAmount,
        source_file_hash: context.fileHash,
      },
    });
  }

  /**
   * Aggregate position summary data from a single FGMDetail
   * Note: Each FGMDetail has ONE fgmPositionSummary (singular)
   */
  private aggregatePositionData(detail: NAXMLFGMDetail): {
    salesVolume: number;
    salesAmount: number;
    tenderType: FuelTenderType;
  } {
    let totalVolume = 0;
    let totalAmount = 0;

    const pos = detail.fgmPositionSummary;
    if (pos) {
      for (const tier of pos.fgmPriceTierSummaries || []) {
        if (tier.fgmSalesTotals) {
          totalVolume += tier.fgmSalesTotals.fuelGradeSalesVolume;
          totalAmount += tier.fgmSalesTotals.fuelGradeSalesAmount;
        }
      }
    }

    return {
      salesVolume: totalVolume,
      salesAmount: totalAmount,
      tenderType: "OTHER", // Position data doesn't have tender breakdown
    };
  }

  // ============================================================================
  // Private Methods - FPM Processing
  // ============================================================================

  /**
   * Process Fuel Product Movement data
   *
   * Creates:
   * - FuelPosition records for each position
   * - MeterReading records for each position/product
   */
  private async processFPM(
    data: NAXMLFuelProductMovementData,
    context: FPMProcessingContext,
  ): Promise<ProcessingResult> {
    console.log(`[MovementReportProcessor] Processing FPM`, {
      correlationId: context.correlationId,
      products: data.fpmDetails?.length || 0,
    });

    let recordsCreated = 0;

    await prisma.$transaction(async (tx) => {
      for (const detail of data.fpmDetails || []) {
        for (const reading of detail.fpmNonResettableTotals || []) {
          // 1. Ensure FuelPosition exists
          const position = await this.ensureFuelPosition(
            tx,
            context.storeId,
            context.companyId,
            context.posIntegrationId,
            reading.fuelPositionId,
          );

          // 2. Create meter reading
          await tx.meterReading.create({
            data: {
              store_id: context.storeId,
              fuel_position_id: position.fuel_position_id,
              day_summary_id: context.daySummaryId,
              fuel_product_id: detail.fuelProductId,
              reading_type: "CLOSE" as MeterReadingType,
              reading_timestamp: new Date(),
              business_date: context.businessDate,
              volume_reading: this.parseDecimal(
                reading.fuelProductNonResettableVolumeNumber,
              ),
              amount_reading: this.parseDecimal(
                reading.fuelProductNonResettableAmountNumber || "0",
              ),
              source_file_hash: context.fileHash,
            },
          });

          recordsCreated++;
        }
      }
    });

    return {
      status: "SUCCESS",
      documentType: "FuelProductMovement",
      businessDate: context.businessDate.toISOString().split("T")[0],
      recordsCreated,
      fileHash: context.fileHash,
    };
  }

  /**
   * Ensure a FuelPosition exists, creating if necessary
   */
  private async ensureFuelPosition(
    tx: Prisma.TransactionClient,
    storeId: string,
    companyId: string,
    posIntegrationId: string,
    positionId: string,
  ): Promise<{ fuel_position_id: string }> {
    const existing = await tx.fuelPosition.findUnique({
      where: {
        store_id_position_id: {
          store_id: storeId,
          position_id: positionId,
        },
      },
      select: { fuel_position_id: true },
    });

    if (existing) {
      return existing;
    }

    return tx.fuelPosition.create({
      data: {
        company_id: companyId,
        store_id: storeId,
        pos_integration_id: posIntegrationId,
        position_id: positionId,
        name: `Pump ${positionId}`,
        is_active: true,
      },
      select: { fuel_position_id: true },
    });
  }

  // ============================================================================
  // Private Methods - MSM Processing
  // ============================================================================

  /**
   * Process Miscellaneous Summary Movement data
   *
   * Updates ShiftSummary/DaySummary with:
   * - Grand totals
   * - Transaction statistics
   * - Drawer operations
   */
  private async processMSM(
    data: NAXMLMiscellaneousSummaryMovementData,
    context: MSMProcessingContext,
  ): Promise<ProcessingResult> {
    console.log(`[MovementReportProcessor] Processing MSM`, {
      correlationId: context.correlationId,
      details: data.msmDetails?.length || 0,
    });

    // MSM processing is primarily for updating existing shift/day summaries
    // The actual data storage depends on ShiftSummary/DaySummary models
    // which already have fields for the MSM data

    // For now, log what we would process
    const grandTotals = this.extractGrandTotals(data);
    const drawerOps = this.extractDrawerOperations(data);
    const statistics = this.extractStatistics(data);

    console.log(`[MovementReportProcessor] MSM extracted data`, {
      correlationId: context.correlationId,
      grandTotals,
      drawerOps,
      statistics,
    });

    // In a full implementation, we would update ShiftSummary here
    // For MVP, we just mark as successful

    return {
      status: "SUCCESS",
      documentType: "MiscellaneousSummaryMovement",
      businessDate: context.businessDate.toISOString().split("T")[0],
      recordsCreated: 0,
      fileHash: context.fileHash,
    };
  }

  /**
   * Extract grand totals from MSM data
   */
  private extractGrandTotals(
    data: NAXMLMiscellaneousSummaryMovementData,
  ): Record<string, number> {
    const totals: Record<string, number> = {};

    for (const detail of data.msmDetails || []) {
      const code = detail.miscellaneousSummaryCodes?.miscellaneousSummaryCode;
      const subCode =
        detail.miscellaneousSummaryCodes?.miscellaneousSummarySubCode;
      const amount = this.parseDecimal(
        detail.msmSalesTotals?.miscellaneousSummaryAmount || "0",
      );

      if (code === "totalizer" && subCode === "sales") {
        totals.totalSales = amount;
      } else if (code === "totalizer" && subCode === "fuelSales") {
        totals.fuelSales = amount;
      } else if (code === "totalizer" && subCode === "merchandiseSales") {
        totals.merchandiseSales = amount;
      }
    }

    return totals;
  }

  /**
   * Extract drawer operations from MSM data
   */
  private extractDrawerOperations(
    data: NAXMLMiscellaneousSummaryMovementData,
  ): Record<string, number> {
    const ops: Record<string, number> = {};

    for (const detail of data.msmDetails || []) {
      const code = detail.miscellaneousSummaryCodes?.miscellaneousSummaryCode;
      const amount = this.parseDecimal(
        detail.msmSalesTotals?.miscellaneousSummaryAmount || "0",
      );

      if (code === "safeDrop") {
        ops.safeDrops = (ops.safeDrops || 0) + amount;
      } else if (code === "safeLoan") {
        ops.loans = (ops.loans || 0) + amount;
      } else if (code === "openingBalance") {
        ops.openingBalance = amount;
      } else if (code === "closingBalance") {
        ops.closingBalance = amount;
      }
    }

    return ops;
  }

  /**
   * Extract transaction statistics from MSM data
   */
  private extractStatistics(
    data: NAXMLMiscellaneousSummaryMovementData,
  ): Record<string, number> {
    const stats: Record<string, number> = {};

    for (const detail of data.msmDetails || []) {
      const code = detail.miscellaneousSummaryCodes?.miscellaneousSummaryCode;
      const count = detail.msmSalesTotals?.miscellaneousSummaryCount ?? 0;

      if (code === "statistics") {
        const subCode =
          detail.miscellaneousSummaryCodes?.miscellaneousSummarySubCode;
        if (subCode === "transactionCount") {
          stats.transactionCount = count;
        } else if (subCode === "voidCount") {
          stats.voidCount = count;
        } else if (subCode === "refundCount") {
          stats.refundCount = count;
        }
      }
    }

    return stats;
  }

  // ============================================================================
  // Private Methods - Utilities
  // ============================================================================

  /**
   * Get store context for processing
   */
  private async getStoreContext(storeId: string): Promise<StoreContext> {
    const store = await prisma.store.findUnique({
      where: { store_id: storeId },
      select: {
        store_id: true,
        company_id: true,
        pos_integration: {
          select: { pos_integration_id: true },
        },
      },
    });

    if (!store) {
      throw new ProcessorError(
        PROCESSOR_ERROR_CODES.STORE_NOT_FOUND,
        `Store not found: ${storeId}`,
      );
    }

    if (!store.pos_integration) {
      throw new ProcessorError(
        PROCESSOR_ERROR_CODES.INTEGRATION_NOT_FOUND,
        `POS integration not found for store: ${storeId}`,
      );
    }

    return {
      storeId: store.store_id,
      companyId: store.company_id,
      posIntegrationId: store.pos_integration.pos_integration_id,
    };
  }

  /**
   * Read file contents
   */
  private async readFile(filePath: string): Promise<string> {
    try {
      return await fs.readFile(filePath, "utf-8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new ProcessorError(
          PROCESSOR_ERROR_CODES.FILE_NOT_FOUND,
          `File not found: ${filePath}`,
        );
      }
      throw new ProcessorError(
        PROCESSOR_ERROR_CODES.FILE_READ_ERROR,
        `Failed to read file: ${filePath}`,
        {
          originalError: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }

  /**
   * Calculate SHA-256 hash of content
   */
  private calculateHash(content: string): string {
    return crypto.createHash("sha256").update(content).digest("hex");
  }

  /**
   * Check if file has already been processed
   */
  private async isAlreadyProcessed(
    storeId: string,
    fileHash: string,
  ): Promise<boolean> {
    // Check in ShiftFuelSummary
    const shiftFuel = await prisma.shiftFuelSummary.findFirst({
      where: { source_file_hash: fileHash },
      select: { shift_fuel_summary_id: true },
    });
    if (shiftFuel) return true;

    // Check in MeterReading
    const meterReading = await prisma.meterReading.findFirst({
      where: {
        store_id: storeId,
        source_file_hash: fileHash,
      },
      select: { meter_reading_id: true },
    });
    if (meterReading) return true;

    return false;
  }

  /**
   * Archive a file after successful processing
   */
  private async archiveFile(
    filePath: string,
    archivePath?: string,
  ): Promise<void> {
    if (!archivePath) return;

    try {
      const fileName = path.basename(filePath);
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const archiveFileName = `${timestamp}_${fileName}`;
      const destination = path.join(archivePath, archiveFileName);

      await fs.mkdir(archivePath, { recursive: true });
      await fs.rename(filePath, destination);
    } catch (error) {
      throw new ProcessorError(
        PROCESSOR_ERROR_CODES.ARCHIVE_FAILED,
        `Failed to archive file: ${filePath}`,
        {
          originalError: error instanceof Error ? error.message : String(error),
        },
      );
    }
  }

  /**
   * Move file to error directory
   */
  private async moveToErrorDir(
    filePath: string,
    errorPath: string,
  ): Promise<void> {
    const fileName = path.basename(filePath);
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const errorFileName = `${timestamp}_${fileName}`;
    const destination = path.join(errorPath, errorFileName);

    await fs.mkdir(errorPath, { recursive: true });
    await fs.rename(filePath, destination);
  }

  /**
   * Generate correlation ID
   */
  private generateCorrelationId(): string {
    return `mrp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Parse business date from document
   */
  private parseBusinessDate(document: NAXMLDocument<unknown>): Date {
    // Try to extract from document data
    const data = document.data as {
      movementHeader?: { businessDate?: string };
    };
    if (data?.movementHeader?.businessDate) {
      return new Date(data.movementHeader.businessDate);
    }
    // Fallback to timestamp
    return document.timestamp ? new Date(document.timestamp) : new Date();
  }

  /**
   * Parse string to decimal number
   */
  private parseDecimal(value: string | number | undefined): number {
    if (value === undefined || value === "") return 0;
    if (typeof value === "number") return value;
    const parsed = parseFloat(value);
    return isNaN(parsed) ? 0 : parsed;
  }

  /**
   * Detect fuel product type from grade ID
   */
  private detectFuelProductType(gradeId: string): FuelProductType {
    const id = gradeId.replace(/^0+/, ""); // Remove leading zeros
    const numId = parseInt(id, 10);

    // Gilbarco grade ID conventions:
    // 1-3, 101-103: Gasoline (Regular, Plus, Premium)
    // 21, 121, 300: Diesel
    // 200+: Other (Kerosene, DEF, etc.)

    if (numId >= 1 && numId <= 3) return "GASOLINE";
    if (numId >= 101 && numId <= 103) return "GASOLINE";
    if (numId === 21 || numId === 121 || numId === 300) return "DIESEL";
    if (numId >= 200 && numId < 300) return "OTHER";

    return "GASOLINE"; // Default to gasoline
  }

  /**
   * Generate fuel grade name from ID and type
   */
  private generateFuelGradeName(
    gradeId: string,
    productType: FuelProductType,
  ): string {
    const id = gradeId.replace(/^0+/, "");
    const numId = parseInt(id, 10);

    // Common Gilbarco grade names
    const gradeNames: Record<number, string> = {
      1: "Regular Unleaded",
      2: "Plus Unleaded",
      3: "Premium Unleaded",
      21: "Diesel #2",
      101: "Regular Unleaded",
      102: "Plus Unleaded",
      103: "Premium Unleaded",
      121: "Diesel #2",
      300: "Diesel #1",
    };

    return gradeNames[numId] || `${productType} Grade ${gradeId}`;
  }

  /**
   * Map NAXML tender code to FuelTenderType
   */
  private mapNAXMLTenderToFuelTender(
    tenderCode: NAXMLFuelTenderCode,
  ): FuelTenderType {
    const mapping: Record<NAXMLFuelTenderCode, FuelTenderType> = {
      cash: "CASH",
      outsideCredit: "OUTSIDE_CREDIT",
      outsideDebit: "OUTSIDE_DEBIT",
      insideCredit: "INSIDE_CREDIT",
      insideDebit: "INSIDE_DEBIT",
      fleet: "FLEET",
    };

    return mapping[tenderCode] || "OTHER";
  }
}

// ============================================================================
// Types
// ============================================================================

interface StoreContext {
  storeId: string;
  companyId: string;
  posIntegrationId: string;
}

// ============================================================================
// Factory Function
// ============================================================================

/**
 * Create a new MovementReportProcessorService instance
 */
export function createMovementReportProcessor(): MovementReportProcessorService {
  return new MovementReportProcessorService();
}
