/**
 * Lottery Game Import Validation Schemas
 *
 * Zod schemas for validating lottery game bulk import operations.
 * Enterprise-grade validation with comprehensive error reporting.
 *
 * @module schemas/lottery-import.schema
 */

import { z } from "zod";

// ============================================================================
// Enum Schemas
// ============================================================================

/**
 * Lottery Game Status enum validation
 */
export const LotteryGameStatusSchema = z.enum([
  "ACTIVE",
  "INACTIVE",
  "DISCONTINUED",
]);

/**
 * Import row status - indicates validation result for each row
 */
export const ImportRowStatusSchema = z.enum([
  "valid", // Row passed all validation
  "error", // Row has validation errors
  "duplicate", // Game code already exists in target state
]);

/**
 * Import action - what will happen when this row is committed
 */
export const ImportActionSchema = z.enum([
  "create", // Will create a new game
  "update", // Will update existing game (if updateExisting enabled)
  "skip", // Will be skipped (duplicate or error)
]);

// ============================================================================
// CSV Row Validation Schemas
// ============================================================================

/**
 * Game code validation - exactly 4 numeric digits
 */
export const GameCodeSchema = z
  .string()
  .min(1, "Game code is required")
  .max(4, "Game code must be exactly 4 digits")
  .regex(/^\d{4}$/, "Game code must be exactly 4 numeric digits");

/**
 * Game name validation
 */
export const GameNameSchema = z
  .string()
  .min(1, "Game name is required")
  .max(255, "Game name cannot exceed 255 characters")
  .transform((val) => val.trim());

/**
 * Game description validation (optional)
 */
export const GameDescriptionSchema = z
  .string()
  .max(500, "Description cannot exceed 500 characters")
  .transform((val) => val.trim())
  .optional()
  .nullable();

/**
 * Price validation - positive decimal with up to 2 decimal places
 */
export const PriceSchema = z
  .union([z.string(), z.number()])
  .transform((val) => {
    if (typeof val === "string") {
      // Remove currency symbols and whitespace
      const cleaned = val.replace(/[$,\s]/g, "");
      return parseFloat(cleaned);
    }
    return val;
  })
  .pipe(
    z
      .number()
      .positive("Price must be greater than 0")
      .max(1000, "Price cannot exceed $1000")
      .refine(
        (val) => Number.isFinite(val) && !isNaN(val),
        "Price must be a valid number",
      ),
  );

/**
 * Pack value validation - positive decimal with up to 2 decimal places
 */
export const PackValueSchema = z
  .union([z.string(), z.number()])
  .transform((val) => {
    if (typeof val === "string") {
      const cleaned = val.replace(/[$,\s]/g, "");
      return cleaned ? parseFloat(cleaned) : 300; // Default to 300
    }
    return val;
  })
  .pipe(
    z
      .number()
      .positive("Pack value must be greater than 0")
      .max(10000, "Pack value cannot exceed $10,000"),
  )
  .optional()
  .default(300);

/**
 * Tickets per pack validation (optional - auto-computed if omitted)
 */
export const TicketsPerPackSchema = z
  .union([z.string(), z.number()])
  .transform((val) => {
    if (typeof val === "string") {
      const cleaned = val.trim();
      return cleaned ? parseInt(cleaned, 10) : null;
    }
    return val;
  })
  .pipe(
    z
      .number()
      .int("Tickets per pack must be a whole number")
      .positive("Tickets per pack must be greater than 0")
      .max(1000, "Tickets per pack cannot exceed 1000")
      .nullable(),
  )
  .optional()
  .nullable();

/**
 * Status validation with case-insensitive matching
 */
export const StatusSchema = z
  .string()
  .transform((val) => val.trim().toUpperCase())
  .pipe(LotteryGameStatusSchema)
  .optional()
  .default("ACTIVE");

/**
 * Single CSV row validation schema
 * Validates one row of lottery game data from CSV
 */
export const LotteryGameCsvRowSchema = z.object({
  game_code: GameCodeSchema,
  name: GameNameSchema,
  price: PriceSchema,
  description: GameDescriptionSchema.optional(),
  pack_value: PackValueSchema,
  tickets_per_pack: TicketsPerPackSchema,
  status: StatusSchema,
});

/**
 * Inferred type for validated CSV row
 */
export type LotteryGameCsvRow = z.infer<typeof LotteryGameCsvRowSchema>;

// ============================================================================
// Import Options Schemas
// ============================================================================

/**
 * Import options schema - controls import behavior
 */
export const ImportOptionsSchema = z.object({
  skipDuplicates: z.boolean().default(true),
  updateExisting: z.boolean().default(false),
});

export type ImportOptions = z.infer<typeof ImportOptionsSchema>;

// ============================================================================
// Validated Row Schemas (stored in database)
// ============================================================================

/**
 * Existing game reference (for duplicates)
 */
export const ExistingGameRefSchema = z.object({
  game_id: z.string().uuid(),
  name: z.string(),
  price: z.number(),
  status: LotteryGameStatusSchema,
});

/**
 * Validated row schema - result of validating one CSV row
 */
export const ValidatedRowSchema = z.object({
  row_number: z.number().int().positive(),
  status: ImportRowStatusSchema,
  action: ImportActionSchema.nullable(),
  data: LotteryGameCsvRowSchema,
  errors: z.array(z.string()).optional(),
  existing_game: ExistingGameRefSchema.optional(),
});

export type ValidatedRow = z.infer<typeof ValidatedRowSchema>;

// ============================================================================
// API Request Schemas
// ============================================================================

/**
 * Validate import request - multipart form data fields
 */
