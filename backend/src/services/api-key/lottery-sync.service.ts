/**
 * Lottery Sync Service
 *
 * Enterprise-grade lottery data synchronization for desktop POS applications.
 * Implements all 25 lottery sync endpoints with strict security controls.
 *
 * Security Controls:
 * - DB-006: TENANT_ISOLATION - All queries scoped by store_id
 * - SEC-006: SQL_INJECTION - All queries use Prisma parameterized queries
 * - API-003: ERROR_HANDLING - Consistent error responses without stack traces
 * - SEC-004: AUDIT_LOGGING - All operations logged
 *
 * @module services/api-key/lottery-sync.service
 */

import { prisma } from "../../utils/db";
import { Decimal } from "@prisma/client/runtime/library";
import { apiKeyAuditService } from "./api-key-audit.service";
import type { ApiKeyIdentity } from "../../types/api-key.types";
import type {
  LotteryGameSyncRecord,
  LotteryConfigSyncRecord,
  LotteryBinSyncRecord,
  LotteryPackSyncRecord,
  LotteryDayStatusSyncRecord,
  LotteryShiftOpeningSyncRecord,
  LotteryShiftClosingSyncRecord,
  LotteryVarianceSyncRecord,
  LotteryDayPackSyncRecord,
  LotteryBinHistorySyncRecord,
  LotteryGamesSyncResponse,
  LotteryConfigSyncResponse,
  LotteryBinsSyncResponse,
  LotteryPacksSyncResponse,
  LotteryDayStatusSyncResponse,
  LotteryShiftOpeningsSyncResponse,
  LotteryShiftClosingsSyncResponse,
  LotteryVariancesSyncResponse,
  LotteryDayPacksSyncResponse,
  LotteryBinHistorySyncResponse,
  LotterySyncOptions,
  LotterySyncAuditContext,
  PackFilterOptions,
  ShiftFilterOptions,
  VarianceFilterOptions,
  DayPackFilterOptions,
  BinHistoryFilterOptions,
  LotteryPackReceiveResponse,
  LotteryPackReceiveBatchResponse,
  LotteryPackActivateResponse,
  LotteryPackMoveResponse,
  LotteryPackDepleteResponse,
  LotteryPackReturnResponse,
  LotteryShiftOpenResponse,
  LotteryShiftCloseResponse,
  LotteryDayPrepareCloseResponse,
  LotteryDayCommitCloseResponse,
  LotteryDayCancelCloseResponse,
  LotteryVarianceApproveResponse,
  PackReceiveResult,
} from "../../types/lottery-sync.types";
import type {
  LotteryPackReceiveInput,
  LotteryPackReceiveBatchInput,
  LotteryPackActivateInput,
  LotteryPackMoveInput,
  LotteryPackDepleteInput,
  LotteryPackReturnInput,
  LotteryShiftOpenInput,
  LotteryShiftCloseInput,
  LotteryDayPrepareCloseInput,
  LotteryDayCommitCloseInput,
  LotteryDayCancelCloseInput,
  LotteryVarianceApproveInput,
} from "../../schemas/lottery-sync.schema";
import { Prisma, type LotteryPackStatus } from "@prisma/client";

// =============================================================================
// Constants
// =============================================================================

/** Default limit for sync queries */
const DEFAULT_LIMIT = 100;

/** Maximum limit for sync queries */
const MAX_LIMIT = 500;

/** Maximum sync session age in milliseconds (1 hour) */
const MAX_SESSION_AGE_MS = 60 * 60 * 1000;

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Convert Decimal to string for JSON serialization
 */
function decimalToString(value: Decimal | null): string | null {
  return value ? value.toString() : null;
}

/**
 * Sanitize limit value
 */
function sanitizeLimit(limit?: number): number {
  if (!limit) return DEFAULT_LIMIT;
  return Math.min(Math.max(1, limit), MAX_LIMIT);
}

/**
 * Get current ISO timestamp
 */
function getServerTime(): string {
  return new Date().toISOString();
}

// =============================================================================
// Service Implementation
// =============================================================================

class LotterySyncService {
  // ===========================================================================
  // Session Validation
  // ===========================================================================

  /**
   * Validate that a sync session is active and belongs to the API key
   * DB-006: TENANT_ISOLATION - Validates store ownership
   *
   * @param sessionId - Sync session ID
   * @param apiKeyId - API key ID to validate ownership
   * @returns Session info with store ID
   * @throws Error if session is invalid or expired
   */
  async validateSyncSession(
    sessionId: string,
    apiKeyId: string,
  ): Promise<{
    syncSessionId: string;
    storeId: string;
    stateId: string | null;
  }> {
    const session = await prisma.apiKeySyncSession.findUnique({
      where: { sync_session_id: sessionId },
      include: {
        api_key: {
          select: {
            store_id: true,
            store: {
              select: { state_id: true },
            },
          },
        },
      },
    });

    if (!session) {
      throw new Error("INVALID_SESSION: Sync session not found");
    }

    if (session.api_key_id !== apiKeyId) {
      throw new Error(
        "INVALID_SESSION: Session does not belong to this API key",
      );
    }

    if (session.sync_status !== "ACTIVE") {
      throw new Error("INVALID_SESSION: Sync session is not active");
    }

    // Check session age
    const sessionAge = Date.now() - session.session_started_at.getTime();
    if (sessionAge > MAX_SESSION_AGE_MS) {
      throw new Error("INVALID_SESSION: Sync session has expired");
    }

    return {
      syncSessionId: session.sync_session_id,
      storeId: session.api_key.store_id,
      stateId: session.api_key.store?.state_id || null,
    };
  }

  // ===========================================================================
  // PULL Endpoints - Games
  // ===========================================================================

  /**
   * GET /api/v1/sync/lottery/games
   * Fetch ALL lottery games for the store's state (including inactive)
   *
   * Returns all games regardless of status so local database can track
   * status changes. Local app filters display as needed.
   *
   * DB-006: TENANT_ISOLATION - Games filtered by state_id from API key
   */
  async getGamesForSync(
    storeId: string,
    stateId: string | null,
    options: LotterySyncOptions = {},
  ): Promise<LotteryGamesSyncResponse> {
    const { sinceTimestamp, sinceSequence } = options;
    const limit = sanitizeLimit(options.limit);

    // Build where clause with state isolation
    // Games are state-scoped or store-scoped (fallback)
    const where: {
      updated_at?: { gt: Date };
      OR: Array<{ state_id: string | null } | { store_id: string }>;
    } = {
      OR: [
        // State-scoped games (primary)
        ...(stateId ? [{ state_id: stateId }] : []),
        // Store-scoped games (fallback/custom)
        { store_id: storeId },
      ],
    };

    if (sinceTimestamp) {
      where.updated_at = { gt: sinceTimestamp };
    }
    // Always return ALL games including inactive - local database needs complete picture
    // to properly track game status changes. Local app filters display as needed.

    const totalCount = await prisma.lotteryGame.count({ where });

    const games = await prisma.lotteryGame.findMany({
      where,
      orderBy: [{ updated_at: "asc" }, { game_id: "asc" }],
      take: limit + 1,
    });

    const hasMore = games.length > limit;
    const recordsToReturn = hasMore ? games.slice(0, limit) : games;

    let sequence = sinceSequence || 0;
    const records: LotteryGameSyncRecord[] = recordsToReturn.map((game) => {
      sequence += 1;
      return {
        game_id: game.game_id,
        game_code: game.game_code,
        name: game.name,
        description: game.description,
        price: game.price.toString(),
        pack_value: game.pack_value.toString(),
        tickets_per_pack: game.tickets_per_pack,
        status: game.status,
        state_id: game.state_id,
        updated_at: game.updated_at.toISOString(),
        sync_sequence: sequence,
      };
    });

    return {
      records,
      total_count: totalCount,
      current_sequence: sequence,
      has_more: hasMore,
      server_time: getServerTime(),
      next_cursor: hasMore ? sequence : undefined,
    };
  }

  // ===========================================================================
  // PULL Endpoints - Config
  // ===========================================================================

  /**
   * GET /api/v1/sync/lottery/config
   * Fetch lottery configuration values (dropdown options)
   */
  async getConfigForSync(
    options: LotterySyncOptions = {},
  ): Promise<LotteryConfigSyncResponse> {
    const { sinceTimestamp, sinceSequence } = options;
    const limit = sanitizeLimit(options.limit);

    const where: {
      updated_at?: { gt: Date };
      is_active: boolean;
    } = {
      is_active: true,
    };

    if (sinceTimestamp) {
      where.updated_at = { gt: sinceTimestamp };
    }

    const totalCount = await prisma.lotteryConfigValue.count({ where });

    const configs = await prisma.lotteryConfigValue.findMany({
      where,
      orderBy: [{ config_type: "asc" }, { display_order: "asc" }],
      take: limit + 1,
    });

    const hasMore = configs.length > limit;
    const recordsToReturn = hasMore ? configs.slice(0, limit) : configs;

    let sequence = sinceSequence || 0;
    const records: LotteryConfigSyncRecord[] = recordsToReturn.map((config) => {
      sequence += 1;
      return {
        config_value_id: config.config_value_id,
        config_type: config.config_type,
        amount: config.amount.toString(),
        display_order: config.display_order,
        is_active: config.is_active,
        updated_at: config.updated_at.toISOString(),
        sync_sequence: sequence,
      };
    });

    return {
      records,
      total_count: totalCount,
      current_sequence: sequence,
      has_more: hasMore,
      server_time: getServerTime(),
      next_cursor: hasMore ? sequence : undefined,
    };
  }

