/**
 * Lottery Sync API Routes
 *
 * Enterprise-grade endpoints for lottery data synchronization with desktop POS.
 * Implements all 25 lottery sync endpoints following strict security patterns.
 *
 * Routes:
 * === PULL Endpoints (13) ===
 * GET  /api/v1/sync/lottery/games           - Active games for store's state
 * GET  /api/v1/sync/lottery/config          - Dropdown values (prices, pack values)
 * GET  /api/v1/sync/lottery/bins            - Bin configuration for store
 * GET  /api/v1/sync/lottery/packs/received  - Received packs
 * GET  /api/v1/sync/lottery/packs/activated - Activated packs with current serials
 * GET  /api/v1/sync/lottery/packs/returned  - Returned packs history
 * GET  /api/v1/sync/lottery/packs/depleted  - Sold-out packs history
 * GET  /api/v1/sync/lottery/day-status      - Current business day state
 * GET  /api/v1/sync/lottery/shift-openings  - Shift opening records
 * GET  /api/v1/sync/lottery/shift-closings  - Shift closing records
 * GET  /api/v1/sync/lottery/variances       - Unresolved discrepancies
 * GET  /api/v1/sync/lottery/day-packs       - Day pack records
 * GET  /api/v1/sync/lottery/bin-history     - Pack movement history
 *
 * === PUSH Endpoints (12) ===
 * POST /api/v1/sync/lottery/packs/receive        - Single pack received
 * POST /api/v1/sync/lottery/packs/receive/batch  - Multiple packs received
 * POST /api/v1/sync/lottery/packs/activate       - Activate pack + assign bin
 * POST /api/v1/sync/lottery/packs/move           - Move pack between bins
 * POST /api/v1/sync/lottery/packs/deplete        - Mark pack sold out
 * POST /api/v1/sync/lottery/packs/return         - Return pack to supplier
 * POST /api/v1/sync/lottery/shift/open           - Record shift opening serials
 * POST /api/v1/sync/lottery/shift/close          - Record shift closing serials
 * POST /api/v1/sync/lottery/day/prepare-close    - Phase 1: Validate & stage
 * POST /api/v1/sync/lottery/day/commit-close     - Phase 2: Finalize day
 * POST /api/v1/sync/lottery/day/cancel-close     - Rollback pending close
 * POST /api/v1/sync/lottery/variances/approve    - Approve discrepancy
 *
 * Security Controls:
 * - API-001: VALIDATION - Zod schema validation for all requests
 * - API-003: ERROR_HANDLING - Generic errors, no stack traces
 * - API-004: AUTHENTICATION - API key middleware required
 * - DB-006: TENANT_ISOLATION - Store-scoped via session validation
 *
 * @module routes/lottery-sync
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import {
  apiKeyMiddleware,
  requireApiKeyIdentity,
} from "../middleware/api-key.middleware";
import { lotterySyncService } from "../services/api-key";
import {
  lotterySyncGamesQuerySchema,
  lotterySyncConfigQuerySchema,
  lotterySyncBinsQuerySchema,
  lotterySyncPacksQuerySchema,
  lotterySyncDayStatusQuerySchema,
  lotterySyncShiftOpeningsQuerySchema,
  lotterySyncShiftClosingsQuerySchema,
  lotterySyncVariancesQuerySchema,
  lotterySyncDayPacksQuerySchema,
  lotterySyncBinHistoryQuerySchema,
  lotteryPackReceiveSchema,
  lotteryPackReceiveBatchSchema,
  lotteryPackActivateSchema,
  lotteryPackMoveSchema,
  lotteryPackDepleteSchema,
  lotteryPackReturnSchema,
  lotteryShiftOpenSchema,
  lotteryShiftCloseSchema,
  lotteryDayPrepareCloseSchema,
  lotteryDayCommitCloseSchema,
  lotteryDayCancelCloseSchema,
  lotteryVarianceApproveSchema,
} from "../schemas/lottery-sync.schema";
import type { LotterySyncAuditContext } from "../types/lottery-sync.types";

// =============================================================================
// Validation Helper
// =============================================================================

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

// =============================================================================
// Helper Functions
// =============================================================================

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
 * Build audit context from request
 */
function buildAuditContext(
  request: FastifyRequest,
  operation: string,
): LotterySyncAuditContext {
  const identity = requireApiKeyIdentity(request);
  return {
    apiKeyId: identity.apiKeyId,
    sessionId: "", // Will be set from query/body
    ipAddress: getClientIp(request),
    operation,
  };
}

/**
 * Handle known error codes with appropriate HTTP status
 */
