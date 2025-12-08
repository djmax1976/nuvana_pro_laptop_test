/**
 * Lottery API client functions
 * Provides functions for interacting with the lottery API
 * All functions require appropriate lottery permissions
 *
 * Story: 6.10 - Lottery Management UI
 */

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

// ============ Types ============

/**
 * Lottery pack status enum
 */
export type LotteryPackStatus = "RECEIVED" | "ACTIVE" | "DEPLETED" | "RETURNED";

/**
 * Lottery pack query filters
 */
export interface LotteryPackQueryFilters {
  store_id?: string;
  status?: LotteryPackStatus;
  game_id?: string;
}

/**
 * Lottery pack response
 */
export interface LotteryPackResponse {
  pack_id: string;
  game_id: string;
  pack_number: string;
  serial_start: string;
  serial_end: string;
  status: LotteryPackStatus;
  store_id: string;
  current_bin_id: string | null;
  received_at: string; // ISO 8601
  activated_at: string | null; // ISO 8601
  // Extended fields from joins (optional, populated by backend)
  game?: {
    game_id: string;
    name: string;
  };
  store?: {
    store_id: string;
    name: string;
  };
  bin?: {
    bin_id: string;
    name: string;
    location: string | null;
  } | null;
  // Calculated field (optional)
  tickets_remaining?: number;
}

/**
 * Lottery pack detail response
 * Extended response for pack detail view with shift openings/closings
 */
export interface LotteryPackDetailResponse extends LotteryPackResponse {
  depleted_at?: string | null; // ISO 8601 - when pack became depleted
  returned_at?: string | null; // ISO 8601 - when pack was returned
  tickets_remaining?: number; // Calculated: (serial_end - serial_start + 1) - sold_count
  shift_openings?: Array<{
    opening_id: string;
    shift_id: string;
    opening_serial: string;
    opened_at: string;
  }>;
  shift_closings?: Array<{
    closing_id: string;
    shift_id: string;
    closing_serial: string;
    opening_serial: string;
    expected_count: number;
    actual_count: number;
    difference: number;
    has_variance: boolean;
    variance_id: string | null;
    closed_at: string;
  }>;
}

/**
 * Receive pack input
 */
export interface ReceivePackInput {
  game_id: string;
  pack_number: string;
  serial_start: string;
  serial_end: string;
  store_id?: string; // Optional - can be derived from user's store role
  bin_id?: string; // Optional - physical location
}

/**
 * Update pack input
 */
export interface UpdatePackInput {
  game_id?: string;
  pack_number?: string;
  serial_start?: string;
  serial_end?: string;
  bin_id?: string; // Optional - can be set to null to unassign bin
}

/**
 * Receive pack response
 */
export interface ReceivePackResponse {
  pack_id: string;
  game_id: string;
  pack_number: string;
  serial_start: string;
  serial_end: string;
  status: "RECEIVED";
  current_bin_id: string | null;
  received_at: string;
  game: {
    game_id: string;
    name: string;
  };
  store: {
    store_id: string;
    name: string;
  };
  bin: {
    bin_id: string;
    name: string;
    location: string | null;
  } | null;
}

/**
 * Activate pack response
 */
export interface ActivatePackResponse {
  pack_id: string;
  game_id: string;
  pack_number: string;
  serial_start: string;
  serial_end: string;
  status: "ACTIVE";
  activated_at: string;
  game: {
    game_id: string;
    name: string;
  };
  store: {
    store_id: string;
    name: string;
  };
  bin: {
    bin_id: string;
    name: string;
    location: string | null;
  } | null;
}

/**
 * Lottery variance response
 */
export interface LotteryVarianceResponse {
  variance_id: string;
  shift_id: string;
  pack_id: string;
  expected_count: number;
  actual_count: number;
  difference: number;
  variance_reason: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
  // Extended fields from joins
  pack?: LotteryPackResponse;
  shift?: {
    shift_id: string;
    status: string;
    opened_at: string;
  };
}

/**
 * Variance query filters
 */
export interface VarianceQueryFilters {
  store_id?: string;
  shift_id?: string;
  pack_id?: string;
  status?: "unresolved" | "resolved"; // unresolved = approved_by is null
}

/**
 * Approve variance input
 */
export interface ApproveVarianceInput {
  variance_reason: string; // Required reason for variance approval
}

/**
 * API response wrapper
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
 * Build query string from filters
 */
function buildQueryString(
  filters?: Record<string, string | undefined>,
): string {
  const params = new URLSearchParams();

  if (filters) {
    Object.entries(filters).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, value);
      }
    });
  }

  const queryString = params.toString();
  return queryString ? `?${queryString}` : "";
}

/**
 * Receive a new lottery pack
 * POST /api/lottery/packs/receive
 * @param data - Pack reception data
 * @returns Created pack response
 */