  // ===========================================================================
  // PULL Endpoints - Bins
  // ===========================================================================

  /**
   * GET /api/v1/sync/lottery/bins
   * Fetch bin configuration for the store
   *
   * DB-006: TENANT_ISOLATION - Bins filtered by store_id
   */
  async getBinsForSync(
    storeId: string,
    options: LotterySyncOptions = {},
  ): Promise<LotteryBinsSyncResponse> {
    const { sinceTimestamp, sinceSequence, includeInactive = false } = options;
    const limit = sanitizeLimit(options.limit);

    const where: {
      store_id: string;
      updated_at?: { gt: Date };
      is_active?: boolean;
    } = {
      store_id: storeId,
    };

    if (sinceTimestamp) {
      where.updated_at = { gt: sinceTimestamp };
    }

    if (!includeInactive) {
      where.is_active = true;
    }

    const totalCount = await prisma.lotteryBin.count({ where });

    const bins = await prisma.lotteryBin.findMany({
      where,
      orderBy: [{ display_order: "asc" }, { bin_id: "asc" }],
      take: limit + 1,
    });

    const hasMore = bins.length > limit;
    const recordsToReturn = hasMore ? bins.slice(0, limit) : bins;

    let sequence = sinceSequence || 0;
    const records: LotteryBinSyncRecord[] = recordsToReturn.map((bin) => {
      sequence += 1;
      return {
        bin_id: bin.bin_id,
        name: bin.name,
        location: bin.location,
        display_order: bin.display_order,
        is_active: bin.is_active,
        updated_at: bin.updated_at.toISOString(),
        sync_sequence: sequence,
      };
    });

    return {
      records,
      total_count: totalCount,
      current_sequence: sequence,
      has_more: hasMore,
      server_time: getServerTime(),
      next_cursor: hasMore ? sequence : undefined,
    };
  }

  // ===========================================================================
  // PULL Endpoints - Packs
  // ===========================================================================

  /**
   * Fetch packs by status for sync
   * DB-006: TENANT_ISOLATION - Packs filtered by store_id
   */
  async getPacksForSync(
    storeId: string,
    status: LotteryPackStatus,
    options: PackFilterOptions = {},
  ): Promise<LotteryPacksSyncResponse> {
    const { sinceTimestamp, sinceSequence, binId, gameId } = options;
    const limit = sanitizeLimit(options.limit);

    const where: {
      store_id: string;
      status: LotteryPackStatus;
      updated_at?: { gt: Date };
      current_bin_id?: string;
      game_id?: string;
    } = {
      store_id: storeId,
      status,
    };

    if (sinceTimestamp) {
      where.updated_at = { gt: sinceTimestamp };
    }

    if (binId) {
      where.current_bin_id = binId;
    }

    if (gameId) {
      where.game_id = gameId;
    }

    const totalCount = await prisma.lotteryPack.count({ where });

    const packs = await prisma.lotteryPack.findMany({
      where,
      orderBy: [{ updated_at: "asc" }, { pack_id: "asc" }],
      take: limit + 1,
      include: {
        game: {
          select: {
            game_code: true,
            name: true,
            price: true,
            pack_value: true,
          },
        },
        bin: {
          select: { name: true },
        },
      },
    });

    const hasMore = packs.length > limit;
    const recordsToReturn = hasMore ? packs.slice(0, limit) : packs;

    let sequence = sinceSequence || 0;
    const records: LotteryPackSyncRecord[] = recordsToReturn.map((pack) => {
      sequence += 1;
      return this.mapPackToSyncRecord(pack, sequence);
    });

    return {
      records,
      total_count: totalCount,
      current_sequence: sequence,
      has_more: hasMore,
      server_time: getServerTime(),
      next_cursor: hasMore ? sequence : undefined,
    };
  }

  /**
   * Map a pack entity to sync record
   */
  private mapPackToSyncRecord(
    pack: {
      pack_id: string;
      game_id: string;
      pack_number: string;
      serial_start: string;
      serial_end: string;
      status: LotteryPackStatus;
      current_bin_id: string | null;
      tickets_sold_count: number;
      last_sold_at: Date | null;
      received_at: Date | null;
      activated_at: Date | null;
      depleted_at: Date | null;
      returned_at: Date | null;
      activated_by: string | null;
      activated_shift_id: string | null;
      depleted_by: string | null;
      depletion_reason: string | null;
      returned_by: string | null;
      return_reason: string | null;
      return_notes: string | null;
      last_sold_serial: string | null;
      tickets_sold_on_return: number | null;
      return_sales_amount: Decimal | null;
      serial_override_approved_by: string | null;
      serial_override_reason: string | null;
      mark_sold_approved_by: string | null;
      mark_sold_reason: string | null;
      updated_at: Date;
      game: {
        game_code: string;
        name: string;
        price: Decimal;
        pack_value: Decimal;
      };
      bin: { name: string } | null;
    },
    sequence: number,
  ): LotteryPackSyncRecord {
    return {
      pack_id: pack.pack_id,
      game_id: pack.game_id,
      game_code: pack.game.game_code,
      game_name: pack.game.name,
      pack_number: pack.pack_number,
      serial_start: pack.serial_start,
      serial_end: pack.serial_end,
      status: pack.status,
      current_bin_id: pack.current_bin_id,
      current_bin_name: pack.bin?.name || null,
      tickets_sold_count: pack.tickets_sold_count,
      last_sold_at: pack.last_sold_at?.toISOString() || null,
      received_at: pack.received_at?.toISOString() || null,
      activated_at: pack.activated_at?.toISOString() || null,
      depleted_at: pack.depleted_at?.toISOString() || null,
      returned_at: pack.returned_at?.toISOString() || null,
      activated_by: pack.activated_by,
      activated_shift_id: pack.activated_shift_id,
      depleted_by: pack.depleted_by,
      depletion_reason:
        pack.depletion_reason as LotteryPackSyncRecord["depletion_reason"],
      returned_by: pack.returned_by,
      return_reason: pack.return_reason as LotteryPackSyncRecord["return_reason"],
      return_notes: pack.return_notes,
      last_sold_serial: pack.last_sold_serial,
      tickets_sold_on_return: pack.tickets_sold_on_return,
      return_sales_amount: decimalToString(pack.return_sales_amount),
      serial_override_approved_by: pack.serial_override_approved_by,
      serial_override_reason: pack.serial_override_reason,
      mark_sold_approved_by: pack.mark_sold_approved_by,
      mark_sold_reason: pack.mark_sold_reason,
      ticket_price: pack.game.price.toString(),
      pack_value: pack.game.pack_value.toString(),
      updated_at: pack.updated_at.toISOString(),
      sync_sequence: sequence,
    };
  }

  // ===========================================================================
  // PULL Endpoints - Day Status
  // ===========================================================================

  /**
   * GET /api/v1/sync/lottery/day-status
   * Fetch current business day status
   *
   * DB-006: TENANT_ISOLATION - Days filtered by store_id
   */
  async getDayStatusForSync(
    storeId: string,
    businessDate?: string,
  ): Promise<LotteryDayStatusSyncResponse> {
    const where: {
      store_id: string;
      business_date?: Date;
      status?: { in: string[] };
    } = {
      store_id: storeId,
    };

    if (businessDate) {
      where.business_date = new Date(businessDate);
    } else {
      // Get OPEN or PENDING_CLOSE days (current active days)
      where.status = { in: ["OPEN", "PENDING_CLOSE"] };
    }

    const days = await prisma.lotteryBusinessDay.findMany({
      where,
      orderBy: [{ business_date: "desc" }, { created_at: "desc" }],
      take: 10, // Return recent days
    });

    const records: LotteryDayStatusSyncRecord[] = days.map((day, index) => ({
      day_id: day.day_id,
      business_date: day.business_date.toISOString().split("T")[0],
      status: day.status as "OPEN" | "PENDING_CLOSE" | "CLOSED",
      opened_at: day.opened_at.toISOString(),
      opened_by: day.opened_by,
      closed_at: day.closed_at?.toISOString() || null,
      closed_by: day.closed_by,
      notes: day.notes,
      pending_close_by: day.pending_close_by,
      pending_close_at: day.pending_close_at?.toISOString() || null,
      pending_close_expires_at:
        day.pending_close_expires_at?.toISOString() || null,
      day_summary_id: day.day_summary_id,
      updated_at: day.updated_at.toISOString(),
      sync_sequence: index + 1,
    }));

    return {
      records,
      total_count: records.length,
      current_sequence: records.length,
      has_more: false,
      server_time: getServerTime(),
    };
  }

