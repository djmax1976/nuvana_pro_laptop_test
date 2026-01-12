/**
 * API Key Audit Service
 *
 * Handles all audit logging for API key operations.
 * Provides comprehensive audit trail for security and compliance.
 *
 * @module services/api-key/api-key-audit.service
 */

import { prisma } from "../../utils/db";
import type { ApiKeyAuditEventType, Prisma } from "@prisma/client";
import type {
  ApiKeyAuditEventInput,
  ApiKeyAuditEventRecord,
} from "../../types/api-key.types";

// ============================================================================
// Service Class
// ============================================================================

/**
 * API Key Audit Service
 *
 * Manages audit logging for all API key operations including
 * creation, activation, rotation, revocation, and usage events.
 */
class ApiKeyAuditService {
  /**
   * Log an audit event
   *
   * @param input - Audit event details
   * @returns The created audit event record
   */
  async logEvent(
    input: ApiKeyAuditEventInput,
  ): Promise<ApiKeyAuditEventRecord> {
    const record = await prisma.apiKeyAuditEvent.create({
      data: {
        api_key_id: input.apiKeyId,
        event_type: input.eventType,
        actor_user_id: input.actorUserId,
        actor_type: input.actorType,
        ip_address: input.ipAddress,
        user_agent: input.userAgent,
        event_details: (input.eventDetails as Prisma.JsonObject) || undefined,
      },
    });

    return this.mapToRecord(record);
  }

  /**
   * Get audit events for an API key
   *
   * @param apiKeyId - API key ID
   * @param options - Pagination and filtering options
   * @returns Paginated audit events
   */
  async getEventsForKey(
    apiKeyId: string,
    options: {
      page?: number;
      limit?: number;
      eventTypes?: ApiKeyAuditEventType[];
      startDate?: Date;
      endDate?: Date;
    } = {},
  ): Promise<{
    items: ApiKeyAuditEventRecord[];
    total: number;
    page: number;
    limit: number;
  }> {
    const page = options.page || 1;
    const limit = Math.min(options.limit || 50, 100);
    const skip = (page - 1) * limit;

    const where: Prisma.ApiKeyAuditEventWhereInput = {
      api_key_id: apiKeyId,
    };

    if (options.eventTypes && options.eventTypes.length > 0) {
      where.event_type = { in: options.eventTypes };
    }

    if (options.startDate || options.endDate) {
      where.created_at = {};
      if (options.startDate) {
        where.created_at.gte = options.startDate;
      }
      if (options.endDate) {
        where.created_at.lte = options.endDate;
      }
    }

    const [items, total] = await Promise.all([
      prisma.apiKeyAuditEvent.findMany({
        where,
        orderBy: { created_at: "desc" },
        skip,
        take: limit,
      }),
      prisma.apiKeyAuditEvent.count({ where }),
    ]);

    return {
      items: items.map(this.mapToRecord),
      total,
      page,
      limit,
    };
  }

  /**
   * Get recent security events across all API keys
   *
   * Returns events like IP_BLOCKED, RATE_LIMITED, REVOKED, SUSPENDED
   */
  async getSecurityEvents(
    options: {
      limit?: number;
      companyId?: string;
      storeId?: string;
    } = {},
  ): Promise<ApiKeyAuditEventRecord[]> {
    const limit = Math.min(options.limit || 100, 500);

    const where: Prisma.ApiKeyAuditEventWhereInput = {
      event_type: {
        in: [
          "IP_BLOCKED",
          "RATE_LIMITED",
          "QUOTA_EXCEEDED",
          "REVOKED",
          "SUSPENDED",
        ],
      },
    };

    // Filter by company or store if provided
    if (options.companyId || options.storeId) {
      where.api_key = {};
      if (options.companyId) {
        where.api_key.company_id = options.companyId;
      }
      if (options.storeId) {
        where.api_key.store_id = options.storeId;
      }
    }

    const items = await prisma.apiKeyAuditEvent.findMany({
      where,
      orderBy: { created_at: "desc" },
      take: limit,
    });

    return items.map(this.mapToRecord);
  }

  /**
   * Log a heartbeat event
   */
  async logHeartbeat(
    apiKeyId: string,
    ipAddress?: string,
    deviceFingerprint?: string,
    appVersion?: string,
  ): Promise<void> {
    await this.logEvent({
      apiKeyId,
      eventType: "HEARTBEAT",
      actorType: "DEVICE",
      ipAddress,
      eventDetails: {
        device_fingerprint: deviceFingerprint,
        app_version: appVersion,
      },
    }).catch((err) => {
      // Non-critical - log and continue
      console.error("[ApiKeyAuditService] Failed to log heartbeat:", err);
    });
  }