export async function receivePack(
  data: ReceivePackInput,
): Promise<ApiResponse<ReceivePackResponse>> {
  return apiRequest<ApiResponse<ReceivePackResponse>>(
    "/api/lottery/packs/receive",
    {
      method: "POST",
      body: JSON.stringify(data),
    },
  );
}

/**
 * Batch receive lottery packs via serialized numbers
 * POST /api/lottery/packs/receive/batch
 * Story 6.12: Serialized Pack Reception with Batch Processing
 * @param data - Batch reception data with serialized numbers
 * @returns Batch reception response with created packs, duplicates, and errors
 */
export interface BatchReceivePackInput {
  serialized_numbers: string[];
  store_id?: string;
}

export interface BatchReceivePackResponse {
  created: Array<{
    pack_id: string;
    game_id: string;
    pack_number: string;
    serial_start: string;
    serial_end: string;
    status: string;
    game?: {
      game_id: string;
      name: string;
    };
  }>;
  duplicates: string[];
  errors: Array<{
    serial: string;
    error: string;
  }>;
}

export async function receivePackBatch(
  data: BatchReceivePackInput,
): Promise<ApiResponse<BatchReceivePackResponse>> {
  return apiRequest<ApiResponse<BatchReceivePackResponse>>(
    "/api/lottery/packs/receive/batch",
    {
      method: "POST",
      body: JSON.stringify(data),
    },
  );
}

/**
 * Activate a lottery pack (change status from RECEIVED to ACTIVE)
 * PUT /api/lottery/packs/:packId/activate
 * @param packId - Pack UUID
 * @returns Activated pack response
 */
export async function activatePack(
  packId: string,
): Promise<ApiResponse<ActivatePackResponse>> {
  return apiRequest<ApiResponse<ActivatePackResponse>>(
    `/api/lottery/packs/${packId}/activate`,
    {
      method: "PUT",
    },
  );
}

/**
 * Update a lottery pack
 * PUT /api/lottery/packs/:packId
 * @param packId - Pack UUID
 * @param data - Pack update data (partial fields)
 * @returns Updated pack response
 */
export async function updatePack(
  packId: string,
  data: UpdatePackInput,
): Promise<ApiResponse<LotteryPackResponse>> {
  return apiRequest<ApiResponse<LotteryPackResponse>>(
    `/api/lottery/packs/${packId}`,
    {
      method: "PUT",
      body: JSON.stringify(data),
    },
  );
}

/**
 * Delete a lottery pack
 * DELETE /api/lottery/packs/:packId
 * @param packId - Pack UUID
 * @returns Success response
 */
export async function deletePack(
  packId: string,
): Promise<ApiResponse<{ pack_id: string; message: string }>> {
  return apiRequest<ApiResponse<{ pack_id: string; message: string }>>(
    `/api/lottery/packs/${packId}`,
    {
      method: "DELETE",
    },
  );
}

/**
 * Get lottery packs with filters
 * GET /api/lottery/packs?store_id={storeId}&status={status}
 * Note: Endpoint may not exist yet - returns empty array for 404s
 * @param filters - Query filters (store_id, status, game_id)
 * @returns Pack list response
 */
export async function getPacks(
  filters?: LotteryPackQueryFilters,
): Promise<ApiResponse<LotteryPackResponse[]>> {
  const queryString = buildQueryString(
    filters as Record<string, string | undefined>,
  );
  try {
    return await apiRequest<ApiResponse<LotteryPackResponse[]>>(
      `/api/lottery/packs${queryString}`,
      {
        method: "GET",
      },
    );
  } catch (error) {
    // Handle 404 gracefully - endpoint not implemented yet
    if (
      error instanceof Error &&
      ((error as any).status === 404 || error.message.includes("404"))
    ) {
      return {
        success: true,
        data: [],
      };
    }
    throw error;
  }
}

/**
 * Get pack details by ID
 * GET /api/lottery/packs/:packId
 * Note: Endpoint may not exist yet - function structure prepared for future implementation
 * @param packId - Pack UUID
 * @returns Pack detail response with shift openings/closings
 */
export async function getPackDetails(
  packId: string,
): Promise<ApiResponse<LotteryPackDetailResponse>> {
  return apiRequest<ApiResponse<LotteryPackDetailResponse>>(
    `/api/lottery/packs/${packId}`,
    {
      method: "GET",
    },
  );
}

/**
 * Get lottery variances with filters
 * GET /api/lottery/variances?store_id={storeId}&status=unresolved
 * Note: Endpoint may not exist yet - returns empty array for 404s
 * Alternative: Query variances via shift detail endpoint
 * @param filters - Query filters (store_id, shift_id, pack_id, status)
 * @returns Variance list response
 */
