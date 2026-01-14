/**
 * API Keys Admin Routes
 *
 * Admin endpoints for managing API keys for desktop POS applications.
 * All routes require SUPERADMIN authentication.
 *
 * Routes:
 * - POST   /api/v1/admin/api-keys              - Create new API key
 * - GET    /api/v1/admin/api-keys              - List all API keys
 * - GET    /api/v1/admin/api-keys/:keyId       - Get API key details
 * - PATCH  /api/v1/admin/api-keys/:keyId       - Update API key settings
 * - POST   /api/v1/admin/api-keys/:keyId/rotate    - Rotate API key
 * - POST   /api/v1/admin/api-keys/:keyId/revoke    - Revoke API key
 * - POST   /api/v1/admin/api-keys/:keyId/suspend   - Suspend API key
 * - POST   /api/v1/admin/api-keys/:keyId/reactivate - Reactivate suspended key
 * - GET    /api/v1/admin/api-keys/:keyId/audit     - Get audit trail
 *
 * @module routes/api-keys
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { authMiddleware, UserIdentity } from "../middleware/auth.middleware";
import { permissionMiddleware } from "../middleware/permission.middleware";
import {
  API_KEY_CREATE,
  API_KEY_READ,
  API_KEY_UPDATE,
  API_KEY_REVOKE,
  API_KEY_ROTATE,
} from "../constants/permissions";
import { apiKeyService, apiKeyAuditService } from "../services/api-key";
import {
  createApiKeySchema,
  updateApiKeySchema,
  rotateApiKeySchema,
  revokeApiKeySchema,
  listApiKeysQuerySchema,
} from "../schemas/api-key.schema";
import type {
  CreateApiKeyInput,
  UpdateApiKeyInput,
  RotateApiKeyInput,
  RevokeApiKeyInput,
  ApiKeyListFilter,
  ApiKeyPaginationOptions,
} from "../types/api-key.types";
import type { ApiKeyRevocationReason, ApiKeyStatus } from "@prisma/client";

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
// Helper Functions
// ============================================================================

/**
 * Require SUPERADMIN role
 * All API key management is restricted to superadmins only
 *
 * IMPORTANT: In Fastify preHandlers, you must return the reply object
 * when sending a response to properly halt the request chain.
 * Simply calling reply.send() without returning it causes the
 * preHandler chain to continue, leading to request hangs.
 */
async function requireSuperAdmin(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const user = (request as any).user as UserIdentity;

  if (!user) {
    return reply.code(401).send({
      success: false,
      error: {
        code: "UNAUTHORIZED",
        message: "Authentication required",
      },
    }) as unknown as void;
  }

  if (!user.is_system_admin && !user.roles?.includes("SUPERADMIN")) {
    return reply.code(403).send({
      success: false,
      error: {
        code: "FORBIDDEN",
        message: "API key management requires SUPERADMIN privileges",
      },
    }) as unknown as void;
  }
  // User is authorized - continue to next preHandler/route handler
}

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

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * Register API key admin routes
 */
