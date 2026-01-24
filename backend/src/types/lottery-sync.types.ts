/**
 * Lottery Sync Types
 *
 * Enterprise-grade type definitions for lottery sync endpoints.
 * Supports offline-first desktop POS applications with full
 * lottery pack management, shift tracking, and day close workflows.
 *
 * Security Controls:
 * - DB-006: TENANT_ISOLATION - All records scoped to store_id
 * - SEC-001: No sensitive data exposed
 * - API-003: Consistent error response types
 *
 * @module types/lottery-sync.types
 */

import type {
  LotteryGameStatus,
  LotteryPackStatus,
  LotteryConfigType,
  LotteryPackDepletionReason,
  LotteryPackReturnReason,
} from "@prisma/client";

// =============================================================================
// PULL Response Types - Records from Server
// =============================================================================

/**
 * Lottery game sync record
 * Represents an active lottery game for the store's state
 * Field names match database column names (snake_case)
 */
export interface LotteryGameSyncRecord {
  /** Unique game identifier */
  game_id: string;
  /** 4-digit game code */
  game_code: string;
  /** Game name */
  name: string;
  /** Game description */
  description: string | null;
  /** Ticket price (decimal string for precision) */
  price: string;
  /** Pack value (default $300) */
  pack_value: string;
  /** Tickets per pack (calculated from pack_value / price) */
  tickets_per_pack: number | null;
  /** Game status */
  status: LotteryGameStatus;
  /** State ID (for state-scoped games) */
  state_id: string | null;
  /** Last modified timestamp */
  updated_at: string;
  /** Sync sequence number */
  sync_sequence: number;
}

/**
 * Lottery config value sync record
 * Dropdown values for ticket prices, pack values
 * Field names match database column names (snake_case)
 */
export interface LotteryConfigSyncRecord {
  /** Unique config value identifier */
  config_value_id: string;
  /** Config type (TICKET_PRICE, PACK_VALUE) */
  config_type: LotteryConfigType;
  /** Amount value (decimal string) */
  amount: string;
  /** Display order */
  display_order: number;
  /** Whether active */
  is_active: boolean;
  /** Last modified timestamp */
  updated_at: string;
  /** Sync sequence number */
  sync_sequence: number;
}

/**
 * Lottery bin sync record
 * Storage bin configuration for the store
 * Field names match database column names (snake_case)
 */
export interface LotteryBinSyncRecord {
  /** Unique bin identifier */
  bin_id: string;
  /** Bin name */
  name: string;
  /** Bin location (optional) */
  location: string | null;
  /** Display order */
  display_order: number;
  /** Whether active */
  is_active: boolean;
  /** Last modified timestamp */
  updated_at: string;
  /** Sync sequence number */
  sync_sequence: number;
}

/**
 * Lottery pack sync record
 * Full pack details for sync
 * Field names match database column names (snake_case)
 */
export interface LotteryPackSyncRecord {
  /** Unique pack identifier */
  pack_id: string;
  /** Game ID reference */
  game_id: string;
  /** Game code (denormalized for offline) */
  game_code: string;
  /** Game name (denormalized for offline) */
  game_name: string;
  /** Pack number */
  pack_number: string;
  /** Starting serial number */
  serial_start: string;
  /** Ending serial number */
  serial_end: string;
  /** Pack status */
  status: LotteryPackStatus;
  /** Current bin ID (if assigned) */
  current_bin_id: string | null;
  /** Current bin name (denormalized) */
  current_bin_name: string | null;
  /** Tickets sold count */
  tickets_sold_count: number;
  /** Last sold timestamp */
  last_sold_at: string | null;
  /** Received timestamp */
  received_at: string | null;
  /** Activated timestamp */
  activated_at: string | null;
  /** Depleted timestamp */
  depleted_at: string | null;
  /** Returned timestamp */
  returned_at: string | null;
  /** Activated by user ID */
  activated_by: string | null;
  /** Activated in shift ID */
  activated_shift_id: string | null;
  /** Depleted by user ID */
  depleted_by: string | null;
  /** Depletion reason */
  depletion_reason: LotteryPackDepletionReason | null;
  /** Returned by user ID */
  returned_by: string | null;
  /** Return reason */
  return_reason: LotteryPackReturnReason | null;
  /** Return notes */
  return_notes: string | null;
  /** Last sold serial on return */
  last_sold_serial: string | null;
  /** Tickets sold on return */
  tickets_sold_on_return: number | null;
  /** Return sales amount (decimal string) */
  return_sales_amount: string | null;
  /** Serial override approved by */
  serial_override_approved_by: string | null;
  /** Serial override reason */
  serial_override_reason: string | null;
  /** Mark sold approved by */
  mark_sold_approved_by: string | null;
  /** Mark sold reason */
  mark_sold_reason: string | null;
  /** Ticket price (denormalized for calculations) */
  ticket_price: string;
  /** Pack value (denormalized) */
  pack_value: string;
  /** Last modified timestamp */
  updated_at: string;
  /** Sync sequence number */
  sync_sequence: number;
}

