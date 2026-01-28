/**
 * Device API Routes
 *
 * Endpoints for desktop POS applications to interact with the server.
 * All routes require API key authentication.
 *
 * Routes:
 * - POST /api/v1/keys/activate        - Activate API key on device
 * - GET  /api/v1/keys/identity        - Get/refresh identity payload
 * - POST /api/v1/keys/heartbeat       - Periodic status check
 * - POST /api/v1/sync/start           - Start sync session
 * - POST /api/v1/sync/push            - Push offline data
 * - GET  /api/v1/sync/pull            - Pull server updates
 * - POST /api/v1/sync/complete        - Complete sync session
 * - GET  /api/v1/sync/cashiers        - Sync cashier data for offline auth
 * - GET  /api/v1/sync/employees       - Sync all employee types for offline auth (PULL)
 * - POST /api/v1/sync/employees       - Push employees from desktop to server (PUSH)
 * - GET  /api/v1/sync/pos/config      - Get Store-level POS connection config (PRIMARY)
 * - GET  /api/v1/sync/terminal/info   - Get terminal info (DEPRECATED - use pos/config)
 * - POST /api/v1/store/reset          - Authorize store data reset
 *
 * @module routes/device-api
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import {
  apiKeyMiddleware,
  requireApiKeyIdentity,
} from "../middleware/api-key.middleware";
import {
  apiKeyService,
  apiKeyAuditService,
  cashierSyncService,
  storeManagerSyncService,
  employeeSyncService,
  terminalSyncService,
} from "../services/api-key";
import { prisma } from "../utils/db";
import jwt from "jsonwebtoken";
import {
  activateApiKeySchema,
  heartbeatSchema,
  syncStartSchema,
  syncPushSchema,
  syncPullQuerySchema,
  syncCompleteSchema,
  cashierSyncQuerySchema,
  employeeSyncQuerySchema,
  employeeSyncPushSchema,
  storeResetSchema,
} from "../schemas/api-key.schema";
import type {
  ActivateApiKeyResponse,
  HeartbeatResponse,
  SyncStartResponse,
  SyncPushResponse,
  SyncPullResponse,
  CashierSyncResponse,
  ApiKeyIdentityPayload,
  StoreResetResponse,
  StoreResetType,
  TerminalInfoResponse,
  StorePOSConnectionConfig,
  POSConnectionConfigResponse,
  EmployeeSyncPushResponse,
} from "../types/api-key.types";

// ============================================================================
// Validation Helper
// ============================================================================

/**
 * Format Zod validation errors for API response
 */
function formatZodError(
  error: z.ZodError,
): { field: string; message: string }[] {
  return error.issues.map((issue) => ({
    field: issue.path.join("."),
    message: issue.message,
  }));
}

// ============================================================================
// Constants
// ============================================================================

/** Default heartbeat interval in seconds */
const DEFAULT_HEARTBEAT_INTERVAL = 300; // 5 minutes

/** Default revocation check interval in seconds */
const DEFAULT_REVOCATION_CHECK_INTERVAL = 300; // 5 minutes

/** Offline token validity in days */
const OFFLINE_TOKEN_VALIDITY_DAYS = 90;

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Extract client IP from request
 */
function getClientIp(request: FastifyRequest): string {
  const forwarded = request.headers["x-forwarded-for"];
  if (forwarded) {
    return Array.isArray(forwarded)
      ? forwarded[0]
      : forwarded.split(",")[0].trim();
  }
  return request.ip || "unknown";
}

/**
 * Generate offline token for local validation
 */
function generateOfflineToken(
  identityPayload: ApiKeyIdentityPayload,
  deviceFingerprint: string,
  appVersion: string,
): { token: string; expiresAt: Date } {
  const jwtSecret = process.env.API_KEY_SECRET || process.env.JWT_SECRET || "";

  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + OFFLINE_TOKEN_VALIDITY_DAYS);

  const offlinePayload = {
    ...identityPayload,
    device_fingerprint: deviceFingerprint,
    app_version: appVersion,
    offline: true,
    exp: Math.floor(expiresAt.getTime() / 1000),
  };

  const token = jwt.sign(offlinePayload, jwtSecret, { algorithm: "HS256" });

  return { token, expiresAt };
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * Register device API routes
 */
