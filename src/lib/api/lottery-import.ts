/**
 * Lottery Game Import API Client
 *
 * Frontend API functions for bulk lottery game import operations.
 * Implements two-phase commit pattern: Validate → Preview → Commit
 *
 * @module lib/api/lottery-import
 */

import apiClient, { extractData } from "./client";

// ============================================================================
// Types
// ============================================================================

export interface ImportOptions {
  skipDuplicates?: boolean;
  updateExisting?: boolean;
}

export interface PreviewSummary {
  total_rows: number;
  valid_rows: number;
  error_rows: number;
  duplicate_rows: number;
  games_to_create: number;
  games_to_update: number;
}

export interface ExistingGameRef {
  game_id: string;
  name: string;
  price: number;
  status: "ACTIVE" | "INACTIVE" | "DISCONTINUED";
}

export interface ValidatedRow {
  row_number: number;
  status: "valid" | "error" | "duplicate";
  action: "create" | "update" | "skip" | null;
  data: {
    game_code: string;
    name: string;
    price: number;
    description?: string | null;
    pack_value: number;
    tickets_per_pack?: number | null;
    status: "ACTIVE" | "INACTIVE" | "DISCONTINUED";
  };
  errors?: string[];
  existing_game?: ExistingGameRef;
}

export interface ValidationResponse {
  valid: boolean;
  preview: PreviewSummary;
  validation_token?: string;
  expires_at?: string;
  rows: ValidatedRow[];
}

export interface CommitSummary {
  created: number;
  updated: number;
  skipped: number;
  failed: number;
}

export interface CreatedGameRef {
  game_id: string;
  game_code: string;
  name: string;
  price: number;
  row_number: number;
}

export interface CommitError {
  row_number: number;
  error: string;
}

export interface CommitResponse {
  summary: CommitSummary;
  created_games: CreatedGameRef[];
  errors: CommitError[];
}

export interface ImportStatus {
  import_id: string;
  validation_token: string;
  state: {
    code: string;
    name: string;
  };
  total_rows: number;
  valid_rows: number;
  error_rows: number;
  duplicate_rows: number;
  expires_at: string;
  is_expired: boolean;
  is_committed: boolean;
  committed_at: string | null;
  commit_result: CommitSummary | null;
  created_at: string;
}

// ============================================================================
// API Functions
// ============================================================================

/**
 * Validate a CSV file and get preview of import results
 *
 * @param file - CSV file to validate
 * @param stateId - Target state UUID
 * @param options - Import options
 * @returns Validation result with preview
 */
export async function validateImport(
  file: File,
  stateId: string,
  options?: ImportOptions,
): Promise<ValidationResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const queryParams = new URLSearchParams({
    state_id: stateId,
  });

  if (options) {
    queryParams.set("options", JSON.stringify(options));
  }

  const response = await apiClient.post(
    `/api/lottery/games/import/validate?${queryParams.toString()}`,
    formData,
    {
      headers: {
        // Let browser set Content-Type with boundary for multipart
        "Content-Type": undefined as unknown as string,
      },
    },
  );

  return extractData<ValidationResponse>(response);
}

/**
 * Commit a validated import using the validation token
 *
 * @param validationToken - Token from validation response
 * @param options - Commit options
 * @returns Commit result with summary
 */
export async function commitImport(
  validationToken: string,
  options?: {
    skip_errors?: boolean;
    update_duplicates?: boolean;
  },
): Promise<CommitResponse> {
  const response = await apiClient.post("/api/lottery/games/import/commit", {
    validation_token: validationToken,
    options: options || { skip_errors: true, update_duplicates: false },
  });

  return extractData<CommitResponse>(response);
}

/**
 * Download the CSV template for lottery game import
 *
 * @returns CSV content as string
 */
export async function downloadTemplate(): Promise<string> {
  const response = await apiClient.get("/api/lottery/games/import/template", {
    responseType: "text",
  });

  return response.data as string;
}

/**
 * Download the CSV template as a file
 * Opens browser download dialog
 */
export async function downloadTemplateAsFile(): Promise<void> {
  try {
    // Fetch the template via API client (handles auth and base URL)
    const csvContent = await downloadTemplate();

    // Create a Blob from the CSV content
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });

    // Create download link
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.href = url;
    link.download = "lottery_games_import_template.csv";

    // Trigger download
    document.body.appendChild(link);
    link.click();

    // Cleanup
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error("Failed to download template:", error);
    throw error;
  }
}

/**
 * Check the status of a validation token
 *
 * @param validationToken - Token to check
 * @returns Import status or null if not found
 */
export async function getImportStatus(
  validationToken: string,
): Promise<ImportStatus | null> {
  try {
    const response = await apiClient.get(
      `/api/lottery/games/import/status/${validationToken}`,
    );
    return extractData<ImportStatus>(response);
  } catch (error: any) {
    if (error.response?.status === 404) {
      return null;
    }
    throw error;
  }
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Parse validation errors into user-friendly messages
 */
export function formatValidationErrors(rows: ValidatedRow[]): string[] {
  const errorRows = rows.filter((r) => r.status === "error");
  return errorRows.flatMap((row) =>
    (row.errors || []).map((error) => `Row ${row.row_number}: ${error}`),
  );
}

/**
 * Check if import can proceed (has at least one valid row)
 */
export function canProceedWithImport(preview: PreviewSummary): boolean {
  return preview.games_to_create > 0 || preview.games_to_update > 0;
}

/**
 * Format preview summary for display
 */
export function formatPreviewSummary(preview: PreviewSummary): string {
  const parts: string[] = [];

  if (preview.games_to_create > 0) {
    parts.push(
      `${preview.games_to_create} game${preview.games_to_create !== 1 ? "s" : ""} to create`,
    );
  }

  if (preview.games_to_update > 0) {
    parts.push(
      `${preview.games_to_update} game${preview.games_to_update !== 1 ? "s" : ""} to update`,
    );
  }

  if (preview.duplicate_rows > 0) {
    parts.push(
      `${preview.duplicate_rows} duplicate${preview.duplicate_rows !== 1 ? "s" : ""} to skip`,
    );
  }

  if (preview.error_rows > 0) {
    parts.push(
      `${preview.error_rows} row${preview.error_rows !== 1 ? "s" : ""} with errors`,
    );
  }

  return parts.join(", ");
}

/**
 * Calculate progress percentage for UI
 */
export function calculateImportProgress(
  summary: CommitSummary,
  total: number,
): number {
  if (total === 0) return 100;
  const processed =
    summary.created + summary.updated + summary.skipped + summary.failed;
  return Math.round((processed / total) * 100);
}
