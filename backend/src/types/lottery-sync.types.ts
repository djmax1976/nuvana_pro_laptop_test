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
 */
export interface LotteryGameSyncRecord {
  /** Unique game identifier */
  gameId: string;
  /** 4-digit game code */
  gameCode: string;
  /** Game name */
  name: string;
  /** Game description */
  description: string | null;
  /** Ticket price (decimal string for precision) */
  price: string;
  /** Pack value (default $300) */
  packValue: string;
  /** Tickets per pack (calculated from pack_value / price) */
  ticketsPerPack: number | null;
  /** Game status */
  status: LotteryGameStatus;
  /** State ID (for state-scoped games) */
  stateId: string | null;
  /** Last modified timestamp */
  updatedAt: string;
  /** Sync sequence number */
  syncSequence: number;
}

/**
 * Lottery config value sync record
 * Dropdown values for ticket prices, pack values
 */
export interface LotteryConfigSyncRecord {
  /** Unique config value identifier */
  configValueId: string;
  /** Config type (TICKET_PRICE, PACK_VALUE) */
  configType: LotteryConfigType;
  /** Amount value (decimal string) */
  amount: string;
  /** Display order */
  displayOrder: number;
  /** Whether active */
  isActive: boolean;
  /** Last modified timestamp */
  updatedAt: string;
  /** Sync sequence number */
  syncSequence: number;
}

/**
 * Lottery bin sync record
 * Storage bin configuration for the store
 */
export interface LotteryBinSyncRecord {
  /** Unique bin identifier */
  binId: string;
  /** Bin name */
  name: string;
  /** Bin location (optional) */
  location: string | null;
  /** Display order */
  displayOrder: number;
  /** Whether active */
  isActive: boolean;
  /** Last modified timestamp */
  updatedAt: string;
  /** Sync sequence number */
  syncSequence: number;
}

/**
 * Lottery pack sync record
 * Full pack details for sync
 */
export interface LotteryPackSyncRecord {
  /** Unique pack identifier */
  packId: string;
  /** Game ID reference */
  gameId: string;
  /** Game code (denormalized for offline) */
  gameCode: string;
  /** Game name (denormalized for offline) */
  gameName: string;
  /** Pack number */
  packNumber: string;
  /** Starting serial number */
  serialStart: string;
  /** Ending serial number */
  serialEnd: string;
  /** Pack status */
  status: LotteryPackStatus;
  /** Current bin ID (if assigned) */
  currentBinId: string | null;
  /** Current bin name (denormalized) */
  currentBinName: string | null;
  /** Tickets sold count */
  ticketsSoldCount: number;
  /** Last sold timestamp */
  lastSoldAt: string | null;
  /** Received timestamp */
  receivedAt: string | null;
  /** Activated timestamp */
  activatedAt: string | null;
  /** Depleted timestamp */
  depletedAt: string | null;
  /** Returned timestamp */
  returnedAt: string | null;
  /** Activated by user ID */
  activatedBy: string | null;
  /** Activated in shift ID */
  activatedShiftId: string | null;
  /** Depleted by user ID */
  depletedBy: string | null;
  /** Depletion reason */
  depletionReason: LotteryPackDepletionReason | null;
  /** Returned by user ID */
  returnedBy: string | null;
  /** Return reason */
  returnReason: LotteryPackReturnReason | null;
  /** Return notes */
  returnNotes: string | null;
  /** Last sold serial on return */
  lastSoldSerial: string | null;
  /** Tickets sold on return */
  ticketsSoldOnReturn: number | null;
  /** Return sales amount (decimal string) */
  returnSalesAmount: string | null;
  /** Serial override approved by */
  serialOverrideApprovedBy: string | null;
  /** Serial override reason */
  serialOverrideReason: string | null;
  /** Mark sold approved by */
  markSoldApprovedBy: string | null;
  /** Mark sold reason */
  markSoldReason: string | null;
  /** Ticket price (denormalized for calculations) */
  ticketPrice: string;
  /** Pack value (denormalized) */
  packValue: string;
  /** Last modified timestamp */
  updatedAt: string;
  /** Sync sequence number */
  syncSequence: number;
}

/**
 * Lottery day status sync record
 * Current business day state
 */
