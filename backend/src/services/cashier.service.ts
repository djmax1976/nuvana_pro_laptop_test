import { Prisma, PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";

const prisma = new PrismaClient();

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
   * @param storeId - Store UUID
   * @param prismaClient - Prisma client (for transaction support)
   * @returns Next employee_id (4-digit zero-padded)
   */
  async generateEmployeeId(
    storeId: string,
    prismaClient: PrismaClient | Prisma.TransactionClient = prisma,
  ): Promise<string> {
    // Query max employee_id for this store
    const maxCashier = await prismaClient.cashier.findFirst({
      where: { store_id: storeId },
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
   * @param pinHash - Hashed PIN to check
   * @param excludeCashierId - Cashier ID to exclude (for updates)
   * @param prismaClient - Prisma client (for transaction support)
   * @returns True if unique, throws error if duplicate
   */
  async validatePINUniqueness(
    storeId: string,
    pinHash: string,
    excludeCashierId?: string,
    prismaClient: PrismaClient | Prisma.TransactionClient = prisma,
  ): Promise<boolean> {
    const where: Prisma.CashierWhereInput = {
      store_id: storeId,
      pin_hash: pinHash,
    };

    if (excludeCashierId) {
      where.cashier_id = { not: excludeCashierId };
    }

    const existing = await prismaClient.cashier.findFirst({
      where,
    });

    if (existing) {
      throw new Error("PIN already in use by another cashier in this store");
    }

    return true;
  }

  /**
   * Create a new cashier
   * @param data - Cashier creation data
   * @param auditContext - Audit context for logging
   * @returns Created cashier (without pin_hash)
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

    // Hash PIN
    const pinHash = await this.hashPIN(data.pin);

    // Use transaction for atomicity
    const result = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
        // Validate PIN uniqueness within store
        await this.validatePINUniqueness(data.store_id, pinHash, undefined, tx);

        // Generate employee_id
        const employeeId = await this.generateEmployeeId(data.store_id, tx);

        // Create cashier
        const cashier = await tx.cashier.create({
          data: {
            store_id: data.store_id,
            employee_id: employeeId,
            name: data.name.trim(),
            pin_hash: pinHash,
            hired_on: data.hired_on,
            termination_date: data.termination_date || null,
            created_by: auditContext.userId,
            is_active: true,
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

    // Return without pin_hash
    return this.toCashierResponse(result);
  }

  /**
   * Get cashiers for a store with optional filtering
   * @param storeId - Store UUID
   * @param filters - Filter options
   * @param auditContext - Audit context for logging
   * @returns Array of cashiers (without pin_hash)
   */
  async getCashiers(
    storeId: string,
    filters: CashierListFilters = {},
    auditContext: AuditContext,
  ): Promise<CashierResponse[]> {
    const where: Prisma.CashierWhereInput = {
      store_id: storeId,
    };

    // Default to active cashiers only
    if (filters.is_active !== undefined) {
      where.is_active = filters.is_active;
    } else {
      where.is_active = true;
    }

    const cashiers = await prisma.cashier.findMany({
      where,
      orderBy: { created_at: "desc" },
    });

    return cashiers.map((c) => this.toCashierResponse(c));
  }

  /**
   * Get cashier by ID
   * @param storeId - Store UUID
   * @param cashierId - Cashier UUID
   * @param auditContext - Audit context for logging
   * @returns Cashier (without pin_hash) or null if not found
   */
  async getCashierById(
    storeId: string,
    cashierId: string,
    auditContext: AuditContext,
  ): Promise<CashierResponse | null> {
    const cashier = await prisma.cashier.findFirst({
      where: {
        cashier_id: cashierId,
        store_id: storeId,
      },
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
    // Verify cashier exists and belongs to store
    const existing = await prisma.cashier.findFirst({
      where: {
        cashier_id: cashierId,
        store_id: storeId,
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
    if (data.pin !== undefined) {
      this.validatePIN(data.pin);
      const pinHash = await this.hashPIN(data.pin);
      await this.validatePINUniqueness(storeId, pinHash, cashierId);
      updateData.pin_hash = pinHash;
    }

    updateData.updater = { connect: { user_id: auditContext.userId } };
    updateData.updated_at = new Date();

    // Use transaction for atomicity
    const result = await prisma.$transaction(
      async (tx: Prisma.TransactionClient) => {
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
  }

  /**
   * Soft delete cashier (set is_active=false, disabled_at=now)
   * @param storeId - Store UUID
   * @param cashierId - Cashier UUID
   * @param auditContext - Audit context for logging
   */
  async deleteCashier(
    storeId: string,
    cashierId: string,
    auditContext: AuditContext,
  ): Promise<void> {
    // Verify cashier exists and belongs to store
    const existing = await prisma.cashier.findFirst({
      where: {
        cashier_id: cashierId,
        store_id: storeId,
      },
    });

    if (!existing) {
      throw new Error("Cashier not found");
    }

    // Use transaction for atomicity
    await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const oldValues = {
        is_active: existing.is_active,
        disabled_at: existing.disabled_at,
      };

      await tx.cashier.update({
        where: { cashier_id: cashierId },
        data: {
          is_active: false,
          disabled_at: new Date(),
          updated_by: auditContext.userId,
          updated_at: new Date(),
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
            disabled_at: new Date(),
          },
          ip_address: auditContext.ipAddress,
          user_agent: auditContext.userAgent,
        },
      });
    });
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
    const where: Prisma.CashierWhereInput = {
      store_id: storeId,
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
      await prisma.auditLog.create({
        data: {
          user_id: null, // Cashier authentication doesn't have a user_id
          action: success ? "AUTH_SUCCESS" : "AUTH_FAILURE",
          table_name: "cashiers",
          record_id: cashier?.cashier_id || "unknown",
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

    // Check if cashier is active
    if (!cashier.is_active) {
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