export async function deviceApiRoutes(fastify: FastifyInstance): Promise<void> {
  // ==========================================================================
  // ACTIVATE API KEY
  // ==========================================================================

  /**
   * POST /api/v1/keys/activate
   * Activate API key on device for first use
   *
   * Changes key status from PENDING to ACTIVE and records device info.
   */
  fastify.post(
    "/api/v1/keys/activate",
    {
      preHandler: [apiKeyMiddleware],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const identity = requireApiKeyIdentity(request);
        const clientIp = getClientIp(request);

        // Validate request body with Zod schema
        const parseResult = activateApiKeySchema.safeParse(request.body);
        if (!parseResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Invalid request body",
              details: formatZodError(parseResult.error),
            },
          });
        }

        const body = parseResult.data;

        // Get the API key record with store POS config and terminal info
        // Store-level POS config is the PRIMARY way to get connection settings
        // Terminal info is included for backward compatibility but deprecated
        const keyRecord = await prisma.apiKey.findUnique({
          where: { api_key_id: identity.apiKeyId },
          include: {
            store: {
              select: {
                name: true,
                timezone: true,
                public_id: true,
                // Store-level POS connection config (NEW - primary approach)
                pos_type: true,
                pos_connection_type: true,
                pos_connection_config: true,
              },
            },
            company: {
              select: { name: true },
            },
            // Terminal info kept for backward compatibility
            // Will be deprecated - terminals are discovered dynamically
            terminal: {
              select: {
                pos_terminal_id: true,
                name: true,
                device_id: true,
                connection_type: true,
                connection_config: true,
                pos_type: true,
                terminal_status: true,
                sync_status: true,
                last_sync_at: true,
                updated_at: true,
                deleted_at: true,
              },
            },
          },
        });

        if (!keyRecord) {
          return reply.code(404).send({
            success: false,
            error: { code: "NOT_FOUND", message: "API key not found" },
          });
        }

        // If key is PENDING, activate it
        if (keyRecord.status === "PENDING") {
          await apiKeyService.activateApiKey(
            identity.apiKeyId,
            body.deviceFingerprint,
            body.appVersion,
            clientIp,
          );
        }

        // Decode identity payload
        const jwtSecret =
          process.env.API_KEY_SECRET || process.env.JWT_SECRET || "";
        const identityPayload = jwt.verify(
          keyRecord.identity_payload,
          jwtSecret,
        ) as ApiKeyIdentityPayload;

        // Generate offline token
        const offlineToken = generateOfflineToken(
          identityPayload,
          body.deviceFingerprint,
          body.appVersion,
        );

        // Fetch store manager data for offline authentication
        const storeManager =
          await storeManagerSyncService.getStoreManagerForActivation(identity, {
            apiKeyId: identity.apiKeyId,
            ipAddress: clientIp,
            eventType: "ACTIVATION",
          });

        // Build Store-level POS connection config (PRIMARY - new approach)
        // This is how desktop apps should get POS connection settings
        // Terminals are discovered dynamically after connecting to POS
        const posConnectionConfig: StorePOSConnectionConfig = {
          pos_type: keyRecord.store.pos_type,
          pos_connection_type: keyRecord.store.pos_connection_type,
          pos_connection_config: keyRecord.store
            .pos_connection_config as Record<string, unknown> | null,
        };

        // Build terminal info if bound and not soft-deleted
        // DEPRECATED: Terminal binding approach is deprecated
        // Terminals should be discovered dynamically from POS data
        let terminalInfo = null;
        if (keyRecord.terminal && !keyRecord.terminal.deleted_at) {
          terminalInfo = {
            pos_terminal_id: keyRecord.terminal.pos_terminal_id,
            name: keyRecord.terminal.name,
            device_id: keyRecord.terminal.device_id,
            connection_type: keyRecord.terminal.connection_type,
            connection_config: keyRecord.terminal.connection_config as Record<
              string,
              unknown
            > | null,
            pos_type: keyRecord.terminal.pos_type,
            terminal_status: keyRecord.terminal.terminal_status,
            sync_status: keyRecord.terminal.sync_status,
            last_sync_at:
              keyRecord.terminal.last_sync_at?.toISOString() || null,
            updated_at: keyRecord.terminal.updated_at.toISOString(),
          };
        }

        const response: ActivateApiKeyResponse = {
          identity: {
            storeId: identityPayload.store_id,
            storeName: identityPayload.store_name,
            storePublicId: identityPayload.store_public_id,
            companyId: identityPayload.company_id,
            companyName: identityPayload.company_name,
            timezone: identityPayload.timezone,
            stateId: identityPayload.state_id,
            stateCode: identityPayload.state_code,
            offlinePermissions: identityPayload.offline_permissions,
            metadata: identityPayload.metadata,
          },
          offlineToken: offlineToken.token,
          offlineTokenExpiresAt: offlineToken.expiresAt.toISOString(),
          serverTime: new Date().toISOString(),
          revocationCheckInterval: DEFAULT_REVOCATION_CHECK_INTERVAL,
          storeManager,
          // Store-level POS connection config (PRIMARY - use this)
          posConnectionConfig,
          // Terminal info (DEPRECATED - kept for backward compatibility)
          terminal: terminalInfo,
        };

        return reply.code(200).send({
          success: true,
          data: response,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        console.error("[DeviceApi] Activate error:", message);
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to activate API key",
          },
        });
      }
    },
  );

  // ==========================================================================
  // GET IDENTITY
  // ==========================================================================

  /**
   * GET /api/v1/keys/identity
   * Get or refresh identity payload
   */
  fastify.get(
    "/api/v1/keys/identity",
    {
      preHandler: [apiKeyMiddleware],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const identity = requireApiKeyIdentity(request);

        return reply.code(200).send({
          success: true,
          data: {
            store_id: identity.storeId,
            store_name: identity.storeName,
            store_public_id: identity.storePublicId,
            company_id: identity.companyId,
            company_name: identity.companyName,
            timezone: identity.timezone,
            state_id: identity.stateId,
            state_code: identity.stateCode,
            pos_terminal_id: identity.posTerminalId,
            pos_terminal_name: identity.posTerminalName,
            offline_permissions: identity.offlinePermissions,
            metadata: identity.metadata,
            server_time: new Date().toISOString(),
          },
        });
      } catch (error) {
        console.error("[DeviceApi] Identity error:", error);
        return reply.code(500).send({
          success: false,
          error: { code: "INTERNAL_ERROR", message: "Failed to get identity" },
        });
      }
    },
  );

  // ==========================================================================
  // HEARTBEAT
  // ==========================================================================

  /**
   * POST /api/v1/keys/heartbeat
   * Periodic heartbeat for revocation checking and status updates
   */
  fastify.post(
    "/api/v1/keys/heartbeat",
    {
      preHandler: [apiKeyMiddleware],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const identity = requireApiKeyIdentity(request);
        const clientIp = getClientIp(request);

        // Validate request body with Zod schema
        const parseResult = heartbeatSchema.safeParse(request.body);
        if (!parseResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Invalid request body",
              details: formatZodError(parseResult.error),
            },
          });
        }

        const body = parseResult.data;

        // Get key record to check for rotation
        const keyRecord = await prisma.apiKey.findUnique({
          where: { api_key_id: identity.apiKeyId },
          include: {
            rotated_to: {
              where: { status: { in: ["PENDING", "ACTIVE"] } },
              select: { api_key_id: true },
            },
          },
        });

        if (!keyRecord) {
          return reply.code(404).send({
            success: false,
            error: { code: "NOT_FOUND", message: "API key not found" },
          });
        }

        // Log heartbeat (async, non-blocking)
        apiKeyAuditService.logHeartbeat(
          identity.apiKeyId,
          clientIp,
          body.deviceFingerprint,
          body.appVersion,
        );

        // Check for rotation
        const hasNewKey = keyRecord.rotated_to.length > 0;
        const graceEnded = keyRecord.rotation_grace_ends_at
          ? keyRecord.rotation_grace_ends_at < new Date()
          : false;

        // Build response
        let status: HeartbeatResponse["status"] = "VALID";
        let message: string | undefined;

        if (graceEnded && hasNewKey) {
          status = "ROTATED";
          message =
            "Your API key has been rotated and the grace period has ended. Please obtain the new key.";
        } else if (keyRecord.status === "SUSPENDED") {
          status = "SUSPENDED";
          message = keyRecord.revocation_notes || "API key has been suspended";
        } else if (keyRecord.status === "REVOKED") {
          status = "REVOKED";
          message = keyRecord.revocation_notes || "API key has been revoked";
        }

        const response: HeartbeatResponse = {
          status,
          serverTime: new Date().toISOString(),
          newKeyAvailable: hasNewKey && !graceEnded,
          gracePeriodEndsAt: keyRecord.rotation_grace_ends_at?.toISOString(),
          newKeyRequired: graceEnded && hasNewKey,
          message,
          nextHeartbeatInterval: DEFAULT_HEARTBEAT_INTERVAL,
          syncPending: false, // TODO: Check for pending sync items
          pendingRecordCount: 0,
        };

        return reply.code(200).send({
          success: true,
          data: response,
        });
      } catch (error) {
        console.error("[DeviceApi] Heartbeat error:", error);
        return reply.code(500).send({
          success: false,
          error: { code: "INTERNAL_ERROR", message: "Heartbeat failed" },
        });
      }
    },
  );

  // ==========================================================================
  // SYNC START
  // ==========================================================================

  /**
   * POST /api/v1/sync/start
   * Start a sync session
   */
  fastify.post(
    "/api/v1/sync/start",
    {
      preHandler: [apiKeyMiddleware],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const identity = requireApiKeyIdentity(request);
        const clientIp = getClientIp(request);

        // Validate request body with Zod schema
        const parseResult = syncStartSchema.safeParse(request.body);
        if (!parseResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Invalid request body",
              details: formatZodError(parseResult.error),
            },
          });
        }

        const body = parseResult.data;

        // Get key record to check status
        const keyRecord = await prisma.apiKey.findUnique({
          where: { api_key_id: identity.apiKeyId },
          include: {
            rotated_to: {
              where: { status: { in: ["PENDING", "ACTIVE"] } },
              select: { api_key_id: true },
            },
          },
        });

        if (!keyRecord) {
          return reply.code(404).send({
            success: false,
            error: { code: "NOT_FOUND", message: "API key not found" },
          });
        }

        // Check for revocation
        if (keyRecord.status === "REVOKED") {
          const response: SyncStartResponse = {
            revocationStatus: "REVOKED",
            lockoutMessage:
              keyRecord.revocation_notes || "API key has been revoked",
          };
          return reply.code(200).send({ success: true, data: response });
        }

        // Check for rotation grace period expiry
        const hasNewKey = keyRecord.rotated_to.length > 0;
        const graceEnded =
          keyRecord.rotation_grace_ends_at &&
          keyRecord.rotation_grace_ends_at < new Date();

        if (graceEnded && hasNewKey) {
          const response: SyncStartResponse = {
            revocationStatus: "ROTATED",
            newKeyRequired: true,
            gracePeriodEndsAt: keyRecord.rotation_grace_ends_at?.toISOString(),
          };
          return reply.code(200).send({ success: true, data: response });
        }

        // Create sync session
        const session = await prisma.apiKeySyncSession.create({
          data: {
            api_key_id: identity.apiKeyId,
            device_fingerprint: body.deviceFingerprint,
            app_version: body.appVersion,
            os_info: body.osInfo,
            server_time_at_start: new Date(),
            last_sync_sequence: BigInt(body.lastSyncSequence || 0),
            offline_duration_seconds: body.offlineDurationSeconds,
            sync_status: "ACTIVE",
          },
        });

        // Log sync started
        await apiKeyAuditService.logSyncStarted(
          identity.apiKeyId,
          session.sync_session_id,
          clientIp,
          body.offlineDurationSeconds,
        );

        // Update last sync timestamp
        await prisma.apiKey.update({
          where: { api_key_id: identity.apiKeyId },
          data: { last_sync_at: new Date() },
        });

        // TODO: Calculate pending pull count based on sync sequence
        const pullPendingCount = 0;

        const response: SyncStartResponse = {
          revocationStatus: "VALID",
          sessionId: session.sync_session_id,
          serverTime: new Date().toISOString(),
          pullPendingCount,
          newKeyAvailable: hasNewKey && !graceEnded,
          gracePeriodEndsAt: keyRecord.rotation_grace_ends_at?.toISOString(),
        };

        return reply.code(200).send({ success: true, data: response });
      } catch (error) {
        console.error("[DeviceApi] Sync start error:", error);
        return reply.code(500).send({
          success: false,
          error: { code: "INTERNAL_ERROR", message: "Failed to start sync" },
        });
      }
    },
  );

  // ==========================================================================
  // SYNC PUSH
  // ==========================================================================

  /**
   * POST /api/v1/sync/push
   * Push offline data to server
   */
  fastify.post(
    "/api/v1/sync/push",
    {
      preHandler: [apiKeyMiddleware],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const identity = requireApiKeyIdentity(request);

        // Validate request body with Zod schema
        const parseResult = syncPushSchema.safeParse(request.body);
        if (!parseResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Invalid request body",
              details: formatZodError(parseResult.error),
            },
          });
        }

        const body = parseResult.data;

        const session = await prisma.apiKeySyncSession.findUnique({
          where: { sync_session_id: body.sessionId },
        });

        if (!session || session.api_key_id !== identity.apiKeyId) {
          return reply.code(404).send({
            success: false,
            error: {
              code: "INVALID_SESSION",
              message: "Invalid or expired sync session",
            },
          });
        }

        // TODO: Process transactions and lottery operations
        // For now, just acknowledge receipt
        const pushedCount =
          (body.transactions?.length || 0) +
          (body.lotteryOperations?.length || 0);

        // Update session
        await prisma.apiKeySyncSession.update({
          where: { sync_session_id: body.sessionId },
          data: {
            records_pushed: { increment: pushedCount },
            offline_transactions_synced: {
              increment: body.transactions?.length || 0,
            },
          },
        });

        const response: SyncPushResponse = {
          pushedCount,
          conflicts: [], // TODO: Detect and return conflicts
          serverSequence: Number(session.last_sync_sequence) + pushedCount,
        };

        return reply.code(200).send({ success: true, data: response });
      } catch (error) {
        console.error("[DeviceApi] Sync push error:", error);
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to push sync data",
          },
        });
      }
    },
  );

  // ==========================================================================
  // SYNC PULL
  // ==========================================================================

  /**
   * GET /api/v1/sync/pull
   * Pull server updates
   */
  fastify.get(
    "/api/v1/sync/pull",
    {
      preHandler: [apiKeyMiddleware],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const identity = requireApiKeyIdentity(request);

        // Validate query parameters with Zod schema
        const parseResult = syncPullQuerySchema.safeParse(request.query);
        if (!parseResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Invalid query parameters",
              details: formatZodError(parseResult.error),
            },
          });
        }

        const query = parseResult.data;

        const session = await prisma.apiKeySyncSession.findUnique({
          where: { sync_session_id: query.session_id },
        });

        if (!session || session.api_key_id !== identity.apiKeyId) {
          return reply.code(404).send({
            success: false,
            error: {
              code: "INVALID_SESSION",
              message: "Invalid or expired sync session",
            },
          });
        }

        // TODO: Implement actual data pulling based on sequence numbers
        // For now, return empty
        const response: SyncPullResponse = {
          records: [],
          newSequence: Number(session.last_sync_sequence),
          hasMore: false,
        };

        return reply.code(200).send({ success: true, data: response });
      } catch (error) {
        console.error("[DeviceApi] Sync pull error:", error);
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to pull sync data",
          },
        });
      }
    },
  );

  // ==========================================================================
  // SYNC COMPLETE
  // ==========================================================================

  /**
   * POST /api/v1/sync/complete
   * Complete sync session
   */
  fastify.post(
    "/api/v1/sync/complete",
    {
      preHandler: [apiKeyMiddleware],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const identity = requireApiKeyIdentity(request);
        const clientIp = getClientIp(request);

        // Validate request body with Zod schema
        const parseResult = syncCompleteSchema.safeParse(request.body);
        if (!parseResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Invalid request body",
              details: formatZodError(parseResult.error),
            },
          });
        }

        const body = parseResult.data;

        const session = await prisma.apiKeySyncSession.findUnique({
          where: { sync_session_id: body.sessionId },
        });

        if (!session || session.api_key_id !== identity.apiKeyId) {
          return reply.code(404).send({
            success: false,
            error: {
              code: "INVALID_SESSION",
              message: "Invalid or expired sync session",
            },
          });
        }

        // Calculate offline duration
        const offlineDuration = Math.floor(
          (new Date().getTime() - session.session_started_at.getTime()) / 1000,
        );

        // Update session
        await prisma.apiKeySyncSession.update({
          where: { sync_session_id: body.sessionId },
          data: {
            session_ended_at: new Date(),
            last_sync_sequence: BigInt(body.finalSequence),
            records_pulled: body.stats.pulled,
            records_pushed: body.stats.pushed,
            conflicts_resolved: body.stats.conflictsResolved,
            offline_duration_seconds: offlineDuration,
            sync_status: "COMPLETED",
          },
        });

        // Log sync completed
        await apiKeyAuditService.logSyncCompleted(
          identity.apiKeyId,
          body.sessionId,
          body.stats,
          clientIp,
        );

        return reply.code(200).send({
          success: true,
          message: "Sync completed successfully",
        });
      } catch (error) {
        console.error("[DeviceApi] Sync complete error:", error);
        return reply.code(500).send({
          success: false,
          error: { code: "INTERNAL_ERROR", message: "Failed to complete sync" },
        });
      }
    },
  );

  // ==========================================================================
  // SYNC CASHIERS
  // ==========================================================================

  /**
   * GET /api/v1/sync/cashiers
   * Sync cashier data for offline authentication
   *
   * Returns cashier records (including bcrypt-hashed PINs) for the store
   * bound to the API key. This follows enterprise POS patterns used by
   * NCR Aloha, Microsoft Dynamics 365, and Oracle MICROS for offline
   * authentication when internet connectivity is unavailable.
   *
   * Security Controls:
   * - Store isolation: Only returns cashiers for the API key's bound store
   * - Session validation: Requires active sync session
   * - Audit logging: All sync operations are logged
   * - Rate limiting: Enforced at API layer
   *
   * Query Parameters:
   * - session_id: Required. Sync session ID from /sync/start
   * - since_timestamp: Optional. ISO 8601 datetime for delta sync
   * - since_sequence: Optional. Sequence number for cursor-based pagination
   * - include_inactive: Optional. Include soft-deleted cashiers (default: false)
   * - limit: Optional. Max records to return (default: 100, max: 500)
   */
  fastify.get(
    "/api/v1/sync/cashiers",
    {
      preHandler: [apiKeyMiddleware],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const identity = requireApiKeyIdentity(request);
        const clientIp = getClientIp(request);

        // Validate query parameters with Zod schema
        const parseResult = cashierSyncQuerySchema.safeParse(request.query);
        if (!parseResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Invalid query parameters",
              details: formatZodError(parseResult.error),
            },
          });
        }

        const query = parseResult.data;

        // Build sync options from query params
        const syncOptions = {
          sinceTimestamp: query.since_timestamp
            ? new Date(query.since_timestamp)
            : undefined,
          sinceSequence: query.since_sequence,
          includeInactive: query.include_inactive,
          limit: query.limit,
        };

        // Perform sync with full validation and audit logging
        const response: CashierSyncResponse =
          await cashierSyncService.syncCashiers(
            identity,
            query.session_id,
            syncOptions,
            {
              apiKeyId: identity.apiKeyId,
              sessionId: query.session_id,
              ipAddress: clientIp,
            },
          );

        return reply.code(200).send({
          success: true,
          data: response,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";

        // Handle known error codes
        if (message.startsWith("INVALID_SESSION:")) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "INVALID_SESSION",
              message: message.replace("INVALID_SESSION: ", ""),
            },
          });
        }

        if (message.startsWith("STORE_MISMATCH:")) {
          return reply.code(403).send({
            success: false,
            error: {
              code: "STORE_MISMATCH",
              message: "Access denied to this store's data",
            },
          });
        }

        console.error("[DeviceApi] Cashier sync error:", message);
        return reply.code(500).send({
          success: false,
          error: { code: "INTERNAL_ERROR", message: "Failed to sync cashiers" },
        });
      }
    },
  );

  // ==========================================================================
  // SYNC EMPLOYEES (Unified Endpoint)
  // ==========================================================================

  /**
   * GET /api/v1/sync/employees
   * Sync all employee types for offline authentication
   *
   * Enterprise-grade unified employee sync endpoint that returns:
   * - Store Managers (from users table with STORE_MANAGER role)
   * - Shift Managers (from users table with SHIFT_MANAGER role)
   * - Cashiers (from cashiers table)
   *
   * This follows enterprise POS patterns used by NCR Aloha, Microsoft
   * Dynamics 365, and Oracle MICROS for offline authentication when
   * internet connectivity is unavailable.
   *
   * Security Controls:
   * - Store isolation: Only returns employees for the API key's bound store
   * - Session validation: Requires active sync session
   * - Audit logging: All sync operations are logged
   * - Rate limiting: Enforced at API layer
   * - SEC-001: PIN hashes only, never password hashes or plaintext
   *
   * Query Parameters:
   * - session_id: Required. Sync session ID from /sync/start
   * - since_timestamp: Optional. ISO 8601 datetime for delta sync
   * - since_sequence: Optional. Sequence number for cursor-based pagination
   * - include_inactive: Optional. Include inactive employees (default: false)
   * - limit: Optional. Max records to return (default: 100, max: 500)
   */
  fastify.get(
    "/api/v1/sync/employees",
    {
      preHandler: [apiKeyMiddleware],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const identity = requireApiKeyIdentity(request);
        const clientIp = getClientIp(request);

        // API-001: Validate query parameters with Zod schema
        const parseResult = employeeSyncQuerySchema.safeParse(request.query);
        if (!parseResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Invalid query parameters",
              details: formatZodError(parseResult.error),
            },
          });
        }

        const query = parseResult.data;

        // Build sync options from query params
        const syncOptions = {
          sinceTimestamp: query.since_timestamp
            ? new Date(query.since_timestamp)
            : undefined,
          sinceSequence: query.since_sequence,
          includeInactive: query.include_inactive,
          limit: query.limit,
        };

        // Perform sync with full validation and audit logging
        const response = await employeeSyncService.syncEmployees(
          identity,
          query.session_id,
          syncOptions,
          {
            apiKeyId: identity.apiKeyId,
            sessionId: query.session_id,
            ipAddress: clientIp,
          },
        );

        return reply.code(200).send({
          success: true,
          data: response,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";

        // Handle known error codes
        if (message.startsWith("INVALID_SESSION:")) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "INVALID_SESSION",
              message: message.replace("INVALID_SESSION: ", ""),
            },
          });
        }

        if (message.startsWith("STORE_MISMATCH:")) {
          return reply.code(403).send({
            success: false,
            error: {
              code: "STORE_MISMATCH",
              message: "Access denied to this store's data",
            },
          });
        }

        // API-003: Generic error response, no stack traces
        console.error("[DeviceApi] Employee sync error:", message);
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to sync employees",
          },
        });
      }
    },
  );

  // ==========================================================================
  // PUSH EMPLOYEES (Desktop → Server)
  // ==========================================================================

  /**
   * POST /api/v1/sync/employees
   * Push employee records from desktop to server
   *
   * Enterprise-grade employee push sync endpoint that allows desktop apps
   * to create/update cashiers on the server. This is the PUSH direction
   * (desktop → server) counterpart to the GET endpoint above (PULL).
   *
   * Currently supports:
   * - CASHIER role only (managers are created via admin UI)
   *
   * Security Controls:
   * - API key authentication required
   * - Store isolation: Only creates cashiers for the API key's bound store
   * - Session validation: Requires active sync session
   * - Audit logging: All sync operations are logged
   * - SEC-001: PIN hashes only (never plaintext PINs over the wire)
   *
   * Request Body:
   * - session_id: Required. Sync session ID from /sync/start
   * - employees: Array of employee records with:
   *   - employee_id: UUID for the cashier
   *   - name: Display name
   *   - role: Must be "CASHIER"
   *   - pin_hash: bcrypt hash of the PIN (hashed on desktop)
   *   - employee_code: Optional 4-digit code (auto-generated if not provided)
   *   - is_active: Optional (default: true)
   *   - hired_on: Optional hire date
   *   - termination_date: Optional termination date
   */
  fastify.post(
    "/api/v1/sync/employees",
    {
      preHandler: [apiKeyMiddleware],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const identity = requireApiKeyIdentity(request);
        const clientIp = getClientIp(request);

        // API-001: Validate request body with Zod schema
        const parseResult = employeeSyncPushSchema.safeParse(request.body);
        if (!parseResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Invalid request body",
              details: formatZodError(parseResult.error),
            },
          });
        }

        const body = parseResult.data;

        // Perform push sync with full validation and audit logging
        const response: EmployeeSyncPushResponse =
          await employeeSyncService.pushEmployees(
            identity,
            body.session_id,
            body.employees,
            {
              apiKeyId: identity.apiKeyId,
              sessionId: body.session_id,
              ipAddress: clientIp,
            },
          );

        // Return 201 for successful push (even partial success)
        return reply.code(201).send({
          success: true,
          data: response,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";

        // Handle known error codes
        if (message.startsWith("INVALID_SESSION:")) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "INVALID_SESSION",
              message: message.replace("INVALID_SESSION: ", ""),
            },
          });
        }

        if (message.startsWith("STORE_MISMATCH:")) {
          return reply.code(403).send({
            success: false,
            error: {
              code: "STORE_MISMATCH",
              message: "Access denied to this store's data",
            },
          });
        }

        if (message.startsWith("STORE_CONFIG_ERROR:")) {
          return reply.code(422).send({
            success: false,
            error: {
              code: "STORE_CONFIG_ERROR",
              message: message.replace("STORE_CONFIG_ERROR: ", ""),
            },
          });
        }

        // API-003: Generic error response, no stack traces
        console.error("[DeviceApi] Employee push error:", message);
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to push employees",
          },
        });
      }
    },
  );

  // ==========================================================================
  // STORE RESET
  // ==========================================================================

  /**
   * POST /api/v1/store/reset
   * Authorize and log store data reset operation
   *
   * This endpoint validates the request and authorizes the Desktop App
   * to perform a local data reset. The actual deletion happens client-side.
   * All reset operations are automatically audit-logged.
   *
   * Security Controls:
   * - API key authentication required
   * - Store isolation: Can only reset data for the API key's bound store
   * - Explicit confirmation required (confirmed: true)
   * - Full audit trail with reason and device info
   *
   * Reset Types:
   * - FULL_RESET: Wipe all local data (lottery, transactions, settings)
   * - LOTTERY_ONLY: Reset only lottery-related data (packs, shifts, activations)
   * - SYNC_STATE: Reset sync state only (forces full re-sync from server)
   */
  fastify.post(
    "/api/v1/store/reset",
    {
      preHandler: [apiKeyMiddleware],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const identity = requireApiKeyIdentity(request);
        const clientIp = getClientIp(request);

        // Validate request body with Zod schema
        const parseResult = storeResetSchema.safeParse(request.body);
        if (!parseResult.success) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Invalid request body",
              details: formatZodError(parseResult.error),
            },
          });
        }

        const body = parseResult.data;
        const resetType = body.resetType as StoreResetType;

        // Generate audit reference ID for correlation
        const auditReferenceId = crypto.randomUUID();

        // Log the reset authorization (async, non-blocking)
        apiKeyAuditService.logEvent({
          apiKeyId: identity.apiKeyId,
          eventType: "SYNC_COMPLETED", // Using existing event type for reset logging
          actorType: "DEVICE",
          ipAddress: clientIp,
          userAgent: request.headers["user-agent"] || undefined,
          eventDetails: {
            operation: "STORE_RESET",
            resetType: resetType,
            reason: body.reason,
            deviceFingerprint: body.deviceFingerprint,
            appVersion: body.appVersion,
            auditReferenceId,
            storeId: identity.storeId,
            storeName: identity.storeName,
          },
        });

        // Determine clear targets and resync requirement based on reset type
        let clearTargets: string[];
        let resyncRequired: boolean;

        switch (resetType) {
          case "FULL_RESET":
            clearTargets = [
              "lottery_packs",
              "lottery_shifts",
              "lottery_activations",
              "lottery_settlements",
              "transactions",
              "sync_state",
              "offline_queue",
              "local_settings",
            ];
            resyncRequired = true;
            break;
          case "LOTTERY_ONLY":
            clearTargets = [
              "lottery_packs",
              "lottery_shifts",
              "lottery_activations",
              "lottery_settlements",
            ];
            resyncRequired = true;
            break;
          case "SYNC_STATE":
            clearTargets = ["sync_state", "offline_queue"];
            resyncRequired = true;
            break;
          default:
            clearTargets = [];
            resyncRequired = false;
        }

        const response: StoreResetResponse = {
          authorized: true,
          resetType: resetType,
          serverTime: new Date().toISOString(),
          auditReferenceId,
          instructions: {
            clearTargets,
            resyncRequired,
          },
        };

        return reply.code(200).send({
          success: true,
          data: response,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        console.error("[DeviceApi] Store reset error:", message);
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to authorize store reset",
          },
        });
      }
    },
  );

  // ==========================================================================
  // TERMINAL INFO
  // ==========================================================================

  // ==========================================================================
  // POS CONNECTION CONFIG (PRIMARY - NEW ARCHITECTURE)
  // ==========================================================================

  /**
   * GET /api/v1/sync/pos/config
   * Get Store-level POS connection configuration (PRIMARY)
   *
   * This is the RECOMMENDED way for desktop apps to get POS settings.
   * Returns the Store's pos_type, pos_connection_type, and pos_connection_config.
   *
   * Workflow:
   * 1. Desktop app calls this endpoint to get POS connection config
   * 2. Desktop app connects to external POS using this config
   * 3. Desktop app discovers registers/terminals dynamically from POS data
   * 4. Desktop app creates/updates POSTerminal records for discovered registers
   *
   * Examples:
   * - NAXML: Returns { import_path: "\\\\server\\naxml", poll_interval_seconds: 60 }
   * - Square: Returns { base_url: "https://...", api_key: "EAAl...", location_id: "L123" }
   */
  fastify.get(
    "/api/v1/sync/pos/config",
    {
      preHandler: [apiKeyMiddleware],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const identity = requireApiKeyIdentity(request);
        const clientIp = getClientIp(request);

        const response: POSConnectionConfigResponse =
          await terminalSyncService.getPOSConnectionConfig(identity, {
            apiKeyId: identity.apiKeyId,
            ipAddress: clientIp,
          });

        return reply.code(200).send({
          success: true,
          data: response,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";

        if (message.startsWith("STORE_NOT_FOUND:")) {
          return reply.code(404).send({
            success: false,
            error: { code: "NOT_FOUND", message: "Store not found" },
          });
        }

        console.error("[DeviceApi] POS config error:", message);
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to get POS connection config",
          },
        });
      }
    },
  );

  // ==========================================================================
  // TERMINAL INFO (DEPRECATED - Use /sync/pos/config instead)
  // ==========================================================================

  /**
   * GET /api/v1/sync/terminal/info
   * @deprecated Use GET /api/v1/sync/pos/config instead
   *
   * Get terminal information bound to this API key.
   * This approach is DEPRECATED because it assumes terminals are pre-bound.
   *
   * NEW APPROACH: Get Store POS config → Connect to POS → Discover terminals
   *
   * Returns terminal configuration including POS type, connection settings,
   * and status. Used by desktop apps to configure POS integration.
   */
  fastify.get(
    "/api/v1/sync/terminal/info",
    {
      preHandler: [apiKeyMiddleware],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const identity = requireApiKeyIdentity(request);
        const clientIp = getClientIp(request);

        const response: TerminalInfoResponse =
          await terminalSyncService.getTerminalInfo(identity, {
            apiKeyId: identity.apiKeyId,
            ipAddress: clientIp,
          });

        return reply.code(200).send({
          success: true,
          data: response,
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";

        if (message.startsWith("API_KEY_NOT_FOUND:")) {
          return reply.code(404).send({
            success: false,
            error: { code: "NOT_FOUND", message: "API key not found" },
          });
        }

        if (message.startsWith("STORE_MISMATCH:")) {
          return reply.code(403).send({
            success: false,
            error: { code: "FORBIDDEN", message: "Access denied" },
          });
        }

        console.error("[DeviceApi] Terminal info error:", message);
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to get terminal info",
          },
        });
      }
    },
  );
}
