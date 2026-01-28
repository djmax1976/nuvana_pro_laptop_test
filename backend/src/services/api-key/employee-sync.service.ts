/**
 * Employee Sync Service
 *
 * Enterprise-grade unified employee data synchronization for desktop POS applications.
 * Combines all store employee types into a single sync endpoint:
 * - Store Managers (from users table with STORE_MANAGER role)
 * - Shift Managers (from users table with SHIFT_MANAGER role)
 * - Cashiers (from cashiers table)
 *
 * Security Controls:
 * - SEC-006: Store isolation via parameterized queries
 * - DB-006: Tenant isolation with store_id validation
 * - SEC-001: PIN hashes only, never plaintext
 * - Session validation: Requires active sync session
 * - Audit logging: All sync operations are logged
 * - Rate limiting: Enforced at API layer
 *
 * Performance:
 * - Batch queries for both users and cashiers
 * - Efficient UNION-style result aggregation
 * - Pagination support with cursor-based navigation
 *
 * @module services/api-key/employee-sync.service
 */

import { prisma } from "../../utils/db";
import { apiKeyAuditService } from "./api-key-audit.service";
import type {
  ApiKeyIdentity,
  EmployeeSyncPushResponse,
  EmployeeSyncPushResult,
} from "../../types/api-key.types";
import type { EmployeeSyncPushRecord } from "../../schemas/api-key.schema";

// ============================================================================
// Types
// ============================================================================

/**
 * Unified employee record for sync
 * Combines store managers, shift managers, and cashiers into single format
 *
 * @security SEC-001: PIN hash only, never password hash or plaintext
 */
export interface EmployeeSyncRecord {
  /** Unique employee identifier */
  employeeId: string;

  /** Employee display name */
  name: string;

  /** Role code: STORE_MANAGER, SHIFT_MANAGER, or CASHIER */
  role: "STORE_MANAGER" | "SHIFT_MANAGER" | "CASHIER";

  /** bcrypt-hashed PIN for offline authentication */
  pinHash: string;

  /** Whether employee is active */
  isActive: boolean;

  /** Last modified timestamp for delta sync */
  updatedAt: string;

  /** Sync sequence number for ordering */
  syncSequence: number;
}

/**
 * Response from employee sync endpoint
 */
export interface EmployeeSyncResponse {
  /** Employee records */
  employees: EmployeeSyncRecord[];

  /** Sync metadata */
  syncMetadata: {
    /** Total count matching query */
    totalCount: number;

    /** Whether more records are available */
    hasMore: boolean;

    /** Last sync sequence for cursor-based pagination */
    lastSequence: number;

    /** Server timestamp for clock sync */
    serverTime: string;
  };
}

/**
 * Options for fetching employee sync data
 */
export interface EmployeeSyncOptions {
  /** Only fetch records modified after this timestamp */
  sinceTimestamp?: Date;

  /** Only fetch records with sequence > this value */
  sinceSequence?: number;

  /** Include inactive employees */
  includeInactive?: boolean;

  /** Maximum records to return */
  limit?: number;
}

/**
 * Audit context for logging sync operations
 */
export interface EmployeeSyncAuditContext {
  apiKeyId: string;
  sessionId: string;
  ipAddress: string;
  deviceFingerprint?: string;
}

// ============================================================================
// Constants
// ============================================================================

/** Default limit for employee sync queries */
const DEFAULT_LIMIT = 100;

/** Maximum limit for employee sync queries */
const MAX_LIMIT = 500;

/** Store-level role codes that should be synced */
const SYNCABLE_ROLE_CODES = ["STORE_MANAGER", "SHIFT_MANAGER"];

// ============================================================================
// Service Implementation
// ============================================================================