/**
 * Lottery day status sync record
 * Current business day state
 * Field names match database column names (snake_case)
 */
export interface LotteryDayStatusSyncRecord {
  /** Unique day identifier */
  day_id: string;
  /** Business date (YYYY-MM-DD) */
  business_date: string;
  /** Day status */
  status: "OPEN" | "PENDING_CLOSE" | "CLOSED";
  /** Opened timestamp */
  opened_at: string;
  /** Opened by user ID */
  opened_by: string | null;
  /** Closed timestamp */
  closed_at: string | null;
  /** Closed by user ID */
  closed_by: string | null;
  /** Notes */
  notes: string | null;
  /** Pending close by user ID */
  pending_close_by: string | null;
  /** Pending close timestamp */
  pending_close_at: string | null;
  /** Pending close expiration */
  pending_close_expires_at: string | null;
  /** Day summary ID (if linked) */
  day_summary_id: string | null;
  /** Last modified timestamp */
  updated_at: string;
  /** Sync sequence number */
  sync_sequence: number;
}

/**
 * Lottery shift opening sync record
 * Field names match database column names (snake_case)
 */
export interface LotteryShiftOpeningSyncRecord {
  /** Unique opening identifier */
  opening_id: string;
  /** Shift ID */
  shift_id: string;
  /** Pack ID */
  pack_id: string;
  /** Pack number (denormalized) */
  pack_number: string;
  /** Game code (denormalized) */
  game_code: string;
  /** Opening serial number */
  opening_serial: string;
  /** Created timestamp */
  created_at: string;
  /** Sync sequence number */
  sync_sequence: number;
}

/**
 * Lottery shift closing sync record
 * Field names match database column names (snake_case)
 */
export interface LotteryShiftClosingSyncRecord {
  /** Unique closing identifier */
  closing_id: string;
  /** Shift ID */
  shift_id: string;
  /** Pack ID */
  pack_id: string;
  /** Pack number (denormalized) */
  pack_number: string;
  /** Game code (denormalized) */
  game_code: string;
  /** Cashier ID */
  cashier_id: string | null;
  /** Closing serial number */
  closing_serial: string;
  /** Entry method (SCAN or MANUAL) */
  entry_method: string | null;
  /** Manual entry authorized by */
  manual_entry_authorized_by: string | null;
  /** Manual entry authorized at */
  manual_entry_authorized_at: string | null;
  /** Created timestamp */
  created_at: string;
  /** Sync sequence number */
  sync_sequence: number;
}

/**
 * Lottery variance sync record
 * Field names match database column names (snake_case)
 */
export interface LotteryVarianceSyncRecord {
  /** Unique variance identifier */
  variance_id: string;
  /** Shift ID */
  shift_id: string;
  /** Pack ID */
  pack_id: string;
  /** Pack number (denormalized) */
  pack_number: string;
  /** Game code (denormalized) */
  game_code: string;
  /** Expected ticket count */
  expected: number;
  /** Actual ticket count */
  actual: number;
  /** Difference (actual - expected) */
  difference: number;
  /** Reason/notes */
  reason: string | null;
  /** Approved by user ID */
  approved_by: string | null;
  /** Approved timestamp */
  approved_at: string | null;
  /** Created timestamp */
  created_at: string;
  /** Sync sequence number */
  sync_sequence: number;
}

/**
 * Lottery day pack sync record
 * Field names match database column names (snake_case)
 */
export interface LotteryDayPackSyncRecord {
  /** Unique day pack identifier */
  day_pack_id: string;
  /** Day ID */
  day_id: string;
  /** Pack ID */
  pack_id: string;
  /** Pack number (denormalized) */
  pack_number: string;
  /** Game code (denormalized) */
  game_code: string;
  /** Bin ID */
  bin_id: string | null;
  /** Bin name (denormalized) */
  bin_name: string | null;
  /** Starting serial (from previous day or "000") */
  starting_serial: string;
  /** Ending serial (entered at day close) */
  ending_serial: string | null;
  /** Tickets sold (calculated) */
  tickets_sold: number | null;
  /** Sales amount (decimal string) */
  sales_amount: string | null;
  /** Entry method */
  entry_method: string | null;
  /** Last modified timestamp */
  updated_at: string;
  /** Sync sequence number */
  sync_sequence: number;
}

/**
 * Lottery bin history sync record
 * Field names match database column names (snake_case)
 */
