/**
 * Shift Service
 *
 * Business logic for shift operations.
 * Story 4.2: Shift Opening API
 */

import { ShiftStatus, Prisma } from "@prisma/client";
import { prisma } from "../utils/db";
import { OpenShiftInput } from "../schemas/shift.schema";

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
    const store = await prisma.store.findUnique({
      where: { store_id: storeId },
    });

    if (!store) {
      throw new ShiftServiceError(
        ShiftErrorCode.STORE_NOT_FOUND,
        `Store with ID ${storeId} not found or you do not have access`,
      );
    }
  }

  /**
   * Validate that cashier exists and is active
   * @param cashierId - Cashier UUID
   * @throws ShiftServiceError if cashier not found or inactive
   */
  async validateCashier(cashierId: string): Promise<void> {
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
   * Validate that shift can be closed
   * Shift must be in OPEN or ACTIVE status
   * @param shiftId - Shift UUID
   * @throws ShiftServiceError if shift cannot be closed
   */
  async validateShiftCanClose(shiftId: string): Promise<void> {
    const shift = await prisma.shift.findUnique({
      where: { shift_id: shiftId },
      select: { shift_id: true, status: true },
    });

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
    // Validate shift can be closed (status check)
    await this.validateShiftCanClose(shiftId);

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
}

// Export singleton instance
export const shiftService = new ShiftService();