  // ===========================================================================
  // PULL Endpoints - Shift Openings
  // ===========================================================================

  /**
   * GET /api/v1/sync/lottery/shift-openings
   * Fetch shift opening records
   */
  async getShiftOpeningsForSync(
    storeId: string,
    options: ShiftFilterOptions = {},
  ): Promise<LotteryShiftOpeningsSyncResponse> {
    const { sinceTimestamp, sinceSequence, shiftId } = options;
    const limit = sanitizeLimit(options.limit);

    // Build where clause with store isolation via shift
    const where: {
      shift: { store_id: string };
      created_at?: { gt: Date };
      shift_id?: string;
    } = {
      shift: { store_id: storeId },
    };

    if (sinceTimestamp) {
      where.created_at = { gt: sinceTimestamp };
    }

    if (shiftId) {
      where.shift_id = shiftId;
    }

    const totalCount = await prisma.lotteryShiftOpening.count({ where });

    const openings = await prisma.lotteryShiftOpening.findMany({
      where,
      orderBy: [{ created_at: "asc" }, { opening_id: "asc" }],
      take: limit + 1,
      include: {
        pack: {
          select: {
            pack_number: true,
            game: { select: { game_code: true } },
          },
        },
      },
    });

    const hasMore = openings.length > limit;
    const recordsToReturn = hasMore ? openings.slice(0, limit) : openings;

    let sequence = sinceSequence || 0;
    const records: LotteryShiftOpeningSyncRecord[] = recordsToReturn.map(
      (opening) => {
        sequence += 1;
        return {
          opening_id: opening.opening_id,
          shift_id: opening.shift_id,
          pack_id: opening.pack_id,
          pack_number: opening.pack.pack_number,
          game_code: opening.pack.game.game_code,
          opening_serial: opening.opening_serial,
          created_at: opening.created_at.toISOString(),
          sync_sequence: sequence,
        };
      },
    );

    return {
      records,
      total_count: totalCount,
      current_sequence: sequence,
      has_more: hasMore,
      server_time: getServerTime(),
      next_cursor: hasMore ? sequence : undefined,
    };
  }

  // ===========================================================================
  // PULL Endpoints - Shift Closings
  // ===========================================================================

  /**
   * GET /api/v1/sync/lottery/shift-closings
   * Fetch shift closing records
   */
  async getShiftClosingsForSync(
    storeId: string,
    options: ShiftFilterOptions = {},
  ): Promise<LotteryShiftClosingsSyncResponse> {
    const { sinceTimestamp, sinceSequence, shiftId } = options;
    const limit = sanitizeLimit(options.limit);

    const where: {
      shift: { store_id: string };
      created_at?: { gt: Date };
      shift_id?: string;
    } = {
      shift: { store_id: storeId },
    };

    if (sinceTimestamp) {
      where.created_at = { gt: sinceTimestamp };
    }

    if (shiftId) {
      where.shift_id = shiftId;
    }

    const totalCount = await prisma.lotteryShiftClosing.count({ where });

    const closings = await prisma.lotteryShiftClosing.findMany({
      where,
      orderBy: [{ created_at: "asc" }, { closing_id: "asc" }],
      take: limit + 1,
      include: {
        pack: {
          select: {
            pack_number: true,
            game: { select: { game_code: true } },
          },
        },
      },
    });

    const hasMore = closings.length > limit;
    const recordsToReturn = hasMore ? closings.slice(0, limit) : closings;

    let sequence = sinceSequence || 0;
    const records: LotteryShiftClosingSyncRecord[] = recordsToReturn.map(
      (closing) => {
        sequence += 1;
        return {
          closing_id: closing.closing_id,
          shift_id: closing.shift_id,
          pack_id: closing.pack_id,
          pack_number: closing.pack.pack_number,
          game_code: closing.pack.game.game_code,
          cashier_id: closing.cashier_id,
          closing_serial: closing.closing_serial,
          entry_method: closing.entry_method,
          manual_entry_authorized_by: closing.manual_entry_authorized_by,
          manual_entry_authorized_at:
            closing.manual_entry_authorized_at?.toISOString() || null,
          created_at: closing.created_at.toISOString(),
          sync_sequence: sequence,
        };
      },
    );

    return {
      records,
      total_count: totalCount,
      current_sequence: sequence,
      has_more: hasMore,
      server_time: getServerTime(),
      next_cursor: hasMore ? sequence : undefined,
    };
  }

  // ===========================================================================
  // PULL Endpoints - Variances
  // ===========================================================================

  /**
   * GET /api/v1/sync/lottery/variances
   * Fetch variance records
   */
  async getVariancesForSync(
    storeId: string,
    options: VarianceFilterOptions = {},
  ): Promise<LotteryVariancesSyncResponse> {
    const { sinceTimestamp, sinceSequence, shiftId, packId, unresolvedOnly } =
      options;
    const limit = sanitizeLimit(options.limit);

    const where: {
      shift: { store_id: string };
      created_at?: { gt: Date };
      shift_id?: string;
      pack_id?: string;
      approved_by?: null;
    } = {
      shift: { store_id: storeId },
    };

    if (sinceTimestamp) {
      where.created_at = { gt: sinceTimestamp };
    }

    if (shiftId) {
      where.shift_id = shiftId;
    }

    if (packId) {
      where.pack_id = packId;
    }

    if (unresolvedOnly) {
      where.approved_by = null;
    }

    const totalCount = await prisma.lotteryVariance.count({ where });

    const variances = await prisma.lotteryVariance.findMany({
      where,
      orderBy: [{ created_at: "asc" }, { variance_id: "asc" }],
      take: limit + 1,
      include: {
        pack: {
          select: {
            pack_number: true,
            game: { select: { game_code: true } },
          },
        },
      },
    });

    const hasMore = variances.length > limit;
    const recordsToReturn = hasMore ? variances.slice(0, limit) : variances;

    let sequence = sinceSequence || 0;
    const records: LotteryVarianceSyncRecord[] = recordsToReturn.map(
      (variance) => {
        sequence += 1;
        return {
          variance_id: variance.variance_id,
          shift_id: variance.shift_id,
          pack_id: variance.pack_id,
          pack_number: variance.pack.pack_number,
          game_code: variance.pack.game.game_code,
          expected: variance.expected,
          actual: variance.actual,
          difference: variance.difference,
          reason: variance.reason,
          approved_by: variance.approved_by,
          approved_at: variance.approved_at?.toISOString() || null,
          created_at: variance.created_at.toISOString(),
          sync_sequence: sequence,
        };
      },
    );

    return {
      records,
      total_count: totalCount,
      current_sequence: sequence,
      has_more: hasMore,
      server_time: getServerTime(),
      next_cursor: hasMore ? sequence : undefined,
    };
  }

  // ===========================================================================
  // PULL Endpoints - Day Packs
  // ===========================================================================

  /**
   * GET /api/v1/sync/lottery/day-packs
   * Fetch day pack records
   */
  async getDayPacksForSync(
    storeId: string,
    options: DayPackFilterOptions = {},
  ): Promise<LotteryDayPacksSyncResponse> {
    const { sinceTimestamp, sinceSequence, dayId, packId } = options;
    const limit = sanitizeLimit(options.limit);

    const where: {
      day: { store_id: string };
      updated_at?: { gt: Date };
      day_id?: string;
      pack_id?: string;
    } = {
      day: { store_id: storeId },
    };

    if (sinceTimestamp) {
      where.updated_at = { gt: sinceTimestamp };
    }

    if (dayId) {
      where.day_id = dayId;
    }

    if (packId) {
      where.pack_id = packId;
    }

    const totalCount = await prisma.lotteryDayPack.count({ where });

    const dayPacks = await prisma.lotteryDayPack.findMany({
      where,
      orderBy: [{ updated_at: "asc" }, { day_pack_id: "asc" }],
      take: limit + 1,
      include: {
        pack: {
          select: {
            pack_number: true,
            game: { select: { game_code: true } },
          },
        },
        bin: {
          select: { name: true },
        },
      },
    });

    const hasMore = dayPacks.length > limit;
    const recordsToReturn = hasMore ? dayPacks.slice(0, limit) : dayPacks;

    let sequence = sinceSequence || 0;
    const records: LotteryDayPackSyncRecord[] = recordsToReturn.map(
      (dayPack) => {
        sequence += 1;
        return {
          day_pack_id: dayPack.day_pack_id,
          day_id: dayPack.day_id,
          pack_id: dayPack.pack_id,
          pack_number: dayPack.pack.pack_number,
          game_code: dayPack.pack.game.game_code,
          bin_id: dayPack.bin_id,
          bin_name: dayPack.bin?.name || null,
          starting_serial: dayPack.starting_serial,
          ending_serial: dayPack.ending_serial,
          tickets_sold: dayPack.tickets_sold,
          sales_amount: decimalToString(dayPack.sales_amount),
          entry_method: dayPack.entry_method,
          updated_at: dayPack.updated_at.toISOString(),
          sync_sequence: sequence,
        };
      },
    );

    return {
      records,
      total_count: totalCount,
      current_sequence: sequence,
      has_more: hasMore,
      server_time: getServerTime(),
      next_cursor: hasMore ? sequence : undefined,
    };
  }