export interface LotteryDayStatusSyncRecord {
  /** Unique day identifier */
  dayId: string;
  /** Business date (YYYY-MM-DD) */
  businessDate: string;
  /** Day status */
  status: "OPEN" | "PENDING_CLOSE" | "CLOSED";
  /** Opened timestamp */
  openedAt: string;
  /** Opened by user ID */
  openedBy: string | null;
  /** Closed timestamp */
  closedAt: string | null;
  /** Closed by user ID */
  closedBy: string | null;
  /** Notes */
  notes: string | null;
  /** Pending close by user ID */
  pendingCloseBy: string | null;
  /** Pending close timestamp */
  pendingCloseAt: string | null;
  /** Pending close expiration */
  pendingCloseExpiresAt: string | null;
  /** Day summary ID (if linked) */
  daySummaryId: string | null;
  /** Last modified timestamp */
  updatedAt: string;
  /** Sync sequence number */
  syncSequence: number;
}

/**
 * Lottery shift opening sync record
 */
export interface LotteryShiftOpeningSyncRecord {
  /** Unique opening identifier */
  openingId: string;
  /** Shift ID */
  shiftId: string;
  /** Pack ID */
  packId: string;
  /** Pack number (denormalized) */
  packNumber: string;
  /** Game code (denormalized) */
  gameCode: string;
  /** Opening serial number */
  openingSerial: string;
  /** Created timestamp */
  createdAt: string;
  /** Sync sequence number */
  syncSequence: number;
}

/**
 * Lottery shift closing sync record
 */
export interface LotteryShiftClosingSyncRecord {
  /** Unique closing identifier */
  closingId: string;
  /** Shift ID */
  shiftId: string;
  /** Pack ID */
  packId: string;
  /** Pack number (denormalized) */
  packNumber: string;
  /** Game code (denormalized) */
  gameCode: string;
  /** Cashier ID */
  cashierId: string | null;
  /** Closing serial number */
  closingSerial: string;
  /** Entry method (SCAN or MANUAL) */
  entryMethod: string | null;
  /** Manual entry authorized by */
  manualEntryAuthorizedBy: string | null;
  /** Manual entry authorized at */
  manualEntryAuthorizedAt: string | null;
  /** Created timestamp */
  createdAt: string;
  /** Sync sequence number */
  syncSequence: number;
}

/**
 * Lottery variance sync record
 */
export interface LotteryVarianceSyncRecord {
  /** Unique variance identifier */
  varianceId: string;
  /** Shift ID */
  shiftId: string;
  /** Pack ID */
  packId: string;
  /** Pack number (denormalized) */
  packNumber: string;
  /** Game code (denormalized) */
  gameCode: string;
  /** Expected ticket count */
  expected: number;
  /** Actual ticket count */
  actual: number;
  /** Difference (actual - expected) */
  difference: number;
  /** Reason/notes */
  reason: string | null;
  /** Approved by user ID */
  approvedBy: string | null;
  /** Approved timestamp */
  approvedAt: string | null;
  /** Created timestamp */
  createdAt: string;
  /** Sync sequence number */
  syncSequence: number;
}

/**
 * Lottery day pack sync record
 */
export interface LotteryDayPackSyncRecord {
  /** Unique day pack identifier */
  dayPackId: string;
  /** Day ID */
  dayId: string;
  /** Pack ID */
  packId: string;
  /** Pack number (denormalized) */
  packNumber: string;
  /** Game code (denormalized) */
  gameCode: string;
  /** Bin ID */
  binId: string | null;
  /** Bin name (denormalized) */
  binName: string | null;
  /** Starting serial (from previous day or "000") */
  startingSerial: string;
  /** Ending serial (entered at day close) */
  endingSerial: string | null;
  /** Tickets sold (calculated) */
  ticketsSold: number | null;
  /** Sales amount (decimal string) */
  salesAmount: string | null;
  /** Entry method */
  entryMethod: string | null;
  /** Last modified timestamp */
  updatedAt: string;
  /** Sync sequence number */
  syncSequence: number;
}

/**
 * Lottery bin history sync record
 */
export interface LotteryBinHistorySyncRecord {
  /** Unique history identifier */
  historyId: string;
  /** Pack ID */
  packId: string;
  /** Pack number (denormalized) */
  packNumber: string;
  /** Bin ID */
  binId: string;
  /** Bin name (denormalized) */
  binName: string;
  /** Moved timestamp */
  movedAt: string;
  /** Moved by user ID */
  movedBy: string;
  /** Move reason */
  reason: string | null;
  /** Sync sequence number */
  syncSequence: number;
}

// =============================================================================
// PULL Response Wrappers
// =============================================================================

/**
 * Base sync response with pagination
 */
