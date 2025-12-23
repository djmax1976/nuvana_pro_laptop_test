/**
 * NAXML Scheduled Export Service
 *
 * Manages scheduled NAXML exports with cron-style scheduling.
 * Supports departments, tender types, tax rates, and price book exports
 * to POS systems using the NAXML format.
 *
 * Phase 2: Gilbarco NAXML Adapter
 *
 * @module services/naxml/scheduled-export.service
 */

import { prisma } from "../../utils/db";
import { NAXMLService } from "./naxml.service";
import * as auditService from "../pos/audit.service";
// File log service reserved for future use
// import * as fileLogService from "../pos/file-processing-status.service";
import { createHash } from "crypto";
import * as fs from "fs/promises";
import * as path from "path";
import { Prisma, POSDataCategory } from "@prisma/client";

// ============================================================================
// Types
// ============================================================================

export type NAXMLExportType =
  | "DEPARTMENTS"
  | "TENDER_TYPES"
  | "TAX_RATES"
  | "PRICE_BOOK"
  | "FULL_SYNC";

export type ScheduledExportStatus = "ACTIVE" | "PAUSED" | "DISABLED";

export type TriggerType = "SCHEDULED" | "MANUAL" | "API";

export interface CreateScheduledExportInput {
  storeId: string;
  posIntegrationId: string;
  exportType: NAXMLExportType;
  exportName: string;
  cronExpression: string;
  timezone?: string;
  maintenanceType?: "Full" | "Incremental";
  outputPath?: string;
  fileNamePattern?: string;
  notifyOnFailure?: boolean;
  notifyOnSuccess?: boolean;
  notifyEmails?: string[];
  createdBy?: string;
  metadata?: Record<string, unknown>;
}

export interface UpdateScheduledExportInput {
  exportName?: string;
  cronExpression?: string;
  timezone?: string;
  maintenanceType?: "Full" | "Incremental";
  outputPath?: string;
  fileNamePattern?: string;
  status?: ScheduledExportStatus;
  notifyOnFailure?: boolean;
  notifyOnSuccess?: boolean;
  notifyEmails?: string[];
  metadata?: Record<string, unknown>;
}

export interface ScheduledExportResult {
  success: boolean;
  scheduleId: string;
  exportType: NAXMLExportType;
  recordCount: number;
  fileSizeBytes: number;
  fileHash: string;
  outputPath?: string;
  processingTimeMs: number;
  errorCode?: string;
  errorMessage?: string;
}

export interface ScheduledExportEntry {
  scheduleId: string;
  storeId: string;
  posIntegrationId: string;
  exportType: NAXMLExportType;
  exportName: string;
  cronExpression: string;
  timezone: string;
  maintenanceType: string;
  outputPath: string | null;
  fileNamePattern: string;
  status: ScheduledExportStatus;
  lastRunAt: Date | null;
  lastRunStatus: string | null;
  lastRunError: string | null;
  nextRunAt: Date | null;
  totalRuns: number;
  successfulRuns: number;
  failedRuns: number;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================================================
// Constants
// ============================================================================

const DEFAULT_TIMEZONE = "America/New_York";
const DEFAULT_FILE_NAME_PATTERN = "{type}_{date}_{time}.xml";

// ============================================================================
// Error Handling
// ============================================================================

export const SCHEDULED_EXPORT_ERROR_CODES = {
  NOT_FOUND: "SCHEDULED_EXPORT_NOT_FOUND",
  DUPLICATE: "SCHEDULED_EXPORT_DUPLICATE",
  INVALID_CRON: "SCHEDULED_EXPORT_INVALID_CRON",
  EXPORT_FAILED: "SCHEDULED_EXPORT_FAILED",
  FILE_WRITE_ERROR: "SCHEDULED_EXPORT_FILE_WRITE_ERROR",
  NO_DATA: "SCHEDULED_EXPORT_NO_DATA",
} as const;

export type ScheduledExportErrorCode =
  (typeof SCHEDULED_EXPORT_ERROR_CODES)[keyof typeof SCHEDULED_EXPORT_ERROR_CODES];

export class ScheduledExportError extends Error {
  readonly code: ScheduledExportErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(
    code: ScheduledExportErrorCode,
    message: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ScheduledExportError";
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, ScheduledExportError.prototype);
  }
}

