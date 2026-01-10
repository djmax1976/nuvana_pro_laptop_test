/**
 * Elevated Access Audit Service
 *
 * Enterprise-grade security event logging for step-up authentication.
 * Provides comprehensive audit trail for all elevated access operations.
 *
 * Security Standards:
 * - SEC-010: AUTHZ - Complete audit trail for authorization decisions
 * - SEC-012: SESSION_TIMEOUT - Tracks token expiry and usage
 * - SEC-014: INPUT_VALIDATION - Logs validation failures
 * - API-003: ERROR_HANDLING - Captures error details for investigation
 *
 * @module services/auth/elevated-access-audit.service
 */

import { prisma } from "../../utils/db";
import type {
  ElevatedAccessEventType,
  ElevatedAccessResult,
  ElevatedAccessAudit,
} from "@prisma/client";

// ============================================================================
// Types
// ============================================================================

/**
 * Input for creating an audit record
 */
export interface CreateAuditInput {
  userId: string;
  userEmail: string;
  sessionId?: string;
  eventType: ElevatedAccessEventType;
  result: ElevatedAccessResult;
  requestedPermission: string;
  storeId?: string;
  tokenJti?: string;
  tokenIssuedAt?: Date;
  tokenExpiresAt?: Date;
  tokenUsedAt?: Date;
  ipAddress: string;
  userAgent?: string;
  requestId?: string;
  errorCode?: string;
  errorMessage?: string;
  attemptCount?: number;
  rateLimitWindow?: Date;
}

/**
 * Input for logging elevation request (before verification)
 */
export interface LogElevationRequestInput {
  userEmail: string;
  requestedPermission: string;
  storeId?: string;
  ipAddress: string;
  userAgent?: string;
  requestId?: string;
}

/**
 * Input for logging successful elevation grant
 */
export interface LogElevationGrantedInput {
  userId: string;
  userEmail: string;
  sessionId?: string;
  requestedPermission: string;
  storeId?: string;
  tokenJti: string;
  tokenIssuedAt: Date;
  tokenExpiresAt: Date;
  ipAddress: string;
  userAgent?: string;
  requestId?: string;
}

/**
 * Input for logging elevation denial
 */
export interface LogElevationDeniedInput {
  userId?: string;
  userEmail: string;
  requestedPermission: string;
  storeId?: string;
  ipAddress: string;
  userAgent?: string;
  requestId?: string;
  result: ElevatedAccessResult;
  errorCode?: string;
  errorMessage?: string;
  attemptCount?: number;
  rateLimitWindow?: Date;
}

/**
 * Input for logging token usage
 */
export interface LogTokenUsedInput {
  tokenJti: string;
  ipAddress: string;
  userAgent?: string;
  requestId?: string;
}

/**
 * Query parameters for audit records
 */
export interface AuditQueryParams {
  userId?: string;
  userEmail?: string;
  storeId?: string;
  eventType?: ElevatedAccessEventType;
  result?: ElevatedAccessResult;
  ipAddress?: string;
  fromDate?: Date;
  toDate?: Date;
  limit?: number;
  offset?: number;
}

/**
 * Rate limit check result
 */
export interface RateLimitStatus {
  isLimited: boolean;
  attemptCount: number;
  windowStart: Date;
  remainingAttempts: number;
}

// ============================================================================
// Constants
// ============================================================================

/** Default rate limit: 5 attempts per 15 minutes */
const DEFAULT_RATE_LIMIT_ATTEMPTS = 5;
const DEFAULT_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

// ============================================================================
// Service Class
// ============================================================================

/**
 * Elevated Access Audit Service
 *
 * Provides comprehensive audit logging for step-up authentication events.
 * All methods are designed to never throw - audit logging should not break
 * the main application flow.
 */
class ElevatedAccessAuditService {
  // ==========================================================================
  // Core Audit Methods
  // ==========================================================================