  // ===========================================================================
  // PULL Endpoints - Bin History
  // ===========================================================================

  /**
   * GET /api/v1/sync/lottery/bin-history
   * Fetch bin history records
   */
  async getBinHistoryForSync(
    storeId: string,
    options: BinHistoryFilterOptions = {},
  ): Promise<LotteryBinHistorySyncResponse> {
    const { sinceTimestamp, sinceSequence, packId, binId } = options;
    const limit = sanitizeLimit(options.limit);

    const where: {
      pack: { store_id: string };
      moved_at?: { gt: Date };
      pack_id?: string;
      bin_id?: string;
    } = {
      pack: { store_id: storeId },
    };

    if (sinceTimestamp) {
      where.moved_at = { gt: sinceTimestamp };
    }

    if (packId) {
      where.pack_id = packId;
    }

    if (binId) {
      where.bin_id = binId;
    }

    const totalCount = await prisma.lotteryPackBinHistory.count({ where });

    const history = await prisma.lotteryPackBinHistory.findMany({
      where,
      orderBy: [{ moved_at: "asc" }, { history_id: "asc" }],
      take: limit + 1,
      include: {
        pack: {
          select: { pack_number: true },
        },
        bin: {
          select: { name: true },
        },
      },
    });

    const hasMore = history.length > limit;
    const recordsToReturn = hasMore ? history.slice(0, limit) : history;

    let sequence = sinceSequence || 0;
    const records: LotteryBinHistorySyncRecord[] = recordsToReturn.map((h) => {
      sequence += 1;
      return {
        history_id: h.history_id,
        pack_id: h.pack_id,
        pack_number: h.pack.pack_number,
        bin_id: h.bin_id,
        bin_name: h.bin.name,
        moved_at: h.moved_at.toISOString(),
        moved_by: h.moved_by,
        reason: h.reason,
        sync_sequence: sequence,
      };
    });

    return {
      records,
      total_count: totalCount,
      current_sequence: sequence,
      has_more: hasMore,
      server_time: getServerTime(),
      next_cursor: hasMore ? sequence : undefined,
    };
  }

  // ===========================================================================
  // PUSH Endpoints - Pack Receive
  // ===========================================================================

  /**
   * POST /api/v1/sync/lottery/packs/receive
   * Receive a single pack
   *
   * DB-006: TENANT_ISOLATION - Pack created with store_id from session
   */
  async receivePack(
    storeId: string,
    stateId: string | null,
    input: Omit<LotteryPackReceiveInput, "session_id">,
    auditContext: LotterySyncAuditContext,
  ): Promise<LotteryPackReceiveResponse> {
    // Lookup game by code (state-scoped first, then store-scoped)
    const game = await this.lookupGameByCode(input.game_code, storeId, stateId);
    if (!game) {
      throw new Error(
        `GAME_NOT_FOUND: Game with code ${input.game_code} not found`,
      );
    }

    // Check for duplicate pack number
    const existing = await prisma.lotteryPack.findUnique({
      where: {
        store_id_pack_number: {
          store_id: storeId,
          pack_number: input.pack_number,
        },
      },
    });

    if (existing) {
      throw new Error(
        `DUPLICATE_PACK: Pack ${input.pack_number} already exists`,
      );
    }

    // Create pack
    const pack = await prisma.lotteryPack.create({
      data: {
        game_id: game.game_id,
        store_id: storeId,
        pack_number: input.pack_number,
        serial_start: input.serial_start,
        serial_end: input.serial_end,
        status: "RECEIVED",
        received_at: input.received_at
          ? new Date(input.received_at)
          : new Date(),
      },
      include: {
        game: {
          select: {
            game_code: true,
            name: true,
            price: true,
            pack_value: true,
          },
        },
        bin: { select: { name: true } },
      },
    });

    // Log audit event
    this.logSyncOperation(auditContext, "PACK_RECEIVE", {
      packId: pack.pack_id,
    }).catch((err) =>
      console.error("[LotterySyncService] Audit log error:", err),
    );

    return {
      success: true,
      pack_id: pack.pack_id,
      pack: this.mapPackToSyncRecord(pack, 0),
      server_time: getServerTime(),
    };
  }

  /**
   * POST /api/v1/sync/lottery/packs/receive/batch
   * Receive multiple packs
   */
  async receivePacksBatch(
    storeId: string,
    stateId: string | null,
    input: Omit<LotteryPackReceiveBatchInput, "session_id">,
    auditContext: LotterySyncAuditContext,
  ): Promise<LotteryPackReceiveBatchResponse> {
    const results: PackReceiveResult[] = [];
    let successCount = 0;
    let failureCount = 0;

    for (const packInput of input.packs) {
      try {
        const result = await this.receivePack(
          storeId,
          stateId,
          packInput,
          auditContext,
        );
        results.push({
          success: true,
          local_id: packInput.local_id,
          pack_id: result.pack_id,
        });
        successCount++;
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        const [errorCode, errorMessage] = message.includes(":")
          ? message.split(": ", 2)
          : ["ERROR", message];
        results.push({
          success: false,
          local_id: packInput.local_id,
          error_code: errorCode,
          error_message: errorMessage,
        });
        failureCount++;
      }
    }

    return {
      total_processed: input.packs.length,
      success_count: successCount,
      failure_count: failureCount,
      results,
      server_time: getServerTime(),
    };
  }

  // ===========================================================================
  // PUSH Endpoints - Pack Activate
  // ===========================================================================

  /**
   * POST /api/v1/sync/lottery/packs/activate
   * Activate a pack and assign to bin
   *
   * Desktop App sends all pack data with every activation request.
   * Server handles:
   * 1. Pack doesn't exist: Create it and activate
   * 2. Pack exists with RECEIVED status: Activate it
   * 3. Pack already ACTIVE in same bin: Idempotent success
   * 4. Pack ACTIVE in different bin: Error
   */
  async activatePack(
    storeId: string,
    stateId: string | null,
    input: Omit<LotteryPackActivateInput, "session_id">,
    auditContext: LotterySyncAuditContext,
  ): Promise<LotteryPackActivateResponse> {
    // Verify bin exists and belongs to store first
    const bin = await prisma.lotteryBin.findFirst({
      where: {
        bin_id: input.bin_id,
        store_id: storeId,
        is_active: true,
      },
    });

    if (!bin) {
      throw new Error("BIN_NOT_FOUND: Bin not found or inactive");
    }

    // Try to find existing pack by pack_id first
    let pack = await prisma.lotteryPack.findFirst({
      where: {
        pack_id: input.pack_id,
        store_id: storeId,
      },
    });

    // If not found by pack_id, try by pack_number (Desktop might have different UUID)
    if (!pack) {
      pack = await prisma.lotteryPack.findUnique({
        where: {
          store_id_pack_number: {
            store_id: storeId,
            pack_number: input.pack_number,
          },
        },
      });
    }

    // Idempotent: pack already ACTIVE in same bin - return success
    if (pack && pack.status === "ACTIVE" && pack.current_bin_id === input.bin_id) {
      const existingPack = await prisma.lotteryPack.findFirst({
        where: { pack_id: pack.pack_id },
        include: {
          game: {
            select: {
              game_code: true,
              name: true,
              price: true,
              pack_value: true,
            },
          },
          bin: { select: { name: true } },
        },
      });

      return {
        success: true,
        pack: this.mapPackToSyncRecord(existingPack!, 0),
        server_time: getServerTime(),
        idempotent: true,
      };
    }

    // Pack doesn't exist - create it
    if (!pack) {
      // Lookup game by code
      const game = await this.lookupGameByCode(input.game_code, storeId, stateId);
      if (!game) {
        throw new Error(
          `GAME_NOT_FOUND: Game with code ${input.game_code} not found`,
        );
      }

      // Create the pack with provided pack_id
      pack = await prisma.lotteryPack.create({
        data: {
          pack_id: input.pack_id,
          game_id: game.game_id,
          store_id: storeId,
          pack_number: input.pack_number,
          serial_start: input.serial_start,
          serial_end: input.serial_end,
          status: "RECEIVED",
          received_at: input.received_at
            ? new Date(input.received_at)
            : new Date(),
        },
      });

      // Log pack creation
      this.logSyncOperation(auditContext, "PACK_RECEIVE_VIA_ACTIVATE", {
        packId: pack.pack_id,
        packNumber: input.pack_number,
        gameCode: input.game_code,
      }).catch((err) =>
        console.error("[LotterySyncService] Audit log error:", err),
      );
    }

    // Pack must be RECEIVED to activate
    if (pack.status !== "RECEIVED") {
      // If pack is ACTIVE but in different bin, that's an error
      if (pack.status === "ACTIVE") {
        throw new Error(
          `ALREADY_ACTIVE: Pack is already active in a different bin`,
        );
      }
      throw new Error(
        `INVALID_STATUS: Pack is ${pack.status}, expected RECEIVED`,
      );
    }

    // Update pack to ACTIVE
    const updatedPack = await prisma.lotteryPack.update({
      where: { pack_id: pack.pack_id },
      data: {
        status: "ACTIVE",
        current_bin_id: input.bin_id,
        activated_at: input.activated_at
          ? new Date(input.activated_at)
          : new Date(),
        activated_by: input.mark_sold_approved_by,
        activated_shift_id: input.shift_id,
        mark_sold_approved_by: input.mark_sold_approved_by,
        mark_sold_approved_at: input.mark_sold_approved_by ? new Date() : null,
        mark_sold_reason: input.mark_sold_reason,
      },
      include: {
        game: {
          select: {
            game_code: true,
            name: true,
            price: true,
            pack_value: true,
          },
        },
        bin: { select: { name: true } },
      },
    });

    // Create bin history entry
    // Note: moved_by is nullable for device API operations without user context
    await prisma.lotteryPackBinHistory.create({
      data: {
        pack_id: pack.pack_id,
        bin_id: input.bin_id,
        moved_by: input.mark_sold_approved_by || null, // Use null if no user provided
        reason: "ACTIVATION",
      },
    });

    // Log audit event
    this.logSyncOperation(auditContext, "PACK_ACTIVATE", {
      packId: pack.pack_id,
      binId: input.bin_id,
    }).catch((err) =>
      console.error("[LotterySyncService] Audit log error:", err),
    );

    return {
      success: true,
      pack: this.mapPackToSyncRecord(updatedPack, 0),
      server_time: getServerTime(),
    };
  }