export interface LotteryBinHistorySyncRecord {
  /** Unique history identifier */
  history_id: string;
  /** Pack ID */
  pack_id: string;
  /** Pack number (denormalized) */
  pack_number: string;
  /** Bin ID */
  bin_id: string;
  /** Bin name (denormalized) */
  bin_name: string;
  /** Moved timestamp */
  moved_at: string;
  /** Moved by user ID (null for device API operations without user context) */
  moved_by: string | null;
  /** Move reason */
  reason: string | null;
  /** Sync sequence number */
  sync_sequence: number;
}

// =============================================================================
// PULL Response Wrappers
// =============================================================================

/**
 * Base sync response with pagination
 * Field names use snake_case for consistency
 */
export interface BaseSyncResponse<T> {
  /** Records */
  records: T[];
  /** Total count matching query */
  total_count: number;
  /** Current sync sequence */
  current_sequence: number;
  /** Whether more records are available */
  has_more: boolean;
  /** Server timestamp for clock sync */
  server_time: string;
  /** Next sync cursor (use as since_sequence in next request) */
  next_cursor?: number;
}

/** Games sync response */
export type LotteryGamesSyncResponse = BaseSyncResponse<LotteryGameSyncRecord>;

/** Config sync response */
export type LotteryConfigSyncResponse =
  BaseSyncResponse<LotteryConfigSyncRecord>;

/** Bins sync response */
export type LotteryBinsSyncResponse = BaseSyncResponse<LotteryBinSyncRecord>;

/** Packs sync response */
export type LotteryPacksSyncResponse = BaseSyncResponse<LotteryPackSyncRecord>;

/** Day status sync response */
export type LotteryDayStatusSyncResponse =
  BaseSyncResponse<LotteryDayStatusSyncRecord>;

/** Shift openings sync response */
export type LotteryShiftOpeningsSyncResponse =
  BaseSyncResponse<LotteryShiftOpeningSyncRecord>;

/** Shift closings sync response */
export type LotteryShiftClosingsSyncResponse =
  BaseSyncResponse<LotteryShiftClosingSyncRecord>;

/** Variances sync response */
export type LotteryVariancesSyncResponse =
  BaseSyncResponse<LotteryVarianceSyncRecord>;

/** Day packs sync response */
export type LotteryDayPacksSyncResponse =
  BaseSyncResponse<LotteryDayPackSyncRecord>;

/** Bin history sync response */
export type LotteryBinHistorySyncResponse =
  BaseSyncResponse<LotteryBinHistorySyncRecord>;

// =============================================================================
// PUSH Response Types - Results from Server
// =============================================================================

/**
 * Result of a single pack receive operation
 * Field names match database column names (snake_case)
 */
export interface PackReceiveResult {
  /** Whether operation succeeded */
  success: boolean;
  /** Local ID (if provided) */
  local_id?: string;
  /** Server-assigned pack ID (if created) */
  pack_id?: string;
  /** Error code (if failed) */
  error_code?: string;
  /** Error message (if failed) */
  error_message?: string;
}

/**
 * Response from pack receive (single)
 * Field names use snake_case for consistency
 */
export interface LotteryPackReceiveResponse {
  /** Whether operation succeeded */
  success: boolean;
  /** Server-assigned pack ID */
  pack_id: string;
  /** Updated pack record */
  pack: LotteryPackSyncRecord;
  /** Server timestamp */
  server_time: string;
}

/**
 * Response from pack receive (batch)
 * Field names use snake_case for consistency
 */
export interface LotteryPackReceiveBatchResponse {
  /** Total packs processed */
  total_processed: number;
  /** Successful receives */
  success_count: number;
  /** Failed receives */
  failure_count: number;
  /** Individual results */
  results: PackReceiveResult[];
  /** Server timestamp */
  server_time: string;
}

/**
 * Response from pack activation
 * Field names use snake_case for consistency
 */
export interface LotteryPackActivateResponse {
  /** Whether operation succeeded */
  success: boolean;
  /** Updated pack record */
  pack: LotteryPackSyncRecord;
  /** Generated UPC code (if POS sync enabled) */
  upc_code?: string;
  /** Server timestamp */
  server_time: string;
  /** True if pack was already active in same bin (idempotent response) */
  idempotent?: boolean;
}

/**
 * Response from pack move
 * Field names use snake_case for consistency
 */
export interface LotteryPackMoveResponse {
  /** Whether operation succeeded */
  success: boolean;
  /** Updated pack record */
  pack: LotteryPackSyncRecord;
  /** Created history record */
  history_record: LotteryBinHistorySyncRecord;
  /** Server timestamp */
  server_time: string;
}

/**
 * Response from pack depletion
 * Field names use snake_case for consistency
 */
export interface LotteryPackDepleteResponse {
  /** Whether operation succeeded */
  success: boolean;
  /** Updated pack record */
  pack: LotteryPackSyncRecord;
  /** Server timestamp */
  server_time: string;
}

/**
 * Response from pack return
 * Field names use snake_case for consistency
 */
