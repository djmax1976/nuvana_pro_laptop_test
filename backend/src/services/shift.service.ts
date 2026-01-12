/**
 * Shift Service
 *
 * Business logic for shift operations.
 * Story 4.2: Shift Opening API
 *
 * IMPORTANT: All status transitions MUST use the ShiftStateMachine service.
 * This ensures consistent behavior across the entire application.
 */

import { ShiftStatus, Prisma } from "@prisma/client";
import { prisma } from "../utils/db";
import { OpenShiftInput } from "../schemas/shift.schema";
import { rbacService } from "./rbac.service";
import { ShiftReportData } from "../types/shift-report.types";
import { getRedisClient } from "../utils/redis";
import { toStoreTime, toUTC } from "../utils/timezone.utils";
import { startOfDay, addDays } from "date-fns";
import * as crypto from "crypto";
import { shiftSummaryService } from "./shift-summary.service";
import {
  shiftStateMachine,
  UNCLOSED_SHIFT_STATUSES,
  type TransitionContext,
} from "./shift-state-machine";
import type { ShiftLotterySummaryResponse } from "../types/shift-lottery-summary.types";
import { daySummaryService } from "./day-summary.service";
import { DaySummaryStatus } from "@prisma/client";

/**
 * Audit context for logging operations
 */
export interface AuditContext {
  userId: string;
  userEmail: string;
  userRoles: string[];
  ipAddress: string | null;
  userAgent: string | null;
}

/**
 * Result of shift closing initiation
 */
export interface ShiftClosingResult {
  shift_id: string;
  status: ShiftStatus;
  closing_initiated_at: Date;
  closing_initiated_by: string;
  expected_cash: number;
  opening_cash: number;
  cash_transactions_total: number;
  calculated_at: Date;
}

/**
 * Result of cash reconciliation
 */
export interface ReconciliationResult {
  shift_id: string;
  status: ShiftStatus;
  closing_cash: number;
  expected_cash: number;
  variance_amount: number;
  variance_percentage: number;
  variance_reason?: string;
  reconciled_at: Date;
  reconciled_by: string;
}

/**
 * Result of variance approval
 */
export interface ApprovalResult {
  shift_id: string;
  status: ShiftStatus;
  closing_cash: number;
  expected_cash: number;
  variance_amount: number;
  variance_percentage: number;
  variance_reason: string;
  approved_by: string;
  approved_at: Date;
  closed_at: Date;
}

/**
 * Result of direct shift close (simplified single-step flow)
 * Story: Simplified Shift Closing - single step OPEN/ACTIVE → CLOSED
 */
export interface DirectCloseResult {
  shift_id: string;
  status: ShiftStatus;
  closing_cash: number;
  closed_at: Date;
  closed_by: string;
}

/**
 * Shift query filters
 * Story 4.7: Shift Management UI
 */
export interface ShiftQueryFilters {
  status?: ShiftStatus;
  store_id?: string;
  from?: string; // ISO 8601 date string
  to?: string; // ISO 8601 date string
}

/**
 * Pagination options
 */
export interface PaginationOptions {
  limit: number;
  offset: number;
}

/**
 * Shift response for list queries
 * Story 4.7: Shift Management UI
 *
 * Enterprise Standards Applied:
 * - DB-006: TENANT_ISOLATION - day_summary_id links to store-scoped day summary
 * - API-008: OUTPUT_FILTERING - Only display-safe fields included
 */
export interface ShiftResponse {
  shift_id: string;
  store_id: string;
  opened_by: string;
  cashier_id: string;
  pos_terminal_id: string | null;
  status: ShiftStatus;
  opening_cash: number;
  closing_cash: number | null;
  expected_cash: number | null;
  variance_amount: number | null;
  variance_percentage: number | null;
  opened_at: string; // ISO 8601
  closed_at: string | null; // ISO 8601
  // Extended fields from joins (optional, populated by backend)
  store_name?: string;
  cashier_name?: string;
  opener_name?: string;
  // Business day association - links shift to its DaySummary
  // This is the authoritative source for shift-to-day grouping in the UI
  day_summary_id: string | null;
}

/**
 * Pagination metadata
 */
export interface PaginationMeta {
  total: number;
  limit: number;
  offset: number;
  has_more: boolean;
}

/**
 * Shift query result
 * Story 4.7: Shift Management UI
 */
export interface ShiftQueryResult {
  shifts: ShiftResponse[];
  meta: PaginationMeta;
}

/**
 * Shift detail response
 * Story 4.7: Shift Management UI
 * Extended response for shift detail view with transaction count and variance details
 *
 * @security SEC-014: shift_number is a sequential business identifier, not a UUID - safe for display
 */
export interface ShiftDetailResponse extends ShiftResponse {
  /** Sequential shift number for display (not a UUID, safe for UI) */
  shift_number: number | null;
  transaction_count: number;
  variance_reason: string | null;
  approved_by: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
}

/**
 * Error codes for shift operations
 */
export enum ShiftErrorCode {
  SHIFT_ALREADY_ACTIVE = "SHIFT_ALREADY_ACTIVE",
  STORE_NOT_FOUND = "STORE_NOT_FOUND",
  CASHIER_NOT_FOUND = "CASHIER_NOT_FOUND",
  TERMINAL_NOT_FOUND = "TERMINAL_NOT_FOUND",
  INVALID_OPENING_CASH = "INVALID_OPENING_CASH",
  SHIFT_NOT_FOUND = "SHIFT_NOT_FOUND",
  SHIFT_ALREADY_CLOSING = "SHIFT_ALREADY_CLOSING",
  SHIFT_ALREADY_CLOSED = "SHIFT_ALREADY_CLOSED",
  SHIFT_INVALID_STATUS = "SHIFT_INVALID_STATUS",
  SHIFT_NOT_CLOSING = "SHIFT_NOT_CLOSING",
  INVALID_CASH_AMOUNT = "INVALID_CASH_AMOUNT",
  VARIANCE_REASON_REQUIRED = "VARIANCE_REASON_REQUIRED",
  SHIFT_NOT_VARIANCE_REVIEW = "SHIFT_NOT_VARIANCE_REVIEW",
  SHIFT_LOCKED = "SHIFT_LOCKED",
  SHIFT_NOT_CLOSED = "SHIFT_NOT_CLOSED",
}

/**
 * Custom error for shift operations
 */
export class ShiftServiceError extends Error {
  constructor(
    public code: ShiftErrorCode,
    message: string,
    public details?: Record<string, any>,
  ) {
    super(message);
    this.name = "ShiftServiceError";
  }
}

/**
 * Shift service for managing shift operations
 */
export class ShiftService {
  /**
   * Check if user has access to a store
   * @param userId - User UUID
   * @param storeId - Store UUID
   * @returns true if user has access, false otherwise
   */
  async checkUserStoreAccess(
    userId: string,
    storeId: string,
  ): Promise<boolean> {
    // Get user's roles
    const userRoles = await rbacService.getUserRoles(userId);

    // Check for superadmin (system scope - can access all stores)
    const hasSuperadminRole = userRoles.some(
      (role) => role.scope === "SYSTEM" || role.role_code === "SUPERADMIN",
    );

    if (hasSuperadminRole) {
      // Superadmins can access any store, just verify store exists
      const store = await prisma.store.findUnique({
        where: { store_id: storeId },
        select: { store_id: true },
      });
      return !!store;
    }

    // Find user's company ID from company-scoped role
    const companyRole = userRoles.find(
      (role) => role.scope === "COMPANY" && role.company_id,
    );

    if (!companyRole?.company_id) {
      // Check for store-scoped roles
      const storeRoles = userRoles.filter(
        (role) => role.scope === "STORE" && role.store_id,
      );
      // User can access if they have a role scoped to this specific store
      return storeRoles.some((role) => role.store_id === storeId);
    }

    // Check if store belongs to user's company
    const store = await prisma.store.findUnique({
      where: { store_id: storeId },
      select: { company_id: true },
    });

    if (!store) {
      return false;
    }

    return store.company_id === companyRole.company_id;
  }

  /**
   * Check if an unclosed shift exists for a POS terminal
   *
   * Uses the ShiftStateMachine's UNCLOSED_SHIFT_STATUSES constant to ensure
   * consistent definition of "unclosed" across the codebase.
   *
   * Note: "Unclosed" includes shifts in CLOSING/VARIANCE_REVIEW states.
   * For checking if a shift allows operations, use isWorkingShift() instead.
   *
   * @param posTerminalId - POS terminal UUID
   * @returns Shift with cashier info if unclosed shift exists, null otherwise
   */
  async checkActiveShift(posTerminalId: string) {
    const activeShift = await prisma.shift.findFirst({
      where: {
        pos_terminal_id: posTerminalId,
        status: {
          in: [...UNCLOSED_SHIFT_STATUSES],
        },
        closed_at: null,
      },
      include: {
        cashier: {
          select: {
            name: true,
          },
        },
      },
      orderBy: {
        opened_at: "desc",
      },
    });

    return activeShift;
  }

  /**
   * Check if a shift is in a "working" state where operations are allowed.
   *
   * Working states: OPEN, ACTIVE
   * These are the only states where transactions and pack activations are allowed.
   *
   * @param shiftId - Shift UUID
   * @returns true if shift is in working state, false otherwise
   */
  async isWorkingShift(shiftId: string): Promise<boolean> {
    const shift = await prisma.shift.findUnique({
      where: { shift_id: shiftId },
      select: { status: true },
    });

    if (!shift) {
      return false;
    }

    return shiftStateMachine.isWorkingStatus(shift.status);
  }

  /**
   * Transition a shift to ACTIVE status when first operational activity occurs.
   *
   * This is called automatically when:
   * - First transaction is recorded
   * - First lottery pack is activated
   * - First lottery pack is opened
   *
   * The transition is idempotent - if already ACTIVE, no change occurs.
   *
   * @param shiftId - Shift UUID
   * @param actorId - User who triggered the activity
   * @param trigger - What caused the activation (for audit)
   * @returns Updated shift status, or current status if no change needed
   */
  async activateShiftOnFirstActivity(
    shiftId: string,
    actorId: string,
    trigger:
      | "LOTTERY_PACK_ACTIVATED"
      | "LOTTERY_PACK_OPENED"
      | "TRANSACTION_CREATED",
  ): Promise<ShiftStatus> {
    const shift = await prisma.shift.findUnique({
      where: { shift_id: shiftId },
      select: { shift_id: true, status: true, store_id: true },
    });

    if (!shift) {
      throw new ShiftServiceError(
        ShiftErrorCode.SHIFT_NOT_FOUND,
        `Shift ${shiftId} not found`,
      );
    }

    // Only transition OPEN → ACTIVE
    if (shift.status !== ShiftStatus.OPEN) {
      return shift.status; // Already ACTIVE or in another state
    }

    // Validate the transition
    const context: TransitionContext = {
      shiftId,
      trigger: "FIRST_ACTIVITY",
      actorId,
      reason: `Shift activated by first activity: ${trigger}`,
    };

    shiftStateMachine.validateTransition(
      shift.status,
      ShiftStatus.ACTIVE,
      context,
    );

    // Perform the transition
    const updated = await prisma.$transaction(async (tx) => {
      const updatedShift = await tx.shift.update({
        where: { shift_id: shiftId },
        data: { status: ShiftStatus.ACTIVE },
        select: { status: true },
      });

      // Audit the transition
      await tx.auditLog.create({
        data: {
          user_id: actorId,
          action: "SHIFT_ACTIVATED",
          table_name: "shifts",
          record_id: shiftId,
          old_values: { status: ShiftStatus.OPEN },
          new_values: {
            status: ShiftStatus.ACTIVE,
            trigger,
            transitioned_at: new Date().toISOString(),
          },
          reason: `Shift transitioned OPEN → ACTIVE on first activity: ${trigger}`,
        },
      });

      return updatedShift;
    });

    return updated.status;
  }

  /**
   * Convert terminal ID to a consistent numeric lock ID for PostgreSQL advisory locks
   * Uses SHA-256 hash of the terminal ID and takes first 4 bytes as a 32-bit integer.
   * We use 4 bytes (32-bit) instead of 8 bytes (64-bit) because:
   * 1. PostgreSQL advisory locks accept bigint, but Prisma has issues serializing JS BigInt
   * 2. A 32-bit integer fits safely in JavaScript's number type
   * 3. 4 billion+ unique lock IDs is sufficient for terminal-level locking
   *
   * @param terminalId - POS terminal UUID
   * @returns Number lock ID for advisory lock (fits in PostgreSQL bigint)
   */
  private getTerminalLockId(terminalId: string): number {
    // Convert UUID to a consistent numeric lock ID
    // Use first 4 bytes of SHA-256 hash as a 32-bit unsigned integer
    const hash = crypto.createHash("sha256").update(terminalId).digest();
    // Read as unsigned 32-bit integer (big-endian)
    return hash.readUInt32BE(0);
  }

