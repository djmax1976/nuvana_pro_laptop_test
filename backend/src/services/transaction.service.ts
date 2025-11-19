/**
 * Transaction Service
 *
 * Business logic for transaction processing and validation.
 * Story 3.2: Transaction Import API
 */

import { PrismaClient } from "@prisma/client";
import { v4 as uuidv4 } from "uuid";
import { publishToTransactionsQueue } from "../utils/rabbitmq";
import {
  TransactionPayload,
  validateTransactionPayload,
} from "../schemas/transaction.schema";
import { rbacService } from "./rbac.service";

const prisma = new PrismaClient();

/**
 * Transaction message structure for RabbitMQ
 */
export interface TransactionMessage {
  correlation_id: string;
  timestamp: string;
  source: "API";
  user_id: string;
  payload: TransactionPayload;
}

/**
 * Result of enqueue operation
 */
export interface EnqueueResult {
  correlation_id: string;
  status: "queued";
}

/**
 * Shift validation result
 */
export interface ShiftValidationResult {
  valid: boolean;
  error?: {
    code: string;
    message: string;
    status: number;
  };
}

/**
 * Transaction Service
 * Provides business logic for transaction import and processing
 */
export const transactionService = {
  /**
   * Validate transaction payload using Zod schema
   * @param data - Raw payload data
   * @returns Validated transaction payload
   * @throws ZodError if validation fails
   */
  validateTransactionPayload(data: unknown): TransactionPayload {
    return validateTransactionPayload(data);
  },

  /**
   * Check if user has access to the specified store
   * @param userId - User ID
   * @param storeId - Store ID to check access for
   * @returns true if user has access, false otherwise
   */
  async checkStoreAccess(userId: string, storeId: string): Promise<boolean> {
    // Get user's roles
    const userRoles = await rbacService.getUserRoles(userId);

    // Find user's company ID
    const companyRole = userRoles.find(
      (role) => role.scope === "COMPANY" && role.company_id,
    );

    if (!companyRole?.company_id) {
      return false;
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
  },

  /**
   * Validate shift exists and is in OPEN or ACTIVE status
   * @param shiftId - Shift ID to validate
   * @param storeId - Store ID the shift should belong to
   * @returns Validation result with error details if invalid
   */
  async validateShift(
    shiftId: string,
    storeId: string,
  ): Promise<ShiftValidationResult> {
    const shift = await prisma.shift.findUnique({
      where: { shift_id: shiftId },
      select: { store_id: true, status: true },
    });

    // Check if shift exists
    if (!shift) {
      return {
        valid: false,
        error: {
          code: "SHIFT_NOT_FOUND",
          message: `Shift with ID ${shiftId} not found`,
          status: 404,
        },
      };
    }

    // Check if shift belongs to the specified store
    if (shift.store_id !== storeId) {
      return {
        valid: false,
        error: {
          code: "SHIFT_NOT_FOUND",
          message: `Shift with ID ${shiftId} not found for store ${storeId}`,
          status: 404,
        },
      };
    }

    // Check if shift is OPEN (ACTIVE is not in our schema, but OPEN is the active state)
    if (shift.status !== "OPEN") {
      return {
        valid: false,
        error: {
          code: "SHIFT_NOT_ACTIVE",
          message: `Shift is ${shift.status}, must be OPEN to accept transactions`,
          status: 409,
        },
      };
    }

    return { valid: true };
  },

  /**
   * Enqueue transaction to RabbitMQ for async processing
   * @param payload - Validated transaction payload
   * @param userId - ID of user submitting the transaction
   * @returns Enqueue result with correlation_id
   * @throws Error if RabbitMQ connection fails
   */
  async enqueueTransaction(
    payload: TransactionPayload,
    userId: string,
  ): Promise<EnqueueResult> {
    const correlation_id = uuidv4();

    const message: TransactionMessage = {
      correlation_id,
      timestamp: new Date().toISOString(),
      source: "API",
      user_id: userId,
      payload,
    };

    try {
      await publishToTransactionsQueue(message, correlation_id);

      return {
        correlation_id,
        status: "queued",
      };
    } catch (error) {
      console.error("Failed to enqueue transaction:", {
        correlation_id,
        user_id: userId,
        store_id: payload.store_id,
        error: error instanceof Error ? error.message : "Unknown error",
      });
      throw error;
    }
  },

  /**
   * Process a transaction import request
   * Validates payload, checks permissions, validates shift, and enqueues
   * @param data - Raw request payload
   * @param userId - ID of authenticated user
   * @returns Enqueue result or throws error
   */
  async processTransactionImport(
    data: unknown,
    userId: string,
  ): Promise<EnqueueResult> {
    // Validate payload
    const payload = this.validateTransactionPayload(data);

    // Check store access
    const hasAccess = await this.checkStoreAccess(userId, payload.store_id);
    if (!hasAccess) {
      const error = new Error("User does not have access to this store");
      (error as any).code = "PERMISSION_DENIED";
      (error as any).status = 403;
      throw error;
    }

    // Validate shift
    const shiftResult = await this.validateShift(
      payload.shift_id,
      payload.store_id,
    );
    if (!shiftResult.valid && shiftResult.error) {
      const error = new Error(shiftResult.error.message);
      (error as any).code = shiftResult.error.code;
      (error as any).status = shiftResult.error.status;
      throw error;
    }

    // Enqueue transaction
    return await this.enqueueTransaction(payload, userId);
  },
};

export default transactionService;
