/**
 * Shift Service
 *
 * Business logic for shift operations.
 * Story 4.2: Shift Opening API
 */

import { ShiftStatus, Prisma } from "@prisma/client";
import { prisma } from "../utils/db";
import { OpenShiftInput } from "../schemas/shift.schema";
import { rbacService } from "./rbac.service";
import { ShiftReportData } from "../types/shift-report.types";
import { getRedisClient } from "../utils/redis";

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
 */
export interface ShiftResponse {
  shift_id: string;
  store_id: string;
  opened_by: string;
  cashier_id: string;
  pos_terminal_id: string;
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
 */
export interface ShiftDetailResponse extends ShiftResponse {
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
   * Check if an active shift exists for a POS terminal
   * Active shifts are those with status: OPEN, ACTIVE, CLOSING, RECONCILING
   * and closed_at IS NULL
   * @param posTerminalId - POS terminal UUID
   * @returns Shift if active shift exists, null otherwise
   */
  async checkActiveShift(posTerminalId: string) {
    const activeShift = await prisma.shift.findFirst({
      where: {
        pos_terminal_id: posTerminalId,
        status: {
          in: [
            ShiftStatus.OPEN,
            ShiftStatus.ACTIVE,
            ShiftStatus.CLOSING,
            ShiftStatus.RECONCILING,
          ],
        },
        closed_at: null,
      },
      orderBy: {
        opened_at: "desc",
      },
    });

    return activeShift;
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
   * @param cashierId - Cashier UUID
   * @throws ShiftServiceError if cashier not found or inactive
   */
  async validateCashier(cashierId: string): Promise<void> {
    try {
      const cashier = await prisma.user.findUnique({
        where: { user_id: cashierId },
        select: { user_id: true, status: true },
      });

      if (!cashier) {
        throw new ShiftServiceError(
          ShiftErrorCode.CASHIER_NOT_FOUND,
          `Cashier with ID ${cashierId} not found`,
        );
      }

      if (cashier.status !== "ACTIVE") {
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
   * Validate that POS terminal exists and belongs to store
   * @param posTerminalId - POS terminal UUID
   * @param storeId - Store UUID
   * @throws ShiftServiceError if terminal not found or doesn't belong to store
   */
  async validateTerminal(
    posTerminalId: string,
    storeId: string,
  ): Promise<void> {
    try {
      const terminal = await prisma.pOSTerminal.findUnique({
        where: { pos_terminal_id: posTerminalId },
        select: { pos_terminal_id: true, store_id: true, status: true },
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

      if (terminal.status !== "ACTIVE") {
        throw new ShiftServiceError(
          ShiftErrorCode.TERMINAL_NOT_FOUND,
          `POS terminal with ID ${posTerminalId} is not active`,
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

    // Create shift and audit log in a transaction for atomicity
    const shift = await prisma.$transaction(async (tx) => {
      // Create shift record
      const newShift = await tx.shift.create({
        data: {
          store_id: data.store_id,
          opened_by: auditContext.userId,
          cashier_id: data.cashier_id,
          pos_terminal_id: data.pos_terminal_id,
          opening_cash: data.opening_cash,
          status: ShiftStatus.OPEN,
          opened_at: new Date(),
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
      (role) => role.scope === "SYSTEM" || role.role_code === "superadmin",
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
    // Get accessible store IDs for RLS enforcement
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

    // Build where clause with RLS filtering
    const where: Prisma.ShiftWhereInput = {
      // RLS: Filter to only accessible stores
      store_id: filters.store_id
        ? // If store_id is specified, only allow if it's in accessible stores
          accessibleStoreIds.includes(filters.store_id)
          ? filters.store_id
          : "00000000-0000-0000-0000-000000000000" // Invalid UUID to return no results
        : { in: accessibleStoreIds },
    };

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

    // Calculate variance_amount and variance_percentage from stored variance field
    const varianceAmount = shift.variance ? Number(shift.variance) : null;
    const expectedCash = shift.expected_cash
      ? Number(shift.expected_cash)
      : null;
    const variancePercentage =
      varianceAmount !== null && expectedCash !== null && expectedCash > 0
        ? (varianceAmount / expectedCash) * 100
        : null;

    // Transform to response format
    const response: ShiftDetailResponse = {
      shift_id: shift.shift_id,
      store_id: shift.store_id,
      opened_by: shift.opened_by,
      cashier_id: shift.cashier_id,
      pos_terminal_id: shift.pos_terminal_id || "",
      status: shift.status,
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
            user_id: true,
            name: true,
            email: true,
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
        quantity: li.quantity,
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
        cashier_name: shift.cashier
          ? {
              user_id: shift.cashier.user_id,
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
}

// Export singleton instance
export const shiftService = new ShiftService();