  /**
   * Calculate shift number for a terminal
   * Shift number is determined by counting shifts that STARTED on the current calendar day
   * for this terminal (using store timezone), then adding 1.
   *
   * This method uses PostgreSQL advisory locks to prevent race conditions when
   * multiple concurrent requests try to create shifts for the same terminal.
   *
   * @param terminalId - POS terminal UUID
   * @param storeTimezone - Store timezone (IANA format, e.g., "America/Denver")
   * @param tx - Optional Prisma transaction client. If provided, uses transaction-scoped lock.
   *             If not provided, uses session-scoped lock (must be manually released).
   * @returns Next shift number (1 for first shift of day, 2 for second, etc.)
   */
  async calculateShiftNumber(
    terminalId: string,
    storeTimezone: string,
    tx?: Prisma.TransactionClient,
  ): Promise<number> {
    const client = tx || prisma;

    // Acquire advisory lock using terminal ID hash
    // This prevents concurrent requests from calculating duplicate shift numbers
    const lockId = this.getTerminalLockId(terminalId);

    if (tx) {
      // Transaction-scoped lock (automatically released on commit/rollback)
      await client.$executeRaw`SELECT pg_advisory_xact_lock(${lockId})`;
    } else {
      // Session-scoped lock (must be manually released)
      await client.$executeRaw`SELECT pg_advisory_lock(${lockId})`;
    }

    try {
      // Get current UTC time
      const now = new Date();

      // Convert to store timezone to get current date in store's timezone
      const storeTime = toStoreTime(now, storeTimezone);

      // Get start of day in store timezone (00:00:00)
      const startOfDayStore = startOfDay(storeTime);
      // Get start of next day in store timezone (00:00:00 next day)
      const startOfNextDayStore = startOfDay(addDays(storeTime, 1));

      // Convert store timezone day boundaries to UTC for database query
      const startOfDayUTC = toUTC(startOfDayStore, storeTimezone);
      const startOfNextDayUTC = toUTC(startOfNextDayStore, storeTimezone);

      // Count shifts that started today (in store timezone) for this terminal
      // Shift belongs to the day it STARTED (opened_at), not when it ended
      // Use < startOfNextDayUTC to ensure we capture all shifts from the current day
      const shiftCount = await client.shift.count({
        where: {
          pos_terminal_id: terminalId,
          opened_at: {
            gte: startOfDayUTC,
            lt: startOfNextDayUTC,
          },
        },
      });

      // Next shift number is count + 1
      return shiftCount + 1;
    } finally {
      // Release session-scoped lock if we acquired one
      if (!tx) {
        await client.$executeRaw`SELECT pg_advisory_unlock(${lockId})`;
      }
      // Transaction-scoped locks are automatically released, no need to unlock
    }
  }

  /**
   * Start a shift for a terminal (used in terminal authentication flow)
   * Creates a new shift with calculated shift_number and returns shift details.
   *
   * @param terminalId - POS terminal UUID
   * @param cashierId - Cashier UUID
   * @param auditContext - Audit context for logging
   * @param openingCash - Optional opening cash amount (defaults to 0)
   * @returns Created shift with shift_number
   * @throws ShiftServiceError if validation fails or active shift exists
   *
   * @security
   * - SEC-014: openingCash validated as non-negative number
   * - SEC-010: Store access validated via RLS
   */
  async startShift(
    terminalId: string,
    cashierId: string,
    auditContext: AuditContext,
    openingCash: number = 0,
  ): Promise<Prisma.ShiftGetPayload<{}>> {
    // Get terminal to access store_id and store timezone
    const terminal = await prisma.pOSTerminal.findUnique({
      where: { pos_terminal_id: terminalId },
      include: {
        store: {
          select: {
            store_id: true,
            timezone: true,
          },
        },
      },
    });

    if (!terminal) {
      throw new ShiftServiceError(
        ShiftErrorCode.TERMINAL_NOT_FOUND,
        `Terminal with ID ${terminalId} not found`,
      );
    }

    // Validate store access (RLS check)
    await this.validateStoreAccess(terminal.store_id, auditContext.userId);

    // Validate cashier exists and is active
    await this.validateCashier(cashierId);

    // SEC-014: Validate opening_cash is non-negative
    if (openingCash < 0) {
      throw new ShiftServiceError(
        ShiftErrorCode.INVALID_OPENING_CASH,
        "Opening cash must be a non-negative number",
      );
    }

    // Check for existing active shift on the POS terminal
    const activeShift = await this.checkActiveShift(terminalId);
    if (activeShift) {
      throw new ShiftServiceError(
        ShiftErrorCode.SHIFT_ALREADY_ACTIVE,
        `An active shift already exists for POS terminal ${terminalId}`,
        {
          existing_shift_id: activeShift.shift_id,
          existing_shift_status: activeShift.status,
          existing_shift_opened_at: activeShift.opened_at,
        },
      );
    }

    // Create shift and audit log in a transaction for atomicity
    // Calculate shift number inside the transaction to use transaction-scoped advisory lock
    const shift = await prisma.$transaction(async (tx) => {
      // Calculate shift number using store timezone within the transaction
      // This ensures the advisory lock is held for the entire critical section
      const shiftNumber = await this.calculateShiftNumber(
        terminalId,
        terminal.store.timezone,
        tx,
      );

      // Get or create the active business day for this store
      // Business Rule: Shift belongs to the day that is currently OPEN
      // DB-006: TENANT_ISOLATION - Day summary scoped to store_id
      // PHASE 5: Pass userId to enable lottery day creation with audit trail
      const daySummaryId = await this.getOrCreateActiveDaySummaryId(
        terminal.store_id,
        terminal.store.timezone,
        tx,
        auditContext.userId,
      );

      // Create shift record with shift_number, opening_cash, and day_summary_id
      const newShift = await tx.shift.create({
        data: {
          store_id: terminal.store_id,
          opened_by: auditContext.userId,
          cashier_id: cashierId,
          pos_terminal_id: terminalId,
          opening_cash: openingCash,
          status: ShiftStatus.OPEN,
          opened_at: new Date(),
          shift_number: shiftNumber,
          // Associate shift with the active business day
          day_summary_id: daySummaryId,
        },
      });

      // Create audit log entry (non-blocking - don't fail if audit fails)
      try {
        await tx.auditLog.create({
          data: {
            user_id: auditContext.userId,
            action: "SHIFT_STARTED",
            table_name: "shifts",
            record_id: newShift.shift_id,
            new_values: {
              shift_id: newShift.shift_id,
              store_id: newShift.store_id,
              opened_by: newShift.opened_by,
              cashier_id: newShift.cashier_id,
              pos_terminal_id: newShift.pos_terminal_id,
              opening_cash: newShift.opening_cash.toString(),
              status: newShift.status,
              opened_at: newShift.opened_at.toISOString(),
              shift_number: newShift.shift_number,
              day_summary_id: newShift.day_summary_id,
            } as Record<string, any>,
            ip_address: auditContext.ipAddress,
            user_agent: auditContext.userAgent,
            reason: `Shift started by ${auditContext.userEmail} (roles: ${auditContext.userRoles.join(", ")}) - Shift #${shiftNumber}`,
          },
        });
      } catch (auditError) {
        // Log the audit failure but don't fail the shift creation
        console.error(
          "Failed to create audit log for shift start:",
          auditError,
        );
      }

      return newShift;
    });

    return shift;
  }

  /**
   * Update starting cash for a shift
   * Validates that the cashier owns the shift and updates starting_cash.
   *
   * @param shiftId - Shift UUID
   * @param cashierId - Cashier UUID (must own the shift)
   * @param startingCash - Starting cash amount (non-negative number or zero)
   * @param auditContext - Audit context for logging
   * @returns Updated shift
   * @throws ShiftServiceError if validation fails
   */
  async updateStartingCash(
    shiftId: string,
    cashierId: string,
    startingCash: number,
    auditContext: AuditContext,
  ): Promise<Prisma.ShiftGetPayload<{}>> {
    // Validate starting_cash is non-negative
    if (startingCash < 0) {
      throw new ShiftServiceError(
        ShiftErrorCode.INVALID_OPENING_CASH,
        "Starting cash must be a non-negative number or zero",
      );
    }

    // Get shift and validate it exists
    const shift = await prisma.shift.findUnique({
      where: { shift_id: shiftId },
    });

    if (!shift) {
      throw new ShiftServiceError(
        ShiftErrorCode.SHIFT_NOT_FOUND,
        `Shift with ID ${shiftId} not found`,
      );
    }

    // Validate store access (RLS check)
    await this.validateStoreAccess(shift.store_id, auditContext.userId);

    // Validate cashier owns the shift
    if (shift.cashier_id !== cashierId) {
      throw new ShiftServiceError(
        ShiftErrorCode.SHIFT_NOT_FOUND,
        "Cashier does not own this shift",
      );
    }

    // Update shift and audit log in a transaction for atomicity
    const updatedShift = await prisma.$transaction(async (tx) => {
      // Update shift record
      const updated = await tx.shift.update({
        where: { shift_id: shiftId },
        data: {
          opening_cash: startingCash,
        },
      });

      // Create audit log entry (non-blocking - don't fail if audit fails)
      try {
        await tx.auditLog.create({
          data: {
            user_id: auditContext.userId,
            action: "SHIFT_STARTING_CASH_UPDATED",
            table_name: "shifts",
            record_id: updated.shift_id,
            old_values: {
              opening_cash: shift.opening_cash.toString(),
            } as Record<string, any>,
            new_values: {
              opening_cash: updated.opening_cash.toString(),
            } as Record<string, any>,
            ip_address: auditContext.ipAddress,
            user_agent: auditContext.userAgent,
            reason: `Starting cash updated by ${auditContext.userEmail} (roles: ${auditContext.userRoles.join(", ")}) - New amount: $${startingCash.toFixed(2)}`,
          },
        });
      } catch (auditError) {
        // Log the audit failure but don't fail the update
        console.error(
          "Failed to create audit log for starting cash update:",
          auditError,
        );
      }

      return updated;
    });

    return updatedShift;
  }

