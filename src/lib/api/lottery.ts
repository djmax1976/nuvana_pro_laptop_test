/**
 * Lottery API client functions
 * Provides functions for interacting with the lottery API
 * All functions require appropriate lottery permissions
 *
 * Story: 6.10 - Lottery Management UI
 *
 * Uses shared API client for consistent:
 * - 401/session expiration handling (automatic redirect to login)
 * - Error formatting with ApiError class
 * - Timeout configuration (30s default)
 * - Credential handling (httpOnly cookies)
 */

import apiClient from "./client";

// ============ Types ============

/**
 * Scope type for lottery games
 * - STATE: Game is visible to all stores in the state
 * - STORE: Game is visible only to a specific store
 * - GLOBAL: Legacy global game (deprecated)
 *
 * Story: State-Scoped Lottery Games Phase
 */
export type GameScopeType = "STATE" | "STORE" | "GLOBAL";

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
  /** Search by game name or pack number (case-insensitive, min 2 chars) */
  search?: string;
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
 * Input for full pack activation (with bin assignment)
 * Story: Pack Activation UX Enhancement
 *
 * MCP Guidance Applied:
 * - FE-002: FORM_VALIDATION - Interface for validated form data
 * - SEC-014: INPUT_VALIDATION - UUID format for IDs
 */
export interface FullActivatePackInput {
  pack_id: string;
  bin_id: string;
  serial_start: string;
  activated_by: string;
  /** Optional - required for cashiers, optional for managers */
  activated_shift_id?: string;
  /** If true, auto-deplete any existing active pack in the bin */
  deplete_previous?: boolean;
  /** Manager user UUID who approved the serial override (for dual-auth flow) */
  serial_override_approved_by?: string;
  /** Reason for the serial override (e.g., "Pack already partially sold") */
  serial_override_reason?: string;
  /** Manager user UUID who approved marking the pack as pre-sold (for dual-auth flow) */
  mark_sold_approved_by?: string;
  /** Reason for marking pack as pre-sold (e.g., "Pack sold before bin placement") */
  mark_sold_reason?: string;
  /** If true, immediately set pack status to DEPLETED (for pre-sold packs) */
  mark_as_depleted?: boolean;
}

/**
 * Response from full pack activation
 */
