/**
 * Transaction Service
 *
 * Business logic for transaction processing, validation, and query.
 * Story 3.2: Transaction Import API
 * Story 3.4: Transaction Query API
 */

import { PrismaClient, Prisma, ShiftStatus } from "@prisma/client";
import { v4 as uuidv4 } from "uuid";
import { publishToTransactionsQueue } from "../utils/rabbitmq";
import {
  TransactionPayload,
  validateTransactionPayload,
} from "../schemas/transaction.schema";
import { rbacService } from "./rbac.service";
import {
  TransactionQueryFilters,
  PaginationOptions,
  IncludeOptions,
  TransactionQueryResult,
  TransactionResponse,
  TransactionLineItemResponse,
  TransactionPaymentResponse,
} from "../types/transaction.types";

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

    // Find user's company ID
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
          code: "SHIFT_STORE_MISMATCH",
          message: `Shift with ID ${shiftId} does not belong to store ${storeId}`,
          status: 400,
        },
      };
    }

    // Check if shift is in a status that blocks transactions (CLOSING, RECONCILING, CLOSED)
    if (
      shift.status === ShiftStatus.CLOSING ||
      shift.status === ShiftStatus.RECONCILING ||
      shift.status === ShiftStatus.CLOSED
    ) {
      return {
        valid: false,
        error: {
          code: "SHIFT_CLOSING_TRANSACTION_BLOCKED",
          message: `Shift is ${shift.status} and cannot accept new transactions. Only OPEN or ACTIVE shifts can accept transactions.`,
          status: 409,
        },
      };
    }

    // Check if shift is in a valid status for transactions (OPEN or ACTIVE)
    if (
      shift.status !== ShiftStatus.OPEN &&
      shift.status !== ShiftStatus.ACTIVE
    ) {
      return {
        valid: false,
        error: {
          code: "SHIFT_NOT_ACTIVE",
          message: `Shift is ${shift.status}, must be OPEN or ACTIVE to accept transactions`,
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

  /**
   * Story 3.4: Transaction Query API
   * Get accessible store IDs for user based on RLS policies
   * Superadmins can see all stores, company users can see their company's stores
   * Store-scoped users can only see their specific stores
   * @param userId - User ID to check access for
   * @returns Array of accessible store IDs
   */
  async getAccessibleStoreIds(userId: string): Promise<string[]> {
    // Get user's roles
    const userRoles = await rbacService.getUserRoles(userId);

    // Check for superadmin (system scope - can see all)
    const hasSuperadminRole = userRoles.some(
      (role) => role.scope === "SYSTEM" || role.role_code === "SUPERADMIN",
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
  },

  /**
   * Story 3.4: Transaction Query API
   * Query transactions with filters, pagination, and optional includes
   * Enforces RLS policies to filter results based on user access
   * @param userId - User ID making the request
   * @param filters - Query filters (store_id, shift_id, date range)
   * @param pagination - Pagination options (limit, offset)
   * @param include - Include options (line_items, payments)
   * @returns TransactionQueryResult with transactions and pagination meta
   */
  async getTransactions(
    userId: string,
    filters: TransactionQueryFilters,
    pagination: PaginationOptions,
    include: IncludeOptions,
  ): Promise<TransactionQueryResult> {
    // Get accessible store IDs for RLS enforcement
    const accessibleStoreIds = await this.getAccessibleStoreIds(userId);

    // If no accessible stores, return empty result
    if (accessibleStoreIds.length === 0) {
      return {
        transactions: [],
        meta: {
          total: 0,
          limit: pagination.limit,
          offset: pagination.offset,
          has_more: false,
        },
      };
    }

    // Build where clause with RLS filtering
    const where: Prisma.TransactionWhereInput = {
      // RLS: Filter to only accessible stores
      store_id: filters.store_id
        ? // If store_id is specified, only allow if it's in accessible stores
          accessibleStoreIds.includes(filters.store_id)
          ? filters.store_id
          : "00000000-0000-0000-0000-000000000000" // Invalid UUID to return no results
        : { in: accessibleStoreIds },
    };

    // Add shift_id filter if provided
    if (filters.shift_id) {
      where.shift_id = filters.shift_id;
    }

    // Add cashier_id filter if provided
    if (filters.cashier_id) {
      where.cashier_id = filters.cashier_id;
    }

    // Add date range filter if provided
    if (filters.from || filters.to) {
      where.timestamp = {};
      if (filters.from) {
        where.timestamp.gte = filters.from;
      }
      if (filters.to) {
        where.timestamp.lte = filters.to;
      }
    }

    // Build include clause
    const prismaInclude: Prisma.TransactionInclude = {
      // Always include cashier and store for name fields
      cashier: {
        select: {
          name: true,
        },
      },
      store: {
        select: {
          name: true,
        },
      },
    };
    if (include.line_items) {
      prismaInclude.line_items = true;
    }
    if (include.payments) {
      prismaInclude.payments = true;
    }

    // Execute count query for total
    const total = await prisma.transaction.count({ where });

    // Execute main query with pagination
    const transactions = await prisma.transaction.findMany({
      where,
      include: prismaInclude,
      orderBy: { timestamp: "desc" },
      take: pagination.limit,
      skip: pagination.offset,
    });

    // Transform to response format
    const transformedTransactions: TransactionResponse[] = transactions.map(
      (tx: any) => ({
        transaction_id: tx.transaction_id,
        store_id: tx.store_id,
        shift_id: tx.shift_id,
        cashier_id: tx.cashier_id,
        pos_terminal_id: tx.pos_terminal_id,
        timestamp: tx.timestamp.toISOString(),
        subtotal: Number(tx.subtotal),
        tax: Number(tx.tax),
        discount: Number(tx.discount),
        total: Number(tx.total),
        public_id: tx.public_id,
        cashier_name: tx.cashier?.name,
        store_name: tx.store?.name,
        line_items: tx.line_items?.map(
          (li: any): TransactionLineItemResponse => ({
            line_item_id: li.line_item_id,
            product_id: li.product_id,
            sku: li.sku,
            name: li.name,
            quantity: li.quantity,
            unit_price: Number(li.unit_price),
            discount: Number(li.discount),
            line_total: Number(li.line_total),
          }),
        ),
        payments: tx.payments?.map(
          (p: any): TransactionPaymentResponse => ({
            payment_id: p.payment_id,
            method: p.method,
            amount: Number(p.amount),
            reference: p.reference,
          }),
        ),
      }),
    );

    return {
      transactions: transformedTransactions,
      meta: {
        total,
        limit: pagination.limit,
        offset: pagination.offset,
        has_more: pagination.offset + transactions.length < total,
      },
    };
  },

  /**
   * Create a new bulk import job record
   * @param userId - User ID who initiated the import
   * @param fileName - Name of the uploaded file
   * @param fileType - File type ('CSV' or 'JSON')
   * @returns BulkImportJob record
   */
  async createBulkImportJob(
    userId: string,
    fileName: string,
    fileType: "CSV" | "JSON",
  ) {
    const job = await prisma.bulkImportJob.create({
      data: {
        job_id: uuidv4(),
        user_id: userId,
        file_name: fileName,
        file_type: fileType,
        status: "PENDING",
        total_rows: 0,
        processed_rows: 0,
        error_rows: 0,
      },
    });

    return job;
  },

  /**
   * Get bulk import job by ID
   * @param jobId - Job ID
   * @param userId - User ID (for permission check - users can only view their own jobs)
   * @param isAdmin - Whether user is admin (can view all jobs)
   * @returns BulkImportJob record or null
   */
  async getBulkImportJob(
    jobId: string,
    userId: string,
    isAdmin: boolean = false,
  ) {
    const where: any = { job_id: jobId };
    if (!isAdmin) {
      where.user_id = userId;
    }

    const job = await prisma.bulkImportJob.findFirst({
      where,
    });

    return job;
  },

  /**
   * Update bulk import job progress
   * @param jobId - Job ID
   * @param updates - Fields to update
   */
  async updateBulkImportJob(
    jobId: string,
    updates: {
      status?: "PENDING" | "PROCESSING" | "COMPLETED" | "FAILED";
      total_rows?: number;
      processed_rows?: number;
      error_rows?: number;
      error_summary?: any;
      completed_at?: Date;
    },
  ) {
    await prisma.bulkImportJob.update({
      where: { job_id: jobId },
      data: updates,
    });
  },
};

export default transactionService;