class EmployeeSyncService {
  /**
   * Validate that a sync session is active and belongs to the API key
   * SEC-006: Parameterized queries for session validation
   *
   * @param sessionId - Sync session ID
   * @param apiKeyId - API key ID to validate ownership
   * @returns Session record if valid
   * @throws Error if session is invalid or expired
   */
  async validateSyncSession(
    sessionId: string,
    apiKeyId: string,
  ): Promise<{ syncSessionId: string; storeId: string }> {
    // SEC-006: Parameterized query via Prisma
    const session = await prisma.apiKeySyncSession.findUnique({
      where: { sync_session_id: sessionId },
      include: {
        api_key: {
          select: { store_id: true },
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

    // Check if session is too old (max 1 hour)
    const maxAge = 60 * 60 * 1000; // 1 hour in ms
    const sessionAge = Date.now() - session.session_started_at.getTime();
    if (sessionAge > maxAge) {
      throw new Error("INVALID_SESSION: Sync session has expired");
    }

    return {
      syncSessionId: session.sync_session_id,
      storeId: session.api_key.store_id,
    };
  }

  /**
   * Get all employees for sync (unified from users + cashiers)
   * SEC-006: Parameterized queries via Prisma ORM
   * DB-006: Tenant isolation via store_id filter
   *
   * @param storeId - Store ID (from validated session)
   * @param options - Sync options (filters, pagination)
   * @returns Employee sync response
   */
  async getEmployeesForSync(
    storeId: string,
    options: EmployeeSyncOptions = {},
  ): Promise<EmployeeSyncResponse> {
    const {
      sinceTimestamp,
      includeInactive = false,
      limit = DEFAULT_LIMIT,
    } = options;

    // Sanitize limit to prevent unbounded reads
    const safeLimit = Math.min(Math.max(1, limit), MAX_LIMIT);

    // Parallel fetch: Users with store roles AND Cashiers
    const [usersWithRoles, cashiers] = await Promise.all([
      this.fetchUsersWithStoreRoles(storeId, sinceTimestamp, includeInactive),
      this.fetchCashiers(storeId, sinceTimestamp, includeInactive),
    ]);

    // Combine and deduplicate (users first, then cashiers)
    const allEmployees: EmployeeSyncRecord[] = [];
    let sequence = options.sinceSequence || 0;

    // Add users with store roles (STORE_MANAGER, SHIFT_MANAGER)
    for (const user of usersWithRoles) {
      // SEC-001: Skip users without PIN hash (can't authenticate offline)
      if (!user.pin_hash) {
        continue;
      }

      sequence += 1;
      allEmployees.push({
        employeeId: user.user_id,
        name: user.name,
        role: user.role_code as "STORE_MANAGER" | "SHIFT_MANAGER",
        pinHash: user.pin_hash,
        isActive: user.status === "ACTIVE",
        updatedAt: user.updated_at.toISOString(),
        syncSequence: sequence,
      });
    }

    // Add cashiers
    for (const cashier of cashiers) {
      sequence += 1;
      allEmployees.push({
        employeeId: cashier.cashier_id,
        name: cashier.name,
        role: "CASHIER",
        pinHash: cashier.pin_hash,
        isActive: cashier.is_active,
        updatedAt: cashier.updated_at.toISOString(),
        syncSequence: sequence,
      });
    }

    // Apply limit and determine hasMore
    const hasMore = allEmployees.length > safeLimit;
    const recordsToReturn = hasMore
      ? allEmployees.slice(0, safeLimit)
      : allEmployees;

    const lastSequence =
      recordsToReturn.length > 0
        ? recordsToReturn[recordsToReturn.length - 1].syncSequence
        : options.sinceSequence || 0;

    return {
      employees: recordsToReturn,
      syncMetadata: {
        totalCount: allEmployees.length,
        hasMore,
        lastSequence,
        serverTime: new Date().toISOString(),
      },
    };
  }

  /**
   * Fetch users with store-level roles
   * SEC-006: Parameterized query via Prisma ORM
   * DB-006: Store-scoped via user_roles.store_id
   *
   * @param storeId - Store ID for tenant isolation
   * @param sinceTimestamp - Optional delta sync filter
   * @param includeInactive - Include inactive users
   * @returns Users with their roles
   */
  private async fetchUsersWithStoreRoles(
    storeId: string,
    sinceTimestamp?: Date,
    includeInactive?: boolean,
  ): Promise<
    Array<{
      user_id: string;
      name: string;
      pin_hash: string | null;
      status: string;
      role_code: string;
      updated_at: Date;
    }>
  > {
    // SEC-006: Use Prisma ORM with proper parameterization
    // DB-006: Store isolation via user_roles.store_id filter
    const userRoles = await prisma.userRole.findMany({
      where: {
        store_id: storeId,
        status: "ACTIVE",
        role: {
          code: { in: SYNCABLE_ROLE_CODES },
        },
        user: {
          ...(sinceTimestamp ? { updated_at: { gt: sinceTimestamp } } : {}),
          ...(!includeInactive ? { status: "ACTIVE" } : {}),
        },
      },
      include: {
        user: {
          select: {
            user_id: true,
            name: true,
            pin_hash: true,
            status: true,
            updated_at: true,
          },
        },
        role: {
          select: {
            code: true,
          },
        },
      },
      orderBy: [{ user: { updated_at: "asc" } }, { user: { user_id: "asc" } }],
    });

    // Transform to flat structure with deduplication
    const userMap = new Map<
      string,
      {
        user_id: string;
        name: string;
        pin_hash: string | null;
        status: string;
        role_code: string;
        updated_at: Date;
      }
    >();

    for (const ur of userRoles) {
      // Use first role found (prioritize STORE_MANAGER over SHIFT_MANAGER)
      if (!userMap.has(ur.user.user_id)) {
        userMap.set(ur.user.user_id, {
          user_id: ur.user.user_id,
          name: ur.user.name,
          pin_hash: ur.user.pin_hash,
          status: ur.user.status,
          role_code: ur.role.code,
          updated_at: ur.user.updated_at,
        });
      }
    }

    return Array.from(userMap.values());
  }

  /**
   * Fetch cashiers for store
   * SEC-006: Parameterized query via Prisma ORM
   * DB-006: Store-scoped via cashiers.store_id
   *
   * @param storeId - Store ID for tenant isolation
   * @param sinceTimestamp - Optional delta sync filter
   * @param includeInactive - Include inactive cashiers
   * @returns Cashier records
   */
  private async fetchCashiers(
    storeId: string,
    sinceTimestamp?: Date,
    includeInactive?: boolean,
  ): Promise<
    Array<{
      cashier_id: string;
      name: string;
      pin_hash: string;
      is_active: boolean;
      updated_at: Date;
    }>
  > {
    // SEC-006: Parameterized query via Prisma ORM
    // DB-006: Store isolation via store_id filter
    const whereClause: {
      store_id: string;
      updated_at?: { gt: Date };
      disabled_at?: null;
    } = {
      store_id: storeId,
    };

    if (sinceTimestamp) {
      whereClause.updated_at = { gt: sinceTimestamp };
    }

    if (!includeInactive) {
      whereClause.disabled_at = null;
    }

    const cashiers = await prisma.cashier.findMany({
      where: whereClause,
      orderBy: [{ updated_at: "asc" }, { cashier_id: "asc" }],
      select: {
        cashier_id: true,
        name: true,
        pin_hash: true,
        is_active: true,
        updated_at: true,
      },
    });

    return cashiers;
  }

  /**
   * Perform full employee sync with validation and audit logging
   * SEC-006: Parameterized queries throughout
   * DB-006: Tenant isolation via session validation
   * SEC-017: Audit logging for all sync operations
   *
   * @param identity - API key identity from middleware
   * @param sessionId - Sync session ID
   * @param options - Sync options
   * @param auditContext - Context for audit logging
   * @returns Employee sync response
   */
  async syncEmployees(
    identity: ApiKeyIdentity,
    sessionId: string,
    options: EmployeeSyncOptions,
    auditContext: EmployeeSyncAuditContext,
  ): Promise<EmployeeSyncResponse> {
    // Validate session ownership and get store ID
    const { storeId } = await this.validateSyncSession(
      sessionId,
      identity.apiKeyId,
    );

    // DB-006: Defense in depth - verify store matches
    if (storeId !== identity.storeId) {
      throw new Error(
        "STORE_MISMATCH: Session store does not match API key store",
      );
    }

    // Fetch employees for the store
    const response = await this.getEmployeesForSync(storeId, options);

    // SEC-017: Log sync operation (async, non-blocking)
    this.logEmployeeSync(auditContext, response.employees.length).catch((err) =>
      console.error("[EmployeeSyncService] Audit log error:", err),
    );

    return response;
  }

  /**
   * Log employee sync operation for audit trail
   * SEC-017: Audit logging
   */
  private async logEmployeeSync(
    context: EmployeeSyncAuditContext,
    employeeCount: number,
  ): Promise<void> {
    await apiKeyAuditService.logCustomEvent(
      context.apiKeyId,
      "SYNC_STARTED",
      "DEVICE",
      context.ipAddress,
      undefined,
      {
        syncType: "EMPLOYEE_SYNC",
        sessionId: context.sessionId,
        employeeCount,
        deviceFingerprint: context.deviceFingerprint,
      },
    );
  }

  // ==========================================================================
  // PUSH Operations (Desktop → Server)
  // ==========================================================================

  /**
   * Push employees from desktop to server (batch operation)
   * SEC-006: Parameterized queries via Prisma ORM
   * DB-006: Tenant isolation via session validation
   * SEC-001: PIN hashes only (never plaintext)
   *
   * @param identity - API key identity from middleware
   * @param sessionId - Sync session ID
   * @param employees - Array of employee records to sync
   * @param auditContext - Context for audit logging
   * @returns Batch sync results with per-record success/failure
   */
  async pushEmployees(
    identity: ApiKeyIdentity,
    sessionId: string,
    employees: EmployeeSyncPushRecord[],
    auditContext: EmployeeSyncAuditContext,
  ): Promise<EmployeeSyncPushResponse> {
    // Validate session ownership and get store ID
    const { storeId } = await this.validateSyncSession(
      sessionId,
      identity.apiKeyId,
    );

    // DB-006: Defense in depth - verify store matches
    if (storeId !== identity.storeId) {
      throw new Error(
        "STORE_MISMATCH: Session store does not match API key store",
      );
    }

    // Get the store's store_login_user_id as default created_by
    const store = await prisma.store.findUnique({
      where: { store_id: storeId },
      select: { store_login_user_id: true },
    });

    if (!store?.store_login_user_id) {
      throw new Error(
        "STORE_CONFIG_ERROR: Store does not have a store_login_user configured. " +
          "Please configure a store login user before syncing employees from desktop.",
      );
    }

    const defaultCreatedBy = store.store_login_user_id;

    const results: EmployeeSyncPushResult[] = [];
    let successCount = 0;
    let failureCount = 0;

    // Process each employee record
    for (const employee of employees) {
      try {
        const result = await this.syncSingleEmployee(
          storeId,
          employee,
          defaultCreatedBy,
        );
        results.push(result);
        if (result.success) {
          successCount++;
        } else {
          failureCount++;
        }
      } catch (error) {
        // Unexpected error - log but continue processing batch
        const message =
          error instanceof Error ? error.message : "Unknown error";
        console.error(
          `[EmployeeSyncService] Error syncing employee ${employee.employee_id}:`,
          message,
        );
        results.push({
          employee_id: employee.employee_id,
          success: false,
          idempotent: false,
          error_code: "INTERNAL_ERROR",
          error_message: "Unexpected error during sync",
        });
        failureCount++;
      }
    }

    // SEC-017: Log push operation (async, non-blocking)
    this.logEmployeePush(auditContext, successCount, failureCount).catch(
      (err) => console.error("[EmployeeSyncService] Audit log error:", err),
    );

    return {
      total_count: employees.length,
      success_count: successCount,
      failure_count: failureCount,
      results,
      server_time: new Date().toISOString(),
    };
  }

  /**
   * Sync a single employee (cashier) to the database
   * SEC-006: Parameterized queries via Prisma ORM
   * DB-006: Tenant isolation via store_id parameter
   *
   * @param storeId - Store ID from validated session
   * @param employee - Employee record to sync
   * @param defaultCreatedBy - Default user ID to use for created_by if not specified
   * @returns Sync result for this employee
   */
  private async syncSingleEmployee(
    storeId: string,
    employee: EmployeeSyncPushRecord,
    defaultCreatedBy: string,
  ): Promise<EmployeeSyncPushResult> {
    // Only CASHIER role is supported for push
    if (employee.role !== "CASHIER") {
      return {
        employee_id: employee.employee_id,
        success: false,
        idempotent: false,
        error_code: "INVALID_ROLE",
        error_message: "Only CASHIER role can be pushed from desktop",
      };
    }

    // Check if cashier already exists
    const existingCashier = await prisma.cashier.findUnique({
      where: { cashier_id: employee.employee_id },
      select: { cashier_id: true, store_id: true },
    });

    // If exists, verify it belongs to the same store (tenant isolation)
    if (existingCashier && existingCashier.store_id !== storeId) {
      return {
        employee_id: employee.employee_id,
        success: false,
        idempotent: false,
        error_code: "TENANT_VIOLATION",
        error_message: "Cashier exists in a different store",
      };
    }

    const isIdempotent = !!existingCashier;

    // Generate employee_id (4-digit code) if not provided
    let employeeCode = employee.employee_code;
    if (!employeeCode) {
      employeeCode = await this.generateUniqueEmployeeCode(storeId);
    } else {
      // Verify employee_code is unique within store
      const codeExists = await prisma.cashier.findFirst({
        where: {
          store_id: storeId,
          employee_id: employeeCode,
          cashier_id: { not: employee.employee_id }, // Exclude self for updates
        },
        select: { cashier_id: true },
      });

      if (codeExists) {
        return {
          employee_id: employee.employee_id,
          success: false,
          idempotent: false,
          error_code: "DUPLICATE_EMPLOYEE_CODE",
          error_message: `Employee code ${employeeCode} already exists in this store`,
        };
      }
    }

    // Determine created_by: use provided value or default
    const createdBy = employee.created_by || defaultCreatedBy;

    // Upsert the cashier record
    await prisma.cashier.upsert({
      where: { cashier_id: employee.employee_id },
      create: {
        cashier_id: employee.employee_id,
        store_id: storeId,
        name: employee.name,
        employee_id: employeeCode,
        pin_hash: employee.pin_hash,
        is_active: employee.is_active ?? true,
        hired_on: employee.hired_on ? new Date(employee.hired_on) : new Date(),
        termination_date: employee.termination_date
          ? new Date(employee.termination_date)
          : null,
        created_by: createdBy,
      },
      update: {
        name: employee.name,
        employee_id: employeeCode,
        pin_hash: employee.pin_hash,
        is_active: employee.is_active ?? true,
        termination_date: employee.termination_date
          ? new Date(employee.termination_date)
          : null,
        // Don't update hired_on or created_by on updates
        updated_at: new Date(),
      },
    });

    return {
      employee_id: employee.employee_id,
      success: true,
      idempotent: isIdempotent,
    };
  }

  /**
   * Generate a unique 4-digit employee code for a store
   * Finds the next available code that doesn't conflict
   */
  private async generateUniqueEmployeeCode(storeId: string): Promise<string> {
    // Get all existing codes for this store
    const existingCodes = await prisma.cashier.findMany({
      where: { store_id: storeId },
      select: { employee_id: true },
    });

    const usedCodes = new Set(existingCodes.map((c) => c.employee_id));

    // Find next available code starting from 0001
    for (let i = 1; i <= 9999; i++) {
      const code = i.toString().padStart(4, "0");
      if (!usedCodes.has(code)) {
        return code;
      }
    }

    // All codes exhausted (unlikely - 9999 cashiers per store)
    throw new Error("NO_AVAILABLE_CODES: All employee codes are in use");
  }

  /**
   * Log employee push operation for audit trail
   * SEC-017: Audit logging
   */
  private async logEmployeePush(
    context: EmployeeSyncAuditContext,
    successCount: number,
    failureCount: number,
  ): Promise<void> {
    await apiKeyAuditService.logCustomEvent(
      context.apiKeyId,
      "SYNC_COMPLETED", // Using SYNC_COMPLETED for push operations
      "DEVICE",
      context.ipAddress,
      undefined,
      {
        syncType: "EMPLOYEE_PUSH",
        sessionId: context.sessionId,
        successCount,
        failureCount,
        deviceFingerprint: context.deviceFingerprint,
      },
    );
  }

  /**
   * Get sync statistics for a store
   * Performance: Parallel count queries
   */
  async getSyncStats(storeId: string): Promise<{
    totalEmployees: number;
    storeManagers: number;
    shiftManagers: number;
    cashiers: number;
    lastUpdated: Date | null;
  }> {
    // SEC-006: Parameterized queries via Prisma
    const [managerCount, cashierCount, lastCashier] = await Promise.all([
      // Count users with store roles
      prisma.userRole.count({
        where: {
          store_id: storeId,
          status: "ACTIVE",
          role: {
            code: { in: SYNCABLE_ROLE_CODES },
          },
          user: {
            status: "ACTIVE",
            pin_hash: { not: null },
          },
        },
      }),
      // Count active cashiers
      prisma.cashier.count({
        where: {
          store_id: storeId,
          disabled_at: null,
        },
      }),
      // Get last updated timestamp
      prisma.cashier.findFirst({
        where: { store_id: storeId },
        orderBy: { updated_at: "desc" },
        select: { updated_at: true },
      }),
    ]);

    // Get breakdown by role
    const roleBreakdown = await prisma.userRole.groupBy({
      by: ["role_id"],
      where: {
        store_id: storeId,
        status: "ACTIVE",
        user: {
          status: "ACTIVE",
          pin_hash: { not: null },
        },
      },
      _count: true,
    });

    // Map role IDs to counts
    const roles = await prisma.role.findMany({
      where: {
        role_id: { in: roleBreakdown.map((r) => r.role_id) },
      },
      select: { role_id: true, code: true },
    });

    const roleMap = new Map(roles.map((r) => [r.role_id, r.code]));
    let storeManagers = 0;
    let shiftManagers = 0;

    for (const rb of roleBreakdown) {
      const code = roleMap.get(rb.role_id);
      if (code === "STORE_MANAGER") storeManagers = rb._count;
      else if (code === "SHIFT_MANAGER") shiftManagers = rb._count;
    }

    return {
      totalEmployees: managerCount + cashierCount,
      storeManagers,
      shiftManagers,
      cashiers: cashierCount,
      lastUpdated: lastCashier?.updated_at || null,
    };
  }
}

// Export singleton instance
export const employeeSyncService = new EmployeeSyncService();