export interface FullActivatePackResponse {
  updatedBin: {
    bin_id: string;
    bin_number: number;
    name: string;
    is_active: boolean;
    pack: {
      pack_id: string;
      game_name: string;
      game_price: number;
      starting_serial: string;
      serial_end: string;
      pack_number: string;
    } | null;
  };
  previousPack: {
    pack_id: string;
    pack_number: string;
    game_name: string;
    game_price: number;
  } | null;
  depletedPack: {
    pack_id: string;
    pack_number: string;
    game_name: string;
    depletion_reason: "AUTO_REPLACED";
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

// ============ API Functions ============

/**
 * Receive a new lottery pack
 * POST /api/lottery/packs/receive
 * @param data - Pack reception data
 * @returns Created pack response
 */
export async function receivePack(
  data: ReceivePackInput,
): Promise<ApiResponse<ReceivePackResponse>> {
  const response = await apiClient.post<ApiResponse<ReceivePackResponse>>(
    "/api/lottery/packs/receive",
    data,
  );
  return response.data;
}

/**
 * Batch receive lottery packs via serialized numbers
 * POST /api/lottery/packs/receive/batch
 * Story 6.12: Serialized Pack Reception with Batch Processing
 * Story: Scan-Only Pack Reception Security
 * @param data - Batch reception data with serialized numbers and scan metrics
 * @returns Batch reception response with created packs, duplicates, and errors
 */
export interface BatchReceivePackInput {
  serialized_numbers: string[];
  store_id?: string;
  /**
   * Scan metrics for server-side validation (required when scan enforcement is enabled)
   * Each entry corresponds to the serialized_number at the same index
   */
  scan_metrics?: import("@/types/scan-detection").ScanMetrics[];
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
  const response = await apiClient.post<ApiResponse<BatchReceivePackResponse>>(
    "/api/lottery/packs/receive/batch",
    data,
  );
  return response.data;
}

/**
 * Lottery game response
 * Story: State-Scoped Lottery Games Phase - Added scope_type, state_id, store_id
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
  /** Scope type: STATE, STORE, or GLOBAL */
  scope_type?: GameScopeType;
  /** State UUID for STATE-scoped games */
  state_id?: string | null;
  /** Store UUID for STORE-scoped games */
  store_id?: string | null;
  /** State info for display */
  state?: {
    state_id: string;
    code: string;
    name: string;
  } | null;
}

/**
 * Get all active lottery games
 * GET /api/lottery/games
 * @returns List of active lottery games
 */
export async function getGames(): Promise<ApiResponse<LotteryGameResponse[]>> {
  const response =
    await apiClient.get<ApiResponse<LotteryGameResponse[]>>(
      "/api/lottery/games",
    );
  return response.data;
}

/**
 * Create a new lottery game
 * POST /api/lottery/games
 *
 * SuperAdmin creates STATE-scoped games (visible to all stores in that state)
 * Non-SuperAdmin creates STORE-scoped games (visible only to that store)
 *
 * Story: State-Scoped Lottery Games Phase
 *
 * @param data - Game data (game_code, name, price, pack_value, state_id OR store_id, optional description)
 * @returns Created game response
 */
export interface CreateGameInput {
  game_code: string;
  name: string;
  price: number;
  pack_value: number;
  /** State UUID - for SuperAdmin creating STATE-scoped games */
  state_id?: string;
  /** Store UUID - for non-SuperAdmin creating STORE-scoped games (fallback) */
  store_id?: string;
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
  scope_type: GameScopeType;
  state_id: string | null;
  store_id: string | null;
}

export async function createGame(
  data: CreateGameInput,
): Promise<ApiResponse<CreateGameResponse>> {
  const response = await apiClient.post<ApiResponse<CreateGameResponse>>(
    "/api/lottery/games",
    data,
  );
  return response.data;
}

/**
 * Update game input - all fields optional for partial updates
 *
 * MCP Guidance Applied:
 * - FE-002: FORM_VALIDATION - Interface for validated form data
 * - SEC-014: INPUT_VALIDATION - Optional fields with type constraints
 */
export interface UpdateGameInput {
  name?: string;
  game_code?: string;
  price?: number;
  pack_value?: number;
  description?: string;
  status?: "ACTIVE" | "INACTIVE" | "DISCONTINUED";
}

/**
 * Update game response
 */
export interface UpdateGameResponse {
  game_id: string;
  game_code: string;
  name: string;
  price: number | null;
  pack_value: number | null;
  total_tickets: number | null;
  description: string | null;
  status: string;
  store_id: string | null;
  updated_at: string;
}

/**
 * Update an existing lottery game
 * PUT /api/lottery/games/:gameId
 *
 * MCP Guidance Applied:
 * - API-001: VALIDATION - Server validates all input fields
 * - API-009: IDOR - Server validates ownership via store access
 * - DB-006: TENANT_ISOLATION - Server enforces store-level isolation
 *
 * @param gameId - Game UUID
 * @param data - Partial game data to update
 * @returns Updated game response
 */
export async function updateGame(
  gameId: string,
  data: UpdateGameInput,
): Promise<ApiResponse<UpdateGameResponse>> {
  const response = await apiClient.put<ApiResponse<UpdateGameResponse>>(
    `/api/lottery/games/${gameId}`,
    data,
  );
  return response.data;
}

/**
 * Get packs filtered by game
 * GET /api/lottery/packs?game_id={gameId}&store_id={storeId}
 * @param gameId - Game UUID to filter by
 * @param storeId - Store UUID for RLS enforcement
 * @returns List of packs for the specified game
 */
export async function getPacksByGame(
  gameId: string,
  storeId: string,
): Promise<ApiResponse<LotteryPackResponse[]>> {
  const response = await apiClient.get<ApiResponse<LotteryPackResponse[]>>(
    "/api/lottery/packs",
    { params: { game_id: gameId, store_id: storeId } },
  );
  return response.data;
}

/**
 * Mark pack as sold out (deplete)
 * POST /api/lottery/packs/:packId/deplete
 *
 * MCP Guidance Applied:
 * - API-001: VALIDATION - Server validates pack status and ownership
 * - DB-006: TENANT_ISOLATION - Server enforces store-level isolation
 *
 * @param packId - Pack UUID
 * @param closingSerial - Optional closing serial number
 * @returns Depleted pack response
 */
export interface DepletePackResponse {
  pack_id: string;
  pack_number: string;
  status: "DEPLETED";
  depleted_at: string;
  depletion_reason: "MANUAL_SOLD_OUT";
  game_name: string;
  bin_name: string | null;
}

export async function depletePack(
  packId: string,
  closingSerial?: string,
): Promise<ApiResponse<DepletePackResponse>> {
  const response = await apiClient.post<ApiResponse<DepletePackResponse>>(
    `/api/lottery/packs/${packId}/deplete`,
    closingSerial ? { closing_serial: closingSerial } : {},
  );
  return response.data;
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
  const response = await apiClient.put<ApiResponse<ActivatePackResponse>>(
    `/api/lottery/packs/${packId}/activate`,
  );
  return response.data;
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
  const response = await apiClient.put<ApiResponse<LotteryPackResponse>>(
    `/api/lottery/packs/${packId}`,
    data,
  );
  return response.data;
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
  const response = await apiClient.delete<
    ApiResponse<{ pack_id: string; message: string }>
  >(`/api/lottery/packs/${packId}`);
  return response.data;
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
  try {
    const response = await apiClient.get<ApiResponse<LotteryPackResponse[]>>(
      "/api/lottery/packs",
      { params: filters },
    );
    return response.data;
  } catch (error) {
    // Handle 404 gracefully - endpoint not implemented yet
    if (
      error instanceof Error &&
      "status" in error &&
      (error as any).status === 404
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
  const response = await apiClient.get<ApiResponse<CheckPackExistsResponse>>(
    `/api/lottery/packs/check/${storeId}/${packNumber}`,
  );
  return response.data;
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
  const response = await apiClient.get<ApiResponse<LotteryPackDetailResponse>>(
    `/api/lottery/packs/${packId}`,
  );
  return response.data;
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
  try {
    const response = await apiClient.get<
      ApiResponse<LotteryVarianceResponse[]>
    >("/api/lottery/variances", { params: filters });
    return response.data;
  } catch (error) {
    // Handle 404 gracefully - endpoint not implemented yet
    if (
      error instanceof Error &&
      "status" in error &&
      (error as any).status === 404
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
  const response = await apiClient.put<
    ApiResponse<{
      shift_id: string;
      status: string;
      variance_reason: string;
      variance_amount: number;
      variance_percentage: number;
    }>
  >(`/api/shifts/${shiftId}/reconcile`, {
    variance_reason: data.variance_reason,
    // Note: closing_cash is not required for variance approval (shift must be in VARIANCE_REVIEW status)
  });
  return response.data;
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
  const response = await apiClient.get<ApiResponse<BinConfigurationResponse>>(
    `/api/lottery/bins/configuration/${storeId}`,
  );
  return response.data;
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
  const response = await apiClient.post<ApiResponse<BinConfigurationResponse>>(
    `/api/lottery/bins/configuration/${storeId}`,
    data,
  );
  return response.data;
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
  const response = await apiClient.put<ApiResponse<BinConfigurationResponse>>(
    `/api/lottery/bins/configuration/${storeId}`,
    data,
  );
  return response.data;
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
  const response = await apiClient.get<ApiResponse<BinDisplayItem[]>>(
    `/api/lottery/bins/display/${storeId}`,
  );
  return response.data;
}

// ============ Bin Delete API ============

/**
 * Delete bin response
 * Response from DELETE /api/lottery/bins/:binId
 */
export interface DeleteBinResponse {
  bin_id: string;
  message: string;
}

/**
 * Soft delete a lottery bin
 * DELETE /api/lottery/bins/:binId
 * Sets bin is_active = false (soft delete for audit trail preservation)
 * Requires LOTTERY_BIN_MANAGE permission
 * Story 6.13: Lottery Database Enhancements & Bin Management (AC #1)
 *
 * @param binId - Bin UUID to delete
 * @returns Delete confirmation with bin_id and message
 * @throws ApiError on 403 (forbidden), 404 (not found), or 500 (server error)
 *
 * @example
 * ```typescript
 * const result = await deleteBin('bin-uuid-here');
 * if (result.success) {
 *   console.log(result.data.message); // "Bin successfully soft deleted"
 * }
 * ```
 */
export async function deleteBin(
  binId: string,
): Promise<ApiResponse<DeleteBinResponse>> {
  // Validate binId format (UUID) before making API call
  const uuidRegex =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!binId || !uuidRegex.test(binId)) {
    throw new Error("Invalid bin ID format");
  }

  const response = await apiClient.delete<ApiResponse<DeleteBinResponse>>(
    `/api/lottery/bins/${binId}`,
  );
  return response.data;
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
  const response = await apiClient.get<
    ApiResponse<LotteryConfigValuesResponse>
  >("/api/lottery/config-values", { params: type ? { type } : undefined });
  return response.data;
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
  /**
   * Whether this is the pack's first period (affects ticket counting).
   *
   * Ticket counting formula (fencepost error prevention):
   * - true: tickets = closing - starting + 1 (new pack, starting serial is first ticket)
   * - false: tickets = closing - starting (continuing, starting serial was last sold ticket)
   */
  is_first_period: boolean;
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
  day_id: string | null; // LotteryBusinessDay UUID
  status: "OPEN" | "CLOSED" | null; // Day status
  first_shift_opened_at: string | null; // ISO datetime
  last_shift_closed_at: string | null; // ISO datetime
  shifts_count: number;
}

/**
 * Open business period information (enterprise close-to-close model)
 * Represents the period from the last closed day to now.
 * In enterprise POS systems, a "business day" runs from close-to-close,
 * not midnight-to-midnight, ensuring no transactions are orphaned.
 */
export interface OpenBusinessPeriod {
  /** When the current open period started (last day close timestamp) */
  started_at: string | null; // ISO datetime
  /** The business date of the last closed day (YYYY-MM-DD) */
  last_closed_date: string | null;
  /** Number of days since last close (for UI warning if > 1) */
  days_since_last_close: number | null;
  /** Whether the store has never closed a day (first-time setup) */
  is_first_period: boolean;
}

/**
 * Depleted pack for the current open business period
 * Shows all packs depleted since the last day close, not just today
 *
 * MCP Guidance Applied:
 * - SEC-014: INPUT_VALIDATION - Strict type definitions for API response
 * - FE-001: STATE_MANAGEMENT - Immutable data structure for safe consumption
 */
export interface DepletedPackDay {
  pack_id: string;
  pack_number: string;
  game_name: string;
  game_price: number;
  bin_number: number;
  activated_at: string; // ISO datetime - when the pack was activated
  depleted_at: string; // ISO datetime - when the pack was sold out
}

/**
 * Activated pack for the current open business period
 * Shows all packs activated since the last day close, regardless of current status.
 * This includes packs that are still ACTIVE, have been DEPLETED (sold out),
 * or have been RETURNED.
 *
 * Enterprise Business Rule:
 * - A pack activated during the business period appears here even if subsequently
 *   depleted (e.g., when replaced by a new pack via auto-depletion)
 * - The status field enables the UI to show differentiated display (e.g., "Sold Out" badge)
 *
 * MCP Guidance Applied:
 * - SEC-014: INPUT_VALIDATION - Strict type definitions for API response with enum constraint
 * - FE-001: STATE_MANAGEMENT - Immutable data structure for safe consumption
 * - API-001: VALIDATION - Schema matches backend response structure exactly
 */
export interface ActivatedPackDay {
  pack_id: string;
  pack_number: string;
  game_name: string;
  game_price: number;
  bin_number: number;
  activated_at: string; // ISO datetime
  /**
   * Current pack status - allows UI to differentiate active packs from those sold out
   * - ACTIVE: Pack is currently in use in a bin
   * - DEPLETED: Pack was sold out (manually or auto-replaced by new pack)
   * - RETURNED: Pack was returned to inventory
   */
  status: "ACTIVE" | "DEPLETED" | "RETURNED";
}

/**
 * Day close summary bin data
 * Pre-calculated data for a single bin from the closed day
 *
 * This contains the ACTUAL calculation data (not transformed for next day display).
 * Essential because bins[].pack.starting_serial shows the NEXT day's starting position
 * after close, not the value used for today's calculations.
 *
 * MCP Guidance Applied:
 * - API-008: OUTPUT_FILTERING - Whitelisted response fields, no internal IDs
 * - SEC-014: INPUT_VALIDATION - Validated numeric data from backend
 */
export interface DayCloseSummaryBin {
  bin_number: number;
  pack_number: string;
  game_name: string;
  game_price: number;
  /** The starting serial used for calculation (from previous day close or pack activation) */
  starting_serial: string;
  /** The ending serial recorded during close (closing_serial) */
  ending_serial: string;
  tickets_sold: number;
  sales_amount: number;
}

/**
 * Day close summary
 * Pre-calculated lottery totals when the business day is CLOSED
 *
 * This summary provides the correct calculation data that was used when
 * the day was closed. The bins[].pack data is transformed after close
 * to show the starting position for the NEXT day, so this summary
 * preserves the original calculation values.
 *
 * MCP Guidance Applied:
 * - API-003: ERROR_HANDLING - Null when day is not closed
 * - FE-001: STATE_MANAGEMENT - Immutable data from backend
 */
export interface DayCloseSummary {
  /** Total lottery sales for the closed day (sum of all bins' sales_amount) */
  lottery_total: number;
  /** Number of bins/packs that were closed */
  closings_count: number;
  /** Timestamp when the day was closed (ISO 8601) */
  closed_at: string | null;
  /** Detailed breakdown per bin with original calculation data */
  bins_closed: DayCloseSummaryBin[];
}

/**
 * Day bins response
 * Response from GET /api/lottery/bins/day/:storeId
 *
 * Uses enterprise close-to-close business day model:
 * - depleted_packs: All packs depleted since last closed day (not just today)
 * - activated_packs: All packs activated since last closed day (not just today)
 * - open_business_period: Metadata about current open period for UI display
 * - day_close_summary: Pre-calculated totals when day is CLOSED
 *
 * MCP Guidance Applied:
 * - API-001: VALIDATION - Schema matches backend response structure
 * - DB-006: TENANT_ISOLATION - Data scoped to store via API
 */
export interface DayBinsResponse {
  bins: DayBin[];
  business_day: BusinessDay;
  /** Enterprise close-to-close business period metadata */
  open_business_period: OpenBusinessPeriod;
  /** All packs depleted since last day close (enterprise model) */
  depleted_packs: DepletedPackDay[];
  /** All packs activated since last day close (enterprise model) */
  activated_packs: ActivatedPackDay[];
  /**
   * Pre-calculated lottery close summary. Only present when business_day.status is CLOSED.
   * Contains the actual calculation data (not transformed for next day display).
   * Use this instead of recalculating from bins[].pack data when displaying closed day totals.
   */
  day_close_summary: DayCloseSummary | null;
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
  const response = await apiClient.get<ApiResponse<DayBinsResponse>>(
    `/api/lottery/bins/day/${storeId}`,
    { params: date ? { date } : undefined },
  );
  return response.data;
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
  /** Current shift ID - this shift will be excluded from open shifts check
   * because the cashier closing the day is doing so from their own shift */
  current_shift_id?: string;
  /** User ID who authorized manual entry - for audit trail */
  authorized_by_user_id?: string;
}

/**
 * Response from closing lottery day
 */
export interface CloseLotteryDayResponse {
  closings_created: number;
  business_day: string;
  day_closed: boolean;
  bins_closed: Array<{
    bin_number: number;
    pack_number: string;
    game_name: string;
    closing_serial: string;
    starting_serial: string;
    game_price: number;
    tickets_sold: number;
    sales_amount: number;
  }>;
  /** Total lottery sales amount for the day (sum of all sales_amount) */
  lottery_total: number;
}

/**
 * Close lottery day - record ending serials for all active packs
 * POST /api/lottery/bins/day/:storeId/close
 * Story: Lottery Day Closing Feature
 * @param storeId - Store UUID
 * @param data - Closing data with pack_id and closing_serial pairs
 * @returns Closing response with summary
 * @deprecated Use prepareLotteryDayClose + commitLotteryDayClose for atomic day close
 */
export async function closeLotteryDay(
  storeId: string,
  data: CloseLotteryDayInput,
): Promise<ApiResponse<CloseLotteryDayResponse>> {
  const response = await apiClient.post<ApiResponse<CloseLotteryDayResponse>>(
    `/api/lottery/bins/day/${storeId}/close`,
    data,
  );
  return response.data;
}

// ============ Two-Phase Day Close API (Enterprise Atomic Pattern) ============

/**
 * Input for Phase 1: Prepare lottery day close
 */
export interface PrepareLotteryDayCloseInput {
  closings: Array<{
    pack_id: string;
    closing_serial: string;
  }>;
  entry_method?: "SCAN" | "MANUAL";
  current_shift_id?: string;
  authorized_by_user_id?: string;
}

/**
 * Response from Phase 1: Prepare lottery day close
 * Contains preview data for UI display before final commit
 */
export interface PrepareLotteryDayCloseResponse {
  day_id: string;
  business_date: string;
  status: "PENDING_CLOSE";
  pending_close_at: string;
  pending_close_expires_at: string;
  closings_count: number;
  /** Calculated lottery total for UI display (not yet committed) */
  estimated_lottery_total: number;
  /** Estimated bin breakdown for UI preview */
  bins_preview: Array<{
    bin_number: number;
    pack_number: string;
    game_name: string;
    starting_serial: string;
    closing_serial: string;
    game_price: number;
    tickets_sold: number;
    sales_amount: number;
  }>;
}

/**
 * Response from Phase 2: Commit lottery day close
 * Final committed data with same structure as original close endpoint
 */
export interface CommitLotteryDayCloseResponse {
  day_id: string;
  business_date: string;
  closed_at: string;
  closings_created: number;
  lottery_total: number;
  bins_closed: Array<{
    bin_number: number;
    pack_number: string;
    game_name: string;
    starting_serial: string;
    closing_serial: string;
    game_price: number;
    tickets_sold: number;
    sales_amount: number;
  }>;
}

/**
 * Response from cancel lottery day close
 */
export interface CancelLotteryDayCloseResponse {
  cancelled: boolean;
  message: string;
}

/**
 * Response from get lottery day status
 */
export interface LotteryDayStatusResponse {
  day_id: string;
  status: "OPEN" | "PENDING_CLOSE" | "CLOSED";
  pending_close_at?: string;
  pending_close_expires_at?: string;
}

/**
 * Phase 1: Prepare lottery day close
 * POST /api/lottery/bins/day/:storeId/prepare-close
 *
 * This endpoint validates closings and stores them in PENDING_CLOSE state
 * without committing any lottery records. Call commitLotteryDayClose to finalize.
 *
 * Story: MyStore Day Close Atomic Transaction
 *
 * @param storeId - Store UUID
 * @param data - Closing data with pack_id and closing_serial pairs
 * @returns Prepare response with preview data and expiration time
 */
export async function prepareLotteryDayClose(
  storeId: string,
  data: PrepareLotteryDayCloseInput,
): Promise<ApiResponse<PrepareLotteryDayCloseResponse>> {
  const response = await apiClient.post<
    ApiResponse<PrepareLotteryDayCloseResponse>
  >(`/api/lottery/bins/day/${storeId}/prepare-close`, data);
  return response.data;
}

/**
 * Phase 2: Commit lottery day close
 * POST /api/lottery/bins/day/:storeId/commit-close
 *
 * This endpoint atomically commits both lottery close and day close.
 * Must be called after prepareLotteryDayClose and before pending close expires.
 *
 * Story: MyStore Day Close Atomic Transaction
 *
 * @param storeId - Store UUID
 * @returns Commit response with final lottery totals and closed bins
 */
export async function commitLotteryDayClose(
  storeId: string,
): Promise<ApiResponse<CommitLotteryDayCloseResponse>> {
  const response = await apiClient.post<
    ApiResponse<CommitLotteryDayCloseResponse>
  >(`/api/lottery/bins/day/${storeId}/commit-close`);
  return response.data;
}

/**
 * Cancel pending lottery day close
 * POST /api/lottery/bins/day/:storeId/cancel-close
 *
 * Reverts PENDING_CLOSE status back to OPEN. Call this when user
 * cancels the day close wizard or navigates away.
 *
 * Story: MyStore Day Close Atomic Transaction
 *
 * @param storeId - Store UUID
 * @returns Cancel response with status
 */
export async function cancelLotteryDayClose(
  storeId: string,
): Promise<ApiResponse<CancelLotteryDayCloseResponse>> {
  const response = await apiClient.post<
    ApiResponse<CancelLotteryDayCloseResponse>
  >(`/api/lottery/bins/day/${storeId}/cancel-close`);
  return response.data;
}

/**
 * Get lottery day close status
 * GET /api/lottery/bins/day/:storeId/close-status
 *
 * Returns the current status of the lottery business day.
 * Use this to resume the wizard if the user navigates away.
 *
 * Story: MyStore Day Close Atomic Transaction
 *
 * @param storeId - Store UUID
 * @returns Status response with pending close info if applicable
 */
export async function getLotteryDayCloseStatus(
  storeId: string,
): Promise<ApiResponse<LotteryDayStatusResponse | null>> {
  const response = await apiClient.get<
    ApiResponse<LotteryDayStatusResponse | null>
  >(`/api/lottery/bins/day/${storeId}/close-status`);
  return response.data;
}

/**
 * Response from marking pack as sold out
 */
export interface MarkPackAsSoldOutResponse {
  pack_id: string;
  status: "DEPLETED";
  depleted_at: string;
  depletion_reason: "MANUAL_SOLD_OUT";
}

/**
 * Input for marking pack as sold out
 * closing_serial is optional - defaults to pack's serial_end on the server
 */
export interface MarkPackAsSoldOutInput {
  closing_serial?: string;
}

/**
 * Mark a pack as sold out (manually deplete)
 * POST /api/lottery/packs/:packId/deplete
 * Story: Lottery Pack Auto-Depletion Feature
 *
 * MCP Guidance Applied:
 * - API-001: VALIDATION - Always send valid JSON body for POST requests
 * - FE-002: FORM_VALIDATION - Optional closing_serial validated on backend
 *
 * @param packId - Pack UUID to mark as sold out
 * @param data - Optional closing serial (defaults to pack's serial_end)
 * @returns Response with depleted pack info
 */
export async function markPackAsSoldOut(
  packId: string,
  data: MarkPackAsSoldOutInput = {},
): Promise<ApiResponse<MarkPackAsSoldOutResponse>> {
  const response = await apiClient.post<ApiResponse<MarkPackAsSoldOutResponse>>(
    `/api/lottery/packs/${packId}/deplete`,
    data,
  );
  return response.data;
}

// ============ Full Pack Activation API ============

/**
 * Activate a pack with bin assignment during shift
 * POST /api/stores/:storeId/lottery/packs/activate
 * Story: Pack Activation UX Enhancement
 *
 * This endpoint combines pack activation with bin assignment in a single operation.
 * For cashiers, a shift_id is required. For managers (CLIENT_OWNER, CLIENT_ADMIN,
 * STORE_MANAGER), the shift_id is optional.
 *
 * MCP Guidance Applied:
 * - API-001: VALIDATION - All inputs validated via Zod on backend
 * - SEC-010: AUTHZ - Role-based shift requirement enforcement
 * - DB-001: ORM_USAGE - Uses Prisma transactions for atomicity
 *
 * @param storeId - Store UUID
 * @param data - Pack activation data
 * @returns Updated bin with pack information
 */
export async function activatePackFull(
  storeId: string,
  data: FullActivatePackInput,
): Promise<ApiResponse<FullActivatePackResponse>> {
  const response = await apiClient.post<ApiResponse<FullActivatePackResponse>>(
    `/api/stores/${storeId}/lottery/packs/activate`,
    data,
  );
  return response.data;
}

// ============ Shifts API (for lottery activation) ============

/**
 * Active shift response for a cashier
 */
export interface CashierActiveShiftResponse {
  shift_id: string;
  store_id: string;
  cashier_id: string;
  cashier_name: string;
  status: "OPEN" | "ACTIVE" | "CLOSING" | "RECONCILING";
  opened_at: string | null;
}

/**
 * Get the active shift for a specific cashier at a store
 * GET /api/stores/:storeId/cashiers/:cashierId/active-shift
 * Story: Pack Activation UX Enhancement
 *
 * Returns the cashier's active shift if one exists.
 * Used to get the shift_id for pack activation when a cashier authenticates.
 *
 * MCP Guidance Applied:
 * - DB-006: TENANT_ISOLATION - Store-scoped query
 * - API-003: ERROR_HANDLING - Structured error responses
 *
 * @param storeId - Store UUID
 * @param cashierId - Cashier UUID
 * @returns Active shift information or 404 if no active shift
 */
export async function getCashierActiveShift(
  storeId: string,
  cashierId: string,
): Promise<ApiResponse<CashierActiveShiftResponse>> {
  const response = await apiClient.get<ApiResponse<CashierActiveShiftResponse>>(
    `/api/stores/${storeId}/cashiers/${cashierId}/active-shift`,
  );
  return response.data;
}