  /**
   * Create a raw audit record
   * Internal method - prefer using the semantic logging methods
   */
  async createAuditRecord(
    input: CreateAuditInput,
  ): Promise<ElevatedAccessAudit | null> {
    try {
      const record = await prisma.elevatedAccessAudit.create({
        data: {
          user_id: input.userId,
          user_email: input.userEmail,
          session_id: input.sessionId,
          event_type: input.eventType,
          result: input.result,
          requested_permission: input.requestedPermission,
          store_id: input.storeId,
          token_jti: input.tokenJti,
          token_issued_at: input.tokenIssuedAt,
          token_expires_at: input.tokenExpiresAt,
          token_used_at: input.tokenUsedAt,
          ip_address: input.ipAddress,
          user_agent: input.userAgent,
          request_id: input.requestId,
          error_code: input.errorCode,
          error_message: input.errorMessage,
          attempt_count: input.attemptCount,
          rate_limit_window: input.rateLimitWindow,
        },
      });

      return record;
    } catch (error) {
      // Audit logging should never break the application
      console.error(
        "[ElevatedAccessAudit] Failed to create audit record:",
        error,
      );
      return null;
    }
  }

  // ==========================================================================
  // Semantic Logging Methods
  // ==========================================================================

  /**
   * Log an elevation request (before verification)
   * Used to track all attempts, even if user lookup fails
   */
  async logElevationRequested(input: LogElevationRequestInput): Promise<void> {
    try {
      // For requests, we may not have a user_id yet (user lookup might fail)
      // Use a placeholder that indicates "unknown user"
      await prisma.elevatedAccessAudit.create({
        data: {
          user_id: "00000000-0000-0000-0000-000000000000", // Placeholder for unknown
          user_email: input.userEmail,
          event_type: "ELEVATION_REQUESTED",
          result: "SUCCESS", // Request itself succeeded, outcome pending
          requested_permission: input.requestedPermission,
          store_id: input.storeId,
          ip_address: input.ipAddress,
          user_agent: input.userAgent,
          request_id: input.requestId,
        },
      });
    } catch (error) {
      console.error(
        "[ElevatedAccessAudit] Failed to log elevation request:",
        error,
      );
    }
  }

  /**
   * Log successful elevation grant
   */
  async logElevationGranted(input: LogElevationGrantedInput): Promise<void> {
    try {
      await prisma.elevatedAccessAudit.create({
        data: {
          user_id: input.userId,
          user_email: input.userEmail,
          session_id: input.sessionId,
          event_type: "ELEVATION_GRANTED",
          result: "SUCCESS",
          requested_permission: input.requestedPermission,
          store_id: input.storeId,
          token_jti: input.tokenJti,
          token_issued_at: input.tokenIssuedAt,
          token_expires_at: input.tokenExpiresAt,
          ip_address: input.ipAddress,
          user_agent: input.userAgent,
          request_id: input.requestId,
        },
      });
    } catch (error) {
      console.error(
        "[ElevatedAccessAudit] Failed to log elevation granted:",
        error,
      );
    }
  }

  /**
   * Log elevation denial
   */
  async logElevationDenied(input: LogElevationDeniedInput): Promise<void> {
    try {
      await prisma.elevatedAccessAudit.create({
        data: {
          user_id: input.userId || "00000000-0000-0000-0000-000000000000",
          user_email: input.userEmail,
          event_type: "ELEVATION_DENIED",
          result: input.result,
          requested_permission: input.requestedPermission,
          store_id: input.storeId,
          ip_address: input.ipAddress,
          user_agent: input.userAgent,
          request_id: input.requestId,
          error_code: input.errorCode,
          error_message: input.errorMessage,
          attempt_count: input.attemptCount,
          rate_limit_window: input.rateLimitWindow,
        },
      });
    } catch (error) {
      console.error(
        "[ElevatedAccessAudit] Failed to log elevation denied:",
        error,
      );
    }
  }

  /**
   * Log rate limit event
   */
  async logRateLimited(input: LogElevationDeniedInput): Promise<void> {
    try {
      await prisma.elevatedAccessAudit.create({
        data: {
          user_id: input.userId || "00000000-0000-0000-0000-000000000000",
          user_email: input.userEmail,
          event_type: "ELEVATION_RATE_LIMITED",
          result: "FAILED_RATE_LIMIT",
          requested_permission: input.requestedPermission,
          store_id: input.storeId,
          ip_address: input.ipAddress,
          user_agent: input.userAgent,
          request_id: input.requestId,
          attempt_count: input.attemptCount,
          rate_limit_window: input.rateLimitWindow,
        },
      });
    } catch (error) {
      console.error("[ElevatedAccessAudit] Failed to log rate limit:", error);
    }
  }

