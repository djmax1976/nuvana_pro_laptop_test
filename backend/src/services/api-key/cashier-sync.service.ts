/**
 * Cashier Sync Service
 *
 * Enterprise-grade cashier data synchronization for desktop POS applications.
 * Enables offline authentication following industry patterns (NCR Aloha,
 * Microsoft Dynamics 365, Oracle MICROS).
 *
 * Security Controls:
 * - Store isolation: Cashiers only sync for the API key's bound store
 * - Session validation: Requires active sync session
 * - Audit logging: All sync operations are logged
 * - Rate limiting: Enforced at API layer
 *
 * @module services/api-key/cashier-sync.service
 */

import { prisma } from "../../utils/db";
import { apiKeyAuditService } from "./api-key-audit.service";
import type {
  CashierSyncRecord,
  CashierSyncResponse,
  ApiKeyIdentity,
} from "../../types/api-key.types";

// ============================================================================
// Types
// ============================================================================

/**
 * Options for fetching cashier sync data
 */
export interface CashierSyncOptions {
  /** Only fetch records modified after this timestamp */
  sinceTimestamp?: Date;

  /** Only fetch records with sequence > this value */
  sinceSequence?: number;

  /** Include inactive (soft-deleted) cashiers */
  includeInactive?: boolean;

  /** Maximum records to return */
  limit?: number;
}

/**
 * Audit context for logging sync operations
 */
export interface SyncAuditContext {
  apiKeyId: string;
  sessionId: string;
  ipAddress: string;
  deviceFingerprint?: string;
}

// ============================================================================
// Service Implementation
// ============================================================================

class CashierSyncService {
  /**
   * Default limit for cashier sync queries
   */
  private readonly DEFAULT_LIMIT = 100;

  /**
   * Maximum limit for cashier sync queries
   */
  private readonly MAX_LIMIT = 500;

  /**
   * Validate that a sync session is active and belongs to the API key
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
   * Get cashiers for sync with the specified store
   *
   * Security: Only returns cashiers for the store bound to the API key.
   * This is enforced by store_id from the validated session.
   *
   * @param storeId - Store ID (from validated session)
   * @param options - Sync options (filters, pagination)
   * @returns Cashier sync response with records and metadata
   */
  async getCashiersForSync(
    storeId: string,
    options: CashierSyncOptions = {},
  ): Promise<CashierSyncResponse> {
    const {
      sinceTimestamp,
      sinceSequence,
      includeInactive = false,
      limit = this.DEFAULT_LIMIT,
    } = options;

    // Sanitize limit
    const safeLimit = Math.min(Math.max(1, limit), this.MAX_LIMIT);

    // Build where clause with strict store isolation
    const where: {
      store_id: string;
      updated_at?: { gt: Date };
      disabled_at?: null | { not?: null };
    } = {
      store_id: storeId,
    };

    // Delta sync by timestamp
    if (sinceTimestamp) {
      where.updated_at = { gt: sinceTimestamp };
    }

    // Filter by active status
    if (!includeInactive) {
      where.disabled_at = null;
    }

    // Get total count for the query
    const totalCount = await prisma.cashier.count({ where });

    // Fetch cashiers with ordering for consistent pagination
    const cashiers = await prisma.cashier.findMany({
      where,
      orderBy: [{ updated_at: "asc" }, { cashier_id: "asc" }],
      take: safeLimit + 1, // Fetch one extra to determine hasMore
      select: {
        cashier_id: true,
        employee_id: true,
        name: true,
        pin_hash: true,
        is_active: true,
        disabled_at: true,
        updated_at: true,
        created_at: true,
      },
    });

    // Determine if there are more records
    const hasMore = cashiers.length > safeLimit;
    const recordsToReturn = hasMore ? cashiers.slice(0, safeLimit) : cashiers;

    // Transform to sync records with sequence numbers
    // Using updated_at timestamp as basis for sequence
    let sequence = sinceSequence || 0;
    const syncRecords: CashierSyncRecord[] = recordsToReturn.map((cashier) => {
      sequence += 1;
      return {
        cashierId: cashier.cashier_id,
        employeeId: cashier.employee_id,
        name: cashier.name,
        pinHash: cashier.pin_hash,
        isActive: cashier.is_active,
        disabledAt: cashier.disabled_at?.toISOString() || null,
        updatedAt: cashier.updated_at.toISOString(),
        syncSequence: sequence,
      };
    });

    // Calculate next cursor for pagination
    const nextCursor = hasMore ? sequence : undefined;

    return {
      cashiers: syncRecords,
      totalCount,
      currentSequence: sequence,
      hasMore,
      serverTime: new Date().toISOString(),
      nextCursor,
    };
  }

