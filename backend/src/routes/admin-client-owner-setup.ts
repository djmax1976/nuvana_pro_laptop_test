/**
 * Admin Client Owner Setup Routes
 *
 * Provides atomic creation of User + Company + Store + Store Login
 * for the Super Admin wizard flow.
 *
 * @enterprise-standards
 * - API-001: VALIDATION - Zod schema validation for all inputs
 * - API-002: RATE_LIMIT - Protected by global rate limiting
 * - API-003: ERROR_HANDLING - Structured error responses with correlation IDs
 * - API-004: AUTHENTICATION - JWT token validation via authMiddleware
 * - SEC-010: AUTHZ - ADMIN_SYSTEM_CONFIG permission required
 * - DB-006: TENANT_ISOLATION - Proper company/store scoping
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import crypto from "crypto";
import { authMiddleware, UserIdentity } from "../middleware/auth.middleware";
import { permissionMiddleware } from "../middleware/permission.middleware";
import { PERMISSIONS } from "../constants/permissions";
import {
  clientOwnerSetupService,
  ClientOwnerSetupValidationError,
  AuditContext,
} from "../services/client-owner-setup.service";
import {
  ClientOwnerSetupRequestSchema,
  mapZodErrorsToWizardSteps,
} from "../schemas/client-owner-setup.schema";

/**
 * Helper to extract audit context from request
 * LM-002: MONITORING - Track who performed what action
 */
function getAuditContext(
  request: FastifyRequest,
  user: UserIdentity,
): AuditContext {
  const ipAddress =
    (request.headers["x-forwarded-for"] as string)?.split(",")[0] ||
    request.ip ||
    request.socket.remoteAddress ||
    null;
  const userAgent = request.headers["user-agent"] || null;

  return {
    userId: user.id,
    userEmail: user.email,
    userRoles: user.roles,
    ipAddress,
    userAgent,
  };
}

/**
 * Admin Client Owner Setup Routes
 *
 * Provides a single endpoint for atomic creation of complete client setup:
 * - POST /api/admin/client-owner-setup - Create user, company, store, and store login
 *
 * All routes require ADMIN_SYSTEM_CONFIG permission (System Admin only).
 */
export async function adminClientOwnerSetupRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/admin/client-owner-setup
   *
   * Create complete client owner setup atomically.
   * Creates User (CLIENT_OWNER) + Company + Store + Store Login (CLIENT_USER) +
   * Store Manager (STORE_MANAGER) + optional Terminals in a single database transaction.
   *
   * Request Body:
   * {
   *   user: { email, name, password },
   *   company: { name, address: { address_line1, address_line2?, city, state_id, county_id?, zip_code } },
   *   store: { name, timezone, status?, address_line1, address_line2?, city, state_id, county_id?, zip_code, pos_config? },
   *   storeLogin: { email, password },
   *   storeManager: { email, password },
   *   terminals?: [{ name, device_id?, pos_type?, connection_type?, connection_config? }]
   * }
   *
   * Response (201 Created):
   * {
   *   success: true,
   *   data: { user, company, store, storeLogin, storeManager, terminals? },
   *   meta: { request_id, timestamp, transaction_id }
   * }
   *
   * Error Response (400/409/500):
   * {
   *   success: false,
   *   error: {
   *     code: "VALIDATION_ERROR" | "CONFLICT" | "INTERNAL_ERROR",
   *     message: string,
   *     details?: { user?: {...}, company?: {...}, store?: {...}, storeLogin?: {...}, storeManager?: {...} }
   *   }
   * }
   *
   * @security
   * - Requires ADMIN_SYSTEM_CONFIG permission
   * - Passwords are bcrypt hashed (salt rounds 10)
   * - Transaction ensures atomicity (all-or-nothing)
   */
  fastify.post(
    "/api/admin/client-owner-setup",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.ADMIN_SYSTEM_CONFIG),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Generate transaction ID for audit trail and debugging
      const transactionId = crypto.randomUUID();

      try {
        const user = (request as unknown as { user: UserIdentity }).user;

        // API-001: VALIDATION - Validate request body with Zod schema
        const parseResult = ClientOwnerSetupRequestSchema.safeParse(
          request.body,
        );

        if (!parseResult.success) {
          // Map Zod errors to wizard step field details
          const details = mapZodErrorsToWizardSteps(parseResult.error);

          fastify.log.warn(
            {
              transactionId,
              validationErrors: parseResult.error.issues,
              userId: user.id,
            },
            "Client owner setup validation failed",
          );

          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message:
                parseResult.error.issues[0]?.message || "Validation failed",
              details,
            },
          };
        }

        const auditContext = getAuditContext(request, user);

        // Execute atomic creation
        const result = await clientOwnerSetupService.createClientOwnerSetup(
          parseResult.data,
          auditContext,
        );

        fastify.log.info(
          {
            transactionId,
            userId: user.id,
            createdUserId: result.user.user_id,
            createdCompanyId: result.company.company_id,
            createdStoreId: result.store.store_id,
            createdStoreLoginId: result.storeLogin.user_id,
            createdStoreManagerId: result.storeManager.user_id,
            terminalsCreated: result.terminals?.length || 0,
          },
          "Client owner setup created successfully",
        );

        reply.code(201);
        return {
          success: true,
          data: result,
          meta: {
            request_id: request.id,
            timestamp: new Date().toISOString(),
            transaction_id: transactionId,
          },
        };
      } catch (error: unknown) {
        fastify.log.error(
          {
            error,
            transactionId,
            errorName: error instanceof Error ? error.name : "Unknown",
            errorMessage:
              error instanceof Error ? error.message : "Unknown error",
          },
          "Client owner setup failed",
        );

        // Handle ClientOwnerSetupValidationError with field-level details
        if (error instanceof ClientOwnerSetupValidationError) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: error.message,
              details: error.details,
            },
          };
        }

        const message =
          error instanceof Error ? error.message : "Unknown error";

        // Handle conflicts (duplicate email)
        if (
          message.includes("already in use") ||
          message.includes("already exist") ||
          message.includes("Unique constraint")
        ) {
          reply.code(409);
          return {
            success: false,
            error: {
              code: "CONFLICT",
              message: message.includes("Unique constraint")
                ? "A resource with this identifier already exists"
                : message,
            },
          };
        }

        // Handle not found errors (invalid state_id, county_id, role not found)
        if (message.includes("not found")) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message,
            },
          };
        }

        // API-003: ERROR_HANDLING - Return generic error for internal issues
        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message:
              "Failed to create client owner setup. Transaction rolled back.",
          },
        };
      }
    },
  );
}