  /**
   * Validate that store exists and user has access (RLS check)
   * RLS policies automatically filter based on user's company/store access
   * The RLS context is set by the RLS middleware at the route level
   * @param storeId - Store UUID
   * @param userId - User UUID (for documentation - RLS context is set by middleware)
   * @throws ShiftServiceError if store not found or user lacks access
   */
  async validateStoreAccess(storeId: string, _userId: string): Promise<void> {
    try {
      const store = await prisma.store.findUnique({
        where: { store_id: storeId },
      });

      if (!store) {
        throw new ShiftServiceError(
          ShiftErrorCode.STORE_NOT_FOUND,
          `Store with ID ${storeId} not found or you do not have access`,
        );
      }
    } catch (error) {
      // Convert Prisma errors (e.g., invalid UUID format) to ShiftServiceError
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        throw new ShiftServiceError(
          ShiftErrorCode.STORE_NOT_FOUND,
          `Store with ID ${storeId} not found or you do not have access`,
        );
      }
      // Re-throw ShiftServiceError as-is
      throw error;
    }
  }

  /**
   * Validate that cashier exists and is active
   * @param cashierId - Cashier UUID (references cashiers table, not users table)
   * @throws ShiftServiceError if cashier not found or inactive
   */
  async validateCashier(cashierId: string): Promise<void> {
    try {
      const cashier = await prisma.cashier.findUnique({
        where: { cashier_id: cashierId },
        select: { cashier_id: true, is_active: true, disabled_at: true },
      });

      if (!cashier) {
        throw new ShiftServiceError(
          ShiftErrorCode.CASHIER_NOT_FOUND,
          `Cashier with ID ${cashierId} not found`,
        );
      }

      // Check if cashier is active (is_active=true AND not soft-deleted via disabled_at)
      if (!cashier.is_active || cashier.disabled_at !== null) {
        throw new ShiftServiceError(
          ShiftErrorCode.CASHIER_NOT_FOUND,
          `Cashier with ID ${cashierId} is not active`,
        );
      }
    } catch (error) {
      // Convert Prisma errors (e.g., invalid UUID format) to ShiftServiceError
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        throw new ShiftServiceError(
          ShiftErrorCode.CASHIER_NOT_FOUND,
          `Cashier with ID ${cashierId} not found`,
        );
      }
      // Re-throw ShiftServiceError as-is
      throw error;
    }
  }

  /**
   * Get or create the active business day for a store.
   *
   * Business Rule: A shift must be associated with the business day that is OPEN
   * when the shift is created. This correctly handles overnight operations where
   * a business day started on one calendar date may include shifts opened on
   * the next calendar date.
   *
   * Algorithm:
   * 1. Check for an OPEN day summary for this store
   * 2. If found, return its ID (shift belongs to this active day)
   * 3. If not found, create a new day summary for today's date
   * 4. PHASE 5: Ensure lottery business day exists and is linked
   *
   * Enterprise Standards Applied:
   * - DB-006: TENANT_ISOLATION - All queries scoped by store_id
   * - DB-001: ORM_USAGE - Using Prisma query builders
   * - SEC-006: SQL_INJECTION - All parameters bound via Prisma ORM
   * - API-003: ERROR_HANDLING - Structured error handling with non-blocking fallback
   * - SEC-017: AUDIT_TRAILS - Structured logging for observability
   *
   * @param storeId - Store UUID (for tenant isolation)
   * @param storeTimezone - Store's timezone for business date calculation
   * @param tx - Optional Prisma transaction client
   * @param openedByUserId - Optional user ID for lottery day creation audit trail
   * @returns Day summary ID for the active business day, or null if creation fails
   */
  async getOrCreateActiveDaySummaryId(
    storeId: string,
    storeTimezone: string | null,
    tx?: Prisma.TransactionClient,
    openedByUserId?: string,
  ): Promise<string | null> {
    const client = tx || prisma;

    try {
      // STEP 1: Find any OPEN day summary for this store
      // DB-006: TENANT_ISOLATION - Filter by store_id
      const openDaySummary = await client.daySummary.findFirst({
        where: {
          store_id: storeId,
          status: DaySummaryStatus.OPEN,
        },
        select: {
          day_summary_id: true,
          business_date: true,
        },
        orderBy: {
          business_date: "desc", // Most recent open day
        },
      });

      let daySummaryId: string;
      let businessDate: Date;

      // If we found an open day summary, use it
      if (openDaySummary) {
        daySummaryId = openDaySummary.day_summary_id;
        businessDate = openDaySummary.business_date;
      } else {
        // STEP 2: No open day found - create one for today's business date
        // Use store timezone if available, otherwise UTC
        const now = new Date();

        if (storeTimezone) {
          // Convert current time to store's local timezone to get business date
          const storeLocalTime = toStoreTime(now, storeTimezone);
          businessDate = startOfDay(storeLocalTime);
        } else {
          // Fallback to UTC start of day
          businessDate = startOfDay(now);
        }

        // Create new day summary
        // Using getOrCreateDaySummary from daySummaryService ensures idempotency
        const newDaySummary = await daySummaryService.getOrCreateDaySummary(
          storeId,
          businessDate,
        );
        daySummaryId = newDaySummary.day_summary_id;
      }

      // =========================================================================
      // PHASE 5: LOTTERY BUSINESS DAY SAFETY FALLBACK
      // =========================================================================
      // Ensure a lottery business day exists and is linked to the day summary.
      // This is a safety fallback - normally day close creates the next day.
      //
      // BUSINESS RULE:
      // - Find existing OPEN lottery day for this store (status-based lookup)
      // - If none exists, create new lottery day linked to the day summary
      //
      // MCP Guidance Applied:
      // - DB-006: TENANT_ISOLATION - Scoped by store_id
      // - DB-001: ORM_USAGE - Using Prisma ORM with query builder
      // - SEC-006: SQL_INJECTION - All parameters bound via Prisma ORM
      // - API-003: ERROR_HANDLING - Non-blocking with structured logging
      // - SEC-017: AUDIT_TRAILS - Structured logging for observability
      // =========================================================================
      await this.ensureLotteryBusinessDayExists(
        client,
        storeId,
        businessDate,
        daySummaryId,
        openedByUserId,
      );

      return daySummaryId;
    } catch (error) {
      // Log error but don't fail shift creation
      // The day_summary_id is nullable and can be backfilled later
      // SEC-017: AUDIT_TRAILS - Log for investigation
      console.error(
        `[ShiftService] Failed to get/create active day summary for store ${storeId}:`,
        error,
      );
      return null;
    }
  }

  /**
   * Ensure a lottery business day exists for the given store and business date.
   *
   * PHASE 5: Shift Open Safety Fallback
   * This is a safety mechanism that ensures lottery operations work even if:
   * - Day close didn't create the next day (edge case)
   * - System was bootstrapped without lottery days
   * - Manual recovery from inconsistent state
   *
   * The method is non-blocking - lottery day creation failure does not fail
   * the parent operation (shift creation).
   *
   * @security
   * - DB-006: TENANT_ISOLATION - Scoped to store_id
   * - DB-001: ORM_USAGE - Uses Prisma ORM with query builder
   * - SEC-006: SQL_INJECTION - All parameters bound via Prisma ORM
   * - API-003: ERROR_HANDLING - Non-blocking, logs errors
   * - SEC-017: AUDIT_TRAILS - Structured logging for observability
   *
   * @param client - Prisma client or transaction client
   * @param storeId - Store UUID (for tenant isolation)
   * @param businessDate - Business date for the lottery day
   * @param daySummaryId - Day summary ID to link the lottery day to
   * @param openedByUserId - Optional user ID for audit trail
   */
  private async ensureLotteryBusinessDayExists(
    client: Prisma.TransactionClient | typeof prisma,
    storeId: string,
    businessDate: Date,
    daySummaryId: string,
    openedByUserId?: string,
  ): Promise<void> {
    try {
      // STEP 1: Find any OPEN lottery day for this store (status-based lookup)
      // DB-006: TENANT_ISOLATION - Scoped by store_id
      // SEC-014: INPUT_VALIDATION - Status values are hardcoded enums
      const existingOpenDay = await client.lotteryBusinessDay.findFirst({
        where: {
          store_id: storeId,
          status: "OPEN",
        },
        select: {
          day_id: true,
          day_summary_id: true,
        },
        orderBy: {
          opened_at: "desc", // Most recent first
        },
      });

      if (existingOpenDay) {
        // OPEN lottery day exists - check if it needs to be linked to day summary
        // This handles the case where lottery day was created without FK link
        if (!existingOpenDay.day_summary_id && daySummaryId) {
          // SEC-017: AUDIT_TRAILS - Log the linking for observability
          console.log(
            `[ShiftService] Linking existing lottery day ${existingOpenDay.day_id} to day summary ${daySummaryId}`,
          );
          await client.lotteryBusinessDay.update({
            where: { day_id: existingOpenDay.day_id },
            data: { day_summary_id: daySummaryId },
          });
        }
        return;
      }

      // STEP 2: No OPEN lottery day found - create one linked to day summary
      // This is a fallback scenario (normally day close creates the next day)
      // DB-006: TENANT_ISOLATION - store_id enforces tenant scope
      // DB-001: ORM_USAGE - Using Prisma ORM, no raw SQL
      const normalizedBusinessDate = startOfDay(businessDate);
      const newLotteryDay = await client.lotteryBusinessDay.create({
        data: {
          store_id: storeId,
          business_date: normalizedBusinessDate,
          status: "OPEN",
          opened_at: new Date(),
          opened_by: openedByUserId || null,
          // Link to the day summary for FK relationship
          day_summary_id: daySummaryId,
        },
      });

      // SEC-017: AUDIT_TRAILS - Log successful creation
      console.log(
        `[ShiftService] Created fallback lottery day ${newLotteryDay.day_id} for store ${storeId}, linked to day summary ${daySummaryId}`,
      );
    } catch (lotteryDayError) {
      // Log but don't fail parent operation - lottery day creation is non-critical
      // SEC-017: AUDIT_TRAILS - Log for investigation
      // API-003: ERROR_HANDLING - Non-blocking error handling
      console.error(
        "[ShiftService] Failed to ensure LotteryBusinessDay exists:",
        lotteryDayError,
      );
    }
  }

  /**
   * Validate that POS terminal exists, belongs to store, and is available for shift opening
   *
   * Note: POSTerminal model uses soft-delete only (deleted_at field). There is no status field.
   * A terminal is available for shift opening if and only if deleted_at is null.
   *
   * @param posTerminalId - POS terminal UUID
   * @param storeId - Store UUID
   * @throws ShiftServiceError if terminal not found, doesn't belong to store, or is soft-deleted
   */
  async validateTerminal(
    posTerminalId: string,
    storeId: string,
  ): Promise<void> {
    try {
      const terminal = await prisma.pOSTerminal.findUnique({
        where: { pos_terminal_id: posTerminalId },
        select: { pos_terminal_id: true, store_id: true, deleted_at: true },
      });

      if (!terminal) {
        throw new ShiftServiceError(
          ShiftErrorCode.TERMINAL_NOT_FOUND,
          `POS terminal with ID ${posTerminalId} not found`,
        );
      }

      if (terminal.store_id !== storeId) {
        throw new ShiftServiceError(
          ShiftErrorCode.TERMINAL_NOT_FOUND,
          `POS terminal with ID ${posTerminalId} does not belong to store ${storeId}`,
        );
      }

      // Block shift opening if terminal is soft-deleted (deleted_at is not null)
      // This is the only blocking state - POSTerminal has no status field
      if (terminal.deleted_at !== null) {
        throw new ShiftServiceError(
          ShiftErrorCode.TERMINAL_NOT_FOUND,
          `POS terminal with ID ${posTerminalId} is deleted`,
        );
      }
    } catch (error) {
      // Convert Prisma errors (e.g., invalid UUID format) to ShiftServiceError
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        throw new ShiftServiceError(
          ShiftErrorCode.TERMINAL_NOT_FOUND,
          `POS terminal with ID ${posTerminalId} not found`,
        );
      }
      // Re-throw ShiftServiceError as-is
      throw error;
    }
  }

  /**
   * Open a new shift
   * @param data - Shift opening data
   * @param auditContext - Audit context for logging
   * @returns Created shift record
   * @throws ShiftServiceError if validation fails or active shift exists
   */
  async openShift(
    data: OpenShiftInput,
    auditContext: AuditContext,
  ): Promise<Prisma.ShiftGetPayload<{}>> {
    // Validate opening_cash is non-negative (already validated by Zod, but double-check)
    if (data.opening_cash < 0) {
      throw new ShiftServiceError(
        ShiftErrorCode.INVALID_OPENING_CASH,
        "Opening cash must be a non-negative number",
      );
    }

    // Validate store access (RLS check)
    await this.validateStoreAccess(data.store_id, auditContext.userId);

    // Validate cashier exists and is active
    // Note: cashier_id should be defined by the route layer, but we check defensively
    if (!data.cashier_id) {
      throw new ShiftServiceError(
        ShiftErrorCode.CASHIER_NOT_FOUND,
        "cashier_id is required",
      );
    }
    await this.validateCashier(data.cashier_id);

    // Validate terminal exists and belongs to store
    await this.validateTerminal(data.pos_terminal_id, data.store_id);

    // Check for existing active shift on the POS terminal
    const activeShift = await this.checkActiveShift(data.pos_terminal_id);
    if (activeShift) {
      throw new ShiftServiceError(
        ShiftErrorCode.SHIFT_ALREADY_ACTIVE,
        `An active shift already exists for POS terminal ${data.pos_terminal_id}`,
        {
          existing_shift_id: activeShift.shift_id,
          existing_shift_status: activeShift.status,
          existing_shift_opened_at: activeShift.opened_at,
        },
      );
    }

    // Get store timezone for business day calculation
    const store = await prisma.store.findUnique({
      where: { store_id: data.store_id },
      select: { timezone: true },
    });

    // Create shift and audit log in a transaction for atomicity
    const shift = await prisma.$transaction(async (tx) => {
      // Get or create the active business day for this store
      // Business Rule: Shift belongs to the day that is currently OPEN
      // DB-006: TENANT_ISOLATION - Day summary scoped to store_id
      // PHASE 5: Pass userId to enable lottery day creation with audit trail
      // Note: getOrCreateActiveDaySummaryId now also ensures lottery day exists
      const daySummaryId = await this.getOrCreateActiveDaySummaryId(
        data.store_id,
        store?.timezone || null,
        tx,
        auditContext.userId,
      );

      // Create shift record with day_summary_id
      // Note: cashier_id is guaranteed to be defined by route layer, but TypeScript needs assertion
      const newShift = await tx.shift.create({
        data: {
          store_id: data.store_id,
          opened_by: auditContext.userId,
          cashier_id: data.cashier_id!, // Non-null assertion: route ensures this is defined
          pos_terminal_id: data.pos_terminal_id,
          opening_cash: data.opening_cash,
          status: ShiftStatus.OPEN,
          opened_at: new Date(),
          // Associate shift with the active business day
          day_summary_id: daySummaryId,
        },
      });

      // Create audit log entry (non-blocking - don't fail if audit fails)
      try {
        await tx.auditLog.create({
          data: {
            user_id: auditContext.userId,
            action: "SHIFT_OPENED",
            table_name: "shifts",
            record_id: newShift.shift_id,
            new_values: {
              shift_id: newShift.shift_id,
              store_id: newShift.store_id,
              opened_by: newShift.opened_by,
              cashier_id: newShift.cashier_id,
              pos_terminal_id: newShift.pos_terminal_id,
              opening_cash: newShift.opening_cash.toString(),
              status: newShift.status,
              opened_at: newShift.opened_at.toISOString(),
              day_summary_id: newShift.day_summary_id,
            } as Record<string, any>,
            ip_address: auditContext.ipAddress,
            user_agent: auditContext.userAgent,
            reason: `Shift opened by ${auditContext.userEmail} (roles: ${auditContext.userRoles.join(", ")})`,
          },
        });
      } catch (auditError) {
        // Log the audit failure but don't fail the shift creation
        console.error(
          "Failed to create audit log for shift opening:",
          auditError,
        );
      }

      return newShift;
    });

    return shift;
  }

  /**
   * Calculate expected cash for a shift
   * Expected cash = opening_cash + sum of all cash payment amounts
   * Cash payments are stored in TransactionPayment table with method = 'cash'
   * @param shiftId - Shift UUID
   * @returns Expected cash amount
   */
  async calculateExpectedCash(shiftId: string): Promise<number> {
    // Get shift to access opening_cash
    const shift = await prisma.shift.findUnique({
      where: { shift_id: shiftId },
      select: { opening_cash: true },
    });

    if (!shift) {
      throw new ShiftServiceError(
        ShiftErrorCode.SHIFT_NOT_FOUND,
        `Shift with ID ${shiftId} not found`,
      );
    }

    // Sum all cash payments for transactions in this shift
    // Cash payments are in TransactionPayment table where method = 'cash'
    const cashPayments = await prisma.transactionPayment.aggregate({
      where: {
        transaction: {
          shift_id: shiftId,
        },
        method: {
          in: ["cash", "CASH"],
        },
      },
      _sum: {
        amount: true,
      },
    });

    const cashTransactionsTotal = cashPayments._sum.amount?.toNumber() || 0;
    const expectedCash = shift.opening_cash.toNumber() + cashTransactionsTotal;

    return expectedCash;
  }

  /**
   * Validate that user has access to a shift's store
   * Uses RBAC to check if user can access the store where the shift belongs
   * @param shiftId - Shift UUID
   * @param userId - User ID requesting access
   * @returns The shift if access is allowed
   * @throws ShiftServiceError if shift not found or access denied
   */
  async validateShiftAccess(
    shiftId: string,
    userId: string,
  ): Promise<{ shift_id: string; store_id: string; status: ShiftStatus }> {
    try {
      // First, get the shift with its store info
      const shift = await prisma.shift.findUnique({
        where: { shift_id: shiftId },
        select: {
          shift_id: true,
          store_id: true,
          status: true,
          store: {
            select: {
              company_id: true,
            },
          },
        },
      });

      if (!shift) {
        throw new ShiftServiceError(
          ShiftErrorCode.SHIFT_NOT_FOUND,
          `Shift with ID ${shiftId} not found or you do not have access`,
        );
      }

      // Get user's roles to check access
      const userRoles = await rbacService.getUserRoles(userId);

      // Check if user has access to this shift's store/company
      let hasAccess = false;

      for (const role of userRoles) {
        // SYSTEM scope users can access all shifts
        if (role.scope === "SYSTEM") {
          hasAccess = true;
          break;
        }

        // COMPANY scope users can access shifts in their company's stores
        if (
          role.scope === "COMPANY" &&
          role.company_id === shift.store.company_id
        ) {
          hasAccess = true;
          break;
        }

        // STORE scope users can only access shifts in their store
        if (role.scope === "STORE" && role.store_id === shift.store_id) {
          hasAccess = true;
          break;
        }
      }

      if (!hasAccess) {
        // Return "not found" to avoid leaking information about shift existence
        throw new ShiftServiceError(
          ShiftErrorCode.SHIFT_NOT_FOUND,
          `Shift with ID ${shiftId} not found or you do not have access`,
        );
      }

      return {
        shift_id: shift.shift_id,
        store_id: shift.store_id,
        status: shift.status,
      };
    } catch (error) {
      // Convert Prisma errors (e.g., invalid UUID format) to ShiftServiceError
      if (error instanceof Prisma.PrismaClientKnownRequestError) {
        throw new ShiftServiceError(
          ShiftErrorCode.SHIFT_NOT_FOUND,
          `Shift with ID ${shiftId} not found or you do not have access`,
        );
      }
      // Re-throw ShiftServiceError as-is
      throw error;
    }
  }

  /**
   * Validate that shift can be closed
   * Shift must be in OPEN or ACTIVE status
   * @param shiftId - Shift UUID
   * @param userId - User ID requesting the close (for access check)
   * @throws ShiftServiceError if shift cannot be closed
   */
  async validateShiftCanClose(shiftId: string, userId: string): Promise<void> {
    // First validate access to the shift
    const shift = await this.validateShiftAccess(shiftId, userId);

    if (!shift) {
      throw new ShiftServiceError(
        ShiftErrorCode.SHIFT_NOT_FOUND,
        `Shift with ID ${shiftId} not found or you do not have access`,
      );
    }

    // Check if shift is already CLOSING
    if (shift.status === ShiftStatus.CLOSING) {
      throw new ShiftServiceError(
        ShiftErrorCode.SHIFT_ALREADY_CLOSING,
        `Shift with ID ${shiftId} is already in CLOSING status`,
        {
          current_status: shift.status,
        },
      );
    }

    // Check if shift is already CLOSED
    if (shift.status === ShiftStatus.CLOSED) {
      throw new ShiftServiceError(
        ShiftErrorCode.SHIFT_ALREADY_CLOSED,
        `Shift with ID ${shiftId} is already CLOSED`,
        {
          current_status: shift.status,
        },
      );
    }

    // Check if shift is in a valid status for closing (OPEN or ACTIVE)
    if (
      shift.status !== ShiftStatus.OPEN &&
      shift.status !== ShiftStatus.ACTIVE
    ) {
      throw new ShiftServiceError(
        ShiftErrorCode.SHIFT_INVALID_STATUS,
        `Shift with ID ${shiftId} cannot be closed. Current status: ${shift.status}. Only OPEN or ACTIVE shifts can be closed.`,
        {
          current_status: shift.status,
          allowed_statuses: [ShiftStatus.OPEN, ShiftStatus.ACTIVE],
        },
      );
    }
  }

  /**
   * Initiate shift closing
   * Changes shift status to CLOSING, calculates expected cash, and creates audit log
   * @param shiftId - Shift UUID
   * @param auditContext - Audit context for logging
   * @returns Shift closing result with expected cash and shift details
   * @throws ShiftServiceError if validation fails
   */
  async initiateClosing(
    shiftId: string,
    auditContext: AuditContext,
  ): Promise<ShiftClosingResult> {
    // Validate shift can be closed (access check + status check)
    await this.validateShiftCanClose(shiftId, auditContext.userId);

    // Calculate expected cash
    const expectedCash = await this.calculateExpectedCash(shiftId);

    // Get cash payments total for response
    // Cash payments are in TransactionPayment table where method = 'cash'
    const cashPayments = await prisma.transactionPayment.aggregate({
      where: {
        transaction: {
          shift_id: shiftId,
        },
        method: {
          in: ["cash", "CASH"],
        },
      },
      _sum: {
        amount: true,
      },
    });
    const cashTransactionsTotal = cashPayments._sum.amount?.toNumber() || 0;

    // Update shift and create audit log in a transaction for atomicity
    const result = await prisma.$transaction(async (tx) => {
      // Get shift to access opening_cash
      const shift = await tx.shift.findUnique({
        where: { shift_id: shiftId },
        select: {
          shift_id: true,
          store_id: true,
          opening_cash: true,
          status: true,
        },
      });

      if (!shift) {
        throw new ShiftServiceError(
          ShiftErrorCode.SHIFT_NOT_FOUND,
          `Shift with ID ${shiftId} not found`,
        );
      }

      // Update shift status to CLOSING
      // NOTE: closing_initiated_at and closing_initiated_by fields don't exist in schema yet
      // Using status change and audit log to track initiation
      // TODO: Add closing_initiated_at and closing_initiated_by fields via migration if needed
      const updatedShift = await tx.shift.update({
        where: { shift_id: shiftId },
        data: {
          status: ShiftStatus.CLOSING,
          // closing_initiated_at and closing_initiated_by will be tracked via audit log
        },
      });

      // Create audit log entry (non-blocking - don't fail if audit fails)
      try {
        await tx.auditLog.create({
          data: {
            user_id: auditContext.userId,
            action: "SHIFT_CLOSING_INITIATED",
            table_name: "shifts",
            record_id: shiftId,
            new_values: {
              shift_id: shiftId,
              store_id: shift.store_id,
              status: ShiftStatus.CLOSING,
              closing_initiated_at: new Date().toISOString(), // Tracked in audit log since field doesn't exist in schema
              closing_initiated_by: auditContext.userId,
              expected_cash: expectedCash.toString(),
              calculated_at: new Date().toISOString(),
            } as Record<string, any>,
            ip_address: auditContext.ipAddress,
            user_agent: auditContext.userAgent,
            reason: `Shift closing initiated by ${auditContext.userEmail} (roles: ${auditContext.userRoles.join(", ")})`,
          },
        });
      } catch (auditError) {
        // Log the audit failure but don't fail the shift closing
        console.error(
          "Failed to create audit log for shift closing:",
          auditError,
        );
      }

      return {
        shift_id: updatedShift.shift_id,
        status: updatedShift.status,
        closing_initiated_at: new Date(), // Current timestamp since field doesn't exist in schema
        closing_initiated_by: auditContext.userId, // From audit context since field doesn't exist in schema
        expected_cash: expectedCash,
        opening_cash: shift.opening_cash.toNumber(),
        cash_transactions_total: cashTransactionsTotal,
        calculated_at: new Date(),
      };
    });

    return result;
  }

  /**
   * Calculate variance between actual and expected cash
   * @param actualCash - Actual cash count
   * @param expectedCash - Expected cash amount
   * @returns Variance amount (can be positive or negative)
   */
  calculateVariance(actualCash: number, expectedCash: number): number {
    return actualCash - expectedCash;
  }

  /**
   * Evaluate if variance exceeds threshold
   * Thresholds: $5 absolute AND 1% relative (both must be exceeded)
   * @param varianceAmount - Variance amount (can be positive or negative)
   * @param expectedCash - Expected cash amount
   * @returns Object with exceedsThreshold flag and new status
   */
  evaluateVarianceThreshold(
    varianceAmount: number,
    expectedCash: number,
  ): { exceedsThreshold: boolean; newStatus: ShiftStatus } {
    const absoluteVariance = Math.abs(varianceAmount);
    const absoluteThreshold = 5.0; // $5 absolute threshold
    const relativeThreshold = 0.01; // 1% relative threshold
    const relativeVariance = absoluteVariance / expectedCash;

    const exceedsAbsolute = absoluteVariance > absoluteThreshold;
    const exceedsRelative = relativeVariance > relativeThreshold;

    // Both thresholds must be exceeded (AND logic)
    const exceedsThreshold = exceedsAbsolute && exceedsRelative;

    return {
      exceedsThreshold,
      newStatus: exceedsThreshold
        ? ShiftStatus.VARIANCE_REVIEW
        : ShiftStatus.RECONCILING,
    };
  }

  /**
   * Validate that shift can be reconciled
   * Shift must be in CLOSING status
   * @param shiftId - Shift UUID
   * @param userId - User ID requesting the reconcile (for access check)
   * @throws ShiftServiceError if shift cannot be reconciled
   */
  async validateShiftCanReconcile(
    shiftId: string,
    userId: string,
  ): Promise<void> {
    // First validate access to the shift
    const shift = await this.validateShiftAccess(shiftId, userId);

    // Check if shift is locked (CLOSED status)
    this.validateShiftNotLocked(shift);

    // Check if shift is in CLOSING status
    if (shift.status !== ShiftStatus.CLOSING) {
      throw new ShiftServiceError(
        ShiftErrorCode.SHIFT_INVALID_STATUS,
        `Shift with ID ${shiftId} is not in CLOSING status. Current status: ${shift.status}. Only shifts in CLOSING status can be reconciled.`,
        {
          current_status: shift.status,
          expected_status: ShiftStatus.CLOSING,
        },
      );
    }
  }

  /**
   * Reconcile cash for a shift
   * Calculates variance, evaluates threshold, updates shift status, and creates audit log
   * @param shiftId - Shift UUID
   * @param closingCash - Actual cash count
   * @param varianceReason - Optional reason for variance (required if threshold exceeded)
   * @param auditContext - Audit context for logging
   * @returns Reconciliation result with variance details and new status
   * @throws ShiftServiceError if validation fails
   */
  async reconcileCash(
    shiftId: string,
    closingCash: number,
    varianceReason: string | undefined,
    auditContext: AuditContext,
  ): Promise<ReconciliationResult> {
    // Validate shift can be reconciled (access check + status check)
    await this.validateShiftCanReconcile(shiftId, auditContext.userId);

    // Validate closing_cash is positive
    if (closingCash <= 0) {
      throw new ShiftServiceError(
        ShiftErrorCode.INVALID_CASH_AMOUNT,
        "closing_cash must be a positive number",
      );
    }

    // Get shift to access expected_cash
    const shift = await prisma.shift.findUnique({
      where: { shift_id: shiftId },
      select: {
        shift_id: true,
        store_id: true,
        expected_cash: true,
        status: true,
      },
    });

    if (!shift) {
      throw new ShiftServiceError(
        ShiftErrorCode.SHIFT_NOT_FOUND,
        `Shift with ID ${shiftId} not found`,
      );
    }

    // Calculate variance
    if (!shift.expected_cash) {
      throw new ShiftServiceError(
        ShiftErrorCode.SHIFT_INVALID_STATUS,
        "Shift expected_cash is required for reconciliation",
      );
    }
    const expectedCash = shift.expected_cash.toNumber();
    const varianceAmount = this.calculateVariance(closingCash, expectedCash);
    const variancePercentage = (varianceAmount / expectedCash) * 100;

    // Evaluate variance threshold
    const { exceedsThreshold, newStatus } = this.evaluateVarianceThreshold(
      varianceAmount,
      expectedCash,
    );

    // Validate variance_reason is provided when threshold is exceeded
    if (exceedsThreshold && !varianceReason) {
      throw new ShiftServiceError(
        ShiftErrorCode.VARIANCE_REASON_REQUIRED,
        "variance_reason is required when variance exceeds threshold ($5 absolute or 1% relative)",
        {
          variance_amount: varianceAmount,
          variance_percentage: variancePercentage,
          expected_cash: expectedCash,
        },
      );
    }

    // Update shift and create audit log in a transaction for atomicity
    const result = await prisma.$transaction(async (tx) => {
      // Update shift with reconciliation data
      // Note: reconciled_at and reconciled_by are tracked via audit log, not database fields
      const updatedShift = await tx.shift.update({
        where: { shift_id: shiftId },
        data: {
          status: newStatus,
          closing_cash: closingCash,
          variance: varianceAmount,
          variance_reason: varianceReason || null,
        },
      });

      // Create audit log entry (non-blocking - don't fail if audit fails)
      try {
        await tx.auditLog.create({
          data: {
            user_id: auditContext.userId,
            action: "SHIFT_CASH_RECONCILED",
            table_name: "shifts",
            record_id: shiftId,
            new_values: {
              shift_id: shiftId,
              store_id: shift.store_id,
              status: newStatus,
              closing_cash: closingCash.toString(),
              expected_cash: expectedCash.toString(),
              variance_amount: varianceAmount.toString(),
              variance_percentage: variancePercentage.toString(),
              variance_reason: varianceReason || null,
              reconciled_at: new Date().toISOString(),
              reconciled_by: auditContext.userId,
            } as Record<string, any>,
            ip_address: auditContext.ipAddress,
            user_agent: auditContext.userAgent,
            reason: `Cash reconciled by ${auditContext.userEmail} (roles: ${auditContext.userRoles.join(", ")})`,
          },
        });
      } catch (auditError) {
        // Log the audit failure but don't fail the reconciliation
        console.error(
          "Failed to create audit log for cash reconciliation:",
          auditError,
        );
      }

      // Return reconciliation result with metadata from audit context
      const reconciledAt = new Date();
      return {
        shift_id: updatedShift.shift_id,
        status: updatedShift.status,
        closing_cash: closingCash,
        expected_cash: expectedCash,
        variance_amount: varianceAmount,
        variance_percentage: variancePercentage,
        variance_reason: varianceReason,
        reconciled_at: reconciledAt,
        reconciled_by: auditContext.userId,
      };
    });

    // Invalidate report cache since shift data changed
    await this.invalidateReportCache(shiftId);

    return result;
  }

  /**
   * Validate that a shift can be approved (is in VARIANCE_REVIEW status)
   * @param shiftId - Shift UUID
   * @param userId - User ID for access validation
   * @throws ShiftServiceError if shift cannot be approved
   */
  async validateShiftCanApprove(
    shiftId: string,
    userId: string,
  ): Promise<void> {
    // First validate access to the shift
    const shift = await this.validateShiftAccess(shiftId, userId);

    // Check if shift is in VARIANCE_REVIEW status
    if (shift.status !== ShiftStatus.VARIANCE_REVIEW) {
      throw new ShiftServiceError(
        ShiftErrorCode.SHIFT_NOT_VARIANCE_REVIEW,
        `Shift with ID ${shiftId} is not in VARIANCE_REVIEW status. Current status: ${shift.status}. Only shifts in VARIANCE_REVIEW status can be approved.`,
        {
          current_status: shift.status,
          expected_status: ShiftStatus.VARIANCE_REVIEW,
        },
      );
    }
  }

  /**
   * Validate that a shift is not locked (not in CLOSED status)
   * @param shift - Shift object to validate
   * @throws ShiftServiceError if shift is locked (CLOSED)
   */
  validateShiftNotLocked(shift: { status: ShiftStatus }): void {
    if (shift.status === ShiftStatus.CLOSED) {
      throw new ShiftServiceError(
        ShiftErrorCode.SHIFT_LOCKED,
        "Shift is CLOSED and cannot be modified",
        {
          current_status: shift.status,
        },
      );
    }
  }

  /**
   * Approve variance for a shift in VARIANCE_REVIEW status
   * Updates shift status to CLOSED, records approval details, and creates audit log
   * @param shiftId - Shift UUID
   * @param varianceReason - Reason for variance approval (required)
   * @param auditContext - Audit context for logging
   * @returns Approval result with shift details and approval metadata
   * @throws ShiftServiceError if validation fails
   */
  async approveVariance(
    shiftId: string,
    varianceReason: string,
    auditContext: AuditContext,
  ): Promise<ApprovalResult> {
    // Validate shift can be approved (access check + status check)
    await this.validateShiftCanApprove(shiftId, auditContext.userId);

    // Validate variance_reason is provided and not empty
    if (!varianceReason || varianceReason.trim().length === 0) {
      throw new ShiftServiceError(
        ShiftErrorCode.VARIANCE_REASON_REQUIRED,
        "variance_reason is required when approving variance",
      );
    }

    // Validate variance_reason length (max 500 characters per schema)
    if (varianceReason.length > 500) {
      throw new ShiftServiceError(
        ShiftErrorCode.VARIANCE_REASON_REQUIRED,
        "variance_reason cannot exceed 500 characters",
      );
    }

    // Get shift to access current data
    const shift = await prisma.shift.findUnique({
      where: { shift_id: shiftId },
      select: {
        shift_id: true,
        store_id: true,
        closing_cash: true,
        expected_cash: true,
        variance: true,
        status: true,
      },
    });

    if (!shift) {
      throw new ShiftServiceError(
        ShiftErrorCode.SHIFT_NOT_FOUND,
        `Shift with ID ${shiftId} not found`,
      );
    }

    // Validate shift has required data
    if (!shift.closing_cash || !shift.expected_cash || !shift.variance) {
      throw new ShiftServiceError(
        ShiftErrorCode.SHIFT_INVALID_STATUS,
        "Shift missing required reconciliation data (closing_cash, expected_cash, or variance)",
      );
    }

    const closingCash = shift.closing_cash.toNumber();
    const expectedCash = shift.expected_cash.toNumber();
    const varianceAmount = shift.variance.toNumber();
    const variancePercentage = (varianceAmount / expectedCash) * 100;

    // Update shift and create audit log in a transaction for atomicity
    const result = await prisma.$transaction(async (tx) => {
      const approvedAt = new Date();
      const closedAt = new Date();

      // Update shift with approval data
      const updatedShift = await tx.shift.update({
        where: { shift_id: shiftId },
        data: {
          status: ShiftStatus.CLOSED,
          variance_reason: varianceReason,
          approved_by: auditContext.userId,
          approved_at: approvedAt,
          closed_at: closedAt,
        },
      });

      // Create audit log entry (non-blocking - don't fail if audit fails)
      try {
        await tx.auditLog.create({
          data: {
            user_id: auditContext.userId,
            action: "SHIFT_VARIANCE_APPROVED",
            table_name: "shifts",
            record_id: shiftId,
            new_values: {
              shift_id: shiftId,
              store_id: shift.store_id,
              status: ShiftStatus.CLOSED,
              closing_cash: closingCash.toString(),
              expected_cash: expectedCash.toString(),
              variance_amount: varianceAmount.toString(),
              variance_percentage: variancePercentage.toString(),
              variance_reason: varianceReason,
              approved_by: auditContext.userId,
              approved_at: approvedAt.toISOString(),
              closed_at: closedAt.toISOString(),
            } as Record<string, any>,
            ip_address: auditContext.ipAddress,
            user_agent: auditContext.userAgent,
            reason: `Variance approved by ${auditContext.userEmail} (roles: ${auditContext.userRoles.join(", ")})`,
          },
        });
      } catch (auditError) {
        // Log the audit failure but don't fail the approval
        console.error(
          "Failed to create audit log for variance approval:",
          auditError,
        );
      }

      // Return approval result
      return {
        shift_id: updatedShift.shift_id,
        status: updatedShift.status,
        closing_cash: closingCash,
        expected_cash: expectedCash,
        variance_amount: varianceAmount,
        variance_percentage: variancePercentage,
        variance_reason: varianceReason,
        approved_by: auditContext.userId,
        approved_at: approvedAt,
        closed_at: closedAt,
      };
    });

    // Create pre-aggregated shift summary (Phase 2.1)
    // This creates a frozen snapshot for fast reporting
    try {
      await shiftSummaryService.createShiftSummary(
        shiftId,
        auditContext.userId,
      );
    } catch (summaryError) {
      // Log but don't fail the close - summary can be regenerated if needed
      console.error(
        `Failed to create shift summary for shift ${shiftId}:`,
        summaryError,
      );
    }

    // Invalidate report cache since shift data changed
    await this.invalidateReportCache(shiftId);

    return result;
  }

  /**
   * Get accessible store IDs for RLS enforcement
   * Story 4.7: Shift Management UI
   * @param userId - User ID
   * @returns Array of store IDs the user can access
   */
  async getAccessibleStoreIds(userId: string): Promise<string[]> {
    // Get user's roles
    const userRoles = await rbacService.getUserRoles(userId);

    // Check for superadmin (system scope - can see all)
    const hasSuperadminRole = userRoles.some(
      (role) =>
        role.scope === "SYSTEM" ||
        role.role_code?.toUpperCase() === "SUPERADMIN",
    );

    if (hasSuperadminRole) {
      // Return all store IDs for superadmin
      const allStores = await prisma.store.findMany({
        select: { store_id: true },
      });
      return allStores.map((s) => s.store_id);
    }

    // Find user's company ID
    const companyRole = userRoles.find(
      (role) => role.scope === "COMPANY" && role.company_id,
    );

    if (companyRole?.company_id) {
      // Get all stores for the company
      const companyStores = await prisma.store.findMany({
        where: { company_id: companyRole.company_id },
        select: { store_id: true },
      });
      return companyStores.map((s) => s.store_id);
    }

    // Check for store-scoped roles
    const storeRoles = userRoles.filter(
      (role) => role.scope === "STORE" && role.store_id,
    );

    if (storeRoles.length > 0) {
      return storeRoles.map((r) => r.store_id!);
    }

    // No accessible stores
    return [];
  }

  /**
   * Query shifts with filters, pagination, and RLS enforcement
   * Story 4.7: Shift Management UI
   * Enforces RLS policies to filter results based on user access
   * @param userId - User ID making the request
   * @param filters - Query filters (status, store_id, date range)
   * @param pagination - Pagination options (limit, offset)
   * @returns ShiftQueryResult with shifts and pagination meta
   */
  async getShifts(
    userId: string,
    filters: ShiftQueryFilters,
    pagination: PaginationOptions,
  ): Promise<ShiftQueryResult> {
    // Story 4.8: Check if user has CASHIER role for cashier-specific filtering
    const userRoles = await rbacService.getUserRoles(userId);
    const hasCashierRole = userRoles.some(
      (role) => role.role_code === "CASHIER",
    );

    // Build where clause with RLS filtering
    const where: Prisma.ShiftWhereInput = {};

    if (hasCashierRole) {
      // Story 4.8: If CASHIER role, filter shifts where cashier_id = user.id
      where.cashier_id = userId;

      // Also apply store_id filter if provided (cashiers can still filter by store)
      if (filters.store_id) {
        where.store_id = filters.store_id;
      }
    } else {
      // If not CASHIER role, use existing store-based RLS filtering
      const accessibleStoreIds = await this.getAccessibleStoreIds(userId);

      // If no accessible stores, return empty result
      if (accessibleStoreIds.length === 0) {
        return {
          shifts: [],
          meta: {
            total: 0,
            limit: pagination.limit,
            offset: pagination.offset,
            has_more: false,
          },
        };
      }

      // RLS: Filter to only accessible stores
      where.store_id = filters.store_id
        ? // If store_id is specified, only allow if it's in accessible stores
          accessibleStoreIds.includes(filters.store_id)
          ? filters.store_id
          : "00000000-0000-0000-0000-000000000000" // Invalid UUID to return no results
        : { in: accessibleStoreIds };
    }

    // Add status filter if provided
    if (filters.status) {
      where.status = filters.status;
    }

    // Add date range filter if provided (filter by opened_at)
    if (filters.from || filters.to) {
      where.opened_at = {};
      if (filters.from) {
        where.opened_at.gte = new Date(filters.from);
      }
      if (filters.to) {
        where.opened_at.lte = new Date(filters.to);
      }
    }

    // Build include clause for related data
    const prismaInclude: Prisma.ShiftInclude = {
      store: {
        select: {
          name: true,
        },
      },
      cashier: {
        select: {
          name: true,
        },
      },
      opener: {
        select: {
          name: true,
        },
      },
    };

    // Execute count query for total
    const total = await prisma.shift.count({ where });

    // Execute main query with pagination
    const shifts = await prisma.shift.findMany({
      where,
      include: prismaInclude,
      orderBy: { opened_at: "desc" },
      take: pagination.limit,
      skip: pagination.offset,
    });

    // Transform to response format
    // DB-006: TENANT_ISOLATION - day_summary_id is within same store scope
    const transformedShifts: ShiftResponse[] = shifts.map((shift: any) => ({
      shift_id: shift.shift_id,
      store_id: shift.store_id,
      opened_by: shift.opened_by,
      cashier_id: shift.cashier_id,
      pos_terminal_id: shift.pos_terminal_id,
      status: shift.status,
      opening_cash: Number(shift.opening_cash),
      closing_cash: shift.closing_cash ? Number(shift.closing_cash) : null,
      expected_cash: shift.expected_cash ? Number(shift.expected_cash) : null,
      variance_amount: shift.variance_amount
        ? Number(shift.variance_amount)
        : null,
      variance_percentage: shift.variance_percentage
        ? Number(shift.variance_percentage)
        : null,
      opened_at: shift.opened_at.toISOString(),
      closed_at: shift.closed_at ? shift.closed_at.toISOString() : null,
      store_name: shift.store?.name,
      cashier_name: shift.cashier?.name,
      opener_name: shift.opener?.name,
      // Business day association for correct shift-to-day grouping
      day_summary_id: shift.day_summary_id || null,
    }));

    return {
      shifts: transformedShifts,
      meta: {
        total,
        limit: pagination.limit,
        offset: pagination.offset,
        has_more: pagination.offset + shifts.length < total,
      },
    };
  }

  /**
   * Get shift by ID with full details including transaction count and variance information
   * Story 4.7: Shift Management UI
   * Enforces RLS policies to ensure user can only access shifts for their accessible stores
   * @param shiftId - Shift UUID
   * @param userId - User ID making the request
   * @returns Shift detail response with transaction count and variance details
   * @throws ShiftServiceError if shift not found or user lacks access
   */
  async getShiftById(
    shiftId: string,
    userId: string,
  ): Promise<ShiftDetailResponse> {
    // Validate shift access (RLS check)
    await this.validateShiftAccess(shiftId, userId);

    // Build include clause for related data
    const prismaInclude: Prisma.ShiftInclude = {
      store: {
        select: {
          name: true,
        },
      },
      cashier: {
        select: {
          name: true,
        },
      },
      opener: {
        select: {
          name: true,
        },
      },
    };

    // Get shift with related data
    const shift = await prisma.shift.findUnique({
      where: { shift_id: shiftId },
      include: prismaInclude,
    });

    if (!shift) {
      throw new ShiftServiceError(
        ShiftErrorCode.SHIFT_NOT_FOUND,
        `Shift with ID ${shiftId} not found or you do not have access`,
      );
    }

    // Calculate transaction count for this shift
    const transactionCount = await prisma.transaction.count({
      where: {
        shift_id: shiftId,
      },
    });

    // Get approved_by user name if applicable
    let approvedByName: string | null = null;
    if (shift.approved_by) {
      const approver = await prisma.user.findUnique({
        where: { user_id: shift.approved_by },
        select: { name: true },
      });
      if (approver) {
        approvedByName = approver.name;
      }
    }

    // Get ShiftSummary for more reliable variance data
    // The shift record may have null variance/expected_cash but ShiftSummary is populated at close time
    const shiftSummary = await prisma.shiftSummary.findUnique({
      where: { shift_id: shiftId },
      select: {
        expected_cash: true,
        cash_variance: true,
        variance_percentage: true,
      },
    });

    // Calculate variance_amount and variance_percentage
    // Prefer ShiftSummary values (more reliable) over shift record values
    const varianceAmount = shiftSummary?.cash_variance
      ? Number(shiftSummary.cash_variance)
      : shift.variance
        ? Number(shift.variance)
        : null;
    const expectedCash = shiftSummary?.expected_cash
      ? Number(shiftSummary.expected_cash)
      : shift.expected_cash
        ? Number(shift.expected_cash)
        : null;
    const variancePercentage = shiftSummary?.variance_percentage
      ? Number(shiftSummary.variance_percentage)
      : varianceAmount !== null && expectedCash !== null && expectedCash > 0
        ? (varianceAmount / expectedCash) * 100
        : null;

    // Transform to response format
    // Warn if pos_terminal_id is missing to surface data integrity issues
    if (shift.pos_terminal_id === null || shift.pos_terminal_id === undefined) {
      console.warn(
        `[ShiftService] Missing pos_terminal_id for shift ${shift.shift_id}. This may indicate a data integrity issue.`,
      );
    }
    // @security SEC-014: shift_number is a sequential business identifier, safe for display
    const response: ShiftDetailResponse = {
      shift_id: shift.shift_id,
      store_id: shift.store_id,
      opened_by: shift.opened_by,
      cashier_id: shift.cashier_id,
      pos_terminal_id: shift.pos_terminal_id as string | null,
      status: shift.status,
      shift_number: shift.shift_number,
      opening_cash: Number(shift.opening_cash),
      closing_cash: shift.closing_cash ? Number(shift.closing_cash) : null,
      expected_cash: expectedCash,
      variance_amount: varianceAmount,
      variance_percentage: variancePercentage,
      opened_at: shift.opened_at.toISOString(),
      closed_at: shift.closed_at ? shift.closed_at.toISOString() : null,
      store_name: shift.store?.name,
      cashier_name: shift.cashier?.name,
      opener_name: shift.opener?.name,
      // Business day association - links shift to its DaySummary
      day_summary_id: shift.day_summary_id || null,
      transaction_count: transactionCount,
      variance_reason: shift.variance_reason || null,
      approved_by: shift.approved_by || null,
      approved_by_name: approvedByName,
      approved_at: shift.approved_at ? shift.approved_at.toISOString() : null,
    };

    return response;
  }

  /**
   * Generate shift report for a CLOSED shift
   * @param shiftId - Shift UUID
   * @param userId - User UUID (for RLS validation)
   * @returns Shift report data
   * @throws ShiftServiceError if validation fails
   * @note Full implementation will be completed in Task 2
   */
  async generateShiftReport(
    shiftId: string,
    userId: string,
  ): Promise<ShiftReportData> {
    // Validate shiftId format (basic validation)
    if (!shiftId || typeof shiftId !== "string") {
      throw new ShiftServiceError(
        ShiftErrorCode.SHIFT_NOT_FOUND,
        "Invalid shift ID",
      );
    }

    // Check Redis cache for existing report data
    const redis = await getRedisClient();
    const cacheKey = this.getReportCacheKey(shiftId);
    if (redis) {
      try {
        const cachedData = await redis.get(cacheKey);
        if (cachedData) {
          // Return cached data
          return JSON.parse(cachedData) as ShiftReportData;
        }
      } catch (error) {
        // Log but continue - cache miss is acceptable
        console.warn(
          "Redis cache read failed, generating fresh report:",
          error,
        );
      }
    }

    // Query shift data (access check done after fetching)
    const shift = await prisma.shift.findUnique({
      where: { shift_id: shiftId },
      include: {
        store: {
          select: {
            store_id: true,
            name: true,
          },
        },
        opener: {
          select: {
            user_id: true,
            name: true,
            email: true,
          },
        },
        cashier: {
          select: {
            cashier_id: true,
            name: true,
          },
        },
      },
    });

    // Validate shift exists
    if (!shift) {
      throw new ShiftServiceError(
        ShiftErrorCode.SHIFT_NOT_FOUND,
        `Shift with ID ${shiftId} not found or you do not have access`,
        { shift_id: shiftId },
      );
    }

    // Validate user has access to the store this shift belongs to
    const hasAccess = await this.checkUserStoreAccess(userId, shift.store_id);
    if (!hasAccess) {
      // Return same error as "not found" to avoid leaking information about shift existence
      throw new ShiftServiceError(
        ShiftErrorCode.SHIFT_NOT_FOUND,
        `Shift with ID ${shiftId} not found or you do not have access`,
        { shift_id: shiftId },
      );
    }

    // Validate shift status is CLOSED
    if (shift.status !== ShiftStatus.CLOSED) {
      throw new ShiftServiceError(
        ShiftErrorCode.SHIFT_NOT_CLOSED,
        `Shift is not in CLOSED status. Current status: ${shift.status}. Reports are only available for closed shifts.`,
        {
          shift_id: shiftId,
          current_status: shift.status,
          expected_status: ShiftStatus.CLOSED,
        },
      );
    }

    // Query all transactions for this shift with line items and payments
    // RLS policies automatically filter by user access
    const transactions = await prisma.transaction.findMany({
      where: {
        shift_id: shiftId,
      },
      include: {
        line_items: true,
        payments: true,
        cashier: {
          select: {
            user_id: true,
            name: true,
          },
        },
      },
      orderBy: {
        timestamp: "asc",
      },
    });

    // Aggregate transaction data
    let totalSales = 0;
    const transactionCount = transactions.length;

    // Calculate total sales from transaction totals
    transactions.forEach((tx) => {
      totalSales += Number(tx.total);
    });

    // Calculate payment method breakdown
    const paymentMethodMap = new Map<
      string,
      { total: number; count: number }
    >();
    transactions.forEach((tx) => {
      tx.payments.forEach((payment) => {
        const method = payment.method;
        const amount = Number(payment.amount);
        const existing = paymentMethodMap.get(method);
        if (existing) {
          existing.total += amount;
          existing.count += 1;
        } else {
          paymentMethodMap.set(method, { total: amount, count: 1 });
        }
      });
    });

    // Convert payment method map to array
    const paymentMethods = Array.from(paymentMethodMap.entries()).map(
      ([method, data]) => ({
        method,
        total: data.total,
        count: data.count,
      }),
    );

    // Get variance approval details if applicable
    let approvedByUser = null;
    if (shift.approved_by) {
      const approver = await prisma.user.findUnique({
        where: { user_id: shift.approved_by },
        select: {
          user_id: true,
          name: true,
        },
      });
      if (approver) {
        approvedByUser = {
          user_id: approver.user_id,
          name: approver.name,
        };
      }
    }

    // Format transaction list for report
    const formattedTransactions = transactions.map((tx) => ({
      transaction_id: tx.transaction_id,
      timestamp: tx.timestamp.toISOString(),
      total: Number(tx.total),
      cashier: tx.cashier
        ? {
            user_id: tx.cashier.user_id,
            name: tx.cashier.name,
          }
        : null,
      line_items: tx.line_items.map((li) => ({
        product_name: li.name,
        quantity: Number(li.quantity),
        price: Number(li.unit_price),
        subtotal: Number(li.line_total),
      })),
      payments: tx.payments.map((p) => ({
        method: p.method,
        amount: Number(p.amount),
      })),
    }));

    // Calculate variance amount and percentage
    const varianceAmount = shift.variance ? Number(shift.variance) : 0;
    const expectedCash = shift.expected_cash ? Number(shift.expected_cash) : 0;
    const variancePercentage =
      expectedCash > 0 ? (varianceAmount / expectedCash) * 100 : 0;

    // Return structured report data
    const reportData: ShiftReportData = {
      shift: {
        shift_id: shift.shift_id,
        store_id: shift.store_id,
        store_name: shift.store?.name || null,
        opened_by: shift.opener
          ? {
              user_id: shift.opener.user_id,
              name: shift.opener.name,
            }
          : null,
        cashier_id: shift.cashier_id,
        cashier: shift.cashier
          ? {
              cashier_id: shift.cashier.cashier_id,
              name: shift.cashier.name,
            }
          : null,
        opened_at: shift.opened_at.toISOString(),
        closed_at: shift.closed_at?.toISOString() || null,
        status: shift.status,
      },
      summary: {
        total_sales: totalSales,
        transaction_count: transactionCount,
        opening_cash: Number(shift.opening_cash),
        closing_cash: Number(shift.closing_cash || 0),
        expected_cash: expectedCash,
        variance_amount: varianceAmount,
        variance_percentage: variancePercentage,
      },
      payment_methods: paymentMethods,
      variance:
        varianceAmount !== 0
          ? {
              variance_amount: varianceAmount,
              variance_percentage: variancePercentage,
              variance_reason: shift.variance_reason || null,
              approved_by: approvedByUser,
              approved_at: shift.approved_at?.toISOString() || null,
            }
          : null,
      transactions: formattedTransactions,
    };

    // Cache report data in Redis with 1 hour expiration
    if (redis) {
      try {
        await redis.setEx(
          cacheKey,
          3600, // 1 hour expiration
          JSON.stringify(reportData),
        );
      } catch (error) {
        // Log but don't fail - caching is best effort
        console.warn("Failed to cache report data:", error);
      }
    }

    return reportData;
  }

  /**
   * Get Redis cache key for shift report
   * @param shiftId - Shift UUID
   * @returns Cache key string
   */
  private getReportCacheKey(shiftId: string): string {
    return `shift:report:${shiftId}`;
  }

  /**
   * Invalidate cached report data for a shift
   * @param shiftId - Shift UUID
   */
  async invalidateReportCache(shiftId: string): Promise<void> {
    const redis = await getRedisClient();
    if (redis) {
      try {
        const cacheKey = this.getReportCacheKey(shiftId);
        await redis.del(cacheKey);
      } catch (error) {
        // Log but don't fail - cache invalidation is best effort
        console.warn("Failed to invalidate report cache:", error);
      }
    }
  }

  /**
   * Close a shift directly in a single step (simplified flow)
   * Goes directly from OPEN/ACTIVE → CLOSED without intermediate CLOSING state
   * No expected cash calculation - just records actual cash and closes
   *
   * Story: Simplified Shift Closing
   *
   * @param shiftId - Shift UUID
   * @param closingCash - Actual cash in drawer
   * @param auditContext - Audit context for logging
   * @returns DirectCloseResult with closed shift details
   * @throws ShiftServiceError if validation fails
   */
  async closeShiftDirect(
    shiftId: string,
    closingCash: number,
    auditContext: AuditContext,
  ): Promise<DirectCloseResult> {
    // Validate closing_cash is non-negative
    if (closingCash < 0) {
      throw new ShiftServiceError(
        ShiftErrorCode.INVALID_CASH_AMOUNT,
        "closing_cash must be a non-negative number",
      );
    }

    // Validate shift exists and user has access
    const shift = await this.validateShiftAccess(shiftId, auditContext.userId);

    // Validate shift is in a closeable status (OPEN or ACTIVE)
    const closeableStatuses: ShiftStatus[] = [
      ShiftStatus.OPEN,
      ShiftStatus.ACTIVE,
    ];
    if (!closeableStatuses.includes(shift.status)) {
      if (shift.status === ShiftStatus.CLOSED) {
        throw new ShiftServiceError(
          ShiftErrorCode.SHIFT_ALREADY_CLOSED,
          `Shift with ID ${shiftId} is already closed`,
          { current_status: shift.status },
        );
      }
      if (shift.status === ShiftStatus.CLOSING) {
        // Allow closing from CLOSING status as well (in case of stuck state)
        // Fall through to close the shift
      } else {
        throw new ShiftServiceError(
          ShiftErrorCode.SHIFT_INVALID_STATUS,
          `Shift with ID ${shiftId} cannot be closed. Current status: ${shift.status}. Only OPEN or ACTIVE shifts can be closed.`,
          {
            current_status: shift.status,
            allowed_statuses: closeableStatuses,
          },
        );
      }
    }

    const closedAt = new Date();

    // Update shift and create audit log in a transaction
    const result = await prisma.$transaction(async (tx) => {
      // Update shift to CLOSED with closing cash
      const updatedShift = await tx.shift.update({
        where: { shift_id: shiftId },
        data: {
          status: ShiftStatus.CLOSED,
          closing_cash: closingCash,
          closed_at: closedAt,
        },
      });

      // Create audit log entry
      try {
        await tx.auditLog.create({
          data: {
            user_id: auditContext.userId,
            action: "SHIFT_CLOSED_DIRECT",
            table_name: "shifts",
            record_id: shiftId,
            new_values: {
              shift_id: shiftId,
              store_id: shift.store_id,
              status: ShiftStatus.CLOSED,
              closing_cash: closingCash.toString(),
              closed_at: closedAt.toISOString(),
              closed_by: auditContext.userId,
            } as Record<string, any>,
            ip_address: auditContext.ipAddress,
            user_agent: auditContext.userAgent,
            reason: `Shift closed directly by ${auditContext.userEmail} (roles: ${auditContext.userRoles.join(", ")})`,
          },
        });
      } catch (auditError) {
        // Log but don't fail the close operation
        console.error(
          "Failed to create audit log for direct shift close:",
          auditError,
        );
      }

      return {
        shift_id: updatedShift.shift_id,
        status: updatedShift.status,
        closing_cash: closingCash,
        closed_at: closedAt,
        closed_by: auditContext.userId,
      };
    });

    // Create pre-aggregated shift summary (Phase 2.1)
    // This creates a frozen snapshot for fast reporting
    try {
      await shiftSummaryService.createShiftSummary(
        shiftId,
        auditContext.userId,
      );
    } catch (summaryError) {
      // Log but don't fail the close - summary can be regenerated if needed
      console.error(
        `Failed to create shift summary for shift ${shiftId}:`,
        summaryError,
      );
    }

    // Invalidate report cache
    await this.invalidateReportCache(shiftId);

    return result;
  }

  /**
   * Get shift summary with payment methods and sales totals
   * Lighter-weight alternative to generateShiftReport for closed shifts
   *
   * Story: Client Owner Dashboard - Shift Detail View
   *
   * Phase 2.7: Updated to read from pre-calculated ShiftSummary table for performance.
   * Falls back to runtime aggregation for shifts closed before summary tables existed.
   *
   * @param shiftId - Shift UUID
   * @param userId - User UUID (for RLS validation)
   * @returns Shift summary data with payment methods and totals
   * @throws ShiftServiceError if validation fails
   */
  async getShiftSummary(
    shiftId: string,
    userId: string,
  ): Promise<{
    shift_id: string;
    total_sales: number;
    transaction_count: number;
    payment_methods: Array<{ method: string; total: number; count: number }>;
    // Enhanced fields from ShiftSummary (when available)
    gross_sales?: number;
    returns_total?: number;
    discounts_total?: number;
    net_sales?: number;
    tax_collected?: number;
    avg_transaction?: number;
    items_sold_count?: number;
    from_summary_table?: boolean;
  }> {
    // Validate shiftId format
    if (!shiftId || typeof shiftId !== "string") {
      throw new ShiftServiceError(
        ShiftErrorCode.SHIFT_NOT_FOUND,
        "Invalid shift ID",
      );
    }

    // Query shift data with minimal includes
    const shift = await prisma.shift.findUnique({
      where: { shift_id: shiftId },
      select: {
        shift_id: true,
        store_id: true,
        status: true,
      },
    });

    // Validate shift exists
    if (!shift) {
      throw new ShiftServiceError(
        ShiftErrorCode.SHIFT_NOT_FOUND,
        `Shift with ID ${shiftId} not found or you do not have access`,
        { shift_id: shiftId },
      );
    }

    // Validate user has access to the store this shift belongs to
    const hasAccess = await this.checkUserStoreAccess(userId, shift.store_id);
    if (!hasAccess) {
      throw new ShiftServiceError(
        ShiftErrorCode.SHIFT_NOT_FOUND,
        `Shift with ID ${shiftId} not found or you do not have access`,
        { shift_id: shiftId },
      );
    }

    // Validate shift status is CLOSED (summary only available for closed shifts)
    if (shift.status !== ShiftStatus.CLOSED) {
      throw new ShiftServiceError(
        ShiftErrorCode.SHIFT_NOT_CLOSED,
        `Shift is not in CLOSED status. Current status: ${shift.status}. Summary is only available for closed shifts.`,
        {
          shift_id: shiftId,
          current_status: shift.status,
          expected_status: ShiftStatus.CLOSED,
        },
      );
    }

    // =========================================================================
    // Phase 2.7: Try to read from pre-calculated ShiftSummary table first
    // This provides ~10-50x faster response times for closed shifts
    // =========================================================================
    try {
      const shiftSummary = await shiftSummaryService.getByShiftId(shiftId, {
        include_tender_summaries: true,
      });

      if (shiftSummary) {
        // Convert tender summaries to payment_methods format for backward compatibility
        const paymentMethods = shiftSummary.tender_summaries.map((tender) => ({
          method: tender.tender_code,
          total: Number(tender.net_amount),
          count: tender.transaction_count,
        }));

        return {
          shift_id: shiftId,
          total_sales: Number(shiftSummary.net_sales),
          transaction_count: shiftSummary.transaction_count,
          payment_methods: paymentMethods,
          // Enhanced fields from ShiftSummary
          gross_sales: Number(shiftSummary.gross_sales),
          returns_total: Number(shiftSummary.returns_total),
          discounts_total: Number(shiftSummary.discounts_total),
          net_sales: Number(shiftSummary.net_sales),
          tax_collected: Number(shiftSummary.tax_collected),
          avg_transaction: Number(shiftSummary.avg_transaction),
          items_sold_count: shiftSummary.items_sold_count,
          from_summary_table: true,
        };
      }
    } catch (error) {
      // Log warning but continue with fallback calculation
      console.warn(
        `[ShiftService] Could not retrieve shift summary from table for shift ${shiftId}, using fallback calculation:`,
        error instanceof Error ? error.message : error,
      );
    }

    // =========================================================================
    // Fallback: Runtime aggregation for shifts without pre-calculated summaries
    // This handles historical shifts closed before summary tables were implemented
    // =========================================================================

    // Query transactions with payments only (no line items needed for basic summary)
    const transactions = await prisma.transaction.findMany({
      where: { shift_id: shiftId },
      include: {
        payments: true,
      },
    });

    // Calculate totals
    let totalSales = 0;
    const transactionCount = transactions.length;

    transactions.forEach((tx) => {
      totalSales += Number(tx.total);
    });

    // Calculate payment method breakdown
    const paymentMethodMap = new Map<
      string,
      { total: number; count: number }
    >();
    transactions.forEach((tx) => {
      tx.payments.forEach((payment) => {
        // Prefer tender_code if available (Phase 1.5), fall back to legacy method field
        const method = payment.tender_code || payment.method;
        const amount = Number(payment.amount);
        const existing = paymentMethodMap.get(method);
        if (existing) {
          existing.total += amount;
          existing.count += 1;
        } else {
          paymentMethodMap.set(method, { total: amount, count: 1 });
        }
      });
    });

    // Convert payment method map to array
    const paymentMethods = Array.from(paymentMethodMap.entries()).map(
      ([method, data]) => ({
        method,
        total: data.total,
        count: data.count,
      }),
    );

    return {
      shift_id: shiftId,
      total_sales: totalSales,
      transaction_count: transactionCount,
      payment_methods: paymentMethods,
      from_summary_table: false,
    };
  }

  /**
   * Get comprehensive lottery summary for a closed shift
   *
   * Returns all data needed to display the full reconciliation view matching
   * the Day Close Wizard Step 3 layout, including:
   * - Shift info (terminal, cashier, timing, cash)
   * - Lottery totals and per-bin breakdown
   * - Money received breakdown
   * - Sales breakdown by department
   * - Returned, depleted, and activated packs
   *
   * @security
   * - DB-006: TENANT_ISOLATION - Validates user access to store
   * - SEC-006: SQL_INJECTION - Uses Prisma ORM, no raw SQL
   * - API-003: ERROR_HANDLING - Throws typed errors for handling
   *
   * @param shiftId - UUID of the shift
   * @param userId - UUID of the requesting user (for access control)
   * @returns Complete lottery summary for the shift
   * @throws ShiftServiceError if shift not found or access denied
   */
  async getShiftLotterySummary(
    shiftId: string,
    userId: string,
  ): Promise<ShiftLotterySummaryResponse> {
    // Validate shiftId format
    if (!shiftId || typeof shiftId !== "string") {
      throw new ShiftServiceError(
        ShiftErrorCode.SHIFT_NOT_FOUND,
        "Invalid shift ID",
      );
    }

    // Query shift with all related data needed for summary
    const shift = await prisma.shift.findUnique({
      where: { shift_id: shiftId },
      include: {
        store: {
          select: {
            store_id: true,
            timezone: true,
          },
        },
        cashier: {
          select: {
            name: true,
          },
        },
        pos_terminal: {
          select: {
            name: true,
          },
        },
      },
    });

    // Validate shift exists
    if (!shift) {
      throw new ShiftServiceError(
        ShiftErrorCode.SHIFT_NOT_FOUND,
        `Shift with ID ${shiftId} not found`,
        { shift_id: shiftId },
      );
    }

    // DB-006: TENANT_ISOLATION - Validate user has access to this store
    const hasAccess = await this.checkUserStoreAccess(userId, shift.store_id);
    if (!hasAccess) {
      throw new ShiftServiceError(
        ShiftErrorCode.SHIFT_NOT_FOUND,
        `Shift with ID ${shiftId} not found or you do not have access`,
        { shift_id: shiftId },
      );
    }

    // Get ShiftSummary if available (contains business_date and aggregated data)
    const shiftSummary = await prisma.shiftSummary.findUnique({
      where: { shift_id: shiftId },
      include: {
        tender_summaries: true,
        department_summaries: true,
      },
    });

    // Determine business date for LOTTERY lookup
    // IMPORTANT: For lottery data, we must use shift.closed_at (when lottery was reconciled)
    // NOT ShiftSummary.business_date (which may be from shift.opened_at)
    // The lottery day is created/closed based on when the shift ends, not when it starts
    // A shift opened on Jan 4 but closed on Jan 6 has its lottery on Jan 6's business day
    const lotteryBusinessDate = shift.closed_at || shift.opened_at;

    // Format business date as YYYY-MM-DD for queries
    const businessDateStr = lotteryBusinessDate.toISOString().split("T")[0];

    // Query LotteryBusinessDay for this store and date
    // Only fetch status and closed_at - day_packs are NOT included because
    // bins_closed data belongs to Day Close, not individual shifts
    // PHASE 3: Status-based lookup - find lottery day linked to same day_summary as shift
    // DB-006: TENANT_ISOLATION - store_id enforces tenant scoping
    const lotteryBusinessDay = await prisma.lotteryBusinessDay.findFirst({
      where: {
        store_id: shift.store_id,
        business_date: new Date(businessDateStr),
      },
      select: {
        status: true,
        closed_at: true,
        business_date: true,
      },
      orderBy: {
        opened_at: "desc", // Most recent first
      },
    });

    // =========================================================================
    // ARCHITECTURAL FIX: bins_closed is DAY-LEVEL data, not SHIFT-LEVEL
    // =========================================================================
    // DB-006: TENANT_ISOLATION - Lottery bin closings belong to LotteryBusinessDay
    // SEC-014: Data integrity - Shifts should NOT display other shifts' lottery data
    //
    // The bins_closed array is intentionally empty for shift summary responses.
    // Lottery closing data (LotteryDayPack) belongs to the Day Close, not to
    // individual shifts. When a user clicks on a "Day Close" row in Lottery
    // Management, they will see the bins_closed data from the dedicated
    // Day Close reconciliation endpoint.
    //
    // This prevents the bug where lottery data from a day close "leaks" into
    // shifts that happened on the same calendar date but weren't involved in
    // the lottery close.
    // =========================================================================
    const binsClosed: ShiftLotterySummaryResponse["bins_closed"] = [];

    // Determine business period boundaries for pack queries
    // For closed shift summary view, we show packs acted on during the SHIFT period
    // This is because a shift may span multiple lottery business days, and we want
    // to show all activity that happened during that shift regardless of lottery day boundaries
    const businessPeriodStart = shift.opened_at;
    const businessPeriodEnd = shift.closed_at || undefined;

    // Query depleted packs for this business period
    // DB-006: TENANT_ISOLATION - store_id filter enforces tenant scoping
    const depletedPacks = await prisma.lotteryPack.findMany({
      where: {
        store_id: shift.store_id,
        status: "DEPLETED",
        depleted_at: {
          gte: businessPeriodStart,
          ...(businessPeriodEnd ? { lte: businessPeriodEnd } : {}),
        },
      },
      include: {
        game: {
          select: {
            name: true,
            price: true,
          },
        },
        bin: {
          select: {
            display_order: true,
          },
        },
      },
      orderBy: { depleted_at: "desc" },
    });

    const depletedPacksData: ShiftLotterySummaryResponse["depleted_packs"] =
      depletedPacks.map((pack) => ({
        pack_id: pack.pack_id,
        pack_number: pack.pack_number,
        game_name: pack.game.name,
        game_price: Number(pack.game.price),
        bin_number: pack.bin ? pack.bin.display_order + 1 : 0,
        activated_at: pack.activated_at?.toISOString() || "",
        depleted_at: pack.depleted_at?.toISOString() || "",
      }));

    // Query returned packs for this business period
    const returnedPacks = await prisma.lotteryPack.findMany({
      where: {
        store_id: shift.store_id,
        status: "RETURNED",
        returned_at: {
          gte: businessPeriodStart,
          ...(businessPeriodEnd ? { lte: businessPeriodEnd } : {}),
        },
      },
      include: {
        game: {
          select: {
            name: true,
            price: true,
          },
        },
        bin: {
          select: {
            display_order: true,
          },
        },
        returnedByUser: {
          select: {
            name: true,
          },
        },
      },
      orderBy: { returned_at: "desc" },
    });

    const returnedPacksData: ShiftLotterySummaryResponse["returned_packs"] =
      returnedPacks.map((pack) => ({
        pack_id: pack.pack_id,
        pack_number: pack.pack_number,
        game_name: pack.game.name,
        game_price: Number(pack.game.price),
        bin_number: pack.bin ? pack.bin.display_order + 1 : 0,
        activated_at: pack.activated_at?.toISOString() || "",
        returned_at: pack.returned_at?.toISOString() || "",
        return_reason: pack.return_reason || null,
        return_notes: pack.return_notes || null,
        last_sold_serial: pack.last_sold_serial || null,
        tickets_sold_on_return: pack.tickets_sold_on_return ?? null,
        return_sales_amount: pack.return_sales_amount
          ? Number(pack.return_sales_amount)
          : null,
        returned_by_name: pack.returnedByUser?.name || null,
      }));

    // Query activated packs for this business period
    const activatedPacks = await prisma.lotteryPack.findMany({
      where: {
        store_id: shift.store_id,
        activated_at: {
          gte: businessPeriodStart,
          ...(businessPeriodEnd ? { lte: businessPeriodEnd } : {}),
          not: null,
        },
      },
      include: {
        game: {
          select: {
            name: true,
            price: true,
          },
        },
        bin: {
          select: {
            display_order: true,
          },
        },
      },
      orderBy: { activated_at: "desc" },
    });

    const activatedPacksData: ShiftLotterySummaryResponse["activated_packs"] =
      activatedPacks.map((pack) => ({
        pack_id: pack.pack_id,
        pack_number: pack.pack_number,
        game_name: pack.game.name,
        game_price: Number(pack.game.price),
        bin_number: pack.bin ? pack.bin.display_order + 1 : 0,
        activated_at: pack.activated_at?.toISOString() || "",
        status: pack.status as "ACTIVE" | "DEPLETED" | "RETURNED",
      }));

    // Build money received summary from ShiftSummary tender data
    const moneyReceived: ShiftLotterySummaryResponse["money_received"] = {
      pos: {
        cash: 0,
        creditCard: 0,
        debitCard: 0,
        ebt: 0,
        cashPayouts: 0,
        lotteryPayouts: shiftSummary?.lottery_cashes
          ? Number(shiftSummary.lottery_cashes)
          : 0,
        gamingPayouts: 0,
      },
      reports: {
        cashPayouts: 0,
        lotteryPayouts: shiftSummary?.lottery_cashes
          ? Number(shiftSummary.lottery_cashes)
          : 0,
        gamingPayouts: 0,
      },
    };

    // Map tender summaries to money received
    if (shiftSummary?.tender_summaries) {
      for (const tender of shiftSummary.tender_summaries) {
        const code = tender.tender_code.toUpperCase();
        const amount = Number(tender.total_amount);

        if (code === "CASH" || code.includes("CASH")) {
          moneyReceived.pos.cash = amount;
        } else if (code === "CREDIT" || code.includes("CREDIT")) {
          moneyReceived.pos.creditCard = amount;
        } else if (code === "DEBIT" || code.includes("DEBIT")) {
          moneyReceived.pos.debitCard = amount;
        } else if (code === "EBT" || code.includes("EBT")) {
          moneyReceived.pos.ebt = amount;
        }
      }
    }

    // Build sales breakdown from ShiftSummary department data
    const salesBreakdown: ShiftLotterySummaryResponse["sales_breakdown"] = {
      pos: {
        gasSales: 0,
        grocery: 0,
        tobacco: 0,
        beverages: 0,
        snacks: 0,
        other: 0,
        scratchOff: shiftSummary?.lottery_sales
          ? Number(shiftSummary.lottery_sales)
          : 0,
        instantCashes: 0,
        onlineLottery: 0,
        onlineCashes: 0,
        salesTax: shiftSummary?.tax_collected
          ? Number(shiftSummary.tax_collected)
          : 0,
      },
      reports: {
        scratchOff: shiftSummary?.lottery_sales
          ? Number(shiftSummary.lottery_sales)
          : 0,
        instantCashes: 0,
        onlineLottery: 0,
        onlineCashes: 0,
      },
    };

    // Map department summaries to sales breakdown
    if (shiftSummary?.department_summaries) {
      for (const dept of shiftSummary.department_summaries) {
        const code = dept.department_code.toUpperCase();
        const amount = Number(dept.net_sales);

        if (code === "GAS" || code.includes("FUEL")) {
          salesBreakdown.pos.gasSales = amount;
        } else if (code === "GROCERY" || code.includes("GROC")) {
          salesBreakdown.pos.grocery = amount;
        } else if (code === "TOBACCO" || code.includes("CIG")) {
          salesBreakdown.pos.tobacco = amount;
        } else if (code === "BEVERAGES" || code.includes("BEV")) {
          salesBreakdown.pos.beverages = amount;
        } else if (code === "SNACKS" || code.includes("SNACK")) {
          salesBreakdown.pos.snacks = amount;
        } else {
          salesBreakdown.pos.other += amount;
        }
      }
    }

    // =========================================================================
    // LOTTERY TOTALS: Use ShiftSummary data (aggregated at shift close)
    // =========================================================================
    // The lottery totals in ShiftSummary represent what was recorded when the
    // shift was closed, which may include scanned reports or other sources.
    // We no longer calculate from bins_closed since that's day-level data.
    // =========================================================================

    // Build response
    const response: ShiftLotterySummaryResponse = {
      shift_id: shiftId,
      store_id: shift.store_id,
      business_date: businessDateStr,
      lottery_closed: lotteryBusinessDay?.status === "CLOSED",
      lottery_closed_at: lotteryBusinessDay?.closed_at?.toISOString() || null,

      lottery_totals: {
        // Use ShiftSummary data exclusively - this is shift-level data
        lottery_sales: shiftSummary?.lottery_sales
          ? Number(shiftSummary.lottery_sales)
          : 0,
        lottery_cashes: shiftSummary?.lottery_cashes
          ? Number(shiftSummary.lottery_cashes)
          : 0,
        lottery_net: shiftSummary?.lottery_net
          ? Number(shiftSummary.lottery_net)
          : 0,
        packs_sold: shiftSummary?.lottery_packs_sold ?? 0,
        tickets_sold: shiftSummary?.lottery_tickets_sold ?? 0,
      },

      bins_closed: binsClosed,
      depleted_packs: depletedPacksData,
      returned_packs: returnedPacksData,
      activated_packs: activatedPacksData,

      // Build open business period metadata for pack section components
      open_business_period: {
        started_at: businessPeriodStart.toISOString(),
        last_closed_date:
          lotteryBusinessDay?.status === "CLOSED"
            ? businessDateStr
            : await this.getPreviousClosedDate(shift.store_id, businessDateStr),
        days_since_last_close:
          lotteryBusinessDay?.status === "CLOSED"
            ? 0
            : await this.getDaysSinceLastClose(shift.store_id, businessDateStr),
        is_first_period: await this.isFirstBusinessPeriod(
          shift.store_id,
          businessDateStr,
        ),
      },

      money_received: moneyReceived,
      sales_breakdown: salesBreakdown,

      shift_info: {
        terminal_name: shift.pos_terminal?.name || null,
        shift_number: shift.shift_number || null,
        cashier_name: shift.cashier?.name || "Unknown",
        opened_at: shift.opened_at.toISOString(),
        closed_at: shift.closed_at?.toISOString() || null,
        opening_cash: Number(shift.opening_cash),
        closing_cash: shift.closing_cash ? Number(shift.closing_cash) : null,
        // Use ShiftSummary for expected_cash and variance (more reliable than shift record)
        expected_cash: shiftSummary?.expected_cash
          ? Number(shiftSummary.expected_cash)
          : shift.expected_cash
            ? Number(shift.expected_cash)
            : null,
        variance: shiftSummary?.cash_variance
          ? Number(shiftSummary.cash_variance)
          : shift.variance
            ? Number(shift.variance)
            : null,
      },
    };

    return response;
  }

  /**
   * Get the previous closed business day date for a store
   *
   * @security DB-006: TENANT_ISOLATION - store_id filter enforces tenant scoping
   * @param storeId - Store UUID
   * @param currentDateStr - Current business date (YYYY-MM-DD)
   * @returns Previous closed date string or null if none found
   */
  private async getPreviousClosedDate(
    storeId: string,
    currentDateStr: string,
  ): Promise<string | null> {
    const previousClosed = await prisma.lotteryBusinessDay.findFirst({
      where: {
        store_id: storeId,
        status: "CLOSED",
        business_date: { lt: new Date(currentDateStr) },
      },
      orderBy: { business_date: "desc" },
      select: { business_date: true },
    });

    return previousClosed?.business_date.toISOString().split("T")[0] || null;
  }

  /**
   * Calculate days since last closed business day
   *
   * @security DB-006: TENANT_ISOLATION - store_id filter enforces tenant scoping
   * @param storeId - Store UUID
   * @param currentDateStr - Current business date (YYYY-MM-DD)
   * @returns Number of days since last close, or null if no previous close
   */
  private async getDaysSinceLastClose(
    storeId: string,
    currentDateStr: string,
  ): Promise<number | null> {
    const previousClosed = await prisma.lotteryBusinessDay.findFirst({
      where: {
        store_id: storeId,
        status: "CLOSED",
        business_date: { lt: new Date(currentDateStr) },
      },
      orderBy: { business_date: "desc" },
      select: { business_date: true },
    });

    if (!previousClosed) {
      return null;
    }

    const currentDate = new Date(currentDateStr);
    const previousDate = previousClosed.business_date;
    const diffTime = currentDate.getTime() - previousDate.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    return diffDays;
  }

  /**
   * Check if this is the first business period (no prior day closes)
   *
   * @security DB-006: TENANT_ISOLATION - store_id filter enforces tenant scoping
   * @param storeId - Store UUID
   * @param currentDateStr - Current business date (YYYY-MM-DD)
   * @returns True if no previous closed business days exist
   */
  private async isFirstBusinessPeriod(
    storeId: string,
    currentDateStr: string,
  ): Promise<boolean> {
    const previousClosed = await prisma.lotteryBusinessDay.findFirst({
      where: {
        store_id: storeId,
        status: "CLOSED",
        business_date: { lt: new Date(currentDateStr) },
      },
      select: { day_id: true },
    });

    return previousClosed === null;
  }
}

// Export singleton instance
export const shiftService = new ShiftService();
