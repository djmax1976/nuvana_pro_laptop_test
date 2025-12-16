/**
 * Lottery API client functions
 * Provides functions for interacting with the lottery API
 * All functions require appropriate lottery permissions
 *
 * Story: 6.10 - Lottery Management UI
 */

const API_BASE_URL =
  process.env.NEXT_PUBLIC_BACKEND_URL || "http://localhost:3001";

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
    game_code: string;
    name: string;
    price: number | null;
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
  games_not_found: Array<{
    serial: string;
    game_code: string;
    pack_number: string;
    serial_start: string;
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
 * Lottery game response
 */
export interface LotteryGameResponse {
  game_id: string;
  game_code: string;
  name: string;
  description: string | null;
  price: number | null;
  pack_value?: number | null;
  total_tickets?: number | null;
  status: string;
  created_at: string;
  updated_at: string;
}

/**
 * Get all active lottery games
 * GET /api/lottery/games
 * @returns List of active lottery games
 */
export async function getGames(): Promise<ApiResponse<LotteryGameResponse[]>> {
  return apiRequest<ApiResponse<LotteryGameResponse[]>>("/api/lottery/games", {
    method: "GET",
  });
}

/**
 * Create a new lottery game
 * POST /api/lottery/games
 * @param data - Game data (game_code, name, price, pack_value, optional description)
 * @returns Created game response
 */
export interface CreateGameInput {
  game_code: string;
  name: string;
  price: number;
  pack_value: number;
  description?: string;
}

export interface CreateGameResponse {
  game_id: string;
  game_code: string;
  name: string;
  price: number;
  pack_value: number;
  total_tickets: number;
  status: string;
}

export async function createGame(
  data: CreateGameInput,
): Promise<ApiResponse<CreateGameResponse>> {
  return apiRequest<ApiResponse<CreateGameResponse>>("/api/lottery/games", {
    method: "POST",
    body: JSON.stringify(data),
  });
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
 * Check if a pack exists in a store
 * GET /api/lottery/packs/check/:storeId/:packNumber
 * Used for real-time duplicate detection during pack reception
 * @param storeId - Store UUID
 * @param packNumber - Pack number to check
 * @returns Whether pack exists and pack info if found
 */
export interface CheckPackExistsResponse {
  exists: boolean;
  pack: {
    pack_id: string;
    status: string;
    game: {
      name: string;
    };
  } | null;
}

export async function checkPackExists(
  storeId: string,
  packNumber: string,
): Promise<ApiResponse<CheckPackExistsResponse>> {
  return apiRequest<ApiResponse<CheckPackExistsResponse>>(
    `/api/lottery/packs/check/${storeId}/${packNumber}`,
    {
      method: "GET",
    },
  );
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

// ============ Configuration Values API ============

/**
 * Lottery config value item
 * Predefined values for dropdown selections
 */
export interface LotteryConfigValueItem {
  config_value_id: string;
  amount: number;
  display_order: number;
}

/**
 * Lottery config values response
 * Contains both ticket prices and pack values
 */
export interface LotteryConfigValuesResponse {
  ticket_prices: LotteryConfigValueItem[];
  pack_values: LotteryConfigValueItem[];
}

/**
 * Get lottery configuration values for dropdowns
 * GET /api/lottery/config-values
 * Returns predefined ticket prices and pack values for dropdown selections
 * Story 6.x: Lottery Configuration Values Enhancement
 * @param type - Optional filter by config type (PACK_VALUE or TICKET_PRICE)
 * @returns Config values grouped by type
 */
export async function getLotteryConfigValues(
  type?: "PACK_VALUE" | "TICKET_PRICE",
): Promise<ApiResponse<LotteryConfigValuesResponse>> {
  const queryParams = type ? `?type=${type}` : "";
  return apiRequest<ApiResponse<LotteryConfigValuesResponse>>(
    `/api/lottery/config-values${queryParams}`,
    {
      method: "GET",
    },
  );
}

// ============ Day Bins API (MyStore Lottery Page) ============

/**
 * Bin with pack information for day-based view
 * Represents a bin that may or may not have an active pack
 * Story: MyStore Lottery Page Redesign
 */
export interface DayBinPack {
  pack_id: string;
  pack_number: string;
  game_name: string;
  game_price: number;
  starting_serial: string; // First opening of the day OR last closing OR pack's serial_start
  ending_serial: string | null; // Most recent closing of the day, null if none
  serial_end: string; // Pack's max serial (for reference)
}

export interface DayBin {
  bin_id: string;
  bin_number: number; // display_order + 1
  name: string;
  is_active: boolean;
  pack: DayBinPack | null;
}

/**
 * Business day information
 */
export interface BusinessDay {
  date: string; // ISO date (YYYY-MM-DD)
  first_shift_opened_at: string | null; // ISO datetime
  last_shift_closed_at: string | null; // ISO datetime
  shifts_count: number;
}

/**
 * Depleted pack for the day
 */
export interface DepletedPackDay {
  pack_id: string;
  pack_number: string;
  game_name: string;
  game_price: number;
  bin_number: number;
  depleted_at: string; // ISO datetime
}

/**
 * Day bins response
 * Response from GET /api/lottery/bins/day/:storeId
 */
export interface DayBinsResponse {
  bins: DayBin[];
  business_day: BusinessDay;
  depleted_packs: DepletedPackDay[];
}

/**
 * Get lottery bins with day-based tracking
 * GET /api/lottery/bins/day/:storeId
 * Returns bins with active packs, starting/ending serials for the business day,
 * and depleted packs for the day.
 * Story: MyStore Lottery Page Redesign
 * @param storeId - Store UUID
 * @param date - Optional ISO date string (YYYY-MM-DD). Defaults to today in store timezone.
 * @returns Day bins response with bins, business day info, and depleted packs
 */
export async function getLotteryDayBins(
  storeId: string,
  date?: string,
): Promise<ApiResponse<DayBinsResponse>> {
  const queryParams = date ? `?date=${date}` : "";
  return apiRequest<ApiResponse<DayBinsResponse>>(
    `/api/lottery/bins/day/${storeId}${queryParams}`,
    {
      method: "GET",
    },
  );
}

// ============ Day Closing API ============

/**
 * Input for closing lottery day
 */
export interface CloseLotteryDayInput {
  closings: Array<{
    pack_id: string;
    closing_serial: string;
  }>;
  entry_method?: "SCAN" | "MANUAL";
}

/**
 * Response from closing lottery day
 */
export interface CloseLotteryDayResponse {
  closings_created: number;
  business_day: string;
  bins_closed: Array<{
    bin_number: number;
    pack_number: string;
    game_name: string;
    closing_serial: string;
  }>;
}

/**
 * Close lottery day - record ending serials for all active packs
 * POST /api/lottery/bins/day/:storeId/close
 * Story: Lottery Day Closing Feature
 * @param storeId - Store UUID
 * @param data - Closing data with pack_id and closing_serial pairs
 * @returns Closing response with summary
 */
export async function closeLotteryDay(
  storeId: string,
  data: CloseLotteryDayInput,
): Promise<ApiResponse<CloseLotteryDayResponse>> {
  return apiRequest<ApiResponse<CloseLotteryDayResponse>>(
    `/api/lottery/bins/day/${storeId}/close`,
    {
      method: "POST",
      body: JSON.stringify(data),
    },
  );
}
