import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authMiddleware, UserIdentity } from "../middleware/auth.middleware";
import { permissionMiddleware } from "../middleware/permission.middleware";
import { PERMISSIONS } from "../constants/permissions";
import { cashierService, AuditContext } from "../services/cashier.service";
import { cashierSessionService } from "../services/cashier-session.service";
import { prisma } from "../utils/db";
import { z } from "zod";

/**
 * Zod schema for creating a cashier
 */
const createCashierSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(255, "Name cannot exceed 255 characters")
    .refine((val) => val.trim().length > 0, {
      message: "Name cannot be whitespace only",
    }),
  pin: z.string().regex(/^\d{4}$/, "PIN must be exactly 4 numeric digits"),
  hired_on: z.coerce.date({
    message: "Hired date is required and must be a valid date",
  }),
  termination_date: z.coerce.date().nullable().optional(),
});

/**
 * Zod schema for updating a cashier
 */
const updateCashierSchema = z.object({
  name: z
    .string()
    .min(1, "Name is required")
    .max(255, "Name cannot exceed 255 characters")
    .refine((val) => val.trim().length > 0, {
      message: "Name cannot be whitespace only",
    })
    .optional(),
  pin: z
    .string()
    .regex(/^\d{4}$/, "PIN must be exactly 4 numeric digits")
    .optional(),
  hired_on: z.coerce
    .date({
      message: "Invalid date format",
    })
    .optional(),
  termination_date: z.coerce.date().nullable().optional(),
});

/**
 * Zod schema for cashier authentication
 * Supports optional terminal_id for creating a cashier session
 */
const authenticateCashierSchema = z
  .object({
    name: z.string().optional(),
    employee_id: z.string().optional(),
    pin: z.string().regex(/^\d{4}$/, "PIN must be exactly 4 numeric digits"),
    terminal_id: z.string().uuid("terminal_id must be a valid UUID").optional(),
  })
  .refine((data) => data.name || data.employee_id, {
    message: "Either name or employee_id must be provided",
  });

/**
 * Validation middleware for POST /api/stores/:storeId/cashiers
 */
async function validateCreateCashierBody(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const parseResult = createCashierSchema.safeParse(request.body);
  if (!parseResult.success) {
    reply.code(400);
    reply.send({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: parseResult.error.issues[0].message,
      },
    });
    return;
  }
  (request as any).validatedBody = parseResult.data;
}

/**
 * Validation middleware for PUT /api/stores/:storeId/cashiers/:cashierId
 */
async function validateUpdateCashierBody(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const parseResult = updateCashierSchema.safeParse(request.body);
  if (!parseResult.success) {
    reply.code(400);
    reply.send({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: parseResult.error.issues[0].message,
      },
    });
    return;
  }
  (request as any).validatedBody = parseResult.data;
}

/**
 * Validation middleware for POST /api/stores/:storeId/cashiers/authenticate
 */
async function validateAuthenticateCashierBody(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const parseResult = authenticateCashierSchema.safeParse(request.body);
  if (!parseResult.success) {
    reply.code(400);
    reply.send({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: parseResult.error.issues[0].message,
      },
    });
    return;
  }
  (request as any).validatedBody = parseResult.data;
}

/**
 * Helper to extract audit context from request
 */
function getAuditContext(
  request: FastifyRequest,
  user: UserIdentity | null,
): AuditContext {
  const ipAddress =
    (request.headers["x-forwarded-for"] as string)?.split(",")[0] ||
    request.ip ||
    request.socket.remoteAddress ||
    null;
  const userAgent = request.headers["user-agent"] || null;

  return {
    userId: user?.id || "system",
    userEmail: user?.email || "system",
    userRoles: user?.roles || [],
    ipAddress,
    userAgent,
  };
}

/**
 * Cashier Management Routes
 *
 * Provides CRUD operations for cashiers.
 * All endpoints require:
 * - Authentication (except authenticate endpoint)
 * - Appropriate CASHIER_* permissions
 *
 * Cashiers are store-scoped and RLS policies ensure users only see cashiers
 * for stores they have access to.
 */
