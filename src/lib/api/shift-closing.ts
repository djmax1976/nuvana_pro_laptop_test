/**
 * Shift Closing API client functions
 * Provides functions for interacting with the shift closing API
 * All functions require appropriate shift permissions and active shift
 *
 * Story: 10.1 - Lottery Shift Closing Page UI
 */

import { useQuery } from "@tanstack/react-query";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

// ============ Types ============

/**
 * Bin with pack information
 * Represents a bin that may or may not have an active pack
 */
export interface BinWithPack {
  bin_id: string;
  bin_number: number; // display_order + 1
  name: string;
  is_active: boolean;
  pack: {
    pack_id: string;
    game_name: string;
    game_price: number;
    starting_serial: string; // from LotteryShiftOpening or pack's last position
    serial_end: string; // pack's maximum serial (for validation)
    pack_number: string; // for scan validation
  } | null; // null = empty bin
}

/**
 * Depleted pack information
 * Represents a pack that was completely sold during the shift
 */
export interface DepletedPack {
  bin_id: string;
  bin_number: number;
  pack_id: string;
  game_name: string;
  game_price: number;
  starting_serial: string;
  ending_serial: string; // pack's serial_end
}

/**
 * Lottery closing data response
 */
export interface LotteryClosingDataResponse {
  bins: BinWithPack[];
  soldPacks: DepletedPack[];
}

/**
 * API response wrapper
 * Follows API-003: ERROR_HANDLING - generic error responses
 */
export interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
  error?: string;
}

/**
 * API error response
 * The error field can be a string or an object with code and message
 * Follows API-003: ERROR_HANDLING - never leak stack traces or DB info
 */
export interface ApiError {
  success: false;
  error: string | { code: string; message: string };
  message?: string;
}

// ============ API Request Helper ============

/**
 * Make authenticated API request
 * Uses credentials: "include" to send httpOnly cookies (JWT token)
 * Follows API-004: AUTHENTICATION pattern - uses secure, stateless auth
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  // Only set Content-Type header if there's a body
  const headers: Record<string, string> = {
    ...((options.headers as Record<string, string>) || {}),
  };
  if (options.body) {
    headers["Content-Type"] = "application/json";
  }

  const response = await fetch(url, {
    ...options,
    credentials: "include", // Sends httpOnly cookies (JWT token)
    headers,
  });

  if (!response.ok) {
    // API-003: ERROR_HANDLING - Return generic error responses, never leak stack traces
    const errorData: ApiError = await response.json().catch(() => ({
      success: false,
      error: "Unknown error",
      message: `HTTP ${response.status}: ${response.statusText}`,
    }));

    // Extract error message - handle both string and object error formats
    let errorMessage: string;
    if (errorData.message) {
      errorMessage = errorData.message;
    } else if (typeof errorData.error === "string") {
      errorMessage = errorData.error;
    } else if (
      typeof errorData.error === "object" &&
      errorData.error?.message
    ) {
      errorMessage = errorData.error.message;
    } else {
      errorMessage = "API request failed";
    }

    // Include status code in error for better detection
    const error = new Error(errorMessage);
    (error as any).status = response.status;
    throw error;
  }

  return response.json();
}

// ============ API Functions ============

/**
 * Get lottery closing data for a shift
 * Returns all bins for the store (ordered by display_order), active pack in each bin,
 * opening serial from LotteryShiftOpening, and packs depleted during shift.
 *
 * Requires:
 * - JWT token authentication (via httpOnly cookie)
 * - Active shift for the user
 * - RLS policies enforce store isolation
 *
 * @param shiftId - Shift UUID
 * @returns Lottery closing data with bins and sold packs
 */
export async function getLotteryClosingData(
  shiftId: string,
): Promise<ApiResponse<LotteryClosingDataResponse>> {
  return apiRequest<ApiResponse<LotteryClosingDataResponse>>(
    `/api/shifts/${shiftId}/lottery/closing-data`,
    {
      method: "GET",
    },
  );
}

/**
 * Closing submission input
 */
export interface LotteryClosingSubmissionInput {
  bin_id: string;
  pack_id: string;
  ending_serial: string;
  entry_method: "SCAN" | "MANUAL";
  manual_entry_authorized_by?: string;
  manual_entry_authorized_at?: string;
}

/**
 * Closing submission summary response
 */
export interface LotteryClosingSummary {
  packs_closed: number;
  packs_depleted: number;
  total_tickets_sold: number;
  variances: Array<{
    pack_id: string;
    pack_number: string;
    game_name: string;
    expected: number;
    actual: number;
    difference: number;
  }>;
}

/**
 * Submit lottery closing data for a shift
 * Creates LotteryShiftClosing records, updates pack status, calculates variance
 *
 * Requires:
 * - JWT token authentication (via httpOnly cookie)
 * - Active shift for the user
 * - LOTTERY_SHIFT_CLOSE permission
 *
 * @param shiftId - Shift UUID
 * @param closings - Array of closing data for each pack
 * @param closedBy - User UUID who is closing the shift
 * @returns Summary of closing operation with counts and variances
 */
export async function submitLotteryClosing(
  shiftId: string,
  closings: LotteryClosingSubmissionInput[],
  closedBy: string,
): Promise<ApiResponse<{ summary: LotteryClosingSummary }>> {
  return apiRequest<ApiResponse<{ summary: LotteryClosingSummary }>>(
    `/api/shifts/${shiftId}/lottery/close`,
    {
      method: "POST",
      body: JSON.stringify({
        closings,
        closed_by: closedBy,
      }),
    },
  );
}

// ============ TanStack Query Keys ============

/**
 * Query key factory for shift closing queries
 */
export const shiftClosingKeys = {
  all: ["shift-closing"] as const,
  closingData: (shiftId: string | undefined) =>
    [...shiftClosingKeys.all, "closing-data", shiftId] as const,
};

// ============ TanStack Query Hooks ============

/**
 * Hook to fetch lottery closing data for a shift
 * @param shiftId - Shift UUID
 * @param options - Query options (enabled, etc.)
 * @returns TanStack Query result with closing data
 */
export function useLotteryClosingData(
  shiftId: string | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: shiftClosingKeys.closingData(shiftId ?? undefined),
    queryFn: () => getLotteryClosingData(shiftId!),
    enabled: options?.enabled !== false && shiftId !== null,
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    staleTime: 30000, // Consider data fresh for 30 seconds
    select: (response) => response.data,
  });
}