function handleKnownError(
  error: unknown,
  reply: FastifyReply,
): FastifyReply | null {
  const message = error instanceof Error ? error.message : "Unknown error";

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

  if (message.startsWith("GAME_NOT_FOUND:")) {
    return reply.code(404).send({
      success: false,
      error: {
        code: "GAME_NOT_FOUND",
        message: message.replace("GAME_NOT_FOUND: ", ""),
      },
    });
  }

  // FAILED_PRECONDITION: Game exists but is inactive (AIP-193 compliant)
  // Returns HTTP 400 because:
  // - 404 is incorrect: game EXISTS in database
  // - 410 is incorrect: game could be reactivated
  // - 400 (FAILED_PRECONDITION) is correct: valid request, invalid system state
  if (message.startsWith("GAME_INACTIVE:")) {
    // Extract game_code from message for metadata
    const gameCodeMatch = message.match(/Game (\S+)/);
    const gameCode = gameCodeMatch ? gameCodeMatch[1] : undefined;

    return reply.code(400).send({
      success: false,
      error: {
        code: "FAILED_PRECONDITION",
        reason: "GAME_INACTIVE",
        message: message.replace("GAME_INACTIVE: ", ""),
        details: {
          domain: "lottery.api.nuvana.com",
          metadata: gameCode ? { game_code: gameCode } : undefined,
        },
      },
    });
  }

  if (message.startsWith("PACK_NOT_FOUND:")) {
    return reply.code(404).send({
      success: false,
      error: {
        code: "PACK_NOT_FOUND",
        message: message.replace("PACK_NOT_FOUND: ", ""),
      },
    });
  }

  if (message.startsWith("BIN_NOT_FOUND:")) {
    return reply.code(404).send({
      success: false,
      error: {
        code: "BIN_NOT_FOUND",
        message: message.replace("BIN_NOT_FOUND: ", ""),
      },
    });
  }

  if (message.startsWith("SHIFT_NOT_FOUND:")) {
    return reply.code(404).send({
      success: false,
      error: {
        code: "SHIFT_NOT_FOUND",
        message: message.replace("SHIFT_NOT_FOUND: ", ""),
      },
    });
  }

  if (message.startsWith("DAY_NOT_FOUND:")) {
    return reply.code(404).send({
      success: false,
      error: {
        code: "DAY_NOT_FOUND",
        message: message.replace("DAY_NOT_FOUND: ", ""),
      },
    });
  }

  if (message.startsWith("VARIANCE_NOT_FOUND:")) {
    return reply.code(404).send({
      success: false,
      error: {
        code: "VARIANCE_NOT_FOUND",
        message: message.replace("VARIANCE_NOT_FOUND: ", ""),
      },
    });
  }

  if (message.startsWith("DUPLICATE_PACK:")) {
    return reply.code(409).send({
      success: false,
      error: {
        code: "DUPLICATE_PACK",
        message: message.replace("DUPLICATE_PACK: ", ""),
      },
    });
  }

  if (message.startsWith("INVALID_STATUS:")) {
    return reply.code(400).send({
      success: false,
      error: {
        code: "INVALID_STATUS",
        message: message.replace("INVALID_STATUS: ", ""),
      },
    });
  }

  if (message.startsWith("BIN_MISMATCH:")) {
    return reply.code(400).send({
      success: false,
      error: {
        code: "BIN_MISMATCH",
        message: message.replace("BIN_MISMATCH: ", ""),
      },
    });
  }

  if (message.startsWith("ALREADY_RETURNED:")) {
    return reply.code(400).send({
      success: false,
      error: {
        code: "ALREADY_RETURNED",
        message: message.replace("ALREADY_RETURNED: ", ""),
      },
    });
  }

  if (message.startsWith("ALREADY_APPROVED:")) {
    return reply.code(400).send({
      success: false,
      error: {
        code: "ALREADY_APPROVED",
        message: message.replace("ALREADY_APPROVED: ", ""),
      },
    });
  }

  if (message.startsWith("EXPIRED:")) {
    return reply.code(400).send({
      success: false,
      error: {
        code: "EXPIRED",
        message: message.replace("EXPIRED: ", ""),
      },
    });
  }

  return null;
}

// =============================================================================
// Route Registration
// =============================================================================

/**
 * Register lottery sync routes
 */
