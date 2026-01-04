/**
 * Lottery Game Import Service
 *
 * Enterprise-grade bulk import service for lottery games.
 * Implements two-phase commit pattern: Validate → Preview → Commit
 *
 * Features:
 * - CSV parsing with comprehensive validation
 * - Duplicate detection against existing games
 * - Validation token with expiry for commit
 * - Atomic transaction for commit phase
 * - Detailed error reporting
 *
 * @module services/lottery-import.service
 */

import { prisma } from "../utils/db";
import { Prisma, LotteryGameStatus } from "@prisma/client";
import { parseCsvBuffer, CsvParseResult } from "./csv-parser.service";
import {
  normalizeHeader,
  validateCsvRow,
  CSV_HEADERS,
  type LotteryGameCsvRow,
  type ImportOptions,
  type ValidatedRow,
  type PreviewSummary,
  type CommitSummary,
} from "../schemas/lottery-import.schema";

// ============================================================================
// Types
// ============================================================================

export interface ValidateImportParams {
  fileBuffer: Buffer;
  stateId: string;
  userId: string;
  options: ImportOptions;
}

export interface ValidateImportResult {
  success: boolean;
  validationToken?: string;
  expiresAt?: Date;
  preview: PreviewSummary;
  rows: ValidatedRow[];
  errors: string[];
}

export interface CommitImportParams {
  validationToken: string;
  userId: string;
  options: {
    skip_errors: boolean;
    update_duplicates: boolean;
  };
}

export interface CommitImportResult {
  success: boolean;
  summary: CommitSummary;
  createdGames: Array<{
    game_id: string;
    game_code: string;
    name: string;
    price: number;
    row_number: number;
  }>;
  errors: Array<{
    row_number: number;
    error: string;
  }>;
}

// ============================================================================
// Constants
// ============================================================================

const VALIDATION_TOKEN_EXPIRY_MINUTES = 15;
const MAX_IMPORT_ROWS = 1000;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

// ============================================================================
// Validation Phase
// ============================================================================

/**
 * Validate a CSV file and return preview results
 * This is phase 1 of the two-phase commit pattern
 */