export async function cashierRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/stores/:storeId/cashiers
   * Create a new cashier for a store
   *
   * @security Requires CASHIER_CREATE permission
   * @body { name, pin, hired_on, termination_date? }
   * @returns Created cashier data (without pin_hash)
   */
  fastify.post(
    "/api/stores/:storeId/cashiers",
    {
      preHandler: [
        validateCreateCashierBody,
        authMiddleware,
        permissionMiddleware(PERMISSIONS.CASHIER_CREATE),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as unknown as { user: UserIdentity }).user;
        const { storeId } = request.params as { storeId: string };
        const { name, pin, hired_on, termination_date } = (request as any)
          .validatedBody;
        const auditContext = getAuditContext(request, user);

        const cashier = await cashierService.createCashier(
          {
            store_id: storeId,
            name,
            pin,
            hired_on,
            termination_date,
          },
          auditContext,
        );

        reply.code(201);
        return {
          success: true,
          data: cashier,
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        fastify.log.error({ error }, "Error creating cashier");

        if (
          message.includes("required") ||
          message.includes("PIN") ||
          message.includes("already in use")
        ) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message,
            },
          };
        }

        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to create cashier",
          },
        };
      }
    },
  );

  /**
   * GET /api/stores/:storeId/cashiers
   * List cashiers for a store with optional filtering
   *
   * @security Requires CASHIER_READ permission
   * @query { is_active?: boolean } (default: true)
   * @returns Array of cashiers (without pin_hash)
   */
  fastify.get(
    "/api/stores/:storeId/cashiers",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.CASHIER_READ),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as unknown as { user: UserIdentity }).user;
        const { storeId } = request.params as { storeId: string };
        const query = request.query as { is_active?: string };
        const auditContext = getAuditContext(request, user);

        // Parse query parameters
        const filters: { is_active?: boolean } = {};
        if (query.is_active !== undefined) {
          filters.is_active = query.is_active === "true";
        }

        const cashiers = await cashierService.getCashiers(
          storeId,
          filters,
          auditContext,
        );

        reply.code(200);
        return {
          success: true,
          data: cashiers,
        };
      } catch (error: unknown) {
        fastify.log.error({ error }, "Error listing cashiers");

        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to list cashiers",
          },
        };
      }
    },
  );

  /**
   * GET /api/stores/:storeId/cashiers/:cashierId
   * Get cashier details by ID
   *
   * @security Requires CASHIER_READ permission
   * @returns Cashier data (without pin_hash) or 404 if not found
   */
  fastify.get(
    "/api/stores/:storeId/cashiers/:cashierId",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.CASHIER_READ),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as unknown as { user: UserIdentity }).user;
        const { storeId, cashierId } = request.params as {
          storeId: string;
          cashierId: string;
        };
        const auditContext = getAuditContext(request, user);

        const cashier = await cashierService.getCashierById(
          storeId,
          cashierId,
          auditContext,
        );

        if (!cashier) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: "Cashier not found",
            },
          };
        }

        reply.code(200);
        return {
          success: true,
          data: cashier,
        };
      } catch (error: unknown) {
        fastify.log.error({ error }, "Error getting cashier");

        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to get cashier",
          },
        };
      }
    },
  );

  /**
   * PUT /api/stores/:storeId/cashiers/:cashierId
   * Update cashier information
   *
   * @security Requires CASHIER_UPDATE permission
   * @body { name?, pin?, hired_on?, termination_date? }
   * @returns Updated cashier data (without pin_hash)
   */
  fastify.put(
    "/api/stores/:storeId/cashiers/:cashierId",
    {
      preHandler: [
        validateUpdateCashierBody,
        authMiddleware,
        permissionMiddleware(PERMISSIONS.CASHIER_UPDATE),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as unknown as { user: UserIdentity }).user;
        const { storeId, cashierId } = request.params as {
          storeId: string;
          cashierId: string;
        };
        const updateData = (request as any).validatedBody;
        const auditContext = getAuditContext(request, user);

        const cashier = await cashierService.updateCashier(
          storeId,
          cashierId,
          updateData,
          auditContext,
        );

        reply.code(200);
        return {
          success: true,
          data: cashier,
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        fastify.log.error({ error }, "Error updating cashier");

        if (message.includes("not found")) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: message || "Cashier not found",
            },
          };
        }

        if (
          message.includes("required") ||
          message.includes("PIN") ||
          message.includes("already in use")
        ) {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message,
            },
          };
        }

        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to update cashier",
          },
        };
      }
    },
  );

  /**
   * DELETE /api/stores/:storeId/cashiers/:cashierId
   * Soft delete cashier (set is_active=false, disabled_at=now atomically)
   *
   * @security Requires CASHIER_DELETE permission
   * @returns 204 No Content
   */
  fastify.delete(
    "/api/stores/:storeId/cashiers/:cashierId",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.CASHIER_DELETE),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as unknown as { user: UserIdentity }).user;
        const { storeId, cashierId } = request.params as {
          storeId: string;
          cashierId: string;
        };
        const auditContext = getAuditContext(request, user);

        await cashierService.deleteCashier(storeId, cashierId, auditContext);

        reply.code(204);
        return;
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        fastify.log.error({ error }, "Error deleting cashier");

        if (message.includes("not found") || message.includes("already")) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: message || "Cashier not found",
            },
          };
        }

        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to delete cashier",
          },
        };
      }
    },
  );

  /**
   * POST /api/stores/:storeId/cashiers/:cashierId/restore
   * Restore a soft-deleted cashier (set is_active=true, disabled_at=NULL atomically)
   *
   * @security Requires CASHIER_UPDATE permission
   * @returns Restored cashier data (without pin_hash)
   */
  fastify.post(
    "/api/stores/:storeId/cashiers/:cashierId/restore",
    {
      preHandler: [
        authMiddleware,
        permissionMiddleware(PERMISSIONS.CASHIER_UPDATE),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as unknown as { user: UserIdentity }).user;
        const { storeId, cashierId } = request.params as {
          storeId: string;
          cashierId: string;
        };
        const auditContext = getAuditContext(request, user);

        const cashier = await cashierService.restoreCashier(
          storeId,
          cashierId,
          auditContext,
        );

        reply.code(200);
        return {
          success: true,
          data: cashier,
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        fastify.log.error({ error }, "Error restoring cashier");

        if (message.includes("not found") || message.includes("already")) {
          reply.code(404);
          return {
            success: false,
            error: {
              code: "NOT_FOUND",
              message: message || "Cashier not found",
            },
          };
        }

        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to restore cashier",
          },
        };
      }
    },
  );

  /**
   * POST /api/stores/:storeId/cashiers/authenticate
   * Authenticate cashier by name or employee_id and PIN
   *
   * When terminal_id is provided, creates a Cashier Session Token for terminal operations.
   * This implements the enterprise Cashier Session Token pattern:
   * - CLIENT_USER must be authenticated (JWT cookie)
   * - Cashier authenticates via PIN
   * - Session token is created and returned for terminal operations
   *
   * @security Requires CLIENT_DASHBOARD_ACCESS permission (authenticated via JWT)
   * Rate limit: 5 attempts per minute per store (prevents brute force attacks)
   * @body { name?, employee_id?, pin, terminal_id? }
   * @returns { cashier_id, employee_id, name, session? } on success
   *          session is included when terminal_id is provided
   */
  fastify.post(
    "/api/stores/:storeId/cashiers/authenticate",
    {
      config: {
        // CI/Test: DISABLED to prevent false test failures
        rateLimit:
          process.env.CI === "true" || process.env.NODE_ENV === "test"
            ? false // Disable rate limiting in test/CI environments
            : {
                max: parseInt(
                  process.env.CASHIER_AUTH_RATE_LIMIT_MAX || "5",
                  10,
                ), // 5 attempts per minute
                timeWindow:
                  process.env.CASHIER_AUTH_RATE_LIMIT_WINDOW || "1 minute",
                // Use storeId + IP address for rate limiting key (per-store rate limiting)
                keyGenerator: (request: FastifyRequest) => {
                  const { storeId } = request.params as { storeId: string };
                  const ip =
                    (request.headers["x-forwarded-for"] as string)?.split(
                      ",",
                    )[0] ||
                    request.ip ||
                    request.socket.remoteAddress ||
                    "unknown";
                  return `cashier-auth:${storeId}:${ip}`;
                },
              },
      },
      preHandler: [
        validateAuthenticateCashierBody,
        authMiddleware, // Requires authenticated CLIENT_USER
        permissionMiddleware(PERMISSIONS.CLIENT_DASHBOARD_ACCESS),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const user = (request as unknown as { user: UserIdentity }).user;
        const { storeId } = request.params as { storeId: string };
        const { name, employee_id, pin, terminal_id } = (request as any)
          .validatedBody;
        const auditContext = getAuditContext(request, user);

        // First authenticate the cashier via PIN
        const authResult = await cashierService.authenticateCashier(
          storeId,
          { name, employee_id },
          pin,
          auditContext,
        );

        // If terminal_id is provided, create a cashier session
        let sessionData = null;
        if (terminal_id) {
          const session = await cashierSessionService.createSession({
            cashierId: authResult.cashier_id,
            terminalId: terminal_id,
            storeId: storeId,
            authenticatedBy: user.id,
          });

          sessionData = {
            session_id: session.session_id,
            session_token: session.session_token,
            expires_at: session.expires_at,
          };
        }

        reply.code(200);
        return {
          success: true,
          data: {
            ...authResult,
            session: sessionData,
          },
        };
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : "Unknown error";
        fastify.log.error({ error }, "Error authenticating cashier");

        // Generic error message for security (don't reveal if cashier exists or not)
        if (
          message.includes("Invalid credentials") ||
          message.includes("not found") ||
          message.includes("inactive")
        ) {
          reply.code(401);
          return {
            success: false,
            error: {
              code: "AUTHENTICATION_FAILED",
              message: "Authentication failed",
            },
          };
        }

        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to authenticate cashier",
          },
        };
      }
    },
  );

  /**
   * Get active shift cashiers for a store
   * GET /api/stores/:storeId/active-shift-cashiers
   * Returns list of cashiers with active shifts at the specified store
   * Active shifts are those with status: OPEN, ACTIVE, CLOSING, RECONCILING and closed_at IS NULL
   */
  fastify.get(
    "/api/stores/:storeId/active-shift-cashiers",
    {
      schema: {
        description: "Get cashiers with active shifts at a store",
        tags: ["cashiers"],
        params: {
          type: "object",
          properties: {
            storeId: {
              type: "string",
              format: "uuid",
              description: "Store UUID",
            },
          },
          required: ["storeId"],
        },
        response: {
          200: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              data: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string", format: "uuid" },
                    name: { type: "string" },
                    shiftId: { type: "string", format: "uuid" },
                  },
                  required: ["id", "name", "shiftId"],
                },
              },
            },
          },
          400: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
          500: {
            type: "object",
            properties: {
              success: { type: "boolean" },
              error: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  message: { type: "string" },
                },
              },
            },
          },
        },
      },
      preHandler: [
        authMiddleware, // Requires authenticated user
        permissionMiddleware(PERMISSIONS.CASHIER_READ), // Requires cashier read permission
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { storeId } = request.params as { storeId: string };

        // API-001: VALIDATION - Validate storeId is a valid UUID
        if (!storeId || typeof storeId !== "string") {
          reply.code(400);
          return {
            success: false,
            error: {
              code: "VALIDATION_ERROR",
              message: "Store ID is required and must be a valid UUID",
            },
          };
        }

        // SEC-006: SQL_INJECTION - Use parameterized query via Prisma ORM
        // Query shifts with active status and get associated cashiers
        const activeShifts = await prisma.shift.findMany({
          where: {
            store_id: storeId,
            status: {
              in: ["OPEN", "ACTIVE", "CLOSING", "RECONCILING"],
            },
            closed_at: null, // Only active shifts (not closed)
            cashier: {
              disabled_at: null, // Only active cashiers
            },
          },
          include: {
            cashier: {
              select: {
                cashier_id: true,
                name: true,
              },
            },
          },
        });

        // Map to response format
        const cashiers = activeShifts.map((shift) => ({
          id: shift.cashier.cashier_id,
          name: shift.cashier.name,
          shiftId: shift.shift_id,
        }));

        // Remove duplicates (in case a cashier has multiple active shifts)
        const uniqueCashiers = Array.from(
          new Map(cashiers.map((c) => [c.id, c])).values(),
        );

        reply.code(200);
        return {
          success: true,
          data: uniqueCashiers,
        };
      } catch (error: unknown) {
        // API-003: ERROR_HANDLING - Generic error message, don't leak implementation details
        fastify.log.error({ error }, "Error getting active shift cashiers");

        reply.code(500);
        return {
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: "Failed to get active shift cashiers",
          },
        };
      }
    },
  );
}