  /**
   * Log token usage
   * Marks the token as used for replay protection
   */
  async logTokenUsed(input: LogTokenUsedInput): Promise<boolean> {
    try {
      // Find the grant record by token JTI
      const grantRecord = await prisma.elevatedAccessAudit.findUnique({
        where: { token_jti: input.tokenJti },
      });

      if (!grantRecord) {
        console.warn(
          `[ElevatedAccessAudit] Token not found: ${input.tokenJti}`,
        );
        return false;
      }

      // Check if already used (replay protection)
      if (grantRecord.token_used_at) {
        // Log replay attempt
        await prisma.elevatedAccessAudit.create({
          data: {
            user_id: grantRecord.user_id,
            user_email: grantRecord.user_email,
            event_type: "ELEVATION_USED",
            result: "FAILED_TOKEN_USED",
            requested_permission: grantRecord.requested_permission,
            store_id: grantRecord.store_id,
            token_jti: `replay-${input.tokenJti}`, // Avoid unique constraint
            ip_address: input.ipAddress,
            user_agent: input.userAgent,
            request_id: input.requestId,
            error_code: "TOKEN_REPLAY",
            error_message: "Token has already been used",
          },
        });
        return false;
      }

      // Mark token as used
      await prisma.elevatedAccessAudit.update({
        where: { token_jti: input.tokenJti },
        data: { token_used_at: new Date() },
      });

      // Create usage record
      await prisma.elevatedAccessAudit.create({
        data: {
          user_id: grantRecord.user_id,
          user_email: grantRecord.user_email,
          event_type: "ELEVATION_USED",
          result: "SUCCESS",
          requested_permission: grantRecord.requested_permission,
          store_id: grantRecord.store_id,
          token_jti: `used-${input.tokenJti}`, // Avoid unique constraint
          ip_address: input.ipAddress,
          user_agent: input.userAgent,
          request_id: input.requestId,
        },
      });

      return true;
    } catch (error) {
      console.error("[ElevatedAccessAudit] Failed to log token usage:", error);
      return false;
    }
  }

  /**
   * Log token expiry
   */
  async logTokenExpired(tokenJti: string): Promise<void> {
    try {
      const grantRecord = await prisma.elevatedAccessAudit.findUnique({
        where: { token_jti: tokenJti },
      });

      if (grantRecord && !grantRecord.token_used_at) {
        await prisma.elevatedAccessAudit.create({
          data: {
            user_id: grantRecord.user_id,
            user_email: grantRecord.user_email,
            event_type: "ELEVATION_EXPIRED",
            result: "FAILED_TOKEN_EXPIRED",
            requested_permission: grantRecord.requested_permission,
            store_id: grantRecord.store_id,
            token_jti: `expired-${tokenJti}`,
            ip_address: grantRecord.ip_address,
          },
        });
      }
    } catch (error) {
      console.error("[ElevatedAccessAudit] Failed to log token expiry:", error);
    }
  }

  // ==========================================================================
  // Rate Limiting Support
  // ==========================================================================

  /**
   * Check rate limit status for an IP address or user
   * Returns the number of failed attempts in the current window
   */
  async checkRateLimit(
    identifier: string,
    identifierType: "ip" | "email",
    windowMs: number = DEFAULT_RATE_LIMIT_WINDOW_MS,
    maxAttempts: number = DEFAULT_RATE_LIMIT_ATTEMPTS,
  ): Promise<RateLimitStatus> {
    try {
      const windowStart = new Date(Date.now() - windowMs);

      // Count failed attempts in the window
      const failedAttempts = await prisma.elevatedAccessAudit.count({
        where: {
          ...(identifierType === "ip"
            ? { ip_address: identifier }
            : { user_email: identifier }),
          event_type: { in: ["ELEVATION_DENIED", "ELEVATION_RATE_LIMITED"] },
          result: {
            in: [
              "FAILED_CREDENTIALS",
              "FAILED_PERMISSION",
              "FAILED_RATE_LIMIT",
            ],
          },
          created_at: { gte: windowStart },
        },
      });

      return {
        isLimited: failedAttempts >= maxAttempts,
        attemptCount: failedAttempts,
        windowStart,
        remainingAttempts: Math.max(0, maxAttempts - failedAttempts),
      };
    } catch (error) {
      console.error("[ElevatedAccessAudit] Failed to check rate limit:", error);
      // Fail open - don't block legitimate requests due to audit failures
      return {
        isLimited: false,
        attemptCount: 0,
        windowStart: new Date(),
        remainingAttempts: maxAttempts,
      };
    }
  }