  // ===========================================================================
  // PUSH Endpoints - Pack Move
  // ===========================================================================

  /**
   * POST /api/v1/sync/lottery/packs/move
   * Move a pack between bins
   */
  async movePack(
    storeId: string,
    input: Omit<LotteryPackMoveInput, "session_id">,
    auditContext: LotterySyncAuditContext,
  ): Promise<LotteryPackMoveResponse> {
    // Verify pack exists and belongs to store
    const pack = await prisma.lotteryPack.findFirst({
      where: {
        pack_id: input.pack_id,
        store_id: storeId,
      },
    });

    if (!pack) {
      throw new Error(
        "PACK_NOT_FOUND: Pack not found or does not belong to this store",
      );
    }

    if (pack.current_bin_id !== input.from_bin_id) {
      throw new Error("BIN_MISMATCH: Pack is not in the specified source bin");
    }

    // Verify target bin exists
    const targetBin = await prisma.lotteryBin.findFirst({
      where: {
        bin_id: input.to_bin_id,
        store_id: storeId,
        is_active: true,
      },
    });

    if (!targetBin) {
      throw new Error("BIN_NOT_FOUND: Target bin not found or inactive");
    }

    // Update pack and create history in transaction
    const [updatedPack, historyRecord] = await prisma.$transaction([
      prisma.lotteryPack.update({
        where: { pack_id: input.pack_id },
        data: { current_bin_id: input.to_bin_id },
        include: {
          game: {
            select: {
              game_code: true,
              name: true,
              price: true,
              pack_value: true,
            },
          },
          bin: { select: { name: true } },
        },
      }),
      // Note: moved_by is null for device API operations without user context
      prisma.lotteryPackBinHistory.create({
        data: {
          pack_id: input.pack_id,
          bin_id: input.to_bin_id,
          moved_by: null, // Device API operations don't have user context
          moved_at: input.moved_at ? new Date(input.moved_at) : new Date(),
          reason: input.reason,
        },
        include: {
          pack: { select: { pack_number: true } },
          bin: { select: { name: true } },
        },
      }),
    ]);

    // Log audit event
    this.logSyncOperation(auditContext, "PACK_MOVE", {
      packId: input.pack_id,
      fromBinId: input.from_bin_id,
      toBinId: input.to_bin_id,
    }).catch((err) =>
      console.error("[LotterySyncService] Audit log error:", err),
    );

    return {
      success: true,
      pack: this.mapPackToSyncRecord(updatedPack, 0),
      history_record: {
        history_id: historyRecord.history_id,
        pack_id: historyRecord.pack_id,
        pack_number: historyRecord.pack.pack_number,
        bin_id: historyRecord.bin_id,
        bin_name: historyRecord.bin.name,
        moved_at: historyRecord.moved_at.toISOString(),
        moved_by: historyRecord.moved_by,
        reason: historyRecord.reason,
        sync_sequence: 0,
      },
      server_time: getServerTime(),
    };
  }

  // ===========================================================================
  // PUSH Endpoints - Pack Deplete
  // ===========================================================================

  /**
   * POST /api/v1/sync/lottery/packs/deplete
   * Mark a pack as sold out
   */
  async depletePack(
    storeId: string,
    input: Omit<LotteryPackDepleteInput, "session_id">,
    auditContext: LotterySyncAuditContext,
  ): Promise<LotteryPackDepleteResponse> {
    // Verify pack exists and belongs to store
    const pack = await prisma.lotteryPack.findFirst({
      where: {
        pack_id: input.pack_id,
        store_id: storeId,
      },
    });

    if (!pack) {
      throw new Error(
        "PACK_NOT_FOUND: Pack not found or does not belong to this store",
      );
    }

    if (pack.status !== "ACTIVE") {
      throw new Error(
        `INVALID_STATUS: Pack is ${pack.status}, expected ACTIVE`,
      );
    }

    // Update pack
    const updatedPack = await prisma.lotteryPack.update({
      where: { pack_id: input.pack_id },
      data: {
        status: "DEPLETED",
        depleted_at: input.depleted_at
          ? new Date(input.depleted_at)
          : new Date(),
        depleted_by: auditContext.apiKeyId,
        depleted_shift_id: input.shift_id,
        depletion_reason: input.depletion_reason,
      },
      include: {
        game: {
          select: {
            game_code: true,
            name: true,
            price: true,
            pack_value: true,
          },
        },
        bin: { select: { name: true } },
      },
    });

    // Log audit event
    this.logSyncOperation(auditContext, "PACK_DEPLETE", {
      packId: input.pack_id,
      reason: input.depletion_reason,
    }).catch((err) =>
      console.error("[LotterySyncService] Audit log error:", err),
    );

    return {
      success: true,
      pack: this.mapPackToSyncRecord(updatedPack, 0),
      server_time: getServerTime(),
    };
  }

  // ===========================================================================
  // PUSH Endpoints - Pack Return
  // ===========================================================================

  /**
   * POST /api/v1/sync/lottery/packs/return
   * Return a pack to supplier
   */
  async returnPack(
    storeId: string,
    input: Omit<LotteryPackReturnInput, "session_id">,
    auditContext: LotterySyncAuditContext,
  ): Promise<LotteryPackReturnResponse> {
    // Verify pack exists and belongs to store
    const pack = await prisma.lotteryPack.findFirst({
      where: {
        pack_id: input.pack_id,
        store_id: storeId,
      },
    });

    if (!pack) {
      throw new Error(
        "PACK_NOT_FOUND: Pack not found or does not belong to this store",
      );
    }

    if (pack.status === "RETURNED") {
      throw new Error("ALREADY_RETURNED: Pack has already been returned");
    }

    // Calculate return sales amount if tickets sold provided
    let returnSalesAmount: Decimal | undefined;
    if (input.tickets_sold_on_return !== undefined) {
      const packWithGame = await prisma.lotteryPack.findUnique({
        where: { pack_id: input.pack_id },
        include: { game: { select: { price: true } } },
      });
      if (packWithGame?.game.price) {
        returnSalesAmount = packWithGame.game.price.mul(
          input.tickets_sold_on_return,
        );
      }
    }

    // Update pack
    const updatedPack = await prisma.lotteryPack.update({
      where: { pack_id: input.pack_id },
      data: {
        status: "RETURNED",
        returned_at: input.returned_at
          ? new Date(input.returned_at)
          : new Date(),
        returned_by: auditContext.apiKeyId,
        returned_shift_id: input.shift_id,
        returned_day_id: input.day_id,
        return_reason: input.return_reason,
        return_notes: input.return_notes,
        last_sold_serial: input.last_sold_serial,
        tickets_sold_on_return: input.tickets_sold_on_return,
        return_sales_amount: returnSalesAmount,
      },
      include: {
        game: {
          select: {
            game_code: true,
            name: true,
            price: true,
            pack_value: true,
          },
        },
        bin: { select: { name: true } },
      },
    });

    // Log audit event
    this.logSyncOperation(auditContext, "PACK_RETURN", {
      packId: input.pack_id,
      reason: input.return_reason,
    }).catch((err) =>
      console.error("[LotterySyncService] Audit log error:", err),
    );

    return {
      success: true,
      pack: this.mapPackToSyncRecord(updatedPack, 0),
      server_time: getServerTime(),
    };
  }