export async function validateImport(
  params: ValidateImportParams,
): Promise<ValidateImportResult> {
  const { fileBuffer, stateId, userId, options } = params;

  // Check if state exists and has lottery enabled
  const state = await prisma.uSState.findUnique({
    where: { state_id: stateId },
    select: {
      state_id: true,
      code: true,
      name: true,
      lottery_enabled: true,
      is_active: true,
    },
  });

  if (!state) {
    return {
      success: false,
      preview: emptyPreview(),
      rows: [],
      errors: ["Invalid state ID. State not found."],
    };
  }

  if (!state.is_active) {
    return {
      success: false,
      preview: emptyPreview(),
      rows: [],
      errors: [`State ${state.name} is not active.`],
    };
  }

  if (!state.lottery_enabled) {
    return {
      success: false,
      preview: emptyPreview(),
      rows: [],
      errors: [`Lottery operations are not enabled for ${state.name}.`],
    };
  }

  // Parse CSV
  const parseResult = await parseCsvBuffer(fileBuffer, {
    maxFileSize: MAX_FILE_SIZE,
    maxRows: MAX_IMPORT_ROWS,
    headerNormalizer: normalizeHeader,
    requiredHeaders: [...CSV_HEADERS.required],
    skipEmptyRows: true,
    trimValues: true,
  });

  if (!parseResult.success) {
    return {
      success: false,
      preview: emptyPreview(),
      rows: [],
      errors: parseResult.errors.map((e) => `Row ${e.rowNumber}: ${e.message}`),
    };
  }

  if (parseResult.totalRows === 0) {
    return {
      success: false,
      preview: emptyPreview(),
      rows: [],
      errors: ["CSV file contains no data rows."],
    };
  }

  // Get existing games in this state for duplicate detection
  const existingGames = await prisma.lotteryGame.findMany({
    where: {
      state_id: stateId,
      status: { not: "DISCONTINUED" },
    },
    select: {
      game_id: true,
      game_code: true,
      name: true,
      price: true,
      status: true,
    },
  });

  const existingGamesByCode = new Map(
    existingGames.map((g) => [g.game_code, g]),
  );

  // Validate each row
  const validatedRows: ValidatedRow[] = [];
  let validCount = 0;
  let errorCount = 0;
  let duplicateCount = 0;
  let createCount = 0;
  let updateCount = 0;

  // Track game codes within this import for internal duplicate detection
  const seenGameCodes = new Map<string, number>();

  for (const parsedRow of parseResult.rows) {
    const rowNumber = parsedRow.rowNumber;
    const rowData = parsedRow.data;

    // Validate row data
    const validationResult = validateCsvRow(rowData, rowNumber);

    if (!validationResult.success) {
      validatedRows.push({
        row_number: rowNumber,
        status: "error",
        action: null,
        data: rowData as unknown as LotteryGameCsvRow,
        errors: validationResult.errors,
      });
      errorCount++;
      continue;
    }

    const data = validationResult.data;

    // Check for internal duplicates (same game_code in CSV)
    const previousRow = seenGameCodes.get(data.game_code);
    if (previousRow !== undefined) {
      validatedRows.push({
        row_number: rowNumber,
        status: "error",
        action: null,
        data,
        errors: [
          `Duplicate game_code ${data.game_code} (also on row ${previousRow})`,
        ],
      });
      errorCount++;
      continue;
    }
    seenGameCodes.set(data.game_code, rowNumber);

    // Check for database duplicates
    const existingGame = existingGamesByCode.get(data.game_code);
    if (existingGame) {
      if (options.updateExisting) {
        // Will update existing game
        validatedRows.push({
          row_number: rowNumber,
          status: "valid",
          action: "update",
          data,
          existing_game: {
            game_id: existingGame.game_id,
            name: existingGame.name,
            price: Number(existingGame.price),
            status: existingGame.status as LotteryGameStatus,
          },
        });
        validCount++;
        updateCount++;
      } else {
        // Mark as duplicate (will be skipped)
        validatedRows.push({
          row_number: rowNumber,
          status: "duplicate",
          action: "skip",
          data,
          existing_game: {
            game_id: existingGame.game_id,
            name: existingGame.name,
            price: Number(existingGame.price),
            status: existingGame.status as LotteryGameStatus,
          },
        });
        duplicateCount++;
      }
      continue;
    }

    // Valid new game
    validatedRows.push({
      row_number: rowNumber,
      status: "valid",
      action: "create",
      data,
    });
    validCount++;
    createCount++;
  }

  // Build preview summary
  const preview: PreviewSummary = {
    total_rows: parseResult.totalRows,
    valid_rows: validCount,
    error_rows: errorCount,
    duplicate_rows: duplicateCount,
    games_to_create: createCount,
    games_to_update: updateCount,
  };

  // If there are no valid rows, don't create a validation token
  if (validCount === 0) {
    return {
      success: false,
      preview,
      rows: validatedRows,
      errors: ["No valid games to import. Please fix errors and try again."],
    };
  }

  // Store validated data in database for commit phase
  const expiresAt = new Date(
    Date.now() + VALIDATION_TOKEN_EXPIRY_MINUTES * 60 * 1000,
  );

  const importRecord = await prisma.lotteryGameImport.create({
    data: {
      state_id: stateId,
      created_by_user_id: userId,
      validated_data: validatedRows as unknown as Prisma.InputJsonValue,
      import_options: options as unknown as Prisma.InputJsonValue,
      total_rows: parseResult.totalRows,
      valid_rows: validCount,
      error_rows: errorCount,
      duplicate_rows: duplicateCount,
      expires_at: expiresAt,
    },
    select: {
      validation_token: true,
      expires_at: true,
    },
  });

  return {
    success: true,
    validationToken: importRecord.validation_token,
    expiresAt: importRecord.expires_at,
    preview,
    rows: validatedRows,
    errors: [],
  };
}

// ============================================================================
// Commit Phase
// ============================================================================

/**
 * Commit a validated import using the validation token
 * This is phase 2 of the two-phase commit pattern
 */