// ============================================================================
// Service Functions
// ============================================================================

/**
 * Create a new scheduled export configuration
 */
export async function createScheduledExport(
  input: CreateScheduledExportInput,
): Promise<string> {
  // Validate cron expression
  if (!isValidCronExpression(input.cronExpression)) {
    throw new ScheduledExportError(
      SCHEDULED_EXPORT_ERROR_CODES.INVALID_CRON,
      `Invalid cron expression: ${input.cronExpression}`,
    );
  }

  // Calculate next run time
  const nextRunAt = calculateNextRun(input.cronExpression, input.timezone);

  const schedule = await prisma.nAXMLScheduledExport.create({
    data: {
      store_id: input.storeId,
      pos_integration_id: input.posIntegrationId,
      export_type: input.exportType as any,
      export_name: input.exportName,
      cron_expression: input.cronExpression,
      timezone: input.timezone || DEFAULT_TIMEZONE,
      maintenance_type: input.maintenanceType || "Full",
      output_path: input.outputPath,
      file_name_pattern: input.fileNamePattern || DEFAULT_FILE_NAME_PATTERN,
      notify_on_failure: input.notifyOnFailure ?? true,
      notify_on_success: input.notifyOnSuccess ?? false,
      notify_emails: input.notifyEmails || [],
      created_by: input.createdBy,
      metadata: (input.metadata || {}) as Prisma.InputJsonValue,
      next_run_at: nextRunAt,
      status: "ACTIVE",
    },
  });

  return schedule.schedule_id;
}

/**
 * Update a scheduled export configuration
 */
export async function updateScheduledExport(
  scheduleId: string,
  input: UpdateScheduledExportInput,
): Promise<void> {
  // Validate cron expression if provided
  if (input.cronExpression && !isValidCronExpression(input.cronExpression)) {
    throw new ScheduledExportError(
      SCHEDULED_EXPORT_ERROR_CODES.INVALID_CRON,
      `Invalid cron expression: ${input.cronExpression}`,
    );
  }

  const updateData: any = {};

  if (input.exportName !== undefined) updateData.export_name = input.exportName;
  if (input.cronExpression !== undefined) {
    updateData.cron_expression = input.cronExpression;
    updateData.next_run_at = calculateNextRun(
      input.cronExpression,
      input.timezone,
    );
  }
  if (input.timezone !== undefined) updateData.timezone = input.timezone;
  if (input.maintenanceType !== undefined)
    updateData.maintenance_type = input.maintenanceType;
  if (input.outputPath !== undefined) updateData.output_path = input.outputPath;
  if (input.fileNamePattern !== undefined)
    updateData.file_name_pattern = input.fileNamePattern;
  if (input.status !== undefined) updateData.status = input.status;
  if (input.notifyOnFailure !== undefined)
    updateData.notify_on_failure = input.notifyOnFailure;
  if (input.notifyOnSuccess !== undefined)
    updateData.notify_on_success = input.notifyOnSuccess;
  if (input.notifyEmails !== undefined)
    updateData.notify_emails = input.notifyEmails;
  if (input.metadata !== undefined) updateData.metadata = input.metadata;

  const result = await prisma.nAXMLScheduledExport.updateMany({
    where: { schedule_id: scheduleId },
    data: updateData,
  });

  if (result.count === 0) {
    throw new ScheduledExportError(
      SCHEDULED_EXPORT_ERROR_CODES.NOT_FOUND,
      `Scheduled export not found: ${scheduleId}`,
    );
  }
}

/**
 * Delete a scheduled export configuration
 */
export async function deleteScheduledExport(scheduleId: string): Promise<void> {
  const result = await prisma.nAXMLScheduledExport.deleteMany({
    where: { schedule_id: scheduleId },
  });

  if (result.count === 0) {
    throw new ScheduledExportError(
      SCHEDULED_EXPORT_ERROR_CODES.NOT_FOUND,
      `Scheduled export not found: ${scheduleId}`,
    );
  }
}

/**
 * Get a scheduled export by ID
 */
