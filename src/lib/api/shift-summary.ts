/**
 * Shift Summary API client functions
 * Provides functions for fetching shift summary data (payment methods, sales totals)
 *
 * Story: Client Owner Dashboard - Shift Detail View
 *
 * @security
 * - API-001: VALIDATION - Uses typed responses
 * - API-004: AUTHENTICATION - Requires authenticated session with SHIFT_READ permission
 * - FE-001: STATE_MANAGEMENT - Uses httpOnly cookies for auth
 */

import { useQuery } from "@tanstack/react-query";

const API_BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

// ============ Types ============

/**
 * Payment method breakdown
 */
export interface PaymentMethodSummary {
  method: string;
  total: number;
  count: number;
}

/**
 * Shift summary response
 */
export interface ShiftSummaryResponse {
  shift_id: string;
  total_sales: number;
  transaction_count: number;
  payment_methods: PaymentMethodSummary[];
}

/**
 * API response wrapper
 */
interface ApiResponse<T> {
  success: boolean;
  data: T;
  message?: string;
}

/**
 * API error response
 */
interface ApiError {
  success: false;
  error: string | { code: string; message: string };
  message?: string;
}

// ============ API Request Helper ============

/**
 * Make authenticated API request
 * Uses credentials: "include" to send httpOnly cookies
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    credentials: "include",
    headers: {
      ...((options.headers as Record<string, string>) || {}),
    },
  });

  if (!response.ok) {
    const errorData: ApiError = await response.json().catch(() => ({
      success: false,
      error: "Unknown error",
      message: `HTTP ${response.status}: ${response.statusText}`,
    }));

    // Extract error message
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

    throw new Error(errorMessage);
  }

  return response.json();
}

// ============ API Functions ============

/**
 * Get shift summary with payment methods and sales totals
 * @param shiftId - Shift UUID
 * @returns Shift summary response
 */
export async function getShiftSummary(
  shiftId: string,
): Promise<ApiResponse<ShiftSummaryResponse>> {
  return apiRequest<ApiResponse<ShiftSummaryResponse>>(
    `/api/shifts/${shiftId}/summary`,
    {
      method: "GET",
    },
  );
}

// ============ TanStack Query Keys ============

/**
 * Query key factory for shift summary queries
 */
export const shiftSummaryKeys = {
  all: ["shift-summary"] as const,
  summary: (shiftId: string | undefined) =>
    [...shiftSummaryKeys.all, shiftId] as const,
};

// ============ TanStack Query Hooks ============

/**
 * Hook to fetch shift summary data
 * @param shiftId - Shift UUID
 * @param options - Query options (enabled, etc.)
 * @returns TanStack Query result with shift summary data
 */
export function useShiftSummary(
  shiftId: string | null,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: shiftSummaryKeys.summary(shiftId ?? undefined),
    queryFn: () => getShiftSummary(shiftId!),
    enabled: options?.enabled !== false && shiftId !== null,
    refetchOnMount: true,
    refetchOnWindowFocus: false,
    staleTime: 60000, // Consider data fresh for 1 minute (closed shift data doesn't change)
    select: (response) => response.data,
  });
}