export interface LotteryPackReturnResponse {
  /** Whether operation succeeded */
  success: boolean;
  /** Updated pack record */
  pack: LotteryPackSyncRecord;
  /** Server timestamp */
  server_time: string;
}

/**
 * Response from shift open
 * Field names use snake_case for consistency
 */
export interface LotteryShiftOpenResponse {
  /** Whether operation succeeded */
  success: boolean;
  /** Created opening records */
  openings: LotteryShiftOpeningSyncRecord[];
  /** Server timestamp */
  server_time: string;
}

/**
 * Response from shift close
 * Field names use snake_case for consistency
 */
export interface LotteryShiftCloseResponse {
  /** Whether operation succeeded */
  success: boolean;
  /** Created closing records */
  closings: LotteryShiftClosingSyncRecord[];
  /** Detected variances (if any) */
  variances: LotteryVarianceSyncRecord[];
  /** Server timestamp */
  server_time: string;
}

/**
 * Response from day prepare close (Phase 1)
 * Field names use snake_case for consistency
 */
export interface LotteryDayPrepareCloseResponse {
  /** Whether operation succeeded */
  success: boolean;
  /** Day ID */
  day_id: string;
  /** New status (should be PENDING_CLOSE) */
  status: "PENDING_CLOSE";
  /** Expiration timestamp */
  expires_at: string;
  /** Validation warnings (non-blocking) */
  warnings?: string[];
  /** Server timestamp */
  server_time: string;
}

/**
 * Response from day commit close (Phase 2)
 * Field names use snake_case for consistency
 */
export interface LotteryDayCommitCloseResponse {
  /** Whether operation succeeded */
  success: boolean;
  /** Day ID */
  day_id: string;
  /** New status (should be CLOSED) */
  status: "CLOSED";
  /** Created day pack records */
  day_packs: LotteryDayPackSyncRecord[];
  /** Summary statistics */
  summary: {
    total_packs: number;
    total_tickets_sold: number;
    total_sales_amount: string;
  };
  /** Server timestamp */
  server_time: string;
}

/**
 * Response from day cancel close
 * Field names use snake_case for consistency
 */
export interface LotteryDayCancelCloseResponse {
  /** Whether operation succeeded */
  success: boolean;
  /** Day ID */
  day_id: string;
  /** New status (should be OPEN) */
  status: "OPEN";
  /** Server timestamp */
  server_time: string;
}

/**
 * Response from variance approval
 * Field names use snake_case for consistency
 */
export interface LotteryVarianceApproveResponse {
  /** Whether operation succeeded */
  success: boolean;
  /** Updated variance record */
  variance: LotteryVarianceSyncRecord;
  /** Server timestamp */
  server_time: string;
}

// =============================================================================
// Sync Options & Context
// =============================================================================

/**
 * Options for fetching lottery sync data
 */
export interface LotterySyncOptions {
  /** Only fetch records modified after this timestamp */
  sinceTimestamp?: Date;
  /** Only fetch records with sequence > this value */
  sinceSequence?: number;
  /** Maximum records to return */
  limit?: number;
  /** Include inactive records */
  includeInactive?: boolean;
}

/**
 * Audit context for logging sync operations
 */
export interface LotterySyncAuditContext {
  apiKeyId: string;
  sessionId: string;
  ipAddress: string;
  deviceFingerprint?: string;
  operation: string;
}

/**
 * Pack filter options
 */
export interface PackFilterOptions extends LotterySyncOptions {
  /** Filter by bin ID */
  binId?: string;
  /** Filter by game ID */
  gameId?: string;
  /** Filter by status */
  status?: LotteryPackStatus;
}

/**
 * Shift filter options
 */
export interface ShiftFilterOptions extends LotterySyncOptions {
  /** Filter by shift ID */
  shiftId?: string;
}

/**
 * Variance filter options
 */
export interface VarianceFilterOptions extends LotterySyncOptions {
  /** Filter by shift ID */
  shiftId?: string;
  /** Filter by pack ID */
  packId?: string;
  /** Only unresolved (not approved) */
  unresolvedOnly?: boolean;
}

/**
 * Day pack filter options
 */
export interface DayPackFilterOptions extends LotterySyncOptions {
  /** Filter by day ID */
  dayId?: string;
  /** Filter by pack ID */
  packId?: string;
}

/**
 * Bin history filter options
 */
export interface BinHistoryFilterOptions extends LotterySyncOptions {
  /** Filter by pack ID */
  packId?: string;
  /** Filter by bin ID */
  binId?: string;
}

// =============================================================================
// Re-export Prisma enums
// =============================================================================

export type {
  LotteryGameStatus,
  LotteryPackStatus,
  LotteryConfigType,
  LotteryPackDepletionReason,
  LotteryPackReturnReason,
} from "@prisma/client";