export async function getVariances(
  filters?: VarianceQueryFilters,
): Promise<ApiResponse<LotteryVarianceResponse[]>> {
  const queryString = buildQueryString(
    filters as Record<string, string | undefined>,
  );
  try {
    return await apiRequest<ApiResponse<LotteryVarianceResponse[]>>(
      `/api/lottery/variances${queryString}`,
      {
        method: "GET",
      },
    );
  } catch (error) {
    // Handle 404 gracefully - endpoint not implemented yet
    if (
      error instanceof Error &&
      ((error as any).status === 404 || error.message.includes("404"))
    ) {
      return {
        success: true,
        data: [],
      };
    }
    throw error;
  }
}

/**
 * Approve a lottery variance
 * PUT /api/shifts/:shiftId/reconcile with variance_reason
 * Note: Variance approval is done via shift reconcile endpoint with variance_reason
 * @param shiftId - Shift UUID
 * @param data - Variance approval data (variance_reason required)
 * @returns Reconciliation response
 */
export async function approveVariance(
  shiftId: string,
  data: ApproveVarianceInput,
): Promise<
  ApiResponse<{
    shift_id: string;
    status: string;
    variance_reason: string;
    variance_amount: number;
    variance_percentage: number;
  }>
> {
  return apiRequest<
    ApiResponse<{
      shift_id: string;
      status: string;
      variance_reason: string;
      variance_amount: number;
      variance_percentage: number;
    }>
  >(`/api/shifts/${shiftId}/reconcile`, {
    method: "PUT",
    body: JSON.stringify({
      variance_reason: data.variance_reason,
      // Note: closing_cash is not required for variance approval (shift must be in VARIANCE_REVIEW status)
    }),
  });
}

// ============ Bin Configuration API ============

/**
 * Bin configuration item
 */
export interface BinConfigurationItem {
  name: string;
  location?: string;
  display_order: number;
}

/**
 * Bin configuration response
 */
export interface BinConfigurationResponse {
  config_id: string;
  store_id: string;
  bin_template: BinConfigurationItem[];
  created_at: string;
  updated_at: string;
}

/**
 * Get bin configuration for a store
 * GET /api/lottery/bins/configuration/:storeId
 * @param storeId - Store UUID
 * @returns Bin configuration response
 */
export async function getBinConfiguration(
  storeId: string,
): Promise<ApiResponse<BinConfigurationResponse>> {
  return apiRequest<ApiResponse<BinConfigurationResponse>>(
    `/api/lottery/bins/configuration/${storeId}`,
    {
      method: "GET",
    },
  );
}

/**
 * Create bin configuration for a store
 * POST /api/lottery/bins/configuration/:storeId
 * @param storeId - Store UUID
 * @param data - Bin configuration data
 * @returns Created bin configuration response
 */
export async function createBinConfiguration(
  storeId: string,
  data: { bin_template: BinConfigurationItem[] },
): Promise<ApiResponse<BinConfigurationResponse>> {
  return apiRequest<ApiResponse<BinConfigurationResponse>>(
    `/api/lottery/bins/configuration/${storeId}`,
    {
      method: "POST",
      body: JSON.stringify(data),
    },
  );
}

/**
 * Update bin configuration for a store
 * PUT /api/lottery/bins/configuration/:storeId
 * @param storeId - Store UUID
 * @param data - Bin configuration data
 * @returns Updated bin configuration response
 */
export async function updateBinConfiguration(
  storeId: string,
  data: { bin_template: BinConfigurationItem[] },
): Promise<ApiResponse<BinConfigurationResponse>> {
  return apiRequest<ApiResponse<BinConfigurationResponse>>(
    `/api/lottery/bins/configuration/${storeId}`,
    {
      method: "PUT",
      body: JSON.stringify(data),
    },
  );
}

// ============ Bin Display API ============

/**
 * Bin display data item
 * Response from GET /api/lottery/bins/display/:storeId
 */
export interface BinDisplayItem {
  bin_id: string;
  bin_name: string;
  display_order: number;
  game_code: string | null;
  game_name: string | null;
  price: number | null;
  pack_number: string | null;
  serial_start: string | null;
  serial_end: string | null;
  total_sold: number;
  status: string | null;
}

/**
 * Get bin display data for a store
 * GET /api/lottery/bins/display/:storeId
 * Returns optimized bin display data with packs, game info, and sold counts
 * Story 6.13: Lottery Database Enhancements & Bin Management (AC #2, #3)
 * @param storeId - Store UUID
 * @returns Bin display data response
 */
export async function getBinDisplay(
  storeId: string,
): Promise<ApiResponse<BinDisplayItem[]>> {
  return apiRequest<ApiResponse<BinDisplayItem[]>>(
    `/api/lottery/bins/display/${storeId}`,
    {
      method: "GET",
    },
  );
}