export async function getScheduledExport(
  scheduleId: string,
): Promise<ScheduledExportEntry | null> {
  const schedule = await prisma.nAXMLScheduledExport.findUnique({
    where: { schedule_id: scheduleId },
  });

  if (!schedule) return null;

  return mapToScheduledExportEntry(schedule);
}

/**
 * List scheduled exports for a store
 */
export async function listScheduledExports(
  storeId: string,
  options?: {
    status?: ScheduledExportStatus;
    exportType?: NAXMLExportType;
    limit?: number;
    offset?: number;
  },
): Promise<{ schedules: ScheduledExportEntry[]; total: number }> {
  const where: any = { store_id: storeId };

  if (options?.status) where.status = options.status;
  if (options?.exportType) where.export_type = options.exportType;

  const [schedules, total] = await Promise.all([
    prisma.nAXMLScheduledExport.findMany({
      where,
      orderBy: { created_at: "desc" },
      take: options?.limit || 50,
      skip: options?.offset || 0,
    }),
    prisma.nAXMLScheduledExport.count({ where }),
  ]);

  return {
    schedules: schedules.map(mapToScheduledExportEntry),
    total,
  };
}

/**
 * Get scheduled exports that are due to run
 */
export async function getDueScheduledExports(): Promise<
  ScheduledExportEntry[]
> {
  const now = new Date();

  const schedules = await prisma.nAXMLScheduledExport.findMany({
    where: {
      status: "ACTIVE",
      next_run_at: { lte: now },
    },
    orderBy: { next_run_at: "asc" },
  });

  return schedules.map(mapToScheduledExportEntry);
}

/**
 * Execute a scheduled export
 */