  // ===========================================================================
  // PUSH Endpoints - Shift Open
  // ===========================================================================

  /**
   * POST /api/v1/sync/lottery/shift/open
   * Record shift opening serials
   */
  async recordShiftOpenings(
    storeId: string,
    input: Omit<LotteryShiftOpenInput, "session_id">,
    auditContext: LotterySyncAuditContext,
  ): Promise<LotteryShiftOpenResponse> {
    // Verify shift exists and belongs to store
    const shift = await prisma.shift.findFirst({
      where: {
        shift_id: input.shift_id,
        store_id: storeId,
      },
    });

    if (!shift) {
      throw new Error(
        "SHIFT_NOT_FOUND: Shift not found or does not belong to this store",
      );
    }

    // Create openings in transaction
    const openings = await prisma.$transaction(
      input.openings.map((opening) =>
        prisma.lotteryShiftOpening.upsert({
          where: {
            shift_id_pack_id: {
              shift_id: input.shift_id,
              pack_id: opening.pack_id,
            },
          },
          create: {
            shift_id: input.shift_id,
            pack_id: opening.pack_id,
            opening_serial: opening.opening_serial,
          },
          update: {
            opening_serial: opening.opening_serial,
          },
          include: {
            pack: {
              select: {
                pack_number: true,
                game: { select: { game_code: true } },
              },
            },
          },
        }),
      ),
    );

    // Log audit event
    this.logSyncOperation(auditContext, "SHIFT_OPEN", {
      shiftId: input.shift_id,
      openingCount: openings.length,
    }).catch((err) =>
      console.error("[LotterySyncService] Audit log error:", err),
    );

    return {
      success: true,
      openings: openings.map((o) => ({
        opening_id: o.opening_id,
        shift_id: o.shift_id,
        pack_id: o.pack_id,
        pack_number: o.pack.pack_number,
        game_code: o.pack.game.game_code,
        opening_serial: o.opening_serial,
        created_at: o.created_at.toISOString(),
        sync_sequence: 0,
      })),
      server_time: getServerTime(),
    };
  }

  // ===========================================================================
  // PUSH Endpoints - Shift Close
  // ===========================================================================

  /**
   * POST /api/v1/sync/lottery/shift/close
   * Record shift closing serials
   */
  async recordShiftClosings(
    storeId: string,
    input: Omit<LotteryShiftCloseInput, "session_id">,
    auditContext: LotterySyncAuditContext,
  ): Promise<LotteryShiftCloseResponse> {
    // Verify shift exists and belongs to store
    const shift = await prisma.shift.findFirst({
      where: {
        shift_id: input.shift_id,
        store_id: storeId,
      },
    });

    if (!shift) {
      throw new Error(
        "SHIFT_NOT_FOUND: Shift not found or does not belong to this store",
      );
    }

    // Create closings in transaction
    const closings = await prisma.$transaction(
      input.closings.map((closing) =>
        prisma.lotteryShiftClosing.upsert({
          where: {
            shift_id_pack_id: {
              shift_id: input.shift_id,
              pack_id: closing.pack_id,
            },
          },
          create: {
            shift_id: input.shift_id,
            pack_id: closing.pack_id,
            cashier_id: input.cashier_id,
            closing_serial: closing.closing_serial,
            entry_method: closing.entry_method,
            manual_entry_authorized_by: input.manual_entry_authorized_by,
            manual_entry_authorized_at: input.manual_entry_authorized_by
              ? new Date()
              : null,
          },
          update: {
            closing_serial: closing.closing_serial,
            entry_method: closing.entry_method,
            manual_entry_authorized_by: input.manual_entry_authorized_by,
            manual_entry_authorized_at: input.manual_entry_authorized_by
              ? new Date()
              : null,
          },
          include: {
            pack: {
              select: {
                pack_number: true,
                game: { select: { game_code: true } },
              },
            },
          },
        }),
      ),
    );

    // Detect variances by comparing opening and closing serials
    const variances: LotteryVarianceSyncRecord[] = [];
    for (const closing of closings) {
      const opening = await prisma.lotteryShiftOpening.findUnique({
        where: {
          shift_id_pack_id: {
            shift_id: input.shift_id,
            pack_id: closing.pack_id,
          },
        },
      });

      if (opening) {
        const openingSerial = parseInt(opening.opening_serial, 10);
        const closingSerial = parseInt(closing.closing_serial, 10);
        if (!isNaN(openingSerial) && !isNaN(closingSerial)) {
          const expected = closingSerial - openingSerial;
          // TODO: Get actual sold count from transactions
          const actual = expected; // Placeholder
          if (expected !== actual) {
            const variance = await prisma.lotteryVariance.create({
              data: {
                shift_id: input.shift_id,
                pack_id: closing.pack_id,
                expected,
                actual,
                difference: actual - expected,
              },
              include: {
                pack: {
                  select: {
                    pack_number: true,
                    game: { select: { game_code: true } },
                  },
                },
              },
            });

            variances.push({
              variance_id: variance.variance_id,
              shift_id: variance.shift_id,
              pack_id: variance.pack_id,
              pack_number: variance.pack.pack_number,
              game_code: variance.pack.game.game_code,
              expected: variance.expected,
              actual: variance.actual,
              difference: variance.difference,
              reason: null,
              approved_by: null,
              approved_at: null,
              created_at: variance.created_at.toISOString(),
              sync_sequence: 0,
            });
          }
        }
      }
    }

    // Log audit event
    this.logSyncOperation(auditContext, "SHIFT_CLOSE", {
      shiftId: input.shift_id,
      closingCount: closings.length,
      varianceCount: variances.length,
    }).catch((err) =>
      console.error("[LotterySyncService] Audit log error:", err),
    );

    return {
      success: true,
      closings: closings.map((c) => ({
        closing_id: c.closing_id,
        shift_id: c.shift_id,
        pack_id: c.pack_id,
        pack_number: c.pack.pack_number,
        game_code: c.pack.game.game_code,
        cashier_id: c.cashier_id,
        closing_serial: c.closing_serial,
        entry_method: c.entry_method,
        manual_entry_authorized_by: c.manual_entry_authorized_by,
        manual_entry_authorized_at:
          c.manual_entry_authorized_at?.toISOString() || null,
        created_at: c.created_at.toISOString(),
        sync_sequence: 0,
      })),
      variances,
      server_time: getServerTime(),
    };
  }

  // ===========================================================================
  // PUSH Endpoints - Day Close
  // ===========================================================================

  /**
   * POST /api/v1/sync/lottery/day/prepare-close
   * Phase 1: Validate and stage day close (two-phase commit)
   */
  async prepareDayClose(
    storeId: string,
    input: Omit<LotteryDayPrepareCloseInput, "session_id">,
    auditContext: LotterySyncAuditContext,
  ): Promise<LotteryDayPrepareCloseResponse> {
    // Verify day exists and belongs to store
    const day = await prisma.lotteryBusinessDay.findFirst({
      where: {
        day_id: input.day_id,
        store_id: storeId,
      },
    });

    if (!day) {
      throw new Error(
        "DAY_NOT_FOUND: Day not found or does not belong to this store",
      );
    }

    if (day.status !== "OPEN") {
      throw new Error(`INVALID_STATUS: Day is ${day.status}, expected OPEN`);
    }

    // Calculate expiration time
    const expiresAt = new Date();
    expiresAt.setMinutes(expiresAt.getMinutes() + (input.expire_minutes || 60));

    // Prepare pending close data
    const pendingCloseData = {
      closings: input.closings,
      entry_method: "SCAN",
      authorized_by_user_id: input.manual_entry_authorized_by,
    };

    // Update day to PENDING_CLOSE status
    await prisma.lotteryBusinessDay.update({
      where: { day_id: input.day_id },
      data: {
        status: "PENDING_CLOSE",
        pending_close_data: pendingCloseData,
        pending_close_by: input.initiated_by,
        pending_close_at: new Date(),
        pending_close_expires_at: expiresAt,
      },
    });

    // Log audit event
    this.logSyncOperation(auditContext, "DAY_PREPARE_CLOSE", {
      dayId: input.day_id,
      closingCount: input.closings.length,
    }).catch((err) =>
      console.error("[LotterySyncService] Audit log error:", err),
    );

    return {
      success: true,
      day_id: input.day_id,
      status: "PENDING_CLOSE",
      expires_at: expiresAt.toISOString(),
      server_time: getServerTime(),
    };
  }

