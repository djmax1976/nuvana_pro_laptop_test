/**
 * File Processing Status Service
 *
 * Provides comprehensive tracking and querying of NAXML file processing status.
 * Records all file processing events to the NAXMLFileLog table for:
 * - Audit trail and compliance
 * - Duplicate detection via file hash
 * - Processing history and analytics
 * - Error tracking and debugging
 *
 * @module services/pos/file-processing-status.service
 * @see Phase 2: File Processing Status Tracking
 */

import { prisma } from "../../utils/db";
import type {
  NAXMLFileStatus,
  NAXMLDocumentType,
  NAXMLFileDirection,
} from "../../types/naxml.types";
import { Prisma } from "@prisma/client";

// ============================================================================
// Types
// ============================================================================

/**
 * Input for creating a new file processing record
 */
export interface CreateFileLogInput {
  storeId: string;
  posIntegrationId: string;
  fileName: string;
  fileType: NAXMLDocumentType;
  direction: NAXMLFileDirection;
  fileSizeBytes: number;
  fileHash: string;
  sourcePath?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Input for updating file processing status
 */
export interface UpdateFileLogInput {
  status: NAXMLFileStatus;
  recordCount?: number;
  processingTimeMs?: number;
  errorCode?: string;
  errorMessage?: string;
  processedPath?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Query filters for file processing logs
 */
export interface FileLogQueryFilters {
  storeId: string;
  posIntegrationId?: string;
  status?: NAXMLFileStatus;
  fileType?: NAXMLDocumentType;
  direction?: NAXMLFileDirection;
  fromDate?: Date;
  toDate?: Date;
  fileHash?: string;
  limit?: number;
  offset?: number;
}

/**
 * File processing statistics
 */
export interface FileProcessingStats {
  totalFiles: number;
  successfulFiles: number;
  failedFiles: number;
  pendingFiles: number;
  processingFiles: number;
  skippedFiles: number;
  partialFiles: number;
  totalRecordsProcessed: number;
  averageProcessingTimeMs: number;
  lastProcessedAt: Date | null;
  byFileType: Record<string, number>;
  byDirection: Record<string, number>;
}

/**
 * File log entry with full details
 */
export interface FileLogEntry {
  fileLogId: string;
  storeId: string;
  posIntegrationId: string;
  fileName: string;
  fileType: NAXMLDocumentType;
  direction: NAXMLFileDirection;
  status: NAXMLFileStatus;
  recordCount: number | null;
  fileSizeBytes: bigint;
  processingTimeMs: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  fileHash: string;
  sourcePath: string | null;
  processedPath: string | null;
  processedAt: Date | null;
  createdAt: Date;
  metadata: Record<string, unknown> | null;
}

// ============================================================================
// Error Handling
// ============================================================================

export const FILE_LOG_ERROR_CODES = {
  NOT_FOUND: "FILE_LOG_NOT_FOUND",
  DUPLICATE_HASH: "FILE_LOG_DUPLICATE_HASH",
  INVALID_STATUS_TRANSITION: "FILE_LOG_INVALID_STATUS_TRANSITION",
  DATABASE_ERROR: "FILE_LOG_DATABASE_ERROR",
} as const;

export type FileLogErrorCode =
  (typeof FILE_LOG_ERROR_CODES)[keyof typeof FILE_LOG_ERROR_CODES];

export class FileLogError extends Error {
  readonly code: FileLogErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: FileLogErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "FileLogError";
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, FileLogError.prototype);
  }
}

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Create a new file processing log entry
 * Called when a file is first detected for processing
 *
 * @param input - File log creation input
 * @returns The created file log ID
 * @throws FileLogError if duplicate hash exists for store
 */