export async function executeScheduledExport(
  scheduleId: string,
  triggerType: TriggerType = "SCHEDULED",
): Promise<ScheduledExportResult> {
  const startTime = Date.now();

  // Get schedule configuration
  const schedule = await prisma.nAXMLScheduledExport.findUnique({
    where: { schedule_id: scheduleId },
    include: {
      store: { select: { company_id: true } },
      pos_integration: { select: { xml_gateway_path: true } },
    },
  });

  if (!schedule) {
    throw new ScheduledExportError(
      SCHEDULED_EXPORT_ERROR_CODES.NOT_FOUND,
      `Scheduled export not found: ${scheduleId}`,
    );
  }

  // Create export log entry
  const logId = await createExportLog(scheduleId, schedule.store_id, {
    exportType: schedule.export_type as NAXMLExportType,
    maintenanceType: schedule.maintenance_type,
    triggerType,
  });

  // Create audit record
  let auditId: string | undefined;
  try {
    auditId = await auditService.createAuditRecord({
      storeId: schedule.store_id,
      posIntegrationId: schedule.pos_integration_id,
      companyId: schedule.store.company_id,
      exchangeId: auditService.generateExchangeId("EXPORT"),
      exchangeType: "FILE_EXPORT",
      direction: "OUTBOUND",
      dataCategory: mapExportTypeToDataCategory(
        schedule.export_type as NAXMLExportType,
      ),
      sourceSystem: "NUVANA",
      sourceIdentifier: schedule.export_name,
      destinationSystem: "POS",
      accessReason: `Scheduled NAXML export: ${schedule.export_name}`,
      metadata: {
        scheduleId,
        triggerType,
        exportType: schedule.export_type,
      },
    });
  } catch (auditError) {
    console.error(
      "Failed to create audit record for scheduled export",
      auditError,
    );
  }

  try {
    // Execute the export based on type
    const naxmlService = new NAXMLService();
    let xmlContent: string;
    let recordCount: number;

    switch (schedule.export_type) {
      case "DEPARTMENTS":
        const deptResult = await exportDepartments(
          schedule.store.company_id,
          schedule.maintenance_type as "Full" | "Incremental",
          naxmlService,
        );
        xmlContent = deptResult.content;
        recordCount = deptResult.recordCount;
        break;

      case "TENDER_TYPES":
        const tenderResult = await exportTenderTypes(
          schedule.store.company_id,
          schedule.maintenance_type as "Full" | "Incremental",
          naxmlService,
        );
        xmlContent = tenderResult.content;
        recordCount = tenderResult.recordCount;
        break;

      case "TAX_RATES":
        const taxResult = await exportTaxRates(
          schedule.store.company_id,
          schedule.maintenance_type as "Full" | "Incremental",
          naxmlService,
        );
        xmlContent = taxResult.content;
        recordCount = taxResult.recordCount;
        break;

      case "PRICE_BOOK":
        throw new ScheduledExportError(
          SCHEDULED_EXPORT_ERROR_CODES.EXPORT_FAILED,
          "Price book export not yet implemented",
        );

      case "FULL_SYNC":
        // Full sync exports all types
        const fullResult = await exportFullSync(
          schedule.store.company_id,
          naxmlService,
        );
        xmlContent = fullResult.content;
        recordCount = fullResult.recordCount;
        break;

      default:
        throw new ScheduledExportError(
          SCHEDULED_EXPORT_ERROR_CODES.EXPORT_FAILED,
          `Unknown export type: ${schedule.export_type}`,
        );
    }

    // Calculate file hash and size
    const fileHash = createHash("sha256").update(xmlContent).digest("hex");
    const fileSizeBytes = Buffer.byteLength(xmlContent, "utf-8");

    // Determine output path
    const outputPath =
      schedule.output_path ||
      schedule.pos_integration.xml_gateway_path ||
      undefined;
    let finalFilePath: string | undefined;

    // Write file if output path is configured
    if (outputPath) {
      const fileName = generateFileName(
        schedule.file_name_pattern,
        schedule.export_type as NAXMLExportType,
        schedule.store_id,
      );
      finalFilePath = path.join(outputPath, "BOInbox", fileName);

      try {
        await fs.mkdir(path.dirname(finalFilePath), { recursive: true });
        await fs.writeFile(finalFilePath, xmlContent, "utf-8");
      } catch (writeError) {
        throw new ScheduledExportError(
          SCHEDULED_EXPORT_ERROR_CODES.FILE_WRITE_ERROR,
          `Failed to write export file: ${(writeError as Error).message}`,
          { path: finalFilePath },
        );
      }
    }

    const processingTimeMs = Date.now() - startTime;

    // Update export log with success
    await updateExportLog(logId, {
      status: "SUCCESS",
      recordCount,
      fileSizeBytes: BigInt(fileSizeBytes),
      fileHash,
      outputPath: finalFilePath,
      durationMs: processingTimeMs,
    });

    // Update schedule with success
    await updateScheduleAfterRun(scheduleId, {
      success: true,
      recordCount,
      fileSizeBytes: BigInt(fileSizeBytes),
    });

    // Update audit record
    if (auditId) {
      await auditService.updateAuditRecord(auditId, {
        status: "SUCCESS",
        recordCount,
        dataSizeBytes: BigInt(fileSizeBytes),
        fileHash,
      });
    }

    return {
      success: true,
      scheduleId,
      exportType: schedule.export_type as NAXMLExportType,
      recordCount,
      fileSizeBytes,
      fileHash,
      outputPath: finalFilePath,
      processingTimeMs,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    const errorCode =
      error instanceof ScheduledExportError
        ? error.code
        : SCHEDULED_EXPORT_ERROR_CODES.EXPORT_FAILED;
    const processingTimeMs = Date.now() - startTime;

    // Update export log with failure
    await updateExportLog(logId, {
      status: "FAILED",
      errorCode,
      errorMessage,
      durationMs: processingTimeMs,
    });

    // Update schedule with failure
    await updateScheduleAfterRun(scheduleId, {
      success: false,
      errorMessage,
    });

    // Update audit record
    if (auditId) {
      await auditService.failAuditRecord(auditId, errorCode, errorMessage);
    }

    return {
      success: false,
      scheduleId,
      exportType: schedule.export_type as NAXMLExportType,
      recordCount: 0,
      fileSizeBytes: 0,
      fileHash: "",
      processingTimeMs,
      errorCode,
      errorMessage,
    };
  }
}

/**
 * Pause a scheduled export
 */
export async function pauseScheduledExport(scheduleId: string): Promise<void> {
  await updateScheduledExport(scheduleId, { status: "PAUSED" });
}

/**
 * Resume a scheduled export
 */
export async function resumeScheduledExport(scheduleId: string): Promise<void> {
  const schedule = await prisma.nAXMLScheduledExport.findUnique({
    where: { schedule_id: scheduleId },
  });

  if (!schedule) {
    throw new ScheduledExportError(
      SCHEDULED_EXPORT_ERROR_CODES.NOT_FOUND,
      `Scheduled export not found: ${scheduleId}`,
    );
  }

  const nextRunAt = calculateNextRun(
    schedule.cron_expression,
    schedule.timezone,
  );

  await prisma.nAXMLScheduledExport.update({
    where: { schedule_id: scheduleId },
    data: {
      status: "ACTIVE",
      next_run_at: nextRunAt,
    },
  });
}

/**
 * Get export history for a schedule
 */
export async function getExportHistory(
  scheduleId: string,
  options?: { limit?: number; offset?: number },
): Promise<{ logs: any[]; total: number }> {
  const [logs, total] = await Promise.all([
    prisma.nAXMLScheduledExportLog.findMany({
      where: { schedule_id: scheduleId },
      orderBy: { started_at: "desc" },
      take: options?.limit || 50,
      skip: options?.offset || 0,
    }),
    prisma.nAXMLScheduledExportLog.count({
      where: { schedule_id: scheduleId },
    }),
  ]);

  return {
    logs: logs.map((log) => ({
      logId: log.log_id,
      scheduleId: log.schedule_id,
      storeId: log.store_id,
      startedAt: log.started_at,
      completedAt: log.completed_at,
      durationMs: log.duration_ms,
      status: log.status,
      errorCode: log.error_code,
      errorMessage: log.error_message,
      exportType: log.export_type,
      maintenanceType: log.maintenance_type,
      recordCount: log.record_count,
      fileSizeBytes: log.file_size_bytes?.toString(),
      fileHash: log.file_hash,
      outputPath: log.output_path,
      triggerType: log.trigger_type,
    })),
    total,
  };
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Validate a single cron field value
 * Safe implementation without regex backtracking
 */
function validateCronField(value: string, min: number, max: number): boolean {
  // Wildcard
  if (value === "*") return true;

  // Step pattern: */N
  if (value.startsWith("*/")) {
    const step = parseInt(value.substring(2), 10);
    return !isNaN(step) && step >= 1 && step <= max;
  }

  // Parse comma-separated values and ranges
  const parts = value.split(",");
  if (parts.length > 20) return false; // Limit to prevent DoS

  for (const part of parts) {
    // Check for range: N-M or N-M/S
    if (part.includes("-")) {
      const rangeParts = part.split("/");
      if (rangeParts.length > 2) return false;

      const range = rangeParts[0].split("-");
      if (range.length !== 2) return false;

      const start = parseInt(range[0], 10);
      const end = parseInt(range[1], 10);
      if (isNaN(start) || isNaN(end)) return false;
      if (start < min || end > max || start > end) return false;

      if (rangeParts.length === 2) {
        const step = parseInt(rangeParts[1], 10);
        if (isNaN(step) || step < 1) return false;
      }
    } else {
      // Single number
      const num = parseInt(part, 10);
      if (isNaN(num) || num < min || num > max) return false;
    }
  }

  return true;
}

/**
 * Validate cron expression format
 * Basic validation - supports standard 5-field cron: minute hour day month weekday
 */
function isValidCronExpression(expression: string): boolean {
  // Split into fields
  const fields = expression.trim().split(/\s+/);

  // Must have exactly 5 fields
  if (fields.length !== 5) return false;

  // Validate each field using simple, safe patterns
  const validators = [
    (v: string) => validateCronField(v, 0, 59), // minute
    (v: string) => validateCronField(v, 0, 23), // hour
    (v: string) => validateCronField(v, 1, 31), // day
    (v: string) => validateCronField(v, 1, 12), // month
    (v: string) => validateCronField(v, 0, 6), // weekday
  ];

  for (let i = 0; i < 5; i++) {
    if (!validators[i](fields[i])) return false;
  }

  return true;
}

/**
 * Calculate next run time from cron expression
 * Simplified calculation - for production, use a proper cron library
 */
function calculateNextRun(cronExpression: string, _timezone?: string): Date {
  // For now, use a simple calculation based on the cron fields
  // In production, use a library like 'cron-parser' or 'node-cron'
  const now = new Date();
  const fields = cronExpression.trim().split(/\s+/);

  // Parse minute and hour for simple daily/hourly patterns
  const minuteField = fields[0];
  const hourField = fields[1];

  let nextRun = new Date(now);

  // Helper to check if a field is a step pattern (*/N)
  const isStepPattern = (field: string) => field.startsWith("*/");

  // Handle common patterns
  if (isStepPattern(minuteField)) {
    // Every N minutes (e.g., "*/15 * * * *")
    const interval = parseInt(minuteField.substring(2), 10);
    const currentMinute = now.getMinutes();
    const nextMinute = Math.ceil((currentMinute + 1) / interval) * interval;

    nextRun.setMinutes(nextMinute % 60, 0, 0);

    if (nextMinute >= 60) {
      nextRun.setHours(nextRun.getHours() + 1);
      nextRun.setMinutes(0, 0, 0);
    }
  } else if (isStepPattern(hourField)) {
    // Every N hours at specific minute (e.g., "0 */2 * * *")
    const minute = parseInt(minuteField, 10) || 0;
    const hourInterval = parseInt(hourField.substring(2), 10);
    const currentHour = now.getHours();
    const nextHour = Math.ceil((currentHour + 1) / hourInterval) * hourInterval;

    nextRun.setMinutes(minute, 0, 0);

    if (nextHour >= 24) {
      // Next occurrence is tomorrow
      nextRun.setDate(nextRun.getDate() + 1);
      nextRun.setHours(0, minute, 0, 0);
    } else {
      nextRun.setHours(nextHour, minute, 0, 0);
    }
  } else if (minuteField !== "*" && hourField !== "*") {
    // Specific time (e.g., "0 2 * * *" = 2:00 AM)
    const minute = parseInt(minuteField, 10);
    const hour = parseInt(hourField, 10);

    nextRun.setHours(hour, minute, 0, 0);

    // If that time has passed today, schedule for tomorrow
    if (nextRun <= now) {
      nextRun.setDate(nextRun.getDate() + 1);
    }
  } else if (minuteField !== "*") {
    // Every hour at specific minute (e.g., "30 * * * *")
    const minute = parseInt(minuteField, 10);

    nextRun.setMinutes(minute, 0, 0);

    if (nextRun <= now) {
      nextRun.setHours(nextRun.getHours() + 1);
    }
  } else {
    // Default: next minute
    nextRun.setMinutes(nextRun.getMinutes() + 1, 0, 0);
  }

  return nextRun;
}

/**
 * Generate file name from pattern
 */
function generateFileName(
  pattern: string,
  exportType: NAXMLExportType,
  storeId: string,
): string {
  const now = new Date();
  const date = now.toISOString().split("T")[0].replace(/-/g, "");
  const time = now
    .toISOString()
    .split("T")[1]
    .substring(0, 8)
    .replace(/:/g, "");

  return pattern
    .replace("{type}", exportType.toLowerCase())
    .replace("{date}", date)
    .replace("{time}", time)
    .replace("{store_id}", storeId.substring(0, 8));
}

/**
 * Map export type to data category for audit
 */
function mapExportTypeToDataCategory(
  exportType: NAXMLExportType,
): POSDataCategory {
  switch (exportType) {
    case "DEPARTMENTS":
      return POSDataCategory.DEPARTMENT;
    case "TENDER_TYPES":
      return POSDataCategory.TENDER_TYPE;
    case "TAX_RATES":
      return POSDataCategory.TAX_RATE;
    case "PRICE_BOOK":
      return POSDataCategory.PRICEBOOK;
    case "FULL_SYNC":
      return POSDataCategory.FINANCIAL; // FULL_SYNC maps to FINANCIAL for now
    default:
      return POSDataCategory.FINANCIAL;
  }
}

/**
 * Map database record to ScheduledExportEntry
 */
function mapToScheduledExportEntry(record: any): ScheduledExportEntry {
  return {
    scheduleId: record.schedule_id,
    storeId: record.store_id,
    posIntegrationId: record.pos_integration_id,
    exportType: record.export_type as NAXMLExportType,
    exportName: record.export_name,
    cronExpression: record.cron_expression,
    timezone: record.timezone,
    maintenanceType: record.maintenance_type,
    outputPath: record.output_path,
    fileNamePattern: record.file_name_pattern,
    status: record.status as ScheduledExportStatus,
    lastRunAt: record.last_run_at,
    lastRunStatus: record.last_run_status,
    lastRunError: record.last_run_error,
    nextRunAt: record.next_run_at,
    totalRuns: record.total_runs,
    successfulRuns: record.successful_runs,
    failedRuns: record.failed_runs,
    createdAt: record.created_at,
    updatedAt: record.updated_at,
  };
}

/**
 * Create export log entry
 */
async function createExportLog(
  scheduleId: string,
  storeId: string,
  details: {
    exportType: NAXMLExportType;
    maintenanceType: string;
    triggerType: TriggerType;
  },
): Promise<string> {
  const log = await prisma.nAXMLScheduledExportLog.create({
    data: {
      schedule_id: scheduleId,
      store_id: storeId,
      started_at: new Date(),
      status: "PROCESSING",
      export_type: details.exportType as any,
      maintenance_type: details.maintenanceType,
      trigger_type: details.triggerType,
    },
  });

  return log.log_id;
}

/**
 * Update export log entry
 */
async function updateExportLog(
  logId: string,
  data: {
    status: string;
    recordCount?: number;
    fileSizeBytes?: bigint;
    fileHash?: string;
    outputPath?: string;
    durationMs?: number;
    errorCode?: string;
    errorMessage?: string;
  },
): Promise<void> {
  await prisma.nAXMLScheduledExportLog.update({
    where: { log_id: logId },
    data: {
      status: data.status as any,
      completed_at: new Date(),
      duration_ms: data.durationMs,
      record_count: data.recordCount,
      file_size_bytes: data.fileSizeBytes,
      file_hash: data.fileHash,
      output_path: data.outputPath,
      error_code: data.errorCode,
      error_message: data.errorMessage,
    },
  });
}

/**
 * Update schedule after a run
 */
async function updateScheduleAfterRun(
  scheduleId: string,
  result: {
    success: boolean;
    recordCount?: number;
    fileSizeBytes?: bigint;
    errorMessage?: string;
  },
): Promise<void> {
  const schedule = await prisma.nAXMLScheduledExport.findUnique({
    where: { schedule_id: scheduleId },
  });

  if (!schedule) return;

  const nextRunAt = calculateNextRun(
    schedule.cron_expression,
    schedule.timezone,
  );

  await prisma.nAXMLScheduledExport.update({
    where: { schedule_id: scheduleId },
    data: {
      last_run_at: new Date(),
      last_run_status: result.success ? "SUCCESS" : "FAILED",
      last_run_error: result.errorMessage || null,
      next_run_at: nextRunAt,
      total_runs: { increment: 1 },
      successful_runs: result.success ? { increment: 1 } : undefined,
      failed_runs: !result.success ? { increment: 1 } : undefined,
      last_record_count: result.recordCount,
      last_file_size: result.fileSizeBytes,
    },
  });
}

// ============================================================================
// Export Functions
// ============================================================================

/**
 * Export departments to NAXML format
 */
async function exportDepartments(
  companyId: string,
  maintenanceType: "Full" | "Incremental",
  naxmlService: NAXMLService,
): Promise<{ content: string; recordCount: number }> {
  const departments = await prisma.department.findMany({
    where: {
      client_id: companyId,
      is_active: true,
    },
    orderBy: { code: "asc" },
  });

  if (departments.length === 0) {
    throw new ScheduledExportError(
      SCHEDULED_EXPORT_ERROR_CODES.NO_DATA,
      "No departments found to export",
    );
  }

  const deptData = departments.map((dept) => ({
    departmentCode: dept.code,
    description: dept.display_name || dept.code,
    isTaxable: dept.is_taxable,
    taxRateCode: dept.default_tax_rate_id ?? undefined,
    minimumAge: dept.minimum_age ?? undefined,
    isActive: dept.is_active,
    sortOrder: dept.sort_order,
    action:
      maintenanceType === "Full" ? ("AddUpdate" as const) : ("Update" as const),
  }));

  const content = naxmlService.buildDepartmentDocument(
    companyId,
    deptData,
    maintenanceType,
  );

  return { content, recordCount: departments.length };
}

/**
 * Export tender types to NAXML format
 */
async function exportTenderTypes(
  companyId: string,
  maintenanceType: "Full" | "Incremental",
  naxmlService: NAXMLService,
): Promise<{ content: string; recordCount: number }> {
  const tenderTypes = await prisma.tenderType.findMany({
    where: {
      client_id: companyId,
      is_active: true,
    },
    orderBy: { code: "asc" },
  });

  if (tenderTypes.length === 0) {
    throw new ScheduledExportError(
      SCHEDULED_EXPORT_ERROR_CODES.NO_DATA,
      "No tender types found to export",
    );
  }

  const tenderData = tenderTypes.map((tender) => ({
    tenderCode: tender.code,
    description: tender.display_name || tender.code,
    isCashEquivalent: tender.is_cash_equivalent,
    isElectronic: tender.is_electronic,
    affectsCashDrawer: tender.affects_cash_drawer,
    requiresReference: tender.requires_reference,
    isActive: tender.is_active,
    sortOrder: tender.sort_order,
    action:
      maintenanceType === "Full" ? ("AddUpdate" as const) : ("Update" as const),
  }));

  const content = naxmlService.buildTenderDocument(
    companyId,
    tenderData,
    maintenanceType,
  );

  return { content, recordCount: tenderTypes.length };
}

/**
 * Export tax rates to NAXML format
 */
async function exportTaxRates(
  companyId: string,
  maintenanceType: "Full" | "Incremental",
  naxmlService: NAXMLService,
): Promise<{ content: string; recordCount: number }> {
  const taxRates = await prisma.taxRate.findMany({
    where: {
      client_id: companyId,
      is_active: true,
    },
    orderBy: { code: "asc" },
  });

  if (taxRates.length === 0) {
    throw new ScheduledExportError(
      SCHEDULED_EXPORT_ERROR_CODES.NO_DATA,
      "No tax rates found to export",
    );
  }

  const taxData = taxRates.map((tax) => ({
    taxRateCode: tax.code,
    description: tax.display_name || tax.code,
    rate: Number(tax.rate),
    isActive: tax.is_active,
    jurisdictionCode: tax.jurisdiction_code ?? undefined,
    taxType: tax.rate_type,
    effectiveDate: tax.effective_from?.toISOString(),
    expirationDate: tax.effective_to?.toISOString(),
    action:
      maintenanceType === "Full" ? ("AddUpdate" as const) : ("Update" as const),
  }));

  const content = naxmlService.buildTaxRateDocument(
    companyId,
    taxData,
    maintenanceType,
  );

  return { content, recordCount: taxRates.length };
}

/**
 * Export full sync (all entity types)
 */
async function exportFullSync(
  companyId: string,
  naxmlService: NAXMLService,
): Promise<{ content: string; recordCount: number }> {
  // For full sync, we combine all exports into one
  // This is a simplified implementation - in production you might want separate files

  const [deptResult, tenderResult, taxResult] = await Promise.all([
    exportDepartments(companyId, "Full", naxmlService).catch(() => ({
      content: "",
      recordCount: 0,
    })),
    exportTenderTypes(companyId, "Full", naxmlService).catch(() => ({
      content: "",
      recordCount: 0,
    })),
    exportTaxRates(companyId, "Full", naxmlService).catch(() => ({
      content: "",
      recordCount: 0,
    })),
  ]);

  // Combine all content (simplified - in production use proper XML merging)
  const content = [deptResult.content, tenderResult.content, taxResult.content]
    .filter((c) => c)
    .join("\n\n");

  const totalRecords =
    deptResult.recordCount + tenderResult.recordCount + taxResult.recordCount;

  if (totalRecords === 0) {
    throw new ScheduledExportError(
      SCHEDULED_EXPORT_ERROR_CODES.NO_DATA,
      "No data found to export",
    );
  }

  return { content, recordCount: totalRecords };
}

// ============================================================================
// Export Service Object
// ============================================================================

export const scheduledExportService = {
  createScheduledExport,
  updateScheduledExport,
  deleteScheduledExport,
  getScheduledExport,
  listScheduledExports,
  getDueScheduledExports,
  executeScheduledExport,
  pauseScheduledExport,
  resumeScheduledExport,
  getExportHistory,
  isValidCronExpression,
};
