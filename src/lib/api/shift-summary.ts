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
 *
 * Uses shared API client for consistent:
 * - 401/session expiration handling (automatic redirect to login)
 * - Error formatting with ApiError class
 * - Timeout configuration (30s default)
 * - Credential handling (httpOnly cookies)
 */

import { useQuery } from "@tanstack/react-query";
import apiClient from "./client";

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

// ============ API Functions ============

/**
 * Get shift summary with payment methods and sales totals
 * @param shiftId - Shift UUID
 * @returns Shift summary response
 */
export async function getShiftSummary(
  shiftId: string,
): Promise<ApiResponse<ShiftSummaryResponse>> {
  const response = await apiClient.get<ApiResponse<ShiftSummaryResponse>>(
    `/api/shifts/${shiftId}/summary`,
  );
  return response.data;
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