export async function apiKeyRoutes(fastify: FastifyInstance): Promise<void> {
  // ==========================================================================
  // CREATE API KEY
  // ==========================================================================

  /**
   * POST /api/v1/admin/api-keys
   * Create a new API key for a store
   *
   * IMPORTANT: The raw key is returned ONCE and must be copied immediately.
   * It is NEVER stored and cannot be retrieved again.
   */
  fastify.post(
    "/api/v1/admin/api-keys",
    {
      preHandler: [
        authMiddleware,
        requireSuperAdmin,
        permissionMiddleware(API_KEY_CREATE),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user as UserIdentity;

        // Validate request body with Zod schema
        const parseResult = createApiKeySchema.safeParse(request.body);
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

        const input: CreateApiKeyInput = {
          storeId: body.store_id,
          label: body.label,
          expiresAt: body.expires_at ? new Date(body.expires_at) : undefined,
          metadata: body.metadata,
          ipAllowlist: body.ip_allowlist,
          ipEnforcementEnabled: body.ip_enforcement_enabled,
          rateLimitRpm: body.rate_limit_rpm,
          dailySyncQuota: body.daily_sync_quota,
          monthlyDataQuotaMb: body.monthly_data_quota_mb,
        };

        const result = await apiKeyService.createApiKey(input, user.id);

        return reply.code(201).send({
          success: true,
          data: {
            // CRITICAL: This is the only time the raw key is returned
            raw_key: result.key.rawKey,
            key_prefix: result.key.keyPrefix,
            key_suffix: result.key.keySuffix,
            api_key_id: result.record.apiKeyId,
            store_id: result.record.storeId,
            company_id: result.record.companyId,
            label: result.record.label,
            status: result.record.status,
            created_at: result.record.createdAt,
          },
          message:
            "API key created successfully. IMPORTANT: Copy the raw_key now - it will not be shown again.",
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        console.error("[ApiKeyRoutes] Create error:", message);

        if (message.includes("not found")) {
          return reply.code(404).send({
            success: false,
            error: { code: "NOT_FOUND", message },
          });
        }

        if (message.includes("already has an active")) {
          return reply.code(409).send({
            success: false,
            error: { code: "CONFLICT", message },
          });
        }

        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to create API key",
          },
        });
      }
    },
  );

  // ==========================================================================
  // LIST API KEYS
  // ==========================================================================

  /**
   * GET /api/v1/admin/api-keys
   * List all API keys with filtering and pagination
   */
  fastify.get(
    "/api/v1/admin/api-keys",
    {
      preHandler: [
        authMiddleware,
        requireSuperAdmin,
        permissionMiddleware(API_KEY_READ),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Validate query parameters with Zod schema
        const parseResult = listApiKeysQuerySchema.safeParse(request.query);
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

        const filter: ApiKeyListFilter = {
          storeId: query.store_id,
          companyId: query.company_id,
          status: query.status as ApiKeyStatus | undefined,
          search: query.search,
          includeExpired: query.include_expired,
          includeRevoked: query.include_revoked,
        };

        const pagination: ApiKeyPaginationOptions = {
          page: query.page,
          limit: query.limit,
          sortBy: query.sort_by,
          sortOrder: query.sort_order,
        };

        const result = await apiKeyService.listApiKeys(filter, pagination);

        return reply.code(200).send({
          success: true,
          data: {
            items: result.items.map((item) => ({
              api_key_id: item.apiKeyId,
              store_id: item.storeId,
              store_name: item.storeName,
              store_public_id: item.storePublicId,
              company_id: item.companyId,
              company_name: item.companyName,
              key_prefix: item.keyPrefix,
              key_suffix: item.keySuffix,
              label: item.label,
              status: item.status,
              activated_at: item.activatedAt,
              last_used_at: item.lastUsedAt,
              last_sync_at: item.lastSyncAt,
              expires_at: item.expiresAt,
              created_at: item.createdAt,
              created_by_name: item.createdByName,
            })),
            pagination: {
              total: result.total,
              page: result.page,
              limit: result.limit,
              total_pages: result.totalPages,
            },
          },
        });
      } catch (error) {
        console.error("[ApiKeyRoutes] List error:", error);
        return reply.code(500).send({
          success: false,
          error: { code: "INTERNAL_ERROR", message: "Failed to list API keys" },
        });
      }
    },
  );

  // ==========================================================================
  // GET API KEY DETAILS
  // ==========================================================================

  /**
   * GET /api/v1/admin/api-keys/:keyId
   * Get detailed information about an API key
   */
  fastify.get(
    "/api/v1/admin/api-keys/:keyId",
    {
      preHandler: [
        authMiddleware,
        requireSuperAdmin,
        permissionMiddleware(API_KEY_READ),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { keyId } = request.params as { keyId: string };

        // Validate keyId is a valid UUID
        if (
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            keyId,
          )
        ) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Invalid API key ID format",
            },
          });
        }

        const details = await apiKeyService.getApiKey(keyId);

        if (!details) {
          return reply.code(404).send({
            success: false,
            error: { code: "NOT_FOUND", message: "API key not found" },
          });
        }

        return reply.code(200).send({
          success: true,
          data: {
            api_key_id: details.apiKeyId,
            store_id: details.storeId,
            store_name: details.storeName,
            store_public_id: details.storePublicId,
            company_id: details.companyId,
            company_name: details.companyName,
            key_prefix: details.keyPrefix,
            key_suffix: details.keySuffix,
            label: details.label,
            status: details.status,
            timezone: details.timezone,
            state_code: details.stateCode,
            metadata: details.metadata,
            ip_allowlist: details.ipAllowlist,
            ip_enforcement_enabled: details.ipEnforcementEnabled,
            rate_limit_rpm: details.rateLimitRpm,
            daily_sync_quota: details.dailySyncQuota,
            monthly_data_quota_mb: details.monthlyDataQuotaMb,
            device_fingerprint: details.deviceFingerprint,
            activated_at: details.activatedAt,
            last_used_at: details.lastUsedAt,
            last_sync_at: details.lastSyncAt,
            expires_at: details.expiresAt,
            rotated_from_key_id: details.rotatedFromKeyId,
            rotation_grace_ends_at: details.rotationGraceEndsAt,
            revoked_at: details.revokedAt,
            revoked_by: details.revokedBy,
            revoked_by_name: details.revokedByName,
            revocation_reason: details.revocationReason,
            revocation_notes: details.revocationNotes,
            created_at: details.createdAt,
            created_by_name: details.createdByName,
          },
        });
      } catch (error) {
        console.error("[ApiKeyRoutes] Get details error:", error);
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to get API key details",
          },
        });
      }
    },
  );

  // ==========================================================================
  // UPDATE API KEY
  // ==========================================================================

  /**
   * PATCH /api/v1/admin/api-keys/:keyId
   * Update API key settings (metadata, quotas, IP allowlist)
   */
  fastify.patch(
    "/api/v1/admin/api-keys/:keyId",
    {
      preHandler: [
        authMiddleware,
        requireSuperAdmin,
        permissionMiddleware(API_KEY_UPDATE),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user as UserIdentity;
        const { keyId } = request.params as { keyId: string };

        // Validate keyId is a valid UUID
        if (
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            keyId,
          )
        ) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Invalid API key ID format",
            },
          });
        }

        // Validate request body with Zod schema
        const parseResult = updateApiKeySchema.safeParse(request.body);
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

        const input: UpdateApiKeyInput = {
          label: body.label,
          metadata: body.metadata,
          ipAllowlist: body.ip_allowlist,
          ipEnforcementEnabled: body.ip_enforcement_enabled,
          rateLimitRpm: body.rate_limit_rpm,
          dailySyncQuota: body.daily_sync_quota,
          monthlyDataQuotaMb: body.monthly_data_quota_mb,
          expiresAt:
            body.expires_at === null
              ? null
              : body.expires_at
                ? new Date(body.expires_at)
                : undefined,
        };

        const clientIp = getClientIp(request);
        const record = await apiKeyService.updateApiKey(
          keyId,
          input,
          user.id,
          clientIp,
        );

        return reply.code(200).send({
          success: true,
          data: {
            api_key_id: record.apiKeyId,
            label: record.label,
            status: record.status,
            updated_at: record.updatedAt,
          },
          message: "API key updated successfully",
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        // Log full error for CI debugging
        console.error("[ApiKeyRoutes] Update error:", {
          message,
          code:
            error && typeof error === "object" && "code" in error
              ? error.code
              : undefined,
          stack: error instanceof Error ? error.stack : undefined,
          error: JSON.stringify(
            error,
            Object.getOwnPropertyNames(error || {}),
            2,
          ),
        });

        // Handle "not found" errors from service layer
        if (message.includes("not found")) {
          return reply.code(404).send({
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "API key not found",
            },
          });
        }

        // Handle Prisma P2025 "Record to update not found" error
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "P2025"
        ) {
          return reply.code(404).send({
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "API key not found",
            },
          });
        }

        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to update API key",
          },
        });
      }
    },
  );

  // ==========================================================================
  // ROTATE API KEY
  // ==========================================================================

  /**
   * POST /api/v1/admin/api-keys/:keyId/rotate
   * Rotate an API key (create new, set grace period on old)
   *
   * IMPORTANT: The new raw key is returned ONCE and must be copied immediately.
   */
  fastify.post(
    "/api/v1/admin/api-keys/:keyId/rotate",
    {
      preHandler: [
        authMiddleware,
        requireSuperAdmin,
        permissionMiddleware(API_KEY_ROTATE),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user as UserIdentity;
        const { keyId } = request.params as { keyId: string };

        // Validate keyId is a valid UUID
        if (
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            keyId,
          )
        ) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Invalid API key ID format",
            },
          });
        }

        // Validate request body with Zod schema
        const parseResult = rotateApiKeySchema.safeParse(request.body);
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

        const input: RotateApiKeyInput = {
          gracePeriodDays: body.grace_period_days,
          newLabel: body.new_label,
          preserveMetadata: body.preserve_metadata,
          preserveIpAllowlist: body.preserve_ip_allowlist,
        };

        const clientIp = getClientIp(request);
        const result = await apiKeyService.rotateApiKey(
          keyId,
          input,
          user.id,
          clientIp,
        );

        return reply.code(200).send({
          success: true,
          data: {
            new_key: {
              // CRITICAL: This is the only time the raw key is returned
              raw_key: result.key.rawKey,
              api_key_id: result.record.apiKeyId,
              key_prefix: result.key.keyPrefix,
              key_suffix: result.key.keySuffix,
            },
            old_key: {
              api_key_id: keyId,
              grace_period_ends_at: result.graceEndsAt,
            },
          },
          message:
            "API key rotated successfully. IMPORTANT: Copy the new raw_key now - it will not be shown again.",
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        console.error("[ApiKeyRoutes] Rotate error:", message);

        if (message.includes("not found")) {
          return reply.code(404).send({
            success: false,
            error: { code: "NOT_FOUND", message },
          });
        }

        if (message.includes("Cannot rotate")) {
          return reply.code(400).send({
            success: false,
            error: { code: "INVALID_STATE", message },
          });
        }

        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to rotate API key",
          },
        });
      }
    },
  );

  // ==========================================================================
  // REVOKE API KEY
  // ==========================================================================

  /**
   * POST /api/v1/admin/api-keys/:keyId/revoke
   * Revoke an API key immediately
   */
  fastify.post(
    "/api/v1/admin/api-keys/:keyId/revoke",
    {
      preHandler: [
        authMiddleware,
        requireSuperAdmin,
        permissionMiddleware(API_KEY_REVOKE),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user as UserIdentity;
        const { keyId } = request.params as { keyId: string };

        // Validate keyId is a valid UUID
        if (
          !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
            keyId,
          )
        ) {
          return reply.code(400).send({
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Invalid API key ID format",
            },
          });
        }

        // Validate request body with Zod schema
        const parseResult = revokeApiKeySchema.safeParse(request.body);
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

        const input: RevokeApiKeyInput = {
          reason: body.reason as ApiKeyRevocationReason,
          notes: body.notes,
          notifyAdmins: body.notify_admins,
        };

        const clientIp = getClientIp(request);
        await apiKeyService.revokeApiKey(keyId, input, user.id, clientIp);

        return reply.code(200).send({
          success: true,
          message: "API key revoked successfully",
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        console.error("[ApiKeyRoutes] Revoke error:", message);

        if (message.includes("not found")) {
          return reply.code(404).send({
            success: false,
            error: { code: "NOT_FOUND", message },
          });
        }

        if (message.includes("already revoked")) {
          return reply.code(400).send({
            success: false,
            error: { code: "ALREADY_REVOKED", message },
          });
        }

        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to revoke API key",
          },
        });
      }
    },
  );

  // ==========================================================================
  // SUSPEND API KEY
  // ==========================================================================

  /**
   * POST /api/v1/admin/api-keys/:keyId/suspend
   * Temporarily suspend an API key
   */
  fastify.post(
    "/api/v1/admin/api-keys/:keyId/suspend",
    {
      preHandler: [
        authMiddleware,
        requireSuperAdmin,
        permissionMiddleware(API_KEY_REVOKE),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user as UserIdentity;
        const { keyId } = request.params as { keyId: string };
        const body = request.body as { reason?: string };

        const clientIp = getClientIp(request);
        await apiKeyService.suspendApiKey(
          keyId,
          body.reason || "Suspended by admin",
          user.id,
          clientIp,
        );

        return reply.code(200).send({
          success: true,
          message: "API key suspended successfully",
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        // Log full error for CI debugging
        console.error("[ApiKeyRoutes] Suspend error:", {
          message,
          code:
            error && typeof error === "object" && "code" in error
              ? error.code
              : undefined,
          stack: error instanceof Error ? error.stack : undefined,
          error: JSON.stringify(
            error,
            Object.getOwnPropertyNames(error || {}),
            2,
          ),
        });

        // Handle "not found" errors from service layer
        if (message.includes("not found")) {
          return reply.code(404).send({
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "API key not found",
            },
          });
        }

        // Handle Prisma P2025 "Record to update not found" error
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "P2025"
        ) {
          return reply.code(404).send({
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "API key not found",
            },
          });
        }

        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to suspend API key",
          },
        });
      }
    },
  );

  // ==========================================================================
  // REACTIVATE API KEY
  // ==========================================================================

  /**
   * POST /api/v1/admin/api-keys/:keyId/reactivate
   * Reactivate a suspended API key
   */
  fastify.post(
    "/api/v1/admin/api-keys/:keyId/reactivate",
    {
      preHandler: [
        authMiddleware,
        requireSuperAdmin,
        permissionMiddleware(API_KEY_UPDATE),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as any).user as UserIdentity;
        const { keyId } = request.params as { keyId: string };

        const clientIp = getClientIp(request);
        await apiKeyService.reactivateApiKey(keyId, user.id, clientIp);

        return reply.code(200).send({
          success: true,
          message: "API key reactivated successfully",
        });
      } catch (error) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        // Log full error for CI debugging
        console.error("[ApiKeyRoutes] Reactivate error:", {
          message,
          code:
            error && typeof error === "object" && "code" in error
              ? error.code
              : undefined,
          stack: error instanceof Error ? error.stack : undefined,
          error: JSON.stringify(
            error,
            Object.getOwnPropertyNames(error || {}),
            2,
          ),
        });

        // Handle "API key not found" error
        if (message.includes("not found")) {
          return reply.code(404).send({
            success: false,
            error: { code: "NOT_FOUND", message: "API key not found" },
          });
        }

        if (message.includes("Cannot reactivate")) {
          return reply.code(400).send({
            success: false,
            error: { code: "INVALID_STATE", message },
          });
        }

        // Handle Prisma P2025 "Record to update not found" error
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "P2025"
        ) {
          return reply.code(404).send({
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "API key not found",
            },
          });
        }

        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to reactivate API key",
          },
        });
      }
    },
  );

  // ==========================================================================
  // GET AUDIT TRAIL
  // ==========================================================================

  /**
   * GET /api/v1/admin/api-keys/:keyId/audit
   * Get audit trail for an API key
   */
  fastify.get(
    "/api/v1/admin/api-keys/:keyId/audit",
    {
      preHandler: [
        authMiddleware,
        requireSuperAdmin,
        permissionMiddleware(API_KEY_READ),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { keyId } = request.params as { keyId: string };
        const query = request.query as {
          page?: string;
          limit?: string;
          event_types?: string;
          start_date?: string;
          end_date?: string;
        };

        const eventTypes = query.event_types?.split(",") as any[] | undefined;

        const result = await apiKeyAuditService.getEventsForKey(keyId, {
          page: query.page ? parseInt(query.page, 10) : 1,
          limit: query.limit ? parseInt(query.limit, 10) : 50,
          eventTypes,
          startDate: query.start_date ? new Date(query.start_date) : undefined,
          endDate: query.end_date ? new Date(query.end_date) : undefined,
        });

        return reply.code(200).send({
          success: true,
          data: {
            items: result.items.map((event) => ({
              audit_event_id: event.auditEventId,
              event_type: event.eventType,
              actor_user_id: event.actorUserId,
              actor_type: event.actorType,
              ip_address: event.ipAddress,
              event_details: event.eventDetails,
              created_at: event.createdAt,
            })),
            pagination: {
              total: result.total,
              page: result.page,
              limit: result.limit,
            },
          },
        });
      } catch (error) {
        console.error("[ApiKeyRoutes] Audit error:", error);
        return reply.code(500).send({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to get audit trail",
          },
        });
      }
    },
  );
}
