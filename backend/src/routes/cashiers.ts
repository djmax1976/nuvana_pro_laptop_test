import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { authMiddleware, UserIdentity } from "../middleware/auth.middleware";
import { permissionMiddleware } from "../middleware/permission.middleware";
import { PERMISSIONS } from "../constants/permissions";
import { cashierService, AuditContext } from "../services/cashier.service";
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
 */
const authenticateCashierSchema = z
  .object({
    name: z.string().optional(),
    employee_id: z.string().optional(),
    pin: z.string().regex(/^\d{4}$/, "PIN must be exactly 4 numeric digits"),
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
      error: "Validation error",
      message: parseResult.error.issues[0].message,
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
      error: "Validation error",
      message: parseResult.error.issues[0].message,
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
      error: "Validation error",
      message: parseResult.error.issues[0].message,
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
            error: "Validation error",
            message,
          };
        }

        reply.code(500);
        return {
          success: false,
          error: "Internal server error",
          message: "Failed to create cashier",
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
          error: "Internal server error",
          message: "Failed to list cashiers",
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
            error: "Not found",
            message: "Cashier not found",
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
          error: "Internal server error",
          message: "Failed to get cashier",
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
            error: "Not found",
            message,
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
            error: "Validation error",
            message,
          };
        }

        reply.code(500);
        return {
          success: false,
          error: "Internal server error",
          message: "Failed to update cashier",
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
            error: "Not found",
            message,
          };
        }

        reply.code(500);
        return {
          success: false,
          error: "Internal server error",
          message: "Failed to delete cashier",
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
            error: "Not found",
            message,
          };
        }

        reply.code(500);
        return {
          success: false,
          error: "Internal server error",
          message: "Failed to restore cashier",
        };
      }
    },
  );

  /**
   * POST /api/stores/:storeId/cashiers/authenticate
   * Authenticate cashier by name or employee_id and PIN
   *
   * @security No authentication required (public endpoint for terminal access)
   * Rate limit: 5 attempts per minute per store (prevents brute force attacks)
   * @body { name?, employee_id?, pin }
   * @returns { cashier_id, employee_id, name } on success
   */
  fastify.post(
    "/api/stores/:storeId/cashiers/authenticate",
    {
      config: {
        rateLimit: {
          max: parseInt(
            process.env.CASHIER_AUTH_RATE_LIMIT_MAX ||
              (process.env.CI === "true" ? "100" : "5"),
            10,
          ), // 5 attempts per minute (100 in CI)
          timeWindow: process.env.CASHIER_AUTH_RATE_LIMIT_WINDOW || "1 minute",
          // Use storeId + IP address for rate limiting key (per-store rate limiting)
          keyGenerator: (request: FastifyRequest) => {
            const { storeId } = request.params as { storeId: string };
            const ip =
              (request.headers["x-forwarded-for"] as string)?.split(",")[0] ||
              request.ip ||
              request.socket.remoteAddress ||
              "unknown";
            return `cashier-auth:${storeId}:${ip}`;
          },
        },
      },
      preHandler: [validateAuthenticateCashierBody],
      // Note: No authMiddleware - this is a public endpoint for terminal authentication
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { storeId } = request.params as { storeId: string };
        const { name, employee_id, pin } = (request as any).validatedBody;
        const auditContext = getAuditContext(request, null);

        const result = await cashierService.authenticateCashier(
          storeId,
          { name, employee_id },
          pin,
          auditContext,
        );

        reply.code(200);
        return {
          success: true,
          data: result,
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
            error: "Authentication failed",
            message: "Authentication failed",
          };
        }

        reply.code(500);
        return {
          success: false,
          error: "Internal server error",
          message: "Failed to authenticate cashier",
        };
      }
    },
  );
}