export const ValidateImportRequestSchema = z.object({
  state_id: z.string().uuid("State ID must be a valid UUID"),
  options: z
    .string()
    .optional()
    .transform((val) => {
      if (!val) return { skipDuplicates: true, updateExisting: false };
      try {
        return JSON.parse(val);
      } catch {
        return { skipDuplicates: true, updateExisting: false };
      }
    })
    .pipe(ImportOptionsSchema),
});

export type ValidateImportRequest = z.infer<typeof ValidateImportRequestSchema>;

/**
 * Commit import request schema
 */
export const CommitImportRequestSchema = z.object({
  validation_token: z.string().uuid("Validation token must be a valid UUID"),
  options: z
    .object({
      skip_errors: z.boolean().default(true),
      update_duplicates: z.boolean().default(false),
    })
    .optional()
    .default({ skip_errors: true, update_duplicates: false }),
});

export type CommitImportRequest = z.infer<typeof CommitImportRequestSchema>;

// ============================================================================
// API Response Schemas
// ============================================================================

/**
 * Preview summary schema
 */
export const PreviewSummarySchema = z.object({
  total_rows: z.number().int(),
  valid_rows: z.number().int(),
  error_rows: z.number().int(),
  duplicate_rows: z.number().int(),
  games_to_create: z.number().int(),
  games_to_update: z.number().int(),
});

export type PreviewSummary = z.infer<typeof PreviewSummarySchema>;

/**
 * Validation response schema
 */
export const ValidationResponseSchema = z.object({
  valid: z.boolean(),
  preview: PreviewSummarySchema,
  validation_token: z.string().uuid(),
  expires_at: z.string().datetime(),
  rows: z.array(ValidatedRowSchema),
});

export type ValidationResponse = z.infer<typeof ValidationResponseSchema>;

/**
 * Commit summary schema
 */
export const CommitSummarySchema = z.object({
  created: z.number().int(),
  updated: z.number().int(),
  skipped: z.number().int(),
  failed: z.number().int(),
});

export type CommitSummary = z.infer<typeof CommitSummarySchema>;

/**
 * Created game reference
 */
export const CreatedGameRefSchema = z.object({
  game_id: z.string().uuid(),
  game_code: z.string(),
  name: z.string(),
  price: z.number(),
  row_number: z.number().int(),
});

/**
 * Commit error reference
 */
export const CommitErrorSchema = z.object({
  row_number: z.number().int(),
  error: z.string(),
});

/**
 * Commit response schema
 */
export const CommitResponseSchema = z.object({
  success: z.boolean(),
  summary: CommitSummarySchema,
  created_games: z.array(CreatedGameRefSchema),
  errors: z.array(CommitErrorSchema),
});

export type CommitResponse = z.infer<typeof CommitResponseSchema>;

// ============================================================================
// CSV Header Mapping
// ============================================================================

/**
 * Expected CSV headers (case-insensitive matching)
 */
export const CSV_HEADERS = {
  required: ["game_code", "name", "price"] as const,
  optional: [
    "description",
    "pack_value",
    "tickets_per_pack",
    "status",
  ] as const,
};

/**
 * Header name normalization map
 * Supports various common column name formats
 */
export const HEADER_ALIASES: Record<string, string> = {
  // game_code aliases
  game_code: "game_code",
  gamecode: "game_code",
  "game code": "game_code",
  code: "game_code",
  game_number: "game_code",
  gamenumber: "game_code",
  "game number": "game_code",
  game_id: "game_code", // Note: different from our internal game_id UUID

  // name aliases
  name: "name",
  game_name: "name",
  gamename: "name",
  "game name": "name",
  title: "name",

  // price aliases
  price: "price",
  ticket_price: "price",
  ticketprice: "price",
  "ticket price": "price",
  cost: "price",

  // description aliases
  description: "description",
  desc: "description",
  game_description: "description",

  // pack_value aliases
  pack_value: "pack_value",
  packvalue: "pack_value",
  "pack value": "pack_value",
  pack_price: "pack_value",
  "pack price": "pack_value",

  // tickets_per_pack aliases
  tickets_per_pack: "tickets_per_pack",
  ticketsperpack: "tickets_per_pack",
  "tickets per pack": "tickets_per_pack",
  ticket_count: "tickets_per_pack",
  tickets: "tickets_per_pack",

  // status aliases
  status: "status",
  game_status: "status",
  state: "status", // Be careful - also used for US state
};

// ============================================================================
// Validation Helper Functions
// ============================================================================

/**
 * Normalize a header name to our standard field name
 */
export function normalizeHeader(header: string): string | undefined {
  const normalized = header
    .toLowerCase()
    .trim()
    .replace(/[\s_-]+/g, "_");
  return HEADER_ALIASES[normalized];
}

/**
 * Validate CSV row data with detailed error collection
 * Returns all errors instead of failing on first error
 */
export function validateCsvRow(
  rowData: Record<string, unknown>,
  _rowNumber: number,
):
  | { success: true; data: LotteryGameCsvRow }
  | { success: false; errors: string[] } {
  const result = LotteryGameCsvRowSchema.safeParse(rowData);

  if (result.success) {
    return { success: true, data: result.data };
  }

  // Collect all error messages
  const errors = result.error.issues.map((issue) => {
    const field = issue.path.join(".");
    return `${field}: ${issue.message}`;
  });

  return { success: false, errors };
}

/**
 * Parse and validate import options from string
 */
export function parseImportOptions(optionsString?: string): ImportOptions {
  if (!optionsString) {
    return { skipDuplicates: true, updateExisting: false };
  }

  try {
    const parsed = JSON.parse(optionsString);
    return ImportOptionsSchema.parse(parsed);
  } catch {
    return { skipDuplicates: true, updateExisting: false };
  }
}