  /**
   * Log a sync session start
   */
  async logSyncStarted(
    apiKeyId: string,
    sessionId: string,
    ipAddress?: string,
    offlineDurationSeconds?: number,
  ): Promise<void> {
    await this.logEvent({
      apiKeyId,
      eventType: "SYNC_STARTED",
      actorType: "DEVICE",
      ipAddress,
      eventDetails: {
        session_id: sessionId,
        offline_duration_seconds: offlineDurationSeconds,
      },
    });
  }

  /**
   * Log a sync session completion
   */
  async logSyncCompleted(
    apiKeyId: string,
    sessionId: string,
    stats: { pulled: number; pushed: number; conflictsResolved: number },
    ipAddress?: string,
  ): Promise<void> {
    await this.logEvent({
      apiKeyId,
      eventType: "SYNC_COMPLETED",
      actorType: "DEVICE",
      ipAddress,
      eventDetails: {
        session_id: sessionId,
        ...stats,
      },
    });
  }

  /**
   * Log a rate limit event
   */
  async logRateLimited(
    apiKeyId: string,
    currentCount: number,
    limit: number,
    ipAddress?: string,
  ): Promise<void> {
    await this.logEvent({
      apiKeyId,
      eventType: "RATE_LIMITED",
      actorType: "SYSTEM",
      ipAddress,
      eventDetails: {
        current_count: currentCount,
        limit,
      },
    });
  }

  /**
   * Log a quota exceeded event
   */
  async logQuotaExceeded(
    apiKeyId: string,
    quotaType: "daily_sync" | "monthly_data",
    currentUsage: number,
    quota: number,
    ipAddress?: string,
  ): Promise<void> {
    await this.logEvent({
      apiKeyId,
      eventType: "QUOTA_EXCEEDED",
      actorType: "SYSTEM",
      ipAddress,
      eventDetails: {
        quota_type: quotaType,
        current_usage: currentUsage,
        quota,
      },
    });
  }

  /**
   * Log a custom audit event with arbitrary details
   * Used for extensible logging like cashier sync events
   */
  async logCustomEvent(
    apiKeyId: string,
    eventType: ApiKeyAuditEventType,
    actorType: "ADMIN" | "SYSTEM" | "DEVICE",
    ipAddress?: string,
    userAgent?: string,
    eventDetails?: Record<string, unknown>,
  ): Promise<void> {
    await this.logEvent({
      apiKeyId,
      eventType,
      actorType,
      ipAddress,
      userAgent,
      eventDetails,
    });
  }

  /**
   * Count events by type for an API key
   *
   * Useful for dashboards and monitoring
   */
  async getEventCounts(
    apiKeyId: string,
    since?: Date,
  ): Promise<Record<ApiKeyAuditEventType, number>> {
    const where: Prisma.ApiKeyAuditEventWhereInput = {
      api_key_id: apiKeyId,
    };

    if (since) {
      where.created_at = { gte: since };
    }

    const counts = await prisma.apiKeyAuditEvent.groupBy({
      by: ["event_type"],
      where,
      _count: { event_type: true },
    });

    // Initialize all event types to 0
    const result: Record<string, number> = {};
    for (const row of counts) {
      result[row.event_type] = row._count.event_type;
    }

    return result as Record<ApiKeyAuditEventType, number>;
  }

  /**
   * Map database record to typed record
   */
  private mapToRecord(record: {
    audit_event_id: string;
    api_key_id: string;
    event_type: ApiKeyAuditEventType;
    actor_user_id: string | null;
    actor_type: string;
    ip_address: string | null;
    user_agent: string | null;
    event_details: Prisma.JsonValue;
    created_at: Date;
  }): ApiKeyAuditEventRecord {
    return {
      auditEventId: record.audit_event_id,
      apiKeyId: record.api_key_id,
      eventType: record.event_type,
      actorUserId: record.actor_user_id,
      actorType: record.actor_type,
      ipAddress: record.ip_address,
      userAgent: record.user_agent,
      eventDetails: record.event_details as Record<string, unknown> | null,
      createdAt: record.created_at,
    };
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const apiKeyAuditService = new ApiKeyAuditService();