  /**
   * POST /api/v1/sync/lottery/day/commit-close
   * Phase 2: Finalize day close
   */
  async commitDayClose(
    storeId: string,
    input: Omit<LotteryDayCommitCloseInput, "session_id">,
    auditContext: LotterySyncAuditContext,
  ): Promise<LotteryDayCommitCloseResponse> {
    // Verify day exists and is in PENDING_CLOSE status
    const day = await prisma.lotteryBusinessDay.findFirst({
      where: {
        day_id: input.day_id,
        store_id: storeId,
      },
    });

    if (!day) {
      throw new Error(
        "DAY_NOT_FOUND: Day not found or does not belong to this store",
      );
    }

    if (day.status !== "PENDING_CLOSE") {
      throw new Error(
        `INVALID_STATUS: Day is ${day.status}, expected PENDING_CLOSE`,
      );
    }

    // Check if pending close has expired
    if (
      day.pending_close_expires_at &&
      day.pending_close_expires_at < new Date()
    ) {
      throw new Error(
        "EXPIRED: Pending close has expired, please prepare close again",
      );
    }

    // Parse pending close data
    const pendingData = day.pending_close_data as {
      closings: Array<{
        pack_id: string;
        ending_serial: string;
        entry_method?: string;
        bin_id?: string;
      }>;
    };

    // Create day pack records and calculate totals
    const dayPackRecords: LotteryDayPackSyncRecord[] = [];
    let totalTicketsSold = 0;
    let totalSalesAmount = new Decimal(0);

    for (const closing of pendingData.closings) {
      // Get pack with game info for price calculation
      const pack = await prisma.lotteryPack.findUnique({
        where: { pack_id: closing.pack_id },
        include: {
          game: { select: { price: true, game_code: true } },
        },
      });

      if (!pack) continue;

      // Get starting serial from previous day close or use "000"
      const lastDayPack = await prisma.lotteryDayPack.findFirst({
        where: { pack_id: closing.pack_id },
        orderBy: { created_at: "desc" },
      });

      const startingSerial = lastDayPack?.ending_serial || "000";
      const startNum = parseInt(startingSerial, 10);
      const endNum = parseInt(closing.ending_serial, 10);
      const ticketsSold =
        !isNaN(startNum) && !isNaN(endNum) ? endNum - startNum : 0;
      const salesAmount = pack.game.price.mul(ticketsSold);

      totalTicketsSold += ticketsSold;
      totalSalesAmount = totalSalesAmount.add(salesAmount);

      // Create day pack record
      const dayPack = await prisma.lotteryDayPack.create({
        data: {
          day_id: input.day_id,
          pack_id: closing.pack_id,
          bin_id: closing.bin_id,
          starting_serial: startingSerial,
          ending_serial: closing.ending_serial,
          tickets_sold: ticketsSold,
          sales_amount: salesAmount,
          entry_method: closing.entry_method,
        },
        include: {
          pack: {
            select: {
              pack_number: true,
              game: { select: { game_code: true } },
            },
          },
          bin: { select: { name: true } },
        },
      });

      dayPackRecords.push({
        day_pack_id: dayPack.day_pack_id,
        day_id: dayPack.day_id,
        pack_id: dayPack.pack_id,
        pack_number: dayPack.pack.pack_number,
        game_code: dayPack.pack.game.game_code,
        bin_id: dayPack.bin_id,
        bin_name: dayPack.bin?.name || null,
        starting_serial: dayPack.starting_serial,
        ending_serial: dayPack.ending_serial,
        tickets_sold: dayPack.tickets_sold,
        sales_amount: decimalToString(dayPack.sales_amount),
        entry_method: dayPack.entry_method,
        updated_at: dayPack.updated_at.toISOString(),
        sync_sequence: 0,
      });
    }

    // Update day to CLOSED status
    await prisma.lotteryBusinessDay.update({
      where: { day_id: input.day_id },
      data: {
        status: "CLOSED",
        closed_at: new Date(),
        closed_by: input.closed_by,
        notes: input.notes,
        pending_close_data: Prisma.DbNull,
        pending_close_by: null,
        pending_close_at: null,
        pending_close_expires_at: null,
      },
    });

    // Log audit event
    this.logSyncOperation(auditContext, "DAY_COMMIT_CLOSE", {
      dayId: input.day_id,
      packCount: dayPackRecords.length,
      totalTicketsSold,
      totalSalesAmount: totalSalesAmount.toString(),
    }).catch((err) =>
      console.error("[LotterySyncService] Audit log error:", err),
    );

    return {
      success: true,
      day_id: input.day_id,
      status: "CLOSED",
      day_packs: dayPackRecords,
      summary: {
        total_packs: dayPackRecords.length,
        total_tickets_sold: totalTicketsSold,
        total_sales_amount: totalSalesAmount.toString(),
      },
      server_time: getServerTime(),
    };
  }

  /**
   * POST /api/v1/sync/lottery/day/cancel-close
   * Rollback pending close
   */
  async cancelDayClose(
    storeId: string,
    input: Omit<LotteryDayCancelCloseInput, "session_id">,
    auditContext: LotterySyncAuditContext,
  ): Promise<LotteryDayCancelCloseResponse> {
    // Verify day exists and is in PENDING_CLOSE status
    const day = await prisma.lotteryBusinessDay.findFirst({
      where: {
        day_id: input.day_id,
        store_id: storeId,
      },
    });

    if (!day) {
      throw new Error(
        "DAY_NOT_FOUND: Day not found or does not belong to this store",
      );
    }

    if (day.status !== "PENDING_CLOSE") {
      throw new Error(
        `INVALID_STATUS: Day is ${day.status}, expected PENDING_CLOSE`,
      );
    }

    // Update day back to OPEN status
    await prisma.lotteryBusinessDay.update({
      where: { day_id: input.day_id },
      data: {
        status: "OPEN",
        pending_close_data: Prisma.DbNull,
        pending_close_by: null,
        pending_close_at: null,
        pending_close_expires_at: null,
      },
    });

    // Log audit event
    this.logSyncOperation(auditContext, "DAY_CANCEL_CLOSE", {
      dayId: input.day_id,
      cancelledBy: input.cancelled_by,
      reason: input.reason,
    }).catch((err) =>
      console.error("[LotterySyncService] Audit log error:", err),
    );

    return {
      success: true,
      day_id: input.day_id,
      status: "OPEN",
      server_time: getServerTime(),
    };
  }

  // ===========================================================================
  // PUSH Endpoints - Variance Approval
  // ===========================================================================

  /**
   * POST /api/v1/sync/lottery/variances/approve
   * Approve a variance
   */
  async approveVariance(
    storeId: string,
    input: Omit<LotteryVarianceApproveInput, "session_id">,
    auditContext: LotterySyncAuditContext,
  ): Promise<LotteryVarianceApproveResponse> {
    // Verify variance exists and belongs to store (via shift)
    const variance = await prisma.lotteryVariance.findFirst({
      where: {
        variance_id: input.variance_id,
        shift: { store_id: storeId },
      },
      include: {
        pack: {
          select: {
            pack_number: true,
            game: { select: { game_code: true } },
          },
        },
      },
    });

    if (!variance) {
      throw new Error(
        "VARIANCE_NOT_FOUND: Variance not found or does not belong to this store",
      );
    }

    if (variance.approved_by) {
      throw new Error("ALREADY_APPROVED: Variance has already been approved");
    }

    // Update variance
    const updatedVariance = await prisma.lotteryVariance.update({
      where: { variance_id: input.variance_id },
      data: {
        approved_by: input.approved_by,
        approved_at: new Date(),
        reason: input.approval_notes || variance.reason,
      },
      include: {
        pack: {
          select: {
            pack_number: true,
            game: { select: { game_code: true } },
          },
        },
      },
    });

    // Log audit event
    this.logSyncOperation(auditContext, "VARIANCE_APPROVE", {
      varianceId: input.variance_id,
      approvedBy: input.approved_by,
    }).catch((err) =>
      console.error("[LotterySyncService] Audit log error:", err),
    );

    return {
      success: true,
      variance: {
        variance_id: updatedVariance.variance_id,
        shift_id: updatedVariance.shift_id,
        pack_id: updatedVariance.pack_id,
        pack_number: updatedVariance.pack.pack_number,
        game_code: updatedVariance.pack.game.game_code,
        expected: updatedVariance.expected,
        actual: updatedVariance.actual,
        difference: updatedVariance.difference,
        reason: updatedVariance.reason,
        approved_by: updatedVariance.approved_by,
        approved_at: updatedVariance.approved_at?.toISOString() || null,
        created_at: updatedVariance.created_at.toISOString(),
        sync_sequence: 0,
      },
      server_time: getServerTime(),
    };
  }

  // ===========================================================================
  // Helper Methods
  // ===========================================================================