export async function lotterySyncRoutes(
  fastify: FastifyInstance,
): Promise<void> {
  // ===========================================================================
  // PULL Endpoints
  // ===========================================================================

  /**
   * GET /api/v1/sync/lottery/games
   * Fetch active lottery games for the store's state
   */
  fastify.get(
    "/api/v1/sync/lottery/games",
    { preHandler: [apiKeyMiddleware] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const identity = requireApiKeyIdentity(request);
        const auditContext = buildAuditContext(request, "GAMES_SYNC");

        // API-001: Validate query parameters
        const parseResult = lotterySyncGamesQuerySchema.safeParse(
          request.query,
        );
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
        auditContext.sessionId = query.session_id;

        const response = await lotterySyncService.syncGames(
          identity,
          query.session_id,
          {
            sinceTimestamp: query.since_timestamp
              ? new Date(query.since_timestamp)
              : undefined,
            sinceSequence: query.since_sequence,
            includeInactive: query.include_inactive,
            limit: query.limit,
          },
          auditContext,
        );

        return reply.code(200).send({ success: true, data: response });
      } catch (error) {
        const handledReply = handleKnownError(error, reply);
        if (handledReply) return handledReply;

        console.error("[LotterySync] Games sync error:", error);
        return reply.code(500).send({
          success: false,
          error: { code: "INTERNAL_ERROR", message: "Failed to sync games" },
        });
      }
    },
  );

  /**
   * GET /api/v1/sync/lottery/config
   * Fetch lottery configuration values
   */
  fastify.get(
    "/api/v1/sync/lottery/config",
    { preHandler: [apiKeyMiddleware] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const identity = requireApiKeyIdentity(request);
        const auditContext = buildAuditContext(request, "CONFIG_SYNC");

        const parseResult = lotterySyncConfigQuerySchema.safeParse(
          request.query,
        );
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
        auditContext.sessionId = query.session_id;

        const response = await lotterySyncService.syncConfig(
          identity,
          query.session_id,
          {
            sinceTimestamp: query.since_timestamp
              ? new Date(query.since_timestamp)
              : undefined,
            sinceSequence: query.since_sequence,
            limit: query.limit,
          },
          auditContext,
        );

        return reply.code(200).send({ success: true, data: response });
      } catch (error) {
        const handledReply = handleKnownError(error, reply);
        if (handledReply) return handledReply;

        console.error("[LotterySync] Config sync error:", error);
        return reply.code(500).send({
          success: false,
          error: { code: "INTERNAL_ERROR", message: "Failed to sync config" },
        });
      }
    },
  );

  /**
   * GET /api/v1/sync/lottery/bins
   * Fetch bin configuration for the store
   */
  fastify.get(
    "/api/v1/sync/lottery/bins",
    { preHandler: [apiKeyMiddleware] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const identity = requireApiKeyIdentity(request);
        const auditContext = buildAuditContext(request, "BINS_SYNC");

        const parseResult = lotterySyncBinsQuerySchema.safeParse(request.query);
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
        auditContext.sessionId = query.session_id;

        const response = await lotterySyncService.syncBins(
          identity,
          query.session_id,
          {
            sinceTimestamp: query.since_timestamp
              ? new Date(query.since_timestamp)
              : undefined,
            sinceSequence: query.since_sequence,
            includeInactive: query.include_inactive,
            limit: query.limit,
          },
          auditContext,
        );

        return reply.code(200).send({ success: true, data: response });
      } catch (error) {
        const handledReply = handleKnownError(error, reply);
        if (handledReply) return handledReply;

        console.error("[LotterySync] Bins sync error:", error);
        return reply.code(500).send({
          success: false,
          error: { code: "INTERNAL_ERROR", message: "Failed to sync bins" },
        });
      }
    },
  );

  /**
   * GET /api/v1/sync/lottery/packs/received
   * Fetch received packs
   */
  fastify.get(
    "/api/v1/sync/lottery/packs/received",
    { preHandler: [apiKeyMiddleware] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const identity = requireApiKeyIdentity(request);
        const auditContext = buildAuditContext(request, "PACKS_RECEIVED_SYNC");

        const parseResult = lotterySyncPacksQuerySchema.safeParse(
          request.query,
        );
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
        auditContext.sessionId = query.session_id;

        const response = await lotterySyncService.syncPacks(
          identity,
          query.session_id,
          "RECEIVED",
          {
            sinceTimestamp: query.since_timestamp
              ? new Date(query.since_timestamp)
              : undefined,
            sinceSequence: query.since_sequence,
            limit: query.limit,
            binId: query.bin_id,
            gameId: query.game_id,
          },
          auditContext,
        );

        return reply.code(200).send({ success: true, data: response });
      } catch (error) {
        const handledReply = handleKnownError(error, reply);
        if (handledReply) return handledReply;

        console.error("[LotterySync] Packs received sync error:", error);
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to sync received packs",
          },
        });
      }
    },
  );

  /**
   * GET /api/v1/sync/lottery/packs/activated
   * Fetch activated packs with current serials
   */
  fastify.get(
    "/api/v1/sync/lottery/packs/activated",
    { preHandler: [apiKeyMiddleware] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const identity = requireApiKeyIdentity(request);
        const auditContext = buildAuditContext(request, "PACKS_ACTIVATED_SYNC");

        const parseResult = lotterySyncPacksQuerySchema.safeParse(
          request.query,
        );
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
        auditContext.sessionId = query.session_id;

        const response = await lotterySyncService.syncPacks(
          identity,
          query.session_id,
          "ACTIVE",
          {
            sinceTimestamp: query.since_timestamp
              ? new Date(query.since_timestamp)
              : undefined,
            sinceSequence: query.since_sequence,
            limit: query.limit,
            binId: query.bin_id,
            gameId: query.game_id,
          },
          auditContext,
        );

        return reply.code(200).send({ success: true, data: response });
      } catch (error) {
        const handledReply = handleKnownError(error, reply);
        if (handledReply) return handledReply;

        console.error("[LotterySync] Packs activated sync error:", error);
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to sync activated packs",
          },
        });
      }
    },
  );

  /**
   * GET /api/v1/sync/lottery/packs/returned
   * Fetch returned packs history
   */
  fastify.get(
    "/api/v1/sync/lottery/packs/returned",
    { preHandler: [apiKeyMiddleware] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const identity = requireApiKeyIdentity(request);
        const auditContext = buildAuditContext(request, "PACKS_RETURNED_SYNC");

        const parseResult = lotterySyncPacksQuerySchema.safeParse(
          request.query,
        );
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
        auditContext.sessionId = query.session_id;

        const response = await lotterySyncService.syncPacks(
          identity,
          query.session_id,
          "RETURNED",
          {
            sinceTimestamp: query.since_timestamp
              ? new Date(query.since_timestamp)
              : undefined,
            sinceSequence: query.since_sequence,
            limit: query.limit,
            binId: query.bin_id,
            gameId: query.game_id,
          },
          auditContext,
        );

        return reply.code(200).send({ success: true, data: response });
      } catch (error) {
        const handledReply = handleKnownError(error, reply);
        if (handledReply) return handledReply;

        console.error("[LotterySync] Packs returned sync error:", error);
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to sync returned packs",
          },
        });
      }
    },
  );

  /**
   * GET /api/v1/sync/lottery/packs/depleted
   * Fetch sold-out packs history
   */
  fastify.get(
    "/api/v1/sync/lottery/packs/depleted",
    { preHandler: [apiKeyMiddleware] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const identity = requireApiKeyIdentity(request);
        const auditContext = buildAuditContext(request, "PACKS_DEPLETED_SYNC");

        const parseResult = lotterySyncPacksQuerySchema.safeParse(
          request.query,
        );
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
        auditContext.sessionId = query.session_id;

        const response = await lotterySyncService.syncPacks(
          identity,
          query.session_id,
          "DEPLETED",
          {
            sinceTimestamp: query.since_timestamp
              ? new Date(query.since_timestamp)
              : undefined,
            sinceSequence: query.since_sequence,
            limit: query.limit,
            binId: query.bin_id,
            gameId: query.game_id,
          },
          auditContext,
        );

        return reply.code(200).send({ success: true, data: response });
      } catch (error) {
        const handledReply = handleKnownError(error, reply);
        if (handledReply) return handledReply;

        console.error("[LotterySync] Packs depleted sync error:", error);
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to sync depleted packs",
          },
        });
      }
    },
  );

  /**
   * GET /api/v1/sync/lottery/day-status
   * Fetch current business day state
   */
  fastify.get(
    "/api/v1/sync/lottery/day-status",
    { preHandler: [apiKeyMiddleware] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const identity = requireApiKeyIdentity(request);
        const auditContext = buildAuditContext(request, "DAY_STATUS_SYNC");

        const parseResult = lotterySyncDayStatusQuerySchema.safeParse(
          request.query,
        );
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
        auditContext.sessionId = query.session_id;

        const response = await lotterySyncService.syncDayStatus(
          identity,
          query.session_id,
          query.business_date,
          auditContext,
        );

        return reply.code(200).send({ success: true, data: response });
      } catch (error) {
        const handledReply = handleKnownError(error, reply);
        if (handledReply) return handledReply;

        console.error("[LotterySync] Day status sync error:", error);
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to sync day status",
          },
        });
      }
    },
  );

  /**
   * GET /api/v1/sync/lottery/shift-openings
   * Fetch shift opening records
   */
  fastify.get(
    "/api/v1/sync/lottery/shift-openings",
    { preHandler: [apiKeyMiddleware] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const identity = requireApiKeyIdentity(request);
        const auditContext = buildAuditContext(request, "SHIFT_OPENINGS_SYNC");

        const parseResult = lotterySyncShiftOpeningsQuerySchema.safeParse(
          request.query,
        );
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
        auditContext.sessionId = query.session_id;

        const response = await lotterySyncService.syncShiftOpenings(
          identity,
          query.session_id,
          {
            sinceTimestamp: query.since_timestamp
              ? new Date(query.since_timestamp)
              : undefined,
            sinceSequence: query.since_sequence,
            limit: query.limit,
            shiftId: query.shift_id,
          },
          auditContext,
        );

        return reply.code(200).send({ success: true, data: response });
      } catch (error) {
        const handledReply = handleKnownError(error, reply);
        if (handledReply) return handledReply;

        console.error("[LotterySync] Shift openings sync error:", error);
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to sync shift openings",
          },
        });
      }
    },
  );

  /**
   * GET /api/v1/sync/lottery/shift-closings
   * Fetch shift closing records
   */
  fastify.get(
    "/api/v1/sync/lottery/shift-closings",
    { preHandler: [apiKeyMiddleware] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const identity = requireApiKeyIdentity(request);
        const auditContext = buildAuditContext(request, "SHIFT_CLOSINGS_SYNC");

        const parseResult = lotterySyncShiftClosingsQuerySchema.safeParse(
          request.query,
        );
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
        auditContext.sessionId = query.session_id;

        const response = await lotterySyncService.syncShiftClosings(
          identity,
          query.session_id,
          {
            sinceTimestamp: query.since_timestamp
              ? new Date(query.since_timestamp)
              : undefined,
            sinceSequence: query.since_sequence,
            limit: query.limit,
            shiftId: query.shift_id,
          },
          auditContext,
        );

        return reply.code(200).send({ success: true, data: response });
      } catch (error) {
        const handledReply = handleKnownError(error, reply);
        if (handledReply) return handledReply;

        console.error("[LotterySync] Shift closings sync error:", error);
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to sync shift closings",
          },
        });
      }
    },
  );

  /**
   * GET /api/v1/sync/lottery/variances
   * Fetch unresolved discrepancies
   */
  fastify.get(
    "/api/v1/sync/lottery/variances",
    { preHandler: [apiKeyMiddleware] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const identity = requireApiKeyIdentity(request);
        const auditContext = buildAuditContext(request, "VARIANCES_SYNC");

        const parseResult = lotterySyncVariancesQuerySchema.safeParse(
          request.query,
        );
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
        auditContext.sessionId = query.session_id;

        const response = await lotterySyncService.syncVariances(
          identity,
          query.session_id,
          {
            sinceTimestamp: query.since_timestamp
              ? new Date(query.since_timestamp)
              : undefined,
            sinceSequence: query.since_sequence,
            limit: query.limit,
            shiftId: query.shift_id,
            packId: query.pack_id,
            unresolvedOnly: query.unresolved_only,
          },
          auditContext,
        );

        return reply.code(200).send({ success: true, data: response });
      } catch (error) {
        const handledReply = handleKnownError(error, reply);
        if (handledReply) return handledReply;

        console.error("[LotterySync] Variances sync error:", error);
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to sync variances",
          },
        });
      }
    },
  );

  /**
   * GET /api/v1/sync/lottery/day-packs
   * Fetch day pack records
   */
  fastify.get(
    "/api/v1/sync/lottery/day-packs",
    { preHandler: [apiKeyMiddleware] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const identity = requireApiKeyIdentity(request);
        const auditContext = buildAuditContext(request, "DAY_PACKS_SYNC");

        const parseResult = lotterySyncDayPacksQuerySchema.safeParse(
          request.query,
        );
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
        auditContext.sessionId = query.session_id;

        const response = await lotterySyncService.syncDayPacks(
          identity,
          query.session_id,
          {
            sinceTimestamp: query.since_timestamp
              ? new Date(query.since_timestamp)
              : undefined,
            sinceSequence: query.since_sequence,
            limit: query.limit,
            dayId: query.day_id,
            packId: query.pack_id,
          },
          auditContext,
        );

        return reply.code(200).send({ success: true, data: response });
      } catch (error) {
        const handledReply = handleKnownError(error, reply);
        if (handledReply) return handledReply;

        console.error("[LotterySync] Day packs sync error:", error);
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to sync day packs",
          },
        });
      }
    },
  );

  /**
   * GET /api/v1/sync/lottery/bin-history
   * Fetch bin history records
   */
  fastify.get(
    "/api/v1/sync/lottery/bin-history",
    { preHandler: [apiKeyMiddleware] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const identity = requireApiKeyIdentity(request);
        const auditContext = buildAuditContext(request, "BIN_HISTORY_SYNC");

        const parseResult = lotterySyncBinHistoryQuerySchema.safeParse(
          request.query,
        );
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
        auditContext.sessionId = query.session_id;

        const response = await lotterySyncService.syncBinHistory(
          identity,
          query.session_id,
          {
            sinceTimestamp: query.since_timestamp
              ? new Date(query.since_timestamp)
              : undefined,
            sinceSequence: query.since_sequence,
            limit: query.limit,
            packId: query.pack_id,
            binId: query.bin_id,
          },
          auditContext,
        );

        return reply.code(200).send({ success: true, data: response });
      } catch (error) {
        const handledReply = handleKnownError(error, reply);
        if (handledReply) return handledReply;

        console.error("[LotterySync] Bin history sync error:", error);
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to sync bin history",
          },
        });
      }
    },
  );

  // ===========================================================================
  // PUSH Endpoints
  // ===========================================================================

  /**
   * POST /api/v1/sync/lottery/packs/receive
   * Receive a single pack
   */
  fastify.post(
    "/api/v1/sync/lottery/packs/receive",
    { preHandler: [apiKeyMiddleware] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const identity = requireApiKeyIdentity(request);
        const auditContext = buildAuditContext(request, "PACK_RECEIVE");

        // API-001: Validate request body
        const parseResult = lotteryPackReceiveSchema.safeParse(request.body);
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
        auditContext.sessionId = body.session_id;

        // Validate session and get store context
        const { storeId, stateId } =
          await lotterySyncService.validateSyncSession(
            body.session_id,
            identity.apiKeyId,
          );

        if (storeId !== identity.storeId) {
          throw new Error(
            "STORE_MISMATCH: Session store does not match API key store",
          );
        }

        const response = await lotterySyncService.receivePack(
          storeId,
          stateId,
          {
            game_code: body.game_code,
            pack_number: body.pack_number,
            serial_start: body.serial_start,
            serial_end: body.serial_end,
            received_at: body.received_at,
            local_id: body.local_id,
          },
          auditContext,
        );

        return reply.code(201).send({ success: true, data: response });
      } catch (error) {
        const handledReply = handleKnownError(error, reply);
        if (handledReply) return handledReply;

        console.error("[LotterySync] Pack receive error:", error);
        return reply.code(500).send({
          success: false,
          error: { code: "INTERNAL_ERROR", message: "Failed to receive pack" },
        });
      }
    },
  );

  /**
   * POST /api/v1/sync/lottery/packs/receive/batch
   * Receive multiple packs
   */
  fastify.post(
    "/api/v1/sync/lottery/packs/receive/batch",
    { preHandler: [apiKeyMiddleware] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const identity = requireApiKeyIdentity(request);
        const auditContext = buildAuditContext(request, "PACK_RECEIVE_BATCH");

        const parseResult = lotteryPackReceiveBatchSchema.safeParse(
          request.body,
        );
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
        auditContext.sessionId = body.session_id;

        const { storeId, stateId } =
          await lotterySyncService.validateSyncSession(
            body.session_id,
            identity.apiKeyId,
          );

        if (storeId !== identity.storeId) {
          throw new Error(
            "STORE_MISMATCH: Session store does not match API key store",
          );
        }

        const response = await lotterySyncService.receivePacksBatch(
          storeId,
          stateId,
          { packs: body.packs },
          auditContext,
        );

        return reply.code(201).send({ success: true, data: response });
      } catch (error) {
        const handledReply = handleKnownError(error, reply);
        if (handledReply) return handledReply;

        console.error("[LotterySync] Pack receive batch error:", error);
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to receive packs batch",
          },
        });
      }
    },
  );

  /**
   * POST /api/v1/sync/lottery/packs/activate
   * Activate a pack and assign to bin
   *
   * Supports two modes:
   * 1. Activate existing pack: Provide pack_id for a pack with status=RECEIVED
   * 2. Create and activate: Provide game_code, pack_number, serial_start, serial_end
   *    to create a new pack and immediately activate it (for Desktop App sync)
   *
   * Idempotent: If pack already ACTIVE in same bin, returns success without changes
   */
  fastify.post(
    "/api/v1/sync/lottery/packs/activate",
    { preHandler: [apiKeyMiddleware] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const identity = requireApiKeyIdentity(request);
        const auditContext = buildAuditContext(request, "PACK_ACTIVATE");

        const parseResult = lotteryPackActivateSchema.safeParse(request.body);
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
        auditContext.sessionId = body.session_id;

        const { storeId, stateId } =
          await lotterySyncService.validateSyncSession(
            body.session_id,
            identity.apiKeyId,
          );

        if (storeId !== identity.storeId) {
          throw new Error(
            "STORE_MISMATCH: Session store does not match API key store",
          );
        }

        const response = await lotterySyncService.activatePack(
          storeId,
          stateId,
          {
            pack_id: body.pack_id,
            bin_id: body.bin_id,
            opening_serial: body.opening_serial,
            activated_at: body.activated_at,
            shift_id: body.shift_id,
            mark_sold_tickets: body.mark_sold_tickets,
            mark_sold_approved_by: body.mark_sold_approved_by,
            mark_sold_reason: body.mark_sold_reason,
            local_id: body.local_id,
            // Optional create-and-activate fields
            game_code: body.game_code,
            pack_number: body.pack_number,
            serial_start: body.serial_start,
            serial_end: body.serial_end,
            received_at: body.received_at,
          },
          auditContext,
        );

        return reply.code(200).send({ success: true, data: response });
      } catch (error) {
        const handledReply = handleKnownError(error, reply);
        if (handledReply) return handledReply;

        console.error("[LotterySync] Pack activate error:", error);
        return reply.code(500).send({
          success: false,
          error: { code: "INTERNAL_ERROR", message: "Failed to activate pack" },
        });
      }
    },
  );

  /**
   * POST /api/v1/sync/lottery/packs/move
   * Move a pack between bins
   */
  fastify.post(
    "/api/v1/sync/lottery/packs/move",
    { preHandler: [apiKeyMiddleware] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const identity = requireApiKeyIdentity(request);
        const auditContext = buildAuditContext(request, "PACK_MOVE");

        const parseResult = lotteryPackMoveSchema.safeParse(request.body);
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
        auditContext.sessionId = body.session_id;

        const { storeId } = await lotterySyncService.validateSyncSession(
          body.session_id,
          identity.apiKeyId,
        );

        if (storeId !== identity.storeId) {
          throw new Error(
            "STORE_MISMATCH: Session store does not match API key store",
          );
        }

        const response = await lotterySyncService.movePack(
          storeId,
          {
            pack_id: body.pack_id,
            from_bin_id: body.from_bin_id,
            to_bin_id: body.to_bin_id,
            reason: body.reason,
            moved_at: body.moved_at,
            local_id: body.local_id,
          },
          auditContext,
        );

        return reply.code(200).send({ success: true, data: response });
      } catch (error) {
        const handledReply = handleKnownError(error, reply);
        if (handledReply) return handledReply;

        console.error("[LotterySync] Pack move error:", error);
        return reply.code(500).send({
          success: false,
          error: { code: "INTERNAL_ERROR", message: "Failed to move pack" },
        });
      }
    },
  );

  /**
   * POST /api/v1/sync/lottery/packs/deplete
   * Mark a pack as sold out
   */
  fastify.post(
    "/api/v1/sync/lottery/packs/deplete",
    { preHandler: [apiKeyMiddleware] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const identity = requireApiKeyIdentity(request);
        const auditContext = buildAuditContext(request, "PACK_DEPLETE");

        const parseResult = lotteryPackDepleteSchema.safeParse(request.body);
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
        auditContext.sessionId = body.session_id;

        const { storeId } = await lotterySyncService.validateSyncSession(
          body.session_id,
          identity.apiKeyId,
        );

        if (storeId !== identity.storeId) {
          throw new Error(
            "STORE_MISMATCH: Session store does not match API key store",
          );
        }

        const response = await lotterySyncService.depletePack(
          storeId,
          {
            pack_id: body.pack_id,
            final_serial: body.final_serial,
            depletion_reason: body.depletion_reason,
            depleted_at: body.depleted_at,
            shift_id: body.shift_id,
            notes: body.notes,
            local_id: body.local_id,
          },
          auditContext,
        );

        return reply.code(200).send({ success: true, data: response });
      } catch (error) {
        const handledReply = handleKnownError(error, reply);
        if (handledReply) return handledReply;

        console.error("[LotterySync] Pack deplete error:", error);
        return reply.code(500).send({
          success: false,
          error: { code: "INTERNAL_ERROR", message: "Failed to deplete pack" },
        });
      }
    },
  );

  /**
   * POST /api/v1/sync/lottery/packs/return
   * Return a pack to supplier
   */
  fastify.post(
    "/api/v1/sync/lottery/packs/return",
    { preHandler: [apiKeyMiddleware] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const identity = requireApiKeyIdentity(request);
        const auditContext = buildAuditContext(request, "PACK_RETURN");

        const parseResult = lotteryPackReturnSchema.safeParse(request.body);
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
        auditContext.sessionId = body.session_id;

        const { storeId } = await lotterySyncService.validateSyncSession(
          body.session_id,
          identity.apiKeyId,
        );

        if (storeId !== identity.storeId) {
          throw new Error(
            "STORE_MISMATCH: Session store does not match API key store",
          );
        }

        const response = await lotterySyncService.returnPack(
          storeId,
          {
            pack_id: body.pack_id,
            return_reason: body.return_reason,
            last_sold_serial: body.last_sold_serial,
            tickets_sold_on_return: body.tickets_sold_on_return,
            return_notes: body.return_notes,
            returned_at: body.returned_at,
            shift_id: body.shift_id,
            day_id: body.day_id,
            local_id: body.local_id,
          },
          auditContext,
        );

        return reply.code(200).send({ success: true, data: response });
      } catch (error) {
        const handledReply = handleKnownError(error, reply);
        if (handledReply) return handledReply;

        console.error("[LotterySync] Pack return error:", error);
        return reply.code(500).send({
          success: false,
          error: { code: "INTERNAL_ERROR", message: "Failed to return pack" },
        });
      }
    },
  );

  /**
   * POST /api/v1/sync/lottery/shift/open
   * Record shift opening serials
   */
  fastify.post(
    "/api/v1/sync/lottery/shift/open",
    { preHandler: [apiKeyMiddleware] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const identity = requireApiKeyIdentity(request);
        const auditContext = buildAuditContext(request, "SHIFT_OPEN");

        const parseResult = lotteryShiftOpenSchema.safeParse(request.body);
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
        auditContext.sessionId = body.session_id;

        const { storeId } = await lotterySyncService.validateSyncSession(
          body.session_id,
          identity.apiKeyId,
        );

        if (storeId !== identity.storeId) {
          throw new Error(
            "STORE_MISMATCH: Session store does not match API key store",
          );
        }

        const response = await lotterySyncService.recordShiftOpenings(
          storeId,
          {
            shift_id: body.shift_id,
            openings: body.openings,
            local_id: body.local_id,
          },
          auditContext,
        );

        return reply.code(201).send({ success: true, data: response });
      } catch (error) {
        const handledReply = handleKnownError(error, reply);
        if (handledReply) return handledReply;

        console.error("[LotterySync] Shift open error:", error);
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to record shift openings",
          },
        });
      }
    },
  );

  /**
   * POST /api/v1/sync/lottery/shift/close
   * Record shift closing serials
   */
  fastify.post(
    "/api/v1/sync/lottery/shift/close",
    { preHandler: [apiKeyMiddleware] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const identity = requireApiKeyIdentity(request);
        const auditContext = buildAuditContext(request, "SHIFT_CLOSE");

        const parseResult = lotteryShiftCloseSchema.safeParse(request.body);
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
        auditContext.sessionId = body.session_id;

        const { storeId } = await lotterySyncService.validateSyncSession(
          body.session_id,
          identity.apiKeyId,
        );

        if (storeId !== identity.storeId) {
          throw new Error(
            "STORE_MISMATCH: Session store does not match API key store",
          );
        }

        const response = await lotterySyncService.recordShiftClosings(
          storeId,
          {
            shift_id: body.shift_id,
            cashier_id: body.cashier_id,
            closings: body.closings,
            manual_entry_authorized_by: body.manual_entry_authorized_by,
            local_id: body.local_id,
          },
          auditContext,
        );

        return reply.code(201).send({ success: true, data: response });
      } catch (error) {
        const handledReply = handleKnownError(error, reply);
        if (handledReply) return handledReply;

        console.error("[LotterySync] Shift close error:", error);
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to record shift closings",
          },
        });
      }
    },
  );

  /**
   * POST /api/v1/sync/lottery/day/prepare-close
   * Phase 1: Validate and stage day close
   */
  fastify.post(
    "/api/v1/sync/lottery/day/prepare-close",
    { preHandler: [apiKeyMiddleware] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const identity = requireApiKeyIdentity(request);
        const auditContext = buildAuditContext(request, "DAY_PREPARE_CLOSE");

        const parseResult = lotteryDayPrepareCloseSchema.safeParse(
          request.body,
        );
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
        auditContext.sessionId = body.session_id;

        const { storeId } = await lotterySyncService.validateSyncSession(
          body.session_id,
          identity.apiKeyId,
        );

        if (storeId !== identity.storeId) {
          throw new Error(
            "STORE_MISMATCH: Session store does not match API key store",
          );
        }

        const response = await lotterySyncService.prepareDayClose(
          storeId,
          {
            day_id: body.day_id,
            closings: body.closings,
            initiated_by: body.initiated_by,
            manual_entry_authorized_by: body.manual_entry_authorized_by,
            expire_minutes: body.expire_minutes,
          },
          auditContext,
        );

        return reply.code(200).send({ success: true, data: response });
      } catch (error) {
        const handledReply = handleKnownError(error, reply);
        if (handledReply) return handledReply;

        console.error("[LotterySync] Day prepare close error:", error);
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to prepare day close",
          },
        });
      }
    },
  );

  /**
   * POST /api/v1/sync/lottery/day/commit-close
   * Phase 2: Finalize day close
   */
  fastify.post(
    "/api/v1/sync/lottery/day/commit-close",
    { preHandler: [apiKeyMiddleware] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const identity = requireApiKeyIdentity(request);
        const auditContext = buildAuditContext(request, "DAY_COMMIT_CLOSE");

        const parseResult = lotteryDayCommitCloseSchema.safeParse(request.body);
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
        auditContext.sessionId = body.session_id;

        const { storeId } = await lotterySyncService.validateSyncSession(
          body.session_id,
          identity.apiKeyId,
        );

        if (storeId !== identity.storeId) {
          throw new Error(
            "STORE_MISMATCH: Session store does not match API key store",
          );
        }

        const response = await lotterySyncService.commitDayClose(
          storeId,
          {
            day_id: body.day_id,
            closed_by: body.closed_by,
            notes: body.notes,
          },
          auditContext,
        );

        return reply.code(200).send({ success: true, data: response });
      } catch (error) {
        const handledReply = handleKnownError(error, reply);
        if (handledReply) return handledReply;

        console.error("[LotterySync] Day commit close error:", error);
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to commit day close",
          },
        });
      }
    },
  );

  /**
   * POST /api/v1/sync/lottery/day/cancel-close
   * Rollback pending close
   */
  fastify.post(
    "/api/v1/sync/lottery/day/cancel-close",
    { preHandler: [apiKeyMiddleware] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const identity = requireApiKeyIdentity(request);
        const auditContext = buildAuditContext(request, "DAY_CANCEL_CLOSE");

        const parseResult = lotteryDayCancelCloseSchema.safeParse(request.body);
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
        auditContext.sessionId = body.session_id;

        const { storeId } = await lotterySyncService.validateSyncSession(
          body.session_id,
          identity.apiKeyId,
        );

        if (storeId !== identity.storeId) {
          throw new Error(
            "STORE_MISMATCH: Session store does not match API key store",
          );
        }

        const response = await lotterySyncService.cancelDayClose(
          storeId,
          {
            day_id: body.day_id,
            cancelled_by: body.cancelled_by,
            reason: body.reason,
          },
          auditContext,
        );

        return reply.code(200).send({ success: true, data: response });
      } catch (error) {
        const handledReply = handleKnownError(error, reply);
        if (handledReply) return handledReply;

        console.error("[LotterySync] Day cancel close error:", error);
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to cancel day close",
          },
        });
      }
    },
  );

  /**
   * POST /api/v1/sync/lottery/variances/approve
   * Approve a variance
   */
  fastify.post(
    "/api/v1/sync/lottery/variances/approve",
    { preHandler: [apiKeyMiddleware] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const identity = requireApiKeyIdentity(request);
        const auditContext = buildAuditContext(request, "VARIANCE_APPROVE");

        const parseResult = lotteryVarianceApproveSchema.safeParse(
          request.body,
        );
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
        auditContext.sessionId = body.session_id;

        const { storeId } = await lotterySyncService.validateSyncSession(
          body.session_id,
          identity.apiKeyId,
        );

        if (storeId !== identity.storeId) {
          throw new Error(
            "STORE_MISMATCH: Session store does not match API key store",
          );
        }

        const response = await lotterySyncService.approveVariance(
          storeId,
          {
            variance_id: body.variance_id,
            approved_by: body.approved_by,
            approval_notes: body.approval_notes,
          },
          auditContext,
        );

        return reply.code(200).send({ success: true, data: response });
      } catch (error) {
        const handledReply = handleKnownError(error, reply);
        if (handledReply) return handledReply;

        console.error("[LotterySync] Variance approve error:", error);
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to approve variance",
          },
        });
      }
    },
  );
}