export async function commitImport(
  params: CommitImportParams,
): Promise<CommitImportResult> {
  const { validationToken, userId, options } = params;

  // Find and validate the import record
  const importRecord = await prisma.lotteryGameImport.findUnique({
    where: { validation_token: validationToken },
    include: {
      state: {
        select: {
          state_id: true,
          code: true,
          name: true,
          lottery_enabled: true,
        },
      },
    },
  });

  if (!importRecord) {
    return {
      success: false,
      summary: emptySummary(),
      createdGames: [],
      errors: [{ row_number: 0, error: "Invalid validation token" }],
    };
  }

  // Check if already committed
  if (importRecord.committed_at) {
    return {
      success: false,
      summary: emptySummary(),
      createdGames: [],
      errors: [
        { row_number: 0, error: "This import has already been committed" },
      ],
    };
  }

  // Check if token has expired
  if (new Date() > importRecord.expires_at) {
    return {
      success: false,
      summary: emptySummary(),
      createdGames: [],
      errors: [
        {
          row_number: 0,
          error: `Validation token expired at ${importRecord.expires_at.toISOString()}. Please re-upload and validate the file.`,
        },
      ],
    };
  }

  // Verify the user has permission (must be the creator or have SYSTEM scope)
  // Note: This is a soft check - route middleware should enforce permissions
  if (importRecord.created_by_user_id !== userId) {
    // For now, allow if they have the token (handled by route)
    // In production, add additional authorization check here
  }

  // Extract validated rows
  const validatedRows =
    importRecord.validated_data as unknown as ValidatedRow[];

  // Filter rows based on options
  const rowsToProcess = validatedRows.filter((row) => {
    // Skip error rows unless skip_errors is false (which would fail the whole import)
    if (row.status === "error") {
      return !options.skip_errors;
    }

    // Skip duplicates unless update_duplicates is true
    if (row.status === "duplicate") {
      return options.update_duplicates;
    }

    return true;
  });

  if (!options.skip_errors) {
    const errorRows = validatedRows.filter((r) => r.status === "error");
    if (errorRows.length > 0) {
      return {
        success: false,
        summary: emptySummary(),
        createdGames: [],
        errors: errorRows.map((r) => ({
          row_number: r.row_number,
          error: r.errors?.join(", ") || "Validation error",
        })),
      };
    }
  }

  // Perform atomic commit in transaction
  const result = await prisma.$transaction(async (tx) => {
    const createdGames: CommitImportResult["createdGames"] = [];
    const errors: CommitImportResult["errors"] = [];
    let created = 0;
    let updated = 0;
    let skipped = 0;
    let failed = 0;

    for (const row of rowsToProcess) {
      try {
        if (row.action === "create") {
          // Create new game
          const ticketsPerPack = row.data.tickets_per_pack
            ? row.data.tickets_per_pack
            : Math.floor(row.data.pack_value / row.data.price);

          const game = await tx.lotteryGame.create({
            data: {
              game_code: row.data.game_code,
              name: row.data.name,
              description: row.data.description || null,
              price: new Prisma.Decimal(row.data.price),
              pack_value: new Prisma.Decimal(row.data.pack_value),
              tickets_per_pack: ticketsPerPack,
              status: (row.data.status as LotteryGameStatus) || "ACTIVE",
              state_id: importRecord.state_id,
              created_by_user_id: userId,
            },
            select: {
              game_id: true,
              game_code: true,
              name: true,
              price: true,
            },
          });

          createdGames.push({
            game_id: game.game_id,
            game_code: game.game_code,
            name: game.name,
            price: Number(game.price),
            row_number: row.row_number,
          });
          created++;
        } else if (row.action === "update" && row.existing_game) {
          // Update existing game
          const ticketsPerPack = row.data.tickets_per_pack
            ? row.data.tickets_per_pack
            : Math.floor(row.data.pack_value / row.data.price);

          await tx.lotteryGame.update({
            where: { game_id: row.existing_game.game_id },
            data: {
              name: row.data.name,
              description: row.data.description || null,
              price: new Prisma.Decimal(row.data.price),
              pack_value: new Prisma.Decimal(row.data.pack_value),
              tickets_per_pack: ticketsPerPack,
              status:
                (row.data.status as LotteryGameStatus) ||
                row.existing_game.status,
            },
          });
          updated++;
        } else if (row.action === "skip") {
          skipped++;
        }
      } catch (error: any) {
        // Handle unique constraint violation (race condition on duplicate)
        if (error.code === "P2002") {
          errors.push({
            row_number: row.row_number,
            error: `Game code ${row.data.game_code} already exists (possible race condition)`,
          });
          failed++;
        } else {
          throw error; // Re-throw unexpected errors to rollback transaction
        }
      }
    }

    // Count skipped rows from original validation
    const originalSkipped = validatedRows.filter(
      (r) => r.status === "duplicate" && !options.update_duplicates,
    ).length;

    const originalErrors = validatedRows.filter(
      (r) => r.status === "error",
    ).length;

    // Update import record with commit result
    await tx.lotteryGameImport.update({
      where: { import_id: importRecord.import_id },
      data: {
        committed_at: new Date(),
        commit_result: {
          created,
          updated,
          skipped: skipped + originalSkipped,
          failed: failed + (options.skip_errors ? originalErrors : 0),
        },
      },
    });

    return {
      success: failed === 0,
      summary: {
        created,
        updated,
        skipped: skipped + originalSkipped,
        failed: failed + (options.skip_errors ? originalErrors : 0),
      },
      createdGames,
      errors,
    };
  });

  // Create audit log (non-blocking)
  try {
    await prisma.auditLog.create({
      data: {
        user_id: userId,
        action: "LOTTERY_GAMES_IMPORT",
        table_name: "lottery_games",
        record_id: importRecord.import_id,
        new_values: {
          state_id: importRecord.state_id,
          state_code: importRecord.state.code,
          total_rows: importRecord.total_rows,
          created: result.summary.created,
          updated: result.summary.updated,
          skipped: result.summary.skipped,
          failed: result.summary.failed,
        },
      },
    });
  } catch (auditError) {
    console.error("Failed to create audit log for import:", auditError);
    // Don't fail the import for audit log errors
  }

  return result;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Get import status by validation token
 */
export async function getImportStatus(validationToken: string) {
  const importRecord = await prisma.lotteryGameImport.findUnique({
    where: { validation_token: validationToken },
    select: {
      import_id: true,
      validation_token: true,
      state_id: true,
      total_rows: true,
      valid_rows: true,
      error_rows: true,
      duplicate_rows: true,
      expires_at: true,
      committed_at: true,
      commit_result: true,
      created_at: true,
      state: {
        select: { code: true, name: true },
      },
    },
  });

  if (!importRecord) {
    return null;
  }

  return {
    ...importRecord,
    is_expired: new Date() > importRecord.expires_at,
    is_committed: importRecord.committed_at !== null,
  };
}

/**
 * Clean up expired import records
 * Should be run periodically (e.g., daily cron job)
 */
export async function cleanupExpiredImports(): Promise<number> {
  const result = await prisma.lotteryGameImport.deleteMany({
    where: {
      expires_at: { lt: new Date() },
      committed_at: null, // Only delete uncommitted imports
    },
  });

  return result.count;
}

/**
 * Get import history for a user
 */
export async function getUserImportHistory(userId: string, limit = 20) {
  return prisma.lotteryGameImport.findMany({
    where: { created_by_user_id: userId },
    select: {
      import_id: true,
      validation_token: true,
      total_rows: true,
      valid_rows: true,
      error_rows: true,
      duplicate_rows: true,
      expires_at: true,
      committed_at: true,
      commit_result: true,
      created_at: true,
      state: {
        select: { code: true, name: true },
      },
    },
    orderBy: { created_at: "desc" },
    take: limit,
  });
}

// ============================================================================
// Helper Functions
// ============================================================================

function emptyPreview(): PreviewSummary {
  return {
    total_rows: 0,
    valid_rows: 0,
    error_rows: 0,
    duplicate_rows: 0,
    games_to_create: 0,
    games_to_update: 0,
  };
}

function emptySummary(): CommitSummary {
  return {
    created: 0,
    updated: 0,
    skipped: 0,
    failed: 0,
  };
}

// ============================================================================
// CSV Template Generation
// ============================================================================

/**
 * Generate a sample CSV template for download
 */
export function generateImportTemplate(): string {
  const headers = [
    "game_code",
    "name",
    "price",
    "description",
    "pack_value",
    "tickets_per_pack",
    "status",
  ];

  const sampleRows = [
    {
      game_code: "1234",
      name: "Mega Cash",
      price: "5.00",
      description: "Win up to $50,000",
      pack_value: "300.00",
      tickets_per_pack: "60",
      status: "ACTIVE",
    },
    {
      game_code: "5678",
      name: "Lucky 7s",
      price: "2.00",
      description: "Triple your money",
      pack_value: "300.00",
      tickets_per_pack: "150",
      status: "ACTIVE",
    },
    {
      game_code: "9012",
      name: "Golden Ticket",
      price: "10.00",
      description: "",
      pack_value: "500.00",
      tickets_per_pack: "50",
      status: "ACTIVE",
    },
  ];

  const lines = [headers.join(",")];

  for (const row of sampleRows) {
    lines.push(headers.map((h) => row[h as keyof typeof row] || "").join(","));
  }

  return lines.join("\n");
}
