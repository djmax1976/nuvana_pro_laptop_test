import { Prisma, PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { createHash } from "crypto";
import { prisma } from "../utils/db";

/**
 * Retry configuration for employee_id generation race condition handling
 */
const EMPLOYEE_ID_RETRY_CONFIG = {
  maxAttempts: 5,
  initialDelayMs: 10,
  maxDelayMs: 200,
  backoffMultiplier: 2,
} as const;

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
 * Cashier creation input
 */
export interface CreateCashierInput {
  store_id: string;
  name: string;
  pin: string;
  hired_on: Date;
  termination_date?: Date | null;
}

/**
 * Cashier update input
 */
export interface UpdateCashierInput {
  name?: string;
  pin?: string;
  hired_on?: Date;
  termination_date?: Date | null;
}

/**
 * Cashier list filters
 */
export interface CashierListFilters {
  is_active?: boolean;
}

/**
 * Cashier response (without pin_hash)
 */
export interface CashierResponse {
  cashier_id: string;
  store_id: string;
  employee_id: string;
  name: string;
  is_active: boolean;
  hired_on: Date;
  termination_date: Date | null;
  created_at: Date;
  updated_at: Date;
  disabled_at: Date | null;
}

/**
 * Cashier authentication result
 */
export interface CashierAuthResult {
  cashier_id: string;
  employee_id: string;
  name: string;
}

/**
 * Cashier Service
 * Handles CRUD operations for cashiers with proper authorization and security
 */
export class CashierService {
  /**
   * Validate PIN format (exactly 4 numeric digits)
   * @param pin - PIN to validate
   * @returns True if valid, throws error if invalid
   */
  validatePIN(pin: string): boolean {
    const pinRegex = /^\d{4}$/;
    if (!pinRegex.test(pin)) {
      throw new Error("PIN must be exactly 4 numeric digits");
    }
    return true;
  }

  /**
   * Compute SHA-256 fingerprint of PIN for fast uniqueness checks
   * @param pin - PIN to fingerprint
   * @returns SHA-256 hex digest
   */
  computePINFingerprint(pin: string): string {
    return createHash("sha256").update(pin).digest("hex");
  }

  /**
   * Hash PIN using bcrypt
   * @param pin - PIN to hash
   * @returns Hashed PIN
   */
  async hashPIN(pin: string): Promise<string> {
    this.validatePIN(pin);
    return await bcrypt.hash(pin, 10);
  }

  /**
   * Generate next sequential employee_id for a store
   * Only considers active cashiers (disabled_at IS NULL) to ensure sequential IDs
   * based on active cashiers, not soft-deleted ones
   * @param storeId - Store UUID
   * @param prismaClient - Prisma client (for transaction support)
   * @returns Next employee_id (4-digit zero-padded)
   */
  async generateEmployeeId(
    storeId: string,
    prismaClient: PrismaClient | Prisma.TransactionClient = prisma,
  ): Promise<string> {
    // Query max employee_id for this store, ignoring soft-deleted cashiers
    // This ensures employee IDs are sequential based on active cashiers only
    const maxCashier = await prismaClient.cashier.findFirst({
      where: {
        store_id: storeId,
        disabled_at: null, // Only active (non-soft-deleted) cashiers
      },
      orderBy: { employee_id: "desc" },
      select: { employee_id: true },
    });

    let nextNumber = 1;
    if (maxCashier) {
      const currentNumber = parseInt(maxCashier.employee_id, 10);
      if (!isNaN(currentNumber)) {
        nextNumber = currentNumber + 1;
      }
    }

    // Zero-pad to 4 digits
    return nextNumber.toString().padStart(4, "0");
  }

  /**
   * Validate PIN uniqueness within store
   * @param storeId - Store UUID
   * @param pin - Plain text PIN to check
   * @param excludeCashierId - Cashier ID to exclude (for updates)
   * @param prismaClient - Prisma client (for transaction support)
   * @returns True if unique, throws error if duplicate
   * @note Uses fast SHA-256 fingerprint check first, with bcrypt.compare as rare-collision fallback
   * @deprecated This method is race-prone and should not be used for create/update operations.
   * The createCashier and updateCashier methods now rely on database unique constraints
   * on (store_id, sha256_pin_fingerprint) to enforce uniqueness atomically.
   * This method is kept for testing and early validation purposes only.
   */
  async validatePINUniqueness(
    storeId: string,
    pin: string,
    excludeCashierId?: string,
    prismaClient: PrismaClient | Prisma.TransactionClient = prisma,
  ): Promise<boolean> {
    // Compute SHA-256 fingerprint for fast deterministic check
    const pinFingerprint = this.computePINFingerprint(pin);

    // Build where clause for fingerprint lookup
    const where: Prisma.CashierWhereInput = {
      store_id: storeId,
      sha256_pin_fingerprint: pinFingerprint,
    };

    if (excludeCashierId) {
      where.cashier_id = { not: excludeCashierId };
    }

    // Fast path: check for existing cashier with same fingerprint
    const existingCashier = await prismaClient.cashier.findFirst({
      where,
      select: {
        cashier_id: true,
        pin_hash: true,
      },
    });

    if (existingCashier) {
      // Verify with bcrypt.compare as rare-collision fallback
      // (extremely unlikely but provides extra safety)
      if (
        existingCashier.pin_hash &&
        (await bcrypt.compare(pin, existingCashier.pin_hash))
      ) {
        throw new Error("PIN already in use by another cashier in this store");
      }
    }

    // If no fingerprint match found, check all cashiers with bcrypt as fallback
    // This handles edge cases where fingerprint might not be set (legacy data)
    const fallbackWhere: Prisma.CashierWhereInput = {
      store_id: storeId,
    };

    if (excludeCashierId) {
      fallbackWhere.cashier_id = { not: excludeCashierId };
    }

    const cashiers = await prismaClient.cashier.findMany({
      where: fallbackWhere,
      select: {
        pin_hash: true,
        sha256_pin_fingerprint: true,
      },
    });

    // Iterate through cashiers and compare PINs using bcrypt
    // Skip those we already checked via fingerprint
    for (const cashier of cashiers) {
      // Skip if we already checked this via fingerprint
      if (cashier.sha256_pin_fingerprint === pinFingerprint) {
        continue;
      }

      if (cashier.pin_hash && (await bcrypt.compare(pin, cashier.pin_hash))) {
        throw new Error("PIN already in use by another cashier in this store");
      }
    }

    return true;
  }

  /**
   * Sleep for specified milliseconds
   * @param ms - Milliseconds to sleep
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Check if error is a unique constraint violation on (store_id, employee_id)
   * @param error - Error to check
   * @returns True if error is P2002 for store_id/employee_id constraint
   */
  private isEmployeeIdConstraintViolation(error: unknown): boolean {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const target = error.meta?.target as string[] | undefined;
      return (
        Array.isArray(target) &&
        target.includes("store_id") &&
        target.includes("employee_id")
      );
    }
    return false;
  }

  /**
   * Check if error is a unique constraint violation on (store_id, sha256_pin_fingerprint)
   * @param error - Error to check
   * @returns True if error is P2002 for store_id/sha256_pin_fingerprint constraint
   */
  private isPINFingerprintConstraintViolation(error: unknown): boolean {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      const target = error.meta?.target as string[] | undefined;
      return (
        Array.isArray(target) &&
        target.includes("store_id") &&
        target.includes("sha256_pin_fingerprint")
      );
    }
    return false;
  }

  /**
   * Create a new cashier with retry logic for employee_id race conditions
   * @param data - Cashier creation data
   * @param auditContext - Audit context for logging
   * @returns Created cashier (without pin_hash)
   * @throws Error if creation fails after all retries
   */
  async createCashier(
    data: CreateCashierInput,
    auditContext: AuditContext,
  ): Promise<CashierResponse> {
    // Validate inputs
    if (!data.name || data.name.trim().length === 0) {
      throw new Error("Name is required and cannot be empty");
    }

    if (!data.store_id) {
      throw new Error("Store ID is required");
    }

    if (!data.hired_on) {
      throw new Error("Hired date is required");
    }

    // Validate PIN format
    this.validatePIN(data.pin);

    let lastError: unknown;
    let attempt = 0;

    // Retry loop with exponential backoff
    while (attempt < EMPLOYEE_ID_RETRY_CONFIG.maxAttempts) {
      try {
        // Use transaction for atomicity
        const result = await prisma.$transaction(
          async (tx: Prisma.TransactionClient) => {
            // Compute fingerprint inside transaction to ensure atomicity
            // This prevents TOCTOU race conditions by relying on DB constraint
            const pinFingerprint = this.computePINFingerprint(data.pin);
            const pinHash = await this.hashPIN(data.pin);

            // Generate employee_id
            const employeeId = await this.generateEmployeeId(data.store_id, tx);

            // Create cashier
            // The unique constraint on (store_id, sha256_pin_fingerprint) enforces PIN uniqueness
            // Set both is_active=true and disabled_at=NULL atomically for consistency
            const cashier = await tx.cashier.create({
              data: {
                store_id: data.store_id,
                employee_id: employeeId,
                name: data.name.trim(),
                pin_hash: pinHash,
                sha256_pin_fingerprint: pinFingerprint,
                hired_on: data.hired_on,
                termination_date: data.termination_date || null,
                created_by: auditContext.userId,
                is_active: true,
                disabled_at: null, // Explicitly set to NULL for new active cashiers
              },
            });

            // Log audit
            await tx.auditLog.create({
              data: {
                user_id: auditContext.userId,
                action: "CREATE",
                table_name: "cashiers",
                record_id: cashier.cashier_id,
                new_values: {
                  store_id: cashier.store_id,
                  employee_id: cashier.employee_id,
                  name: cashier.name,
                  hired_on: cashier.hired_on,
                },
                ip_address: auditContext.ipAddress,
                user_agent: auditContext.userAgent,
              },
            });

            return cashier;
          },
        );

        // Success - return result
        return this.toCashierResponse(result);
      } catch (error: unknown) {
        lastError = error;

        // Check if this is an employee_id unique constraint violation
        if (this.isEmployeeIdConstraintViolation(error)) {
          attempt++;

          // Calculate exponential backoff delay
          const delayMs = Math.min(
            EMPLOYEE_ID_RETRY_CONFIG.initialDelayMs *
              Math.pow(EMPLOYEE_ID_RETRY_CONFIG.backoffMultiplier, attempt - 1),
            EMPLOYEE_ID_RETRY_CONFIG.maxDelayMs,
          );

          // Log retry attempt
          console.warn(
            `[CashierService] Employee ID generation race condition detected (attempt ${attempt}/${EMPLOYEE_ID_RETRY_CONFIG.maxAttempts}). Retrying in ${delayMs}ms...`,
            {
              store_id: data.store_id,
              attempt,
              maxAttempts: EMPLOYEE_ID_RETRY_CONFIG.maxAttempts,
              delayMs,
            },
          );

          // If we've exhausted retries, throw a clear error
          if (attempt >= EMPLOYEE_ID_RETRY_CONFIG.maxAttempts) {
            console.error(
              `[CashierService] Failed to create cashier after ${EMPLOYEE_ID_RETRY_CONFIG.maxAttempts} attempts due to employee_id race condition`,
              {
                store_id: data.store_id,
                attempts: attempt,
              },
            );
            throw new Error(
              `Failed to create cashier: unable to generate unique employee ID after ${EMPLOYEE_ID_RETRY_CONFIG.maxAttempts} attempts. Please try again.`,
            );
          }

          // Wait before retrying
          await this.sleep(delayMs);
          continue;
        }

        // Check if this is a PIN fingerprint unique constraint violation
        if (this.isPINFingerprintConstraintViolation(error)) {
          // PIN already exists - throw immediately with clear error message
          throw new Error(
            "PIN already in use by another cashier in this store",
          );
        }

        // For non-constraint-violation errors, rethrow immediately
        throw error;
      }
    }

    // This should never be reached, but TypeScript requires it
    throw lastError || new Error("Unknown error creating cashier");
  }

  /**
   * Get cashiers for a store with optional filtering
   * Uses disabled_at IS NULL as the authoritative field for filtering
   * @param storeId - Store UUID
   * @param filters - Filter options
   * @param auditContext - Audit context for logging
   * @returns Array of cashiers (without pin_hash)
   */
  async getCashiers(
    storeId: string,
    filters: CashierListFilters = {},
    _auditContext: AuditContext,
  ): Promise<CashierResponse[]> {
    const where: Prisma.CashierWhereInput = {
      store_id: storeId,
    };

    // Use disabled_at IS NULL as authoritative field for filtering
    // is_active filter is translated to disabled_at for consistency
    if (filters.is_active !== undefined) {
      if (filters.is_active) {
        where.disabled_at = null; // Active = disabled_at IS NULL
      } else {
        where.disabled_at = { not: null }; // Inactive = disabled_at IS NOT NULL
      }
    } else {
      // Default to active cashiers only
      where.disabled_at = null;
    }

    const cashiers = await prisma.cashier.findMany({
      where,
      orderBy: { created_at: "desc" },
    });

    return cashiers.map((c) => this.toCashierResponse(c));
  }

  /**
   * Get cashier by ID
   * By default, only returns active cashiers (disabled_at IS NULL)
   * @param storeId - Store UUID
   * @param cashierId - Cashier UUID
   * @param auditContext - Audit context for logging
   * @param includeDeleted - If true, returns cashier even if soft-deleted
   * @returns Cashier (without pin_hash) or null if not found
   */
  async getCashierById(
    storeId: string,
    cashierId: string,
    _auditContext: AuditContext,
    includeDeleted: boolean = false,
  ): Promise<CashierResponse | null> {
    const where: Prisma.CashierWhereInput = {
      cashier_id: cashierId,
      store_id: storeId,
    };

    // By default, only return active cashiers (disabled_at IS NULL)
    if (!includeDeleted) {
      where.disabled_at = null;
    }

    const cashier = await prisma.cashier.findFirst({
      where,
    });

    if (!cashier) {
      return null;
    }

    return this.toCashierResponse(cashier);
  }

  /**
   * Update cashier
   * @param storeId - Store UUID
   * @param cashierId - Cashier UUID
   * @param data - Update data
   * @param auditContext - Audit context for logging
   * @returns Updated cashier (without pin_hash)
   */
  async updateCashier(
    storeId: string,
    cashierId: string,
    data: UpdateCashierInput,
    auditContext: AuditContext,
  ): Promise<CashierResponse> {
    // Verify cashier exists, belongs to store, and is active (not soft-deleted)
    // This ensures consistency with getCashierById which filters out soft-deleted cashiers
    const existing = await prisma.cashier.findFirst({
      where: {
        cashier_id: cashierId,
        store_id: storeId,
        disabled_at: null, // Only allow updating active cashiers
      },
    });

    if (!existing) {
      throw new Error("Cashier not found");
    }

    // Prepare update data
    const updateData: Prisma.CashierUpdateInput = {};

    if (data.name !== undefined) {
      if (data.name.trim().length === 0) {
        throw new Error("Name cannot be empty");
      }
      updateData.name = data.name.trim();
    }

    if (data.hired_on !== undefined) {
      updateData.hired_on = data.hired_on;
    }

    if (data.termination_date !== undefined) {
      updateData.termination_date = data.termination_date;
    }

    // Handle PIN update
    // Pre-validate PIN format (early validation for better UX)
    if (data.pin !== undefined) {
      this.validatePIN(data.pin);
    }

    updateData.updater = { connect: { user_id: auditContext.userId } };
    updateData.updated_at = new Date();

    try {
      // Use transaction for atomicity
      const result = await prisma.$transaction(
        async (tx: Prisma.TransactionClient) => {
          // Compute fingerprint inside transaction to ensure atomicity
          // This prevents TOCTOU race conditions by relying on DB constraint
          if (data.pin !== undefined) {
            const pinFingerprint = this.computePINFingerprint(data.pin);
            const pinHash = await this.hashPIN(data.pin);
            updateData.pin_hash = pinHash;
            updateData.sha256_pin_fingerprint = pinFingerprint;
          }

          const oldValues = {
            name: existing.name,
            hired_on: existing.hired_on,
            termination_date: existing.termination_date,
            is_active: existing.is_active,
          };

          const updated = await tx.cashier.update({
            where: { cashier_id: cashierId },
            data: updateData,
          });

          // Log audit
          await tx.auditLog.create({
            data: {
              user_id: auditContext.userId,
              action: "UPDATE",
              table_name: "cashiers",
              record_id: updated.cashier_id,
              old_values: oldValues,
              new_values: {
                name: updated.name,
                hired_on: updated.hired_on,
                termination_date: updated.termination_date,
                is_active: updated.is_active,
              },
              ip_address: auditContext.ipAddress,
              user_agent: auditContext.userAgent,
            },
          });

          return updated;
        },
      );

      return this.toCashierResponse(result);
    } catch (error: unknown) {
      // Handle PIN fingerprint constraint violation
      if (this.isPINFingerprintConstraintViolation(error)) {
        throw new Error("PIN already in use by another cashier in this store");
      }
      // Re-throw other errors
      throw error;
    }
  }

  /**
   * Soft delete cashier (set is_active=false, disabled_at=now atomically)
   * Uses disabled_at as the authoritative field
   * @param storeId - Store UUID
   * @param cashierId - Cashier UUID
   * @param auditContext - Audit context for logging
   */
  async deleteCashier(
    storeId: string,
    cashierId: string,
    auditContext: AuditContext,
  ): Promise<void> {
    // Verify cashier exists and belongs to store (only check active ones)
    const existing = await prisma.cashier.findFirst({
      where: {
        cashier_id: cashierId,
        store_id: storeId,
        disabled_at: null, // Only allow deleting active cashiers
      },
    });

    if (!existing) {
      throw new Error("Cashier not found or already deleted");
    }

    // Use transaction for atomicity
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const oldValues = {
        is_active: existing.is_active,
        disabled_at: existing.disabled_at,
      };

      const now = new Date();
      await tx.cashier.update({
        where: { cashier_id: cashierId },
        data: {
          is_active: false,
          disabled_at: now,
          updated_by: auditContext.userId,
          updated_at: now,
        },
      });

      // Log audit
      await tx.auditLog.create({
        data: {
          user_id: auditContext.userId,
          action: "DELETE",
          table_name: "cashiers",
          record_id: cashierId,
          old_values: oldValues,
          new_values: {
            is_active: false,
            disabled_at: now,
          },
          ip_address: auditContext.ipAddress,
          user_agent: auditContext.userAgent,
        },
      });
    });
  }

  /**
   * Restore a soft-deleted cashier (set is_active=true, disabled_at=NULL atomically)
   * Uses disabled_at as the authoritative field
   * @param storeId - Store UUID
   * @param cashierId - Cashier UUID
   * @param auditContext - Audit context for logging
   */
  async restoreCashier(
    storeId: string,
    cashierId: string,
    auditContext: AuditContext,
  ): Promise<CashierResponse> {
    // Verify cashier exists and belongs to store (only check deleted ones)
    const existing = await prisma.cashier.findFirst({
      where: {
        cashier_id: cashierId,
        store_id: storeId,
        disabled_at: { not: null }, // Only allow restoring deleted cashiers
      },
    });

    if (!existing) {
      throw new Error("Cashier not found or already active");
    }

    // Use transaction for atomicity
    const result = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        const oldValues = {
          is_active: existing.is_active,
          disabled_at: existing.disabled_at,
        };

        const updated = await tx.cashier.update({
          where: { cashier_id: cashierId },
          data: {
            is_active: true,
            disabled_at: null,
            updated_by: auditContext.userId,
            updated_at: new Date(),
          },
        });

        // Log audit
        await tx.auditLog.create({
          data: {
            user_id: auditContext.userId,
            action: "RESTORE",
            table_name: "cashiers",
            record_id: cashierId,
            old_values: oldValues,
            new_values: {
              is_active: true,
              disabled_at: null,
            },
            ip_address: auditContext.ipAddress,
            user_agent: auditContext.userAgent,
          },
        });

        return updated;
      },
    );

    return this.toCashierResponse(result);
  }

  /**
   * Authenticate cashier by name or employee_id and PIN
   * @param storeId - Store UUID
   * @param identifier - Name or employee_id
   * @param pin - PIN to verify
   * @param auditContext - Audit context for logging
   * @returns Cashier auth result or throws error
   */
  async authenticateCashier(
    storeId: string,
    identifier: { name?: string; employee_id?: string },
    pin: string,
    auditContext: AuditContext,
  ): Promise<CashierAuthResult> {
    if (!identifier.name && !identifier.employee_id) {
      throw new Error("Either name or employee_id must be provided");
    }

    // Build where clause
    // Only search active cashiers (disabled_at IS NULL)
    const where: Prisma.CashierWhereInput = {
      store_id: storeId,
      disabled_at: null, // Only authenticate active cashiers
    };

    if (identifier.name) {
      where.name = identifier.name.trim();
    } else if (identifier.employee_id) {
      where.employee_id = identifier.employee_id;
    }

    // Find cashier
    const cashier = await prisma.cashier.findFirst({
      where,
    });

    // Log authentication attempt (success or failure)
    const logAuthAttempt = async (success: boolean, reason?: string) => {
      // Use a null UUID (all zeros) when cashier is not found to satisfy UUID constraint
      const recordId =
        cashier?.cashier_id || "00000000-0000-0000-0000-000000000000";
      await prisma.auditLog.create({
        data: {
          user_id: null, // Cashier authentication doesn't have a user_id
          action: success ? "AUTH_SUCCESS" : "AUTH_FAILURE",
          table_name: "cashiers",
          record_id: recordId,
          new_values: {
            store_id: storeId,
            identifier: identifier.name || identifier.employee_id,
            reason:
              reason ||
              (success ? "Authentication successful" : "Authentication failed"),
          },
          ip_address: auditContext.ipAddress,
          user_agent: auditContext.userAgent,
        },
      });
    };

    if (!cashier) {
      await logAuthAttempt(false, "Cashier not found");
      throw new Error("Invalid credentials");
    }

    // Check if cashier is active using authoritative field (disabled_at IS NULL)
    if (cashier.disabled_at !== null) {
      await logAuthAttempt(false, "Cashier account is inactive");
      throw new Error("Cashier account is inactive");
    }

    // Verify PIN
    const pinValid = await bcrypt.compare(pin, cashier.pin_hash);
    if (!pinValid) {
      await logAuthAttempt(false, "Invalid PIN");
      throw new Error("Invalid credentials");
    }

    // Log successful authentication
    await logAuthAttempt(true);

    return {
      cashier_id: cashier.cashier_id,
      employee_id: cashier.employee_id,
      name: cashier.name,
    };
  }

  /**
   * Convert cashier to response format (exclude pin_hash)
   * @param cashier - Cashier from database
   * @returns Cashier response
   */
  private toCashierResponse(cashier: {
    cashier_id: string;
    store_id: string;
    employee_id: string;
    name: string;
    is_active: boolean;
    hired_on: Date;
    termination_date: Date | null;
    created_at: Date;
    updated_at: Date;
    disabled_at: Date | null;
  }): CashierResponse {
    return {
      cashier_id: cashier.cashier_id,
      store_id: cashier.store_id,
      employee_id: cashier.employee_id,
      name: cashier.name,
      is_active: cashier.is_active,
      hired_on: cashier.hired_on,
      termination_date: cashier.termination_date,
      created_at: cashier.created_at,
      updated_at: cashier.updated_at,
      disabled_at: cashier.disabled_at,
    };
  }
}

// Export singleton instance
export const cashierService = new CashierService();