  // ==========================================================================
  // Query Methods
  // ==========================================================================

  /**
   * Query audit records with filters
   */
  async queryAuditRecords(
    params: AuditQueryParams,
  ): Promise<ElevatedAccessAudit[]> {
    try {
      const records = await prisma.elevatedAccessAudit.findMany({
        where: {
          ...(params.userId && { user_id: params.userId }),
          ...(params.userEmail && { user_email: params.userEmail }),
          ...(params.storeId && { store_id: params.storeId }),
          ...(params.eventType && { event_type: params.eventType }),
          ...(params.result && { result: params.result }),
          ...(params.ipAddress && { ip_address: params.ipAddress }),
          ...(params.fromDate || params.toDate
            ? {
                created_at: {
                  ...(params.fromDate && { gte: params.fromDate }),
                  ...(params.toDate && { lte: params.toDate }),
                },
              }
            : {}),
        },
        orderBy: { created_at: "desc" },
        take: params.limit || 100,
        skip: params.offset || 0,
      });

      return records;
    } catch (error) {
      console.error(
        "[ElevatedAccessAudit] Failed to query audit records:",
        error,
      );
      return [];
    }
  }

  /**
   * Get security summary for a user
   */
  async getUserSecuritySummary(
    userId: string,
    days: number = 30,
  ): Promise<{
    totalRequests: number;
    successfulElevations: number;
    deniedAttempts: number;
    rateLimitEvents: number;
    tokenUsages: number;
    uniqueIPs: number;
  }> {
    try {
      const fromDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const [
        totalRequests,
        successfulElevations,
        deniedAttempts,
        rateLimitEvents,
        tokenUsages,
        uniqueIPsResult,
      ] = await Promise.all([
        prisma.elevatedAccessAudit.count({
          where: { user_id: userId, created_at: { gte: fromDate } },
        }),
        prisma.elevatedAccessAudit.count({
          where: {
            user_id: userId,
            event_type: "ELEVATION_GRANTED",
            created_at: { gte: fromDate },
          },
        }),
        prisma.elevatedAccessAudit.count({
          where: {
            user_id: userId,
            event_type: "ELEVATION_DENIED",
            created_at: { gte: fromDate },
          },
        }),
        prisma.elevatedAccessAudit.count({
          where: {
            user_id: userId,
            event_type: "ELEVATION_RATE_LIMITED",
            created_at: { gte: fromDate },
          },
        }),
        prisma.elevatedAccessAudit.count({
          where: {
            user_id: userId,
            event_type: "ELEVATION_USED",
            result: "SUCCESS",
            created_at: { gte: fromDate },
          },
        }),
        prisma.elevatedAccessAudit.groupBy({
          by: ["ip_address"],
          where: { user_id: userId, created_at: { gte: fromDate } },
        }),
      ]);

      return {
        totalRequests,
        successfulElevations,
        deniedAttempts,
        rateLimitEvents,
        tokenUsages,
        uniqueIPs: uniqueIPsResult.length,
      };
    } catch (error) {
      console.error(
        "[ElevatedAccessAudit] Failed to get user security summary:",
        error,
      );
      return {
        totalRequests: 0,
        successfulElevations: 0,
        deniedAttempts: 0,
        rateLimitEvents: 0,
        tokenUsages: 0,
        uniqueIPs: 0,
      };
    }
  }

  /**
   * Check if a token JTI has been used (replay protection)
   */
  async isTokenUsed(tokenJti: string): Promise<boolean> {
    try {
      const record = await prisma.elevatedAccessAudit.findUnique({
        where: { token_jti: tokenJti },
        select: { token_used_at: true },
      });

      return record?.token_used_at !== null;
    } catch (error) {
      console.error(
        "[ElevatedAccessAudit] Failed to check token usage:",
        error,
      );
      // Fail secure - assume token is used if we can't verify
      return true;
    }
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

export const elevatedAccessAuditService = new ElevatedAccessAuditService();