export interface BaseSyncResponse<T> {
  /** Records */
  records: T[];
  /** Total count matching query */
  totalCount: number;
  /** Current sync sequence */
  currentSequence: number;
  /** Whether more records are available */
  hasMore: boolean;
  /** Server timestamp for clock sync */
  serverTime: string;
  /** Next sync cursor (use as since_sequence in next request) */
  nextCursor?: number;
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
 */
export interface PackReceiveResult {
  /** Whether operation succeeded */
  success: boolean;
  /** Local ID (if provided) */
  localId?: string;
  /** Server-assigned pack ID (if created) */
  packId?: string;
  /** Error code (if failed) */
  errorCode?: string;
  /** Error message (if failed) */
  errorMessage?: string;
}

/**
 * Response from pack receive (single)
 */
export interface LotteryPackReceiveResponse {
  /** Whether operation succeeded */
  success: boolean;
  /** Server-assigned pack ID */
  packId: string;
  /** Updated pack record */
  pack: LotteryPackSyncRecord;
  /** Server timestamp */
  serverTime: string;
}

/**
 * Response from pack receive (batch)
 */
export interface LotteryPackReceiveBatchResponse {
  /** Total packs processed */
  totalProcessed: number;
  /** Successful receives */
  successCount: number;
  /** Failed receives */
  failureCount: number;
  /** Individual results */
  results: PackReceiveResult[];
  /** Server timestamp */
  serverTime: string;
}

/**
 * Response from pack activation
 */
export interface LotteryPackActivateResponse {
  /** Whether operation succeeded */
  success: boolean;
  /** Updated pack record */
  pack: LotteryPackSyncRecord;
  /** Generated UPC code (if POS sync enabled) */
  upcCode?: string;
  /** Server timestamp */
  serverTime: string;
}

/**
 * Response from pack move
 */
export interface LotteryPackMoveResponse {
  /** Whether operation succeeded */
  success: boolean;
  /** Updated pack record */
  pack: LotteryPackSyncRecord;
  /** Created history record */
  historyRecord: LotteryBinHistorySyncRecord;
  /** Server timestamp */
  serverTime: string;
}

/**
 * Response from pack depletion
 */
export interface LotteryPackDepleteResponse {
  /** Whether operation succeeded */
  success: boolean;
  /** Updated pack record */
  pack: LotteryPackSyncRecord;
  /** Server timestamp */
  serverTime: string;
}

/**
 * Response from pack return
 */
export interface LotteryPackReturnResponse {
  /** Whether operation succeeded */
  success: boolean;
  /** Updated pack record */
  pack: LotteryPackSyncRecord;
  /** Server timestamp */
  serverTime: string;
}

/**
 * Response from shift open
 */
export interface LotteryShiftOpenResponse {
  /** Whether operation succeeded */
  success: boolean;
  /** Created opening records */
  openings: LotteryShiftOpeningSyncRecord[];
  /** Server timestamp */
  serverTime: string;
}

/**
 * Response from shift close
 */
export interface LotteryShiftCloseResponse {
  /** Whether operation succeeded */
  success: boolean;
  /** Created closing records */
  closings: LotteryShiftClosingSyncRecord[];
  /** Detected variances (if any) */
  variances: LotteryVarianceSyncRecord[];
  /** Server timestamp */
  serverTime: string;
}

/**
 * Response from day prepare close (Phase 1)
 */
export interface LotteryDayPrepareCloseResponse {
  /** Whether operation succeeded */
  success: boolean;
  /** Day ID */
  dayId: string;
  /** New status (should be PENDING_CLOSE) */
  status: "PENDING_CLOSE";
  /** Expiration timestamp */
  expiresAt: string;
  /** Validation warnings (non-blocking) */
  warnings?: string[];
  /** Server timestamp */
  serverTime: string;
}

/**
 * Response from day commit close (Phase 2)
 */
export interface LotteryDayCommitCloseResponse {
  /** Whether operation succeeded */
  success: boolean;
  /** Day ID */
  dayId: string;
  /** New status (should be CLOSED) */
  status: "CLOSED";
  /** Created day pack records */
  dayPacks: LotteryDayPackSyncRecord[];
  /** Summary statistics */
  summary: {
    totalPacks: number;
    totalTicketsSold: number;
    totalSalesAmount: string;
  };
  /** Server timestamp */
  serverTime: string;
}

/**
 * Response from day cancel close
 */
export interface LotteryDayCancelCloseResponse {
  /** Whether operation succeeded */
  success: boolean;
  /** Day ID */
  dayId: string;
  /** New status (should be OPEN) */
  status: "OPEN";
  /** Server timestamp */
  serverTime: string;
}

/**
 * Response from variance approval
 */
export interface LotteryVarianceApproveResponse {
  /** Whether operation succeeded */
  success: boolean;
  /** Updated variance record */
  variance: LotteryVarianceSyncRecord;
  /** Server timestamp */
  serverTime: string;
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