  /**
   * Lookup game by code with proper scoping
   * Priority: state-scoped > store-scoped
   */
  private async lookupGameByCode(
    gameCode: string,
    storeId: string,
    stateId: string | null,
  ): Promise<{ game_id: string } | null> {
    // First try state-scoped game
    if (stateId) {
      const stateGame = await prisma.lotteryGame.findFirst({
        where: {
          game_code: gameCode,
          state_id: stateId,
          status: "ACTIVE",
        },
        select: { game_id: true },
      });
      if (stateGame) return stateGame;
    }

    // Then try store-scoped game
    const storeGame = await prisma.lotteryGame.findFirst({
      where: {
        game_code: gameCode,
        store_id: storeId,
        status: "ACTIVE",
      },
      select: { game_id: true },
    });

    return storeGame;
  }

  /**
   * Log sync operation for audit trail
   */
  private async logSyncOperation(
    context: LotterySyncAuditContext,
    operation: string,
    details: Record<string, unknown>,
  ): Promise<void> {
    await apiKeyAuditService.logCustomEvent(
      context.apiKeyId,
      "SYNC_STARTED", // Using existing event type
      "DEVICE",
      context.ipAddress,
      undefined,
      {
        syncType: `LOTTERY_${operation}`,
        sessionId: context.sessionId,
        deviceFingerprint: context.deviceFingerprint,
        ...details,
      },
    );
  }

  // ===========================================================================
  // Public Wrapper Methods with Session Validation
  // ===========================================================================

  /**
   * Full sync operation with validation and audit logging
   */
  async syncGames(
    identity: ApiKeyIdentity,
    sessionId: string,
    options: LotterySyncOptions,
    auditContext: LotterySyncAuditContext,
  ): Promise<LotteryGamesSyncResponse> {
    const { storeId, stateId } = await this.validateSyncSession(
      sessionId,
      identity.apiKeyId,
    );

    // Double-check store isolation
    if (storeId !== identity.storeId) {
      throw new Error(
        "STORE_MISMATCH: Session store does not match API key store",
      );
    }

    const response = await this.getGamesForSync(storeId, stateId, options);

    this.logSyncOperation(auditContext, "GAMES_SYNC", {
      recordCount: response.records.length,
    }).catch((err) =>
      console.error("[LotterySyncService] Audit log error:", err),
    );

    return response;
  }

  async syncConfig(
    identity: ApiKeyIdentity,
    sessionId: string,
    options: LotterySyncOptions,
    auditContext: LotterySyncAuditContext,
  ): Promise<LotteryConfigSyncResponse> {
    await this.validateSyncSession(sessionId, identity.apiKeyId);

    const response = await this.getConfigForSync(options);

    this.logSyncOperation(auditContext, "CONFIG_SYNC", {
      recordCount: response.records.length,
    }).catch((err) =>
      console.error("[LotterySyncService] Audit log error:", err),
    );

    return response;
  }

  async syncBins(
    identity: ApiKeyIdentity,
    sessionId: string,
    options: LotterySyncOptions,
    auditContext: LotterySyncAuditContext,
  ): Promise<LotteryBinsSyncResponse> {
    const { storeId } = await this.validateSyncSession(
      sessionId,
      identity.apiKeyId,
    );

    if (storeId !== identity.storeId) {
      throw new Error(
        "STORE_MISMATCH: Session store does not match API key store",
      );
    }

    const response = await this.getBinsForSync(storeId, options);

    this.logSyncOperation(auditContext, "BINS_SYNC", {
      recordCount: response.records.length,
    }).catch((err) =>
      console.error("[LotterySyncService] Audit log error:", err),
    );

    return response;
  }

  async syncPacks(
    identity: ApiKeyIdentity,
    sessionId: string,
    status: LotteryPackStatus,
    options: PackFilterOptions,
    auditContext: LotterySyncAuditContext,
  ): Promise<LotteryPacksSyncResponse> {
    const { storeId } = await this.validateSyncSession(
      sessionId,
      identity.apiKeyId,
    );

    if (storeId !== identity.storeId) {
      throw new Error(
        "STORE_MISMATCH: Session store does not match API key store",
      );
    }

    const response = await this.getPacksForSync(storeId, status, options);

    this.logSyncOperation(auditContext, `PACKS_${status}_SYNC`, {
      recordCount: response.records.length,
    }).catch((err) =>
      console.error("[LotterySyncService] Audit log error:", err),
    );

    return response;
  }

  async syncDayStatus(
    identity: ApiKeyIdentity,
    sessionId: string,
    businessDate: string | undefined,
    auditContext: LotterySyncAuditContext,
  ): Promise<LotteryDayStatusSyncResponse> {
    const { storeId } = await this.validateSyncSession(
      sessionId,
      identity.apiKeyId,
    );

    if (storeId !== identity.storeId) {
      throw new Error(
        "STORE_MISMATCH: Session store does not match API key store",
      );
    }

    const response = await this.getDayStatusForSync(storeId, businessDate);

    this.logSyncOperation(auditContext, "DAY_STATUS_SYNC", {
      recordCount: response.records.length,
    }).catch((err) =>
      console.error("[LotterySyncService] Audit log error:", err),
    );

    return response;
  }

  async syncShiftOpenings(
    identity: ApiKeyIdentity,
    sessionId: string,
    options: ShiftFilterOptions,
    auditContext: LotterySyncAuditContext,
  ): Promise<LotteryShiftOpeningsSyncResponse> {
    const { storeId } = await this.validateSyncSession(
      sessionId,
      identity.apiKeyId,
    );

    if (storeId !== identity.storeId) {
      throw new Error(
        "STORE_MISMATCH: Session store does not match API key store",
      );
    }

    const response = await this.getShiftOpeningsForSync(storeId, options);

    this.logSyncOperation(auditContext, "SHIFT_OPENINGS_SYNC", {
      recordCount: response.records.length,
    }).catch((err) =>
      console.error("[LotterySyncService] Audit log error:", err),
    );

    return response;
  }

  async syncShiftClosings(
    identity: ApiKeyIdentity,
    sessionId: string,
    options: ShiftFilterOptions,
    auditContext: LotterySyncAuditContext,
  ): Promise<LotteryShiftClosingsSyncResponse> {
    const { storeId } = await this.validateSyncSession(
      sessionId,
      identity.apiKeyId,
    );

    if (storeId !== identity.storeId) {
      throw new Error(
        "STORE_MISMATCH: Session store does not match API key store",
      );
    }

    const response = await this.getShiftClosingsForSync(storeId, options);

    this.logSyncOperation(auditContext, "SHIFT_CLOSINGS_SYNC", {
      recordCount: response.records.length,
    }).catch((err) =>
      console.error("[LotterySyncService] Audit log error:", err),
    );

    return response;
  }

  async syncVariances(
    identity: ApiKeyIdentity,
    sessionId: string,
    options: VarianceFilterOptions,
    auditContext: LotterySyncAuditContext,
  ): Promise<LotteryVariancesSyncResponse> {
    const { storeId } = await this.validateSyncSession(
      sessionId,
      identity.apiKeyId,
    );

    if (storeId !== identity.storeId) {
      throw new Error(
        "STORE_MISMATCH: Session store does not match API key store",
      );
    }

    const response = await this.getVariancesForSync(storeId, options);

    this.logSyncOperation(auditContext, "VARIANCES_SYNC", {
      recordCount: response.records.length,
    }).catch((err) =>
      console.error("[LotterySyncService] Audit log error:", err),
    );

    return response;
  }

  async syncDayPacks(
    identity: ApiKeyIdentity,
    sessionId: string,
    options: DayPackFilterOptions,
    auditContext: LotterySyncAuditContext,
  ): Promise<LotteryDayPacksSyncResponse> {
    const { storeId } = await this.validateSyncSession(
      sessionId,
      identity.apiKeyId,
    );

    if (storeId !== identity.storeId) {
      throw new Error(
        "STORE_MISMATCH: Session store does not match API key store",
      );
    }

    const response = await this.getDayPacksForSync(storeId, options);

    this.logSyncOperation(auditContext, "DAY_PACKS_SYNC", {
      recordCount: response.records.length,
    }).catch((err) =>
      console.error("[LotterySyncService] Audit log error:", err),
    );

    return response;
  }

  async syncBinHistory(
    identity: ApiKeyIdentity,
    sessionId: string,
    options: BinHistoryFilterOptions,
    auditContext: LotterySyncAuditContext,
  ): Promise<LotteryBinHistorySyncResponse> {
    const { storeId } = await this.validateSyncSession(
      sessionId,
      identity.apiKeyId,
    );

    if (storeId !== identity.storeId) {
      throw new Error(
        "STORE_MISMATCH: Session store does not match API key store",
      );
    }

    const response = await this.getBinHistoryForSync(storeId, options);

    this.logSyncOperation(auditContext, "BIN_HISTORY_SYNC", {
      recordCount: response.records.length,
    }).catch((err) =>
      console.error("[LotterySyncService] Audit log error:", err),
    );

    return response;
  }
}

// Export singleton instance
export const lotterySyncService = new LotterySyncService();