  /**
   * Perform full cashier sync operation with validation and audit logging
   *
   * @param identity - API key identity from middleware
   * @param sessionId - Sync session ID
   * @param options - Sync options
   * @param auditContext - Context for audit logging
   * @returns Cashier sync response
   */
  async syncCashiers(
    identity: ApiKeyIdentity,
    sessionId: string,
    options: CashierSyncOptions,
    auditContext: SyncAuditContext,
  ): Promise<CashierSyncResponse> {
    // Validate session ownership and get store ID
    const { storeId } = await this.validateSyncSession(
      sessionId,
      identity.apiKeyId,
    );

    // Double-check store isolation (defense in depth)
    if (storeId !== identity.storeId) {
      throw new Error(
        "STORE_MISMATCH: Session store does not match API key store",
      );
    }

    // Fetch cashiers for the store
    const response = await this.getCashiersForSync(storeId, options);

    // Log sync operation (async, non-blocking)
    this.logCashierSync(auditContext, response.cashiers.length).catch((err) =>
      console.error("[CashierSyncService] Audit log error:", err),
    );

    return response;
  }

  /**
   * Get a single cashier by employee ID for offline authentication
   *
   * @param storeId - Store ID
   * @param employeeId - 4-digit employee ID
   * @returns Cashier record or null if not found
   */
  async getCashierByEmployeeId(
    storeId: string,
    employeeId: string,
  ): Promise<CashierSyncRecord | null> {
    const cashier = await prisma.cashier.findFirst({
      where: {
        store_id: storeId,
        employee_id: employeeId,
      },
      select: {
        cashier_id: true,
        employee_id: true,
        name: true,
        pin_hash: true,
        is_active: true,
        disabled_at: true,
        updated_at: true,
      },
    });

    if (!cashier) {
      return null;
    }

    return {
      cashierId: cashier.cashier_id,
      employeeId: cashier.employee_id,
      name: cashier.name,
      pinHash: cashier.pin_hash,
      isActive: cashier.is_active,
      disabledAt: cashier.disabled_at?.toISOString() || null,
      updatedAt: cashier.updated_at.toISOString(),
      syncSequence: 0, // Not relevant for single fetch
    };
  }

  /**
   * Log cashier sync operation for audit trail
   */
  private async logCashierSync(
    context: SyncAuditContext,
    cashierCount: number,
  ): Promise<void> {
    await apiKeyAuditService.logCustomEvent(
      context.apiKeyId,
      "SYNC_STARTED", // Using existing event type
      "DEVICE",
      context.ipAddress,
      undefined,
      {
        syncType: "CASHIER_SYNC",
        sessionId: context.sessionId,
        cashierCount,
        deviceFingerprint: context.deviceFingerprint,
      },
    );
  }

  /**
   * Get sync statistics for a store
   * Useful for monitoring and debugging
   */
  async getSyncStats(storeId: string): Promise<{
    totalCashiers: number;
    activeCashiers: number;
    inactiveCashiers: number;
    lastUpdated: Date | null;
  }> {
    const [total, active, lastCashier] = await Promise.all([
      prisma.cashier.count({ where: { store_id: storeId } }),
      prisma.cashier.count({ where: { store_id: storeId, disabled_at: null } }),
      prisma.cashier.findFirst({
        where: { store_id: storeId },
        orderBy: { updated_at: "desc" },
        select: { updated_at: true },
      }),
    ]);

    return {
      totalCashiers: total,
      activeCashiers: active,
      inactiveCashiers: total - active,
      lastUpdated: lastCashier?.updated_at || null,
    };
  }
}

// Export singleton instance
export const cashierSyncService = new CashierSyncService();