export async function createFileLog(
  input: CreateFileLogInput,
): Promise<string> {
  try {
    // Check for duplicate hash (same file already processed)
    const existing = await prisma.nAXMLFileLog.findUnique({
      where: {
        store_id_file_hash: {
          store_id: input.storeId,
          file_hash: input.fileHash,
        },
      },
      select: { file_log_id: true, status: true, created_at: true },
    });

    if (existing) {
      throw new FileLogError(
        FILE_LOG_ERROR_CODES.DUPLICATE_HASH,
        `File with hash ${input.fileHash} already processed for this store`,
        {
          existingFileLogId: existing.file_log_id,
          existingStatus: existing.status,
          processedAt: existing.created_at,
        },
      );
    }

    const fileLog = await prisma.nAXMLFileLog.create({
      data: {
        store_id: input.storeId,
        pos_integration_id: input.posIntegrationId,
        file_name: input.fileName,
        file_type: input.fileType as any,
        direction: input.direction as any,
        status: "PENDING",
        file_size_bytes: BigInt(input.fileSizeBytes),
        file_hash: input.fileHash,
        source_path: input.sourcePath,
        metadata: (input.metadata || {}) as Prisma.InputJsonValue,
      },
    });

    return fileLog.file_log_id;
  } catch (error) {
    if (error instanceof FileLogError) {
      throw error;
    }

    // Handle Prisma unique constraint error
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      throw new FileLogError(
        FILE_LOG_ERROR_CODES.DUPLICATE_HASH,
        `File with hash ${input.fileHash} already processed for this store`,
        { hash: input.fileHash },
      );
    }

    throw new FileLogError(
      FILE_LOG_ERROR_CODES.DATABASE_ERROR,
      `Failed to create file log: ${(error as Error).message}`,
      { originalError: (error as Error).message },
    );
  }
}

/**
 * Update file processing status
 * Called when processing starts, completes, or fails
 *
 * @param fileLogId - The file log ID to update
 * @param input - Update input
 */
export async function updateFileLog(
  fileLogId: string,
  input: UpdateFileLogInput,
): Promise<void> {
  try {
    const updateData: Prisma.NAXMLFileLogUpdateInput = {
      status: input.status as any,
    };

    if (input.recordCount !== undefined) {
      updateData.record_count = input.recordCount;
    }

    if (input.processingTimeMs !== undefined) {
      updateData.processing_time_ms = input.processingTimeMs;
    }

    if (input.errorCode !== undefined) {
      updateData.error_code = input.errorCode;
    }

    if (input.errorMessage !== undefined) {
      updateData.error_message = input.errorMessage;
    }

    if (input.processedPath !== undefined) {
      updateData.processed_path = input.processedPath;
    }

    if (input.metadata !== undefined) {
      updateData.metadata = input.metadata as Prisma.InputJsonValue;
    }

    // Set processed_at when status becomes terminal
    if (["SUCCESS", "FAILED", "PARTIAL", "SKIPPED"].includes(input.status)) {
      updateData.processed_at = new Date();
    }

    await prisma.nAXMLFileLog.update({
      where: { file_log_id: fileLogId },
      data: updateData,
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2025"
    ) {
      throw new FileLogError(
        FILE_LOG_ERROR_CODES.NOT_FOUND,
        `File log not found: ${fileLogId}`,
      );
    }

    throw new FileLogError(
      FILE_LOG_ERROR_CODES.DATABASE_ERROR,
      `Failed to update file log: ${(error as Error).message}`,
      { fileLogId, originalError: (error as Error).message },
    );
  }
}

/**
 * Mark file as processing started
 */
export async function markProcessingStarted(fileLogId: string): Promise<void> {
  await updateFileLog(fileLogId, { status: "PROCESSING" });
}

/**
 * Mark file as successfully processed
 */
export async function markProcessingSuccess(
  fileLogId: string,
  recordCount: number,
  processingTimeMs: number,
  processedPath?: string,
): Promise<void> {
  await updateFileLog(fileLogId, {
    status: "SUCCESS",
    recordCount,
    processingTimeMs,
    processedPath,
  });
}

/**
 * Mark file as failed
 */
export async function markProcessingFailed(
  fileLogId: string,
  errorCode: string,
  errorMessage: string,
  processingTimeMs: number,
): Promise<void> {
  await updateFileLog(fileLogId, {
    status: "FAILED",
    errorCode,
    errorMessage,
    processingTimeMs,
  });
}

/**
 * Mark file as skipped (e.g., duplicate)
 */
export async function markProcessingSkipped(
  fileLogId: string,
  reason: string,
): Promise<void> {
  await updateFileLog(fileLogId, {
    status: "SKIPPED",
    errorMessage: reason,
  });
}

/**
 * Check if a file has already been processed by hash
 *
 * @param storeId - Store identifier
 * @param fileHash - SHA-256 hash of file content
 * @returns True if file was already processed
 */
export async function isFileAlreadyProcessed(
  storeId: string,
  fileHash: string,
): Promise<boolean> {
  const existing = await prisma.nAXMLFileLog.findUnique({
    where: {
      store_id_file_hash: {
        store_id: storeId,
        file_hash: fileHash,
      },
    },
    select: { file_log_id: true },
  });

  return existing !== null;
}

/**
 * Get file log by ID
 */
export async function getFileLog(
  fileLogId: string,
): Promise<FileLogEntry | null> {
  const log = await prisma.nAXMLFileLog.findUnique({
    where: { file_log_id: fileLogId },
  });

  if (!log) {
    return null;
  }

  return mapToFileLogEntry(log);
}

/**
 * Get file log by hash for a store
 */
export async function getFileLogByHash(
  storeId: string,
  fileHash: string,
): Promise<FileLogEntry | null> {
  const log = await prisma.nAXMLFileLog.findUnique({
    where: {
      store_id_file_hash: {
        store_id: storeId,
        file_hash: fileHash,
      },
    },
  });

  if (!log) {
    return null;
  }

  return mapToFileLogEntry(log);
}

/**
 * Query file processing logs with filters
 */
export async function queryFileLogs(
  filters: FileLogQueryFilters,
): Promise<{ logs: FileLogEntry[]; total: number }> {
  const where: Prisma.NAXMLFileLogWhereInput = {
    store_id: filters.storeId,
  };

  if (filters.posIntegrationId) {
    where.pos_integration_id = filters.posIntegrationId;
  }

  if (filters.status) {
    where.status = filters.status as any;
  }

  if (filters.fileType) {
    where.file_type = filters.fileType as any;
  }

  if (filters.direction) {
    where.direction = filters.direction as any;
  }

  if (filters.fileHash) {
    where.file_hash = filters.fileHash;
  }

  if (filters.fromDate || filters.toDate) {
    where.created_at = {};
    if (filters.fromDate) {
      where.created_at.gte = filters.fromDate;
    }
    if (filters.toDate) {
      where.created_at.lte = filters.toDate;
    }
  }

  const [logs, total] = await Promise.all([
    prisma.nAXMLFileLog.findMany({
      where,
      orderBy: { created_at: "desc" },
      take: filters.limit || 50,
      skip: filters.offset || 0,
    }),
    prisma.nAXMLFileLog.count({ where }),
  ]);

  return {
    logs: logs.map(mapToFileLogEntry),
    total,
  };
}

/**
 * Get file processing statistics for a store
 */
export async function getFileProcessingStats(
  storeId: string,
  fromDate?: Date,
  toDate?: Date,
): Promise<FileProcessingStats> {
  const where: Prisma.NAXMLFileLogWhereInput = {
    store_id: storeId,
  };

  if (fromDate || toDate) {
    where.created_at = {};
    if (fromDate) {
      where.created_at.gte = fromDate;
    }
    if (toDate) {
      where.created_at.lte = toDate;
    }
  }

  // Get counts by status
  const statusCounts = await prisma.nAXMLFileLog.groupBy({
    by: ["status"],
    where,
    _count: { _all: true },
  });

  // Get counts by file type
  const typeCounts = await prisma.nAXMLFileLog.groupBy({
    by: ["file_type"],
    where,
    _count: { _all: true },
  });

  // Get counts by direction
  const directionCounts = await prisma.nAXMLFileLog.groupBy({
    by: ["direction"],
    where,
    _count: { _all: true },
  });

  // Get aggregate stats
  const aggregates = await prisma.nAXMLFileLog.aggregate({
    where,
    _count: { _all: true },
    _sum: { record_count: true },
    _avg: { processing_time_ms: true },
    _max: { processed_at: true },
  });

  // Build status map
  const statusMap: Record<string, number> = {};
  for (const sc of statusCounts) {
    statusMap[sc.status] = sc._count._all;
  }

  // Build file type map
  const byFileType: Record<string, number> = {};
  for (const tc of typeCounts) {
    byFileType[tc.file_type] = tc._count._all;
  }

  // Build direction map
  const byDirection: Record<string, number> = {};
  for (const dc of directionCounts) {
    byDirection[dc.direction] = dc._count._all;
  }

  return {
    totalFiles: aggregates._count._all,
    successfulFiles: statusMap["SUCCESS"] || 0,
    failedFiles: statusMap["FAILED"] || 0,
    pendingFiles: statusMap["PENDING"] || 0,
    processingFiles: statusMap["PROCESSING"] || 0,
    skippedFiles: statusMap["SKIPPED"] || 0,
    partialFiles: statusMap["PARTIAL"] || 0,
    totalRecordsProcessed: aggregates._sum.record_count || 0,
    averageProcessingTimeMs: Math.round(
      aggregates._avg.processing_time_ms || 0,
    ),
    lastProcessedAt: aggregates._max.processed_at,
    byFileType,
    byDirection,
  };
}

/**
 * Get recent file processing activity for a store
 */
export async function getRecentActivity(
  storeId: string,
  limit: number = 10,
): Promise<FileLogEntry[]> {
  const logs = await prisma.nAXMLFileLog.findMany({
    where: { store_id: storeId },
    orderBy: { created_at: "desc" },
    take: limit,
  });

  return logs.map(mapToFileLogEntry);
}

/**
 * Get failed files for retry
 */
export async function getFailedFiles(
  storeId: string,
  limit: number = 100,
): Promise<FileLogEntry[]> {
  const logs = await prisma.nAXMLFileLog.findMany({
    where: {
      store_id: storeId,
      status: "FAILED",
    },
    orderBy: { created_at: "desc" },
    take: limit,
  });

  return logs.map(mapToFileLogEntry);
}

/**
 * Delete old file logs based on retention policy
 *
 * @param storeId - Store identifier
 * @param olderThanDays - Delete logs older than this many days
 * @returns Number of records deleted
 */
export async function deleteOldFileLogs(
  storeId: string,
  olderThanDays: number,
): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

  const result = await prisma.nAXMLFileLog.deleteMany({
    where: {
      store_id: storeId,
      created_at: { lt: cutoffDate },
      // Only delete terminal states
      status: { in: ["SUCCESS", "FAILED", "SKIPPED"] },
    },
  });

  return result.count;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Map Prisma model to FileLogEntry type
 */
function mapToFileLogEntry(log: any): FileLogEntry {
  return {
    fileLogId: log.file_log_id,
    storeId: log.store_id,
    posIntegrationId: log.pos_integration_id,
    fileName: log.file_name,
    fileType: log.file_type as NAXMLDocumentType,
    direction: log.direction as NAXMLFileDirection,
    status: log.status as NAXMLFileStatus,
    recordCount: log.record_count,
    fileSizeBytes: log.file_size_bytes,
    processingTimeMs: log.processing_time_ms,
    errorCode: log.error_code,
    errorMessage: log.error_message,
    fileHash: log.file_hash,
    sourcePath: log.source_path,
    processedPath: log.processed_path,
    processedAt: log.processed_at,
    createdAt: log.created_at,
    metadata: log.metadata as Record<string, unknown> | null,
  };
}

// ============================================================================
// Export Service Object (for convenience)
// ============================================================================

export const fileProcessingStatusService = {
  createFileLog,
  updateFileLog,
  markProcessingStarted,
  markProcessingSuccess,
  markProcessingFailed,
  markProcessingSkipped,
  isFileAlreadyProcessed,
  getFileLog,
  getFileLogByHash,
  queryFileLogs,
  getFileProcessingStats,
  getRecentActivity,
  getFailedFiles,
  deleteOldFileLogs,
};
